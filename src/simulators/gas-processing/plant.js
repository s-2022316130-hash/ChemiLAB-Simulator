/**
 * 05 — NATURAL GAS PROCESSING PLANT — 3D plant.
 *
 * Composes scene/geometry.js primitives only. This module owns geometry and
 * nothing else: it never computes a process value. Everything it shows comes
 * from engine.getEquipmentState() and engine.getStreams(), handed to it by the
 * workspace as plain data.
 *
 * Equipment tags come from engine.js so the 3D group's userData.tag, the
 * flowsheet node tag and the engine's own key are guaranteed to be one string.
 *
 * The gas runs along +X in the order it is treated: reception at the west end,
 * the two treating towers in the middle, the cold box and the demethaniser to
 * the east, and the compressor station and product storage beyond them. The
 * regeneration loops sit on −Z behind their contactors, and the flare stands
 * well clear of everything, which is why it is where it is.
 */
import * as THREE from 'three';
import {
  column, verticalVessel, horizontalVessel, tank, sphereTank, compressorTrain,
  shellTubeExchanger, centrifugalPump, pipe, valve, platform, stairs, frame,
  instrument, cabinet, statusLamp, ladder, flange, nozzle, cableTray, bollard,
  pipeSupport, setLampState, pulseLamps, plume
} from '../../scene/geometry.js';
import { MAT, STATE_COLOR } from '../../scene/materials.js';
import { TAGS, STREAMS } from './engine.js';

// ---------------------------------------------------------------------------
// Plot plan. One place to move a unit; every pipe run is derived from it.
// ---------------------------------------------------------------------------
const L = {
  [TAGS.inletSeparator]: { x: -42, z: 0 },
  [TAGS.stabiliser]: { x: -42, z: 13 },
  [TAGS.flare]: { x: -46, z: -26 },
  [TAGS.amineContactor]: { x: -24, z: 0 },
  [TAGS.amineRegenerator]: { x: -24, z: -13 },
  [TAGS.leanRichExchanger]: { x: -17, z: -7 },
  [TAGS.aminePump]: { x: -30, z: -7 },
  [TAGS.glycolContactor]: { x: -6, z: 0 },
  [TAGS.glycolRegenerator]: { x: -6, z: -12 },
  [TAGS.coldBox]: { x: 8, z: 0 },
  [TAGS.expander]: { x: 17, z: 0 },
  [TAGS.coldSeparator]: { x: 24, z: 0 },
  [TAGS.demethaniser]: { x: 33, z: 0 },
  [TAGS.residueCompressor]: { x: 47, z: -9 },
  [TAGS.nglStorage]: { x: 47, z: 11 },
  [TAGS.mcc]: { x: 14, z: 15 }
};
// Vessel dimensions, shared between the geometry and the pipe routing.
const DIM = {
  separator: { d: 3.0, l: 9.0 },
  stabiliser: { d: 1.8, h: 13, trays: 8 },
  amineContactor: { d: 3.2, h: 22, trays: 12 },
  amineRegen: { d: 2.6, h: 15, trays: 8 },
  glycolContactor: { d: 2.4, h: 14, trays: 6 },
  glycolRegen: { d: 1.2, h: 7 },
  coldBox: { w: 3.2, h: 9, d: 3.2 },
  coldSeparator: { d: 2.0, h: 6 },
  demethaniser: { d: 2.8, h: 26, trays: 10 },
  sphere: { d: 9 },
  flare: { h: 38, d: 1.4 }
};

// ---------------------------------------------------------------------------
// Camera presets. The ids are fixed by scene/cameras.js PRESET_ORDER.
// ---------------------------------------------------------------------------
const PRESETS = {
  overview: { pos: [44, 34, 56], target: [2, 8, 0] },
  feed: { pos: [-52, 16, 18], target: [-42, 4, 2] },
  main: { pos: [-26, 20, 22], target: [-16, 8, -4] },
  separation: { pos: [20, 20, 26], target: [18, 8, 0] },
  utilities: { pos: [-4, 16, 24], target: [-6, 6, -8] },
  products: { pos: [56, 18, 26], target: [46, 5, 2] },
  control: { pos: [20, 12, 28], target: [14, 3, 15] }
};

// The framework calls applyState on the module rather than on the built plant,
// so one loaded module drives one live view.
let live = null;

const stateColor = st => {
  if (!st) return STATE_COLOR.idle;
  if (st.state === 'tripped') return STATE_COLOR.tripped;
  if (st.alarm || st.state === 'warning') return STATE_COLOR.warning;
  if (st.state === 'running') return STATE_COLOR.running;
  if (st.state === 'stopped' || st.state === 'off') return STATE_COLOR.off;
  return STATE_COLOR.idle;
};
// Cold steel frosts over. The cold section is painted from the temperature the
// engine reports at the expander outlet rather than from a fixed colour.
const WARM_STEEL = new THREE.Color(0xb9c3ce);
const FROSTED = new THREE.Color(0xe8f1f6);

function withPos(obj, [x, y, z]) { obj.position.set(x, y, z); return obj; }

/** Attach a lamp above a unit and remember it for applyState. */
function lamp(grp, refs, tag, y, x = 0, z = 0) {
  const l = statusLamp({});
  l.position.set(x, y, z);
  grp.add(l);
  refs.lamps.set(tag, l);
  return l;
}
/** A liquid body whose level is driven by the engine, hidden until it reports one. */
function trackLiquid(refs, tag, mesh, dims) {
  if (!mesh) return null;
  mesh.visible = false;
  mesh.material = mesh.material.clone();
  refs.levels.set(tag, { mesh, h: dims.h, base: dims.base ?? 0, frac0: dims.frac0 });
  return mesh;
}
/** A liquid body inside a vertical vessel, sized from the vessel. */
function liquidIn(grp, refs, tag, { d, h, base = 0, frac0 = 0.5 }) {
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(d / 2 * 0.96, d / 2 * 0.96, h * frac0, 24),
    MAT.liquid.clone()
  );
  body.name = 'liquid';
  body.position.set(0, base + h * frac0 / 2, 0);
  grp.add(body);
  return trackLiquid(refs, tag, body, { h, base, frac0 });
}

export function build(view, streams) {
  const refs = {
    lamps: new Map(), levels: new Map(), motors: new Map(),
    rotors: [], cold: [], view
  };
  const add = (tag, group, name, type, camera) => {
    group.position.set(L[tag].x, 0, L[tag].z);
    view.addEquipment(group, { tag, name, type, camera });
    return group;
  };

  // ---- V-501 inlet separator ----------------------------------------------
  {
    const d = DIM.separator, g = new THREE.Group();
    g.add(horizontalVessel({ d: d.d, l: d.l, mat: MAT.vessel }));
    // Water boot underneath the liquid end, which is what makes it three-phase.
    g.add(withPos(verticalVessel({ d: 1.0, h: 1.6, mat: MAT.vessel }), [d.l / 2 - 1.4, -1.6, 0]));
    [-d.l / 2 - 0.2, d.l / 2 + 0.2].forEach(x => g.add(withPos(flange({ d: 0.3 }), [x, d.d / 2 + 0.6, 0])));
    g.add(withPos(instrument({ label: 'LIT' }), [d.l / 2 - 2.2, 1.2, d.d / 2 + 0.3]));
    g.add(withPos(instrument({ label: 'PIT' }), [-d.l / 2 + 1.6, 2.6, d.d / 2 + 0.3]));
    g.add(withPos(valve({ s: 1.2 }), [d.l / 2 + 1.0, 0.7, 0]));
    g.add(withPos(platform({ w: d.l + 1, d: 1.6, y: d.d + 1.2, rails: true }), [0, 0, d.d / 2 + 0.9]));
    g.add(withPos(stairs({ steps: 16, w: 1 }), [d.l / 2 - 1, 0, d.d / 2 + 2.6]));
    for (const bz of [-1, 1]) g.add(withPos(bollard({ h: 1.0 }), [-d.l / 2 - 1.6, 0, bz * 2.4]));
    lamp(g, refs, TAGS.inletSeparator, d.d + 2.4);
    add(TAGS.inletSeparator, g, 'Inlet three-phase separator', 'vessel', { pos: [-50, 10, 12], target: [-42, 2, 0] });
  }

  // ---- T-506 condensate stabiliser ----------------------------------------
  {
    const d = DIM.stabiliser, g = new THREE.Group();
    g.add(column({ d: d.d, h: d.h, trays: d.trays }));
    liquidIn(g, refs, TAGS.stabiliser, { d: d.d, h: d.h * 0.3, frac0: 0.55 });
    g.add(withPos(shellTubeExchanger({ d: 0.9, l: 3.0 }), [d.d / 2 + 2.4, 0, 0]));
    g.add(withPos(ladder({ h: d.h }), [-d.d / 2 - 0.3, 0, 0]));
    g.add(withPos(platform({ w: 3.4, d: 2.0, y: d.h * 0.72, rails: true }), [d.d / 2 + 1.0, 0, 0]));
    g.add(withPos(instrument({ label: 'TIC' }), [d.d / 2 + 0.3, 2.4, 0]));
    lamp(g, refs, TAGS.stabiliser, d.h + 1.6);
    add(TAGS.stabiliser, g, 'Condensate stabiliser', 'column', { pos: [-50, 12, 22], target: [-42, 6, 13] });
  }

  // ---- FL-501 acid gas flare -----------------------------------------------
  {
    const d = DIM.flare, g = new THREE.Group();
    g.add(tank({ d: d.d, h: d.h, mat: MAT.steelDark }));
    // Derrick legs, which is what a flare of this height actually stands on.
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      g.add(withPos(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, d.h * 0.8, 8), MAT.frame),
        [Math.cos(a) * 3.2, d.h * 0.4, Math.sin(a) * 3.2]));
    }
    for (let y = 6; y < d.h * 0.8; y += 7) {
      g.add(withPos(new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.07, 6, 3), MAT.frame), [0, y, 0], [Math.PI / 2, 0, 0]));
    }
    g.add(withPos(new THREE.Mesh(new THREE.CylinderGeometry(d.d / 2 + 0.35, d.d / 2, 1.4, 16), MAT.steelDark), [0, d.h + 0.7, 0]));
    g.add(withPos(ladder({ h: d.h * 0.8 }), [d.d / 2 + 0.3, 0, 0]));
    // Knockout drum at the base: liquid to a flare is burning rain.
    g.add(withPos(horizontalVessel({ d: 1.6, l: 4.0, mat: MAT.vessel }), [0, 0, 4.6]));
    // The flame itself, lit only while the engine reports acid gas going to it.
    const flame = plume({ h: 9, r: 0.7, spread: 1.6, count: 90, colour: 0xffb45a, rise: 3.6, size: 1.7, opacity: 0.55 });
    flame.position.y = d.h + 1.5;
    g.add(flame);
    refs.flame = flame;
    lamp(g, refs, TAGS.flare, 3.0, 3.6);
    add(TAGS.flare, g, 'Acid gas flare', 'block', { pos: [-56, 24, -12], target: [-46, 20, -26] });
  }

  // ---- T-501 amine contactor ----------------------------------------------
  {
    const d = DIM.amineContactor, g = new THREE.Group();
    g.add(column({ d: d.d, h: d.h, trays: d.trays }));
    liquidIn(g, refs, TAGS.amineContactor, { d: d.d, h: 3.0, frac0: 0.5 });
    g.add(withPos(ladder({ h: d.h }), [-d.d / 2 - 0.3, 0, 0]));
    [0.3, 0.62, 0.9].forEach(f => g.add(withPos(platform({ w: d.d + 3.2, d: 1.8, y: d.h * f, rails: true }), [0, 0, d.d / 2 + 1.0])));
    g.add(withPos(stairs({ steps: 26, w: 1.0 }), [d.d / 2 + 1.6, 0, d.d / 2 + 2.8]));
    g.add(withPos(nozzle({ d: 0.3, l: 0.7 }), [0, d.h, 0]));
    g.add(withPos(instrument({ label: 'AIT' }), [d.d / 2 + 0.35, d.h * 0.94, 0]));
    g.add(withPos(instrument({ label: 'TIT' }), [d.d / 2 + 0.35, d.h * 0.86, 0]));
    g.add(withPos(instrument({ label: 'PDI' }), [-d.d / 2 - 0.35, d.h * 0.5, 0]));
    lamp(g, refs, TAGS.amineContactor, d.h + 2.0);
    add(TAGS.amineContactor, g, 'Amine contactor', 'column', { pos: [-32, 18, 14], target: [-24, 11, 0] });
  }

  // ---- T-502 amine regenerator --------------------------------------------
  {
    const d = DIM.amineRegen, g = new THREE.Group();
    g.add(column({ d: d.d, h: d.h, trays: d.trays }));
    liquidIn(g, refs, TAGS.amineRegenerator, { d: d.d, h: 3.0, frac0: 0.5 });
    // Kettle reboiler alongside, and the overhead condenser above it.
    g.add(withPos(horizontalVessel({ d: 1.6, l: 5.0, mat: MAT.heating }), [d.d / 2 + 3.4, 0, 0]));
    g.add(withPos(shellTubeExchanger({ d: 1.0, l: 3.6 }), [-d.d / 2 - 2.8, 0, 0]));
    g.add(withPos(verticalVessel({ d: 1.4, h: 2.6, mat: MAT.vessel }), [-d.d / 2 - 2.8, 3.0, 0]));
    g.add(withPos(ladder({ h: d.h }), [0, 0, -d.d / 2 - 0.3]));
    g.add(withPos(platform({ w: d.d + 2.6, d: 1.8, y: d.h * 0.8, rails: true }), [0, 0, d.d / 2 + 1.0]));
    g.add(withPos(instrument({ label: 'TIC' }), [d.d / 2 + 0.35, 2.2, 0]));
    lamp(g, refs, TAGS.amineRegenerator, d.h + 1.8);
    add(TAGS.amineRegenerator, g, 'Amine regenerator', 'column', { pos: [-32, 15, -22], target: [-24, 8, -13] });
  }

  // ---- E-501 lean/rich exchanger ------------------------------------------
  {
    const g = new THREE.Group();
    // A plate pack rather than a shell: close approach in a small volume.
    const pack = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, 1.0), MAT.separation);
    pack.position.y = 1.5; pack.castShadow = pack.receiveShadow = true;
    g.add(pack);
    for (let i = -3; i <= 3; i++) {
      g.add(withPos(new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.2, 1.04), MAT.steel), [i * 0.2, 1.5, 0]));
    }
    g.add(frame({ w: 2.0, h: 0.4, d: 1.4 }));
    g.add(withPos(flange({ d: 0.18 }), [-0.9, 2.4, 0]));
    g.add(withPos(flange({ d: 0.18 }), [0.9, 0.7, 0]));
    g.add(withPos(instrument({ label: 'TI' }), [1.1, 2.0, 0.6]));
    lamp(g, refs, TAGS.leanRichExchanger, 3.4);
    add(TAGS.leanRichExchanger, g, 'Lean/rich amine exchanger', 'exchanger', { pos: [-22, 8, -2], target: [-17, 2, -7] });
  }

  // ---- P-501 amine circulation pump ---------------------------------------
  {
    const g = new THREE.Group();
    [-1.2, 1.2].forEach((z, i) => {
      const p = centrifugalPump({ s: 1.1 });
      p.position.set(0, 0, z);
      const m = p.getObjectByName('motor');
      if (m) { m.material = m.material.clone(); refs.motors.set(`${TAGS.aminePump}#${i}`, m); }
      g.add(p);
      g.add(withPos(valve({ s: 1.1 }), [1.7, 0.9, z]));
    });
    g.add(withPos(instrument({ label: 'PI' }), [2.4, 1.6, 0]));
    lamp(g, refs, TAGS.aminePump, 2.4);
    add(TAGS.aminePump, g, 'Amine circulation pump', 'pump', { pos: [-35, 7, -2], target: [-30, 1.5, -7] });
  }

  // ---- T-503 glycol contactor ---------------------------------------------
  {
    const d = DIM.glycolContactor, g = new THREE.Group();
    g.add(column({ d: d.d, h: d.h, trays: d.trays }));
    liquidIn(g, refs, TAGS.glycolContactor, { d: d.d, h: 2.2, frac0: 0.5 });
    g.add(withPos(ladder({ h: d.h }), [-d.d / 2 - 0.3, 0, 0]));
    [0.45, 0.9].forEach(f => g.add(withPos(platform({ w: d.d + 2.6, d: 1.6, y: d.h * f, rails: true }), [0, 0, d.d / 2 + 0.9])));
    g.add(withPos(stairs({ steps: 22, w: 1.0 }), [d.d / 2 + 1.3, 0, d.d / 2 + 2.4]));
    g.add(withPos(nozzle({ d: 0.22, l: 0.6 }), [0, d.h, 0]));
    g.add(withPos(instrument({ label: 'MIT' }), [d.d / 2 + 0.35, d.h * 0.92, 0]));
    lamp(g, refs, TAGS.glycolContactor, d.h + 1.8);
    add(TAGS.glycolContactor, g, 'Glycol contactor', 'column', { pos: [-13, 14, 12], target: [-6, 7, 0] });
  }

  // ---- T-504 glycol regenerator -------------------------------------------
  {
    const d = DIM.glycolRegen, g = new THREE.Group();
    g.add(withPos(horizontalVessel({ d: 1.6, l: 4.2, mat: MAT.heating }), [0, 0, 0]));
    g.add(withPos(tank({ d: d.d, h: d.h, mat: MAT.steelDark }), [0, 2.4, 0]));
    g.add(withPos(new THREE.Mesh(new THREE.ConeGeometry(d.d / 2 + 0.2, 0.8, 14), MAT.steelDark), [0, 2.4 + d.h + 0.4, 0]));
    // Flash separator and the glycol pump on the skid.
    g.add(withPos(verticalVessel({ d: 1.0, h: 1.8, mat: MAT.vessel }), [2.8, 0.6, 0]));
    const gp = centrifugalPump({ s: 0.6 });
    gp.position.set(-2.6, 0, 0.8);
    const gm = gp.getObjectByName('motor');
    if (gm) { gm.material = gm.material.clone(); refs.motors.set(TAGS.glycolRegenerator, gm); }
    g.add(gp);
    g.add(withPos(instrument({ label: 'TIC' }), [1.0, 2.4, 0.9]));
    // Water vapour off the still, only while the unit is removing water.
    const still = plume({ h: 5.5, r: 0.35, spread: 1.8, count: 60, colour: 0xe6edf5, rise: 1.6, size: 1.0, opacity: 0.26 });
    still.position.y = 2.4 + d.h + 0.9;
    g.add(still);
    refs.still = still;
    lamp(g, refs, TAGS.glycolRegenerator, 2.4 + d.h + 2.2);
    add(TAGS.glycolRegenerator, g, 'Glycol regenerator', 'column', { pos: [-12, 12, -20], target: [-6, 5, -12] });
  }

  // ---- E-502 cold box ------------------------------------------------------
  {
    const d = DIM.coldBox, g = new THREE.Group();
    // An insulated box packed with perlite, which is what a cold box is.
    const shell = new THREE.Mesh(new THREE.BoxGeometry(d.w, d.h, d.d), MAT.instrument);
    shell.position.y = d.h / 2 + 0.5; shell.castShadow = shell.receiveShadow = true;
    g.add(shell);
    refs.cold.push(shell);
    shell.material = shell.material.clone();
    g.add(frame({ w: d.w + 0.6, h: 0.5, d: d.d + 0.6 }));
    for (let y = 2; y < d.h; y += 2.6) {
      g.add(withPos(new THREE.Mesh(new THREE.BoxGeometry(d.w + 0.14, 0.12, d.d + 0.14), MAT.steel), [0, y, 0]));
    }
    g.add(withPos(ladder({ h: d.h }), [-d.w / 2 - 0.3, 0.5, 0]));
    g.add(withPos(platform({ w: d.w + 2.4, d: 1.6, y: d.h, rails: true }), [0, 0, d.d / 2 + 0.9]));
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) =>
      g.add(withPos(flange({ d: 0.28 }), [sx * d.w * 0.3, d.h + 0.5, sz * d.d * 0.3])));
    g.add(withPos(instrument({ label: 'TI' }), [d.w / 2 + 0.3, 4.0, 0]));
    lamp(g, refs, TAGS.coldBox, d.h + 2.2);
    add(TAGS.coldBox, g, 'Gas/gas cold box', 'exchanger', { pos: [3, 12, 12], target: [8, 5, 0] });
  }

  // ---- EX-501 turboexpander ------------------------------------------------
  {
    const g = new THREE.Group();
    g.add(withPos(new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.4, 2.6), MAT.concrete), [0, 0.2, 0]));
    // Expander wheel and booster wheel on one shaft, in one casing.
    const rotor = new THREE.Group();
    rotor.name = 'rotor';
    rotor.add(withPos(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.6, 10), MAT.steel), [0, 0, 0], [0, 0, Math.PI / 2]));
    for (const sx of [-0.75, 0.75]) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.09), MAT.steel);
        b.position.set(sx, Math.cos(a) * 0.28, Math.sin(a) * 0.28);
        b.rotation.set(a, 0, 0);
        rotor.add(b);
      }
    }
    rotor.position.set(0, 1.6, 0);
    g.add(rotor);
    refs.rotors.push({ tag: TAGS.expander, obj: rotor, base: 18, speed: 0, axis: 'x' });
    const casing = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 2.4, 24), MAT.vessel);
    casing.position.set(0, 1.6, 0); casing.rotation.z = Math.PI / 2;
    casing.castShadow = casing.receiveShadow = true;
    g.add(casing);
    refs.cold.push(casing);
    casing.material = casing.material.clone();
    [-1.4, 1.4].forEach(x => g.add(withPos(new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.5, 22), MAT.steelDark), [x, 1.6, 0], [0, 0, Math.PI / 2])));
    // Joule–Thomson bypass valve, which is what runs when the machine is down.
    g.add(pipe([[-2.2, 2.8, 1.1], [0, 3.4, 1.1], [2.2, 2.8, 1.1]], { r: 0.16, mat: MAT.steelDark }));
    g.add(withPos(valve({ s: 1.3 }), [0, 3.4, 1.1]));
    g.add(withPos(instrument({ label: 'SI' }), [1.6, 2.6, -0.9]));
    lamp(g, refs, TAGS.expander, 4.2);
    add(TAGS.expander, g, 'Turboexpander', 'compressor', { pos: [14, 8, 10], target: [17, 2.5, 0] });
  }

  // ---- V-502 cold separator ------------------------------------------------
  {
    const d = DIM.coldSeparator, g = new THREE.Group();
    const vessel = verticalVessel({ d: d.d, h: d.h, mat: MAT.vessel });
    vessel.position.y = 1.2;
    g.add(vessel);
    vessel.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); refs.cold.push(o); } });
    liquidIn(g, refs, TAGS.coldSeparator, { d: d.d, h: d.h * 0.45, base: 1.2, frac0: 0.4 });
    g.add(frame({ w: 2.2, h: 1.2, d: 2.2 }));
    g.add(withPos(ladder({ h: d.h }), [-d.d / 2 - 0.3, 1.2, 0]));
    g.add(withPos(instrument({ label: 'LIT' }), [d.d / 2 + 0.3, 3.0, 0]));
    g.add(withPos(nozzle({ d: 0.24, l: 0.6 }), [0, 1.2 + d.h, 0]));
    lamp(g, refs, TAGS.coldSeparator, d.h + 3.0);
    add(TAGS.coldSeparator, g, 'Cold separator', 'vessel', { pos: [29, 9, 10], target: [24, 4, 0] });
  }

  // ---- T-505 demethaniser --------------------------------------------------
  {
    const d = DIM.demethaniser, g = new THREE.Group();
    const col = column({ d: d.d, h: d.h, trays: d.trays });
    g.add(col);
    col.traverse(o => { if (o.isMesh && o.material === MAT.vessel) { o.material = o.material.clone(); refs.cold.push(o); } });
    liquidIn(g, refs, TAGS.demethaniser, { d: d.d, h: 3.4, frac0: 0.5 });
    // Side and bottom reboilers, heated by the warm inlet gas.
    g.add(withPos(shellTubeExchanger({ d: 1.0, l: 3.4 }), [d.d / 2 + 2.6, 0, 0]));
    g.add(withPos(shellTubeExchanger({ d: 0.9, l: 3.0 }), [d.d / 2 + 2.6, 9.0, 0]));
    g.add(withPos(ladder({ h: d.h }), [-d.d / 2 - 0.3, 0, 0]));
    [0.28, 0.55, 0.82].forEach(f => g.add(withPos(platform({ w: d.d + 3.4, d: 1.8, y: d.h * f, rails: true }), [0, 0, d.d / 2 + 1.0])));
    g.add(withPos(stairs({ steps: 30, w: 1.0 }), [d.d / 2 + 1.7, 0, d.d / 2 + 2.9]));
    g.add(withPos(instrument({ label: 'TIT' }), [-d.d / 2 - 0.35, 2.6, 0]));
    g.add(withPos(instrument({ label: 'AIT' }), [-d.d / 2 - 0.35, d.h * 0.9, 0]));
    lamp(g, refs, TAGS.demethaniser, d.h + 2.2);
    add(TAGS.demethaniser, g, 'Demethaniser', 'column', { pos: [42, 22, 18], target: [33, 13, 0] });
  }

  // ---- K-501 residue compressor -------------------------------------------
  {
    const g = new THREE.Group();
    const train = compressorTrain({ stages: 2, d: 1.4, l: 2.6, mat: MAT.vessel });
    g.add(train);
    const m = train.getObjectByName('motor');
    if (m) { m.material = m.material.clone(); refs.motors.set(TAGS.residueCompressor, m); }
    // Shelter over the machine, which is what a compressor station looks like.
    g.add(withPos(new THREE.Mesh(new THREE.BoxGeometry(11, 0.24, 6.4), MAT.grating), [0, 5.4, 0]));
    [[-5, -3], [5, -3], [-5, 3], [5, 3]].forEach(([x, z]) =>
      g.add(withPos(new THREE.Mesh(new THREE.BoxGeometry(0.24, 5.4, 0.24), MAT.frame), [x, 2.7, z])));
    // Aftercooler bank on the roof.
    for (const x of [-2.4, 0, 2.4]) {
      const fan = new THREE.Group();
      fan.name = 'rotor';
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.04, 0.2), MAT.steelDark);
        b.position.set(Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42);
        b.rotation.set(0, -a, 0.3);
        fan.add(b);
      }
      fan.position.set(x, 5.9, 0);
      g.add(fan);
      g.add(withPos(new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.05, 8, 22), MAT.frame), [x, 5.85, 0], [Math.PI / 2, 0, 0]));
      refs.rotors.push({ tag: TAGS.residueCompressor, obj: fan, base: 12, speed: 0 });
    }
    g.add(withPos(instrument({ label: 'SI' }), [3.4, 2.0, 2.0]));
    g.add(withPos(instrument({ label: 'TIT' }), [-3.4, 2.0, 2.0]));
    lamp(g, refs, TAGS.residueCompressor, 6.6);
    add(TAGS.residueCompressor, g, 'Residue gas compressor', 'compressor', { pos: [56, 12, -2], target: [47, 3, -9] });
  }

  // ---- TK-501 natural gas liquids storage ---------------------------------
  {
    const d = DIM.sphere, g = new THREE.Group();
    g.add(sphereTank({ d: d.d, legs: 6, mat: MAT.product }));
    // Bullets alongside for the heavier product.
    [-1, 1].forEach(sz => g.add(withPos(horizontalVessel({ d: 2.2, l: 8.0, mat: MAT.product }), [0, 0, sz * 8.5])));
    g.add(withPos(instrument({ label: 'PIT' }), [d.d / 2 + 0.6, 4.0, 0]));
    g.add(withPos(instrument({ label: 'LIT' }), [-d.d / 2 - 0.6, 4.0, 0]));
    const lp = centrifugalPump({ s: 1.0 });
    lp.position.set(d.d / 2 + 3.0, 0, 0);
    g.add(lp);
    for (const [bx, bz] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) g.add(withPos(bollard({ h: 1.1 }), [bx, 0, bz]));
    lamp(g, refs, TAGS.nglStorage, d.d + 3.4);
    add(TAGS.nglStorage, g, 'Natural gas liquids storage', 'tank', { pos: [58, 14, 22], target: [47, 5, 11] });
  }

  // ---- MCC-501 motor control centre ---------------------------------------
  {
    const g = new THREE.Group();
    const shed = new THREE.Mesh(new THREE.BoxGeometry(9.0, 3.6, 5.2), MAT.cabinet);
    shed.position.y = 1.8; shed.castShadow = shed.receiveShadow = true;
    g.add(shed);
    g.add(withPos(new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.22, 5.8), MAT.concrete), [0, 3.7, 0]));
    [-2.8, 0, 2.8].forEach(x => g.add(withPos(cabinet({ w: 1.1, h: 2.1, d: 0.7 }), [x, 0, 3.2])));
    g.add(withPos(instrument({ label: 'JI' }), [4.8, 2.2, 0]));
    lamp(g, refs, TAGS.mcc, 4.4);
    add(TAGS.mcc, g, 'Motor control centre', 'block', { pos: [20, 10, 24], target: [14, 2, 15] });
  }

  // ---- pipe rack, services and stream tracer paths -------------------------
  buildRack(view);
  const tray = cableTray({ l: 78, w: 0.6, y: 5.0 });
  tray.position.set(4, 0, 8.0);
  view.add(tray);
  for (const [bx, bz] of [[-34, 6], [-14, 6], [6, -6], [28, -6], [42, 6]]) {
    const b = bollard({ h: 1.0 }); b.position.set(bx, 0, bz); view.add(b);
  }

  const routes = streamRoutes();
  for (const [id, r] of Object.entries(routes)) {
    view.add(pipe(r.path, { r: r.bore, mat: r.mat ?? MAT.pipe }));
    streams?.add(id, r.path, { phase: r.phase, maxTracers: r.tracers ?? 26 });
  }

  // ---- one ticker for everything that moves -------------------------------
  // Rendering stays on the shared rAF loop; nothing here rebuilds geometry.
  view.onTick((dt, t) => {
    for (const r of refs.rotors) {
      if (!(r.speed > 0) || !r.obj) continue;
      if (r.axis === 'x') r.obj.rotation.x += dt * r.speed; else r.obj.rotation.y += dt * r.speed;
    }
    pulseLamps(refs.lamps.values(), t);
    refs.flame?.userData.update(dt, refs.flareRate ?? 0);
    refs.still?.userData.update(dt, refs.stillRate ?? 0);
  });

  live = refs;
  return { presets: PRESETS, refs };
}

/** The main pipe rack, which on a gas plant runs the length of the process. */
function buildRack(view) {
  const z = -5.0, y = 6.4;
  for (let x = -38; x <= 42; x += 6.5) {
    const bent = frame({ w: 2.2, h: y, d: 2.2 });
    bent.position.set(x, 0, z);
    view.add(bent);
  }
  [-0.7, 0, 0.7].forEach(o => view.add(pipe([[-39, y - 0.4, z + o], [43, y - 0.4, z + o]], { r: 0.12 })));
  view.add(pipe([[-39, y - 1.1, z], [43, y - 1.1, z]], { r: 0.09, mat: MAT.steelDark }));
  for (let x = -34; x <= 40; x += 8) {
    const sup = pipeSupport({ w: 1.3, h: 0.7 });
    sup.position.set(x, 0, 5.2);
    view.add(sup);
  }
}

/**
 * Tracer paths. The ids are engine stream ids, so a path only ever animates
 * when the engine has reported a non-zero flow for that exact stream.
 */
function streamRoutes() {
  const P = tag => L[tag];
  const ac = DIM.amineContactor, gc = DIM.glycolContactor, dm = DIM.demethaniser;
  return {
    [STREAMS.wellheadFeed]: {
      phase: 'gas', bore: 0.26,
      path: [[-54, 3.0, 0], [-49, 3.0, 0], [P(TAGS.inletSeparator).x - DIM.separator.l / 2, 2.6, 0]]
    },
    [STREAMS.separatedGas]: {
      phase: 'gas', bore: 0.24,
      path: [[P(TAGS.inletSeparator).x + DIM.separator.l / 2, 3.4, 0], [-36, 3.4, 0], [P(TAGS.amineContactor).x, 2.4, 0]]
    },
    [STREAMS.condensate]: {
      phase: 'liquid', bore: 0.1, tracers: 16,
      path: [[P(TAGS.inletSeparator).x + 3.0, 0.8, 1.6], [-42, 1.0, 7], [P(TAGS.stabiliser).x, 2.4, 11.2]]
    },
    [STREAMS.producedWater]: {
      phase: 'liquid', bore: 0.06, tracers: 12, mat: MAT.separation,
      path: [[P(TAGS.inletSeparator).x + 3.1, -0.8, 0], [-39, 0.4, 6], [P(TAGS.stabiliser).x + 2.0, 0.6, 11.0]]
    },
    [STREAMS.sweetGas]: {
      phase: 'gas', bore: 0.24,
      path: [[P(TAGS.amineContactor).x, ac.h, 0], [-18, ac.h + 1.0, 0], [-10, gc.h + 1.0, 0], [P(TAGS.glycolContactor).x, gc.h * 0.5, 0]]
    },
    [STREAMS.richAmine]: {
      phase: 'liquid', bore: 0.12, mat: MAT.utility,
      path: [[P(TAGS.amineContactor).x, 1.2, 0], [-22, 1.4, -4], [P(TAGS.leanRichExchanger).x, 2.4, P(TAGS.leanRichExchanger).z]]
    },
    [STREAMS.leanAmine]: {
      phase: 'liquid', bore: 0.12, mat: MAT.utility,
      path: [[P(TAGS.aminePump).x + 1.8, 1.0, P(TAGS.aminePump).z], [-27, 6.0, -5], [-25, ac.h * 0.95, -1.4], [P(TAGS.amineContactor).x, ac.h * 0.98, 0]]
    },
    [STREAMS.acidGas]: {
      phase: 'gas', bore: 0.16, tracers: 20,
      path: [[P(TAGS.amineRegenerator).x, DIM.amineRegen.h + 1.0, -13], [-34, 16, -18], [P(TAGS.flare).x, DIM.flare.h * 0.6, P(TAGS.flare).z + 2]]
    },
    [STREAMS.dryGas]: {
      phase: 'gas', bore: 0.24,
      path: [[P(TAGS.glycolContactor).x, gc.h, 0], [-1, gc.h + 0.6, 0], [4, 9.0, 0], [P(TAGS.coldBox).x - 1.8, 8.0, 0]]
    },
    [STREAMS.richGlycol]: {
      phase: 'liquid', bore: 0.05, tracers: 14, mat: MAT.feed,
      path: [[P(TAGS.glycolContactor).x - 1.0, 1.4, 0], [-8.5, 1.6, -6], [P(TAGS.glycolRegenerator).x + 2.4, 1.6, -12]]
    },
    [STREAMS.leanGlycol]: {
      phase: 'liquid', bore: 0.05, tracers: 14, mat: MAT.feed,
      path: [[P(TAGS.glycolRegenerator).x - 2.4, 1.2, -12], [-10, 8, -7], [-8, gc.h * 0.96, -1.2], [P(TAGS.glycolContactor).x, gc.h * 0.98, 0]]
    },
    [STREAMS.regenVapour]: {
      phase: 'steam', bore: 0.1, tracers: 12,
      path: [[P(TAGS.glycolRegenerator).x, 2.4 + DIM.glycolRegen.h + 0.6, -12], [-6, 14, -14], [-6, 16, -16]]
    },
    [STREAMS.chilledGas]: {
      phase: 'gas', bore: 0.24,
      path: [[P(TAGS.coldBox).x, DIM.coldBox.h + 0.5, 0], [12, 7.0, 0], [P(TAGS.expander).x - 2.2, 2.8, 0]]
    },
    [STREAMS.expanderOutlet]: {
      phase: 'gas', bore: 0.26,
      path: [[P(TAGS.expander).x + 2.2, 1.6, 0], [21, 2.0, 0], [P(TAGS.coldSeparator).x, 5.2, 0]]
    },
    [STREAMS.coldLiquid]: {
      phase: 'liquid', bore: 0.12, tracers: 18,
      path: [[P(TAGS.coldSeparator).x, 1.4, 0], [28, 1.6, 0], [P(TAGS.demethaniser).x, dm.h * 0.62, 0]]
    },
    [STREAMS.residueGas]: {
      phase: 'gas', bore: 0.26,
      path: [[P(TAGS.demethaniser).x, dm.h, 0], [38, dm.h + 1.0, -3], [P(TAGS.residueCompressor).x - 5.4, 4.4, -9]]
    },
    [STREAMS.nglProduct]: {
      phase: 'liquid', bore: 0.13, tracers: 18, mat: MAT.product,
      path: [[P(TAGS.demethaniser).x, 1.0, 0], [38, 1.4, 5], [P(TAGS.nglStorage).x - 5.0, 2.4, 11]]
    },
    [STREAMS.salesGas]: {
      phase: 'gas', bore: 0.22,
      path: [[P(TAGS.residueCompressor).x + 5.4, 3.6, -9], [56, 3.6, -12], [60, 3.6, -16]]
    }
  };
}

/**
 * Paints the solved state onto the plant. Called on every result change, never
 * per frame. Anything the engine has not reported is left showing nothing
 * rather than a plausible default: liquid bodies hide, lamps go idle, the
 * expander stops turning and the flare goes out.
 */
export function applyState(equipment = {}, streams = []) {
  const refs = live;
  if (!refs) return;

  // Lamp bodies and their halos move together, and a unit in alarm flashes —
  // which is the one thing on a real plot that catches the eye from anywhere.
  for (const [key, l] of refs.lamps) {
    const st = equipment[key];
    setLampState(l, stateColor(st), {
      on: !!st && st.state !== 'off' && st.state !== 'stopped',
      alarm: !!st && (st.alarm === true || st.state === 'tripped')
    });
  }

  for (const [key, m] of refs.motors) {
    m.material.color.setHex(stateColor(equipment[key.split('#')[0]]));
  }

  for (const [key, lv] of refs.levels) {
    const st = equipment[key.split('#')[0]];
    const frac = st?.level;
    if (!Number.isFinite(frac) || frac <= 0) { lv.mesh.visible = false; continue; }
    lv.mesh.visible = true;
    lv.mesh.scale.y = Math.max(frac / lv.frac0, 0.02);
    lv.mesh.position.y = lv.base + lv.h * frac / 2;
  }

  // Cold steel frosts. The reading is the engine's own, parsed back out of the
  // formatted value it reported for the expander.
  const coldTemp = readNumber(equipment[TAGS.expander]?.values?.['Outlet temperature']);
  const frost = coldTemp === null ? 0 : Math.min(Math.max((-coldTemp) / 80, 0), 1);
  for (const mesh of refs.cold) {
    mesh.material.color.copy(WARM_STEEL).lerp(FROSTED, frost);
    if ('roughness' in mesh.material) mesh.material.roughness = 0.2 + 0.55 * frost;
  }

  // The flare burns what the engine sent to it, and nothing when it sent none.
  const acid = streams.find(s => s.id === STREAMS.acidGas);
  refs.flareRate = Number.isFinite(acid?.flow) && acid.flow > 0
    ? Math.min(0.25 + acid.flow / 400, 1) : 0;
  const vapour = streams.find(s => s.id === STREAMS.regenVapour);
  refs.stillRate = Number.isFinite(vapour?.flow) && vapour.flow > 0 ? 1 : 0;

  for (const r of refs.rotors) {
    const st = equipment[r.tag];
    const running = st && st.state !== 'stopped' && st.state !== 'tripped' && st.state !== 'off';
    // The machines report their own speed; the cooler fans turn at a fixed rate.
    const rpm = Number.isFinite(st?.speed) ? st.speed : null;
    r.speed = running ? (rpm !== null ? Math.min(rpm * 2 * Math.PI / 60 * 0.006, 30) : r.base) : 0;
  }
}

/** Read a number back out of an engine-formatted value, or null if there is none. */
function readNumber(formatted) {
  if (typeof formatted !== 'string') return null;
  const n = parseFloat(formatted);
  return Number.isFinite(n) ? n : null;
}

export default { build, applyState, presets: PRESETS, layout: L };
