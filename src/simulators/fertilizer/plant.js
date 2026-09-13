/**
 * 03 — AMMONIA–UREA FERTILIZER PLANT — 3D plant.
 *
 * Composes scene/geometry.js primitives only. This module owns geometry and
 * nothing else: it never computes a process value. Everything it shows comes
 * from engine.getEquipmentState() and engine.getStreams(), handed to it by the
 * workspace as plain data.
 *
 * Tags come from engine.js so the 3D group's userData.tag, the flowsheet node
 * tag and the engine's own key are one string by construction.
 *
 * The plot runs west to east in the order the material does: synthesis gas
 * compression, the ammonia loop, ammonia storage, then the urea section and the
 * prilling tower that dominates the skyline at the east end.
 */
import * as THREE from 'three';
import {
  compressorTrain, sphereTank, column, verticalVessel, horizontalVessel, tank,
  hopperVessel, shellTubeExchanger, pipe, valve, platform, stairs, frame,
  instrument, cabinet, statusLamp, ladder, flange, nozzle, cableTray, bollard, pipeSupport
} from '../../scene/geometry.js';
import { MAT, STATE_COLOR } from '../../scene/materials.js';
import { TAGS, STREAMS } from './engine.js';

// ---------------------------------------------------------------------------
// Plot plan. One place to move a unit; every pipe run is derived from it.
// ---------------------------------------------------------------------------
const L = {
  [TAGS.makeupComp]: { x: -32, z: -8 },
  [TAGS.recycleComp]: { x: -32, z: 5 },
  [TAGS.converter]: { x: -21, z: 0 },
  [TAGS.wasteHeatBoiler]: { x: -13, z: -7.5 },
  [TAGS.chiller]: { x: -13, z: 7 },
  [TAGS.separator]: { x: -5, z: 0 },
  [TAGS.purgeRecovery]: { x: -5, z: -11 },
  [TAGS.ammoniaStorage]: { x: 3, z: -10 },
  [TAGS.co2Comp]: { x: 3, z: 10 },
  [TAGS.ureaReactor]: { x: 12, z: 0 },
  [TAGS.stripper]: { x: 19, z: 0 },
  [TAGS.carbamateCondenser]: { x: 19, z: 9 },
  [TAGS.evaporator]: { x: 26, z: 0 },
  [TAGS.prillTower]: { x: 36, z: 0 },
  [TAGS.productBin]: { x: 46, z: 0 },
  [TAGS.mcc]: { x: 26, z: -11 }
};
const DIM = {
  converter: { d: 2.6, h: 17, trays: 4 },
  separator: { d: 2.4, h: 8 },
  purgeRecovery: { d: 1.6, h: 6 },
  ammoniaSphere: { d: 8 },
  ureaReactor: { d: 3.0, h: 20 },
  stripper: { d: 2.0, h: 14, trays: 6 },
  carbamateCondenser: { d: 1.8, l: 6 },
  evaporator: { d: 2.2, h: 9 },
  prillTower: { d: 9, h: 58 },
  bin: { w: 5, l: 5, h: 5, hopper: 3 }
};

// ---------------------------------------------------------------------------
// Camera presets. The ids are fixed by scene/cameras.js PRESET_ORDER.
// ---------------------------------------------------------------------------
// Sight lines checked against the plot plan: the prilling tower is nearly 60 m
// tall, so the overview stands well back and high enough to keep it in frame.
const PRESETS = {
  overview: { pos: [52, 40, 64], target: [10, 15, 0] },
  feed: { pos: [-42, 14, 16], target: [-30, 4, -2] },
  main: { pos: [-22, 18, 24], target: [-16, 7, 0] },
  separation: { pos: [-2, 14, 20], target: [-5, 5, 0] },
  utilities: { pos: [22, 16, 24], target: [17, 6, 4] },
  products: { pos: [70, 48, 62], target: [37, 28, 0] },
  control: { pos: [30, 8, -4], target: [26, 2, -11] }
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
// The converter shell carries its duty: cold steel when idle, glowing when the
// exotherm is running.
const SHELL_COLD = new THREE.Color().copy(MAT.vessel.color);
const SHELL_HOT = new THREE.Color(0xc25a38);
const TOWER_SHELL = new THREE.MeshStandardMaterial({ color: 0x8d8497, roughness: 0.96, metalness: 0.02 });
const PRODUCT_OFF = new THREE.Color(0x8c8272);
const PRODUCT_ON = new THREE.Color(0xf0e7d2);

const withPos = (obj, [x, y, z]) => { obj.position.set(x, y, z); return obj; };

function lamp(grp, refs, tag, y, x = 0, z = 0) {
  const l = statusLamp({});
  l.position.set(x, y, z);
  grp.add(l);
  refs.lamps.set(tag, l);
  return l;
}
function trackLevel(refs, tag, mesh, geom) {
  if (!mesh) return;
  mesh.visible = false;
  refs.levels.set(tag, { mesh, ...geom });
}

export function build(view, streams) {
  const refs = {
    lamps: new Map(), levels: new Map(), motors: new Map(),
    shells: [], product: [], view
  };
  const add = (tag, group, name, type, camera) => {
    group.position.set(L[tag].x, 0, L[tag].z);
    view.addEquipment(group, { tag, name, type, camera });
    return group;
  };
  /** Liquid inside a vertical vessel, driven by the engine's reported level. */
  function liquidIn(grp, tag, refs, { d, h, base = 0, frac0 = 0.5, mat = MAT.liquid }) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(d / 2 * 0.96, d / 2 * 0.96, h * frac0, 28), mat);
    mesh.position.set(0, base + h * frac0 / 2, 0);
    grp.add(mesh);
    trackLevel(refs, tag, mesh, { h, base, frac0 });
    return mesh;
  }
  const withMotor = (grp, tag, refs) => {
    const m = grp.getObjectByName('motor');
    if (m) { m.material = m.material.clone(); refs.motors.set(tag, m); }
    return grp;
  };

  // ---- K-301 makeup compressor ---------------------------------------------
  {
    const g = new THREE.Group();
    g.add(withMotor(compressorTrain({ stages: 3, d: 1.2, l: 2.1 }), TAGS.makeupComp, refs));
    g.add(withPos(instrument({ label: 'PIT' }), [0, 2.4, 1.6]));
    g.add(withPos(bollard({}), [-4.5, 0, 2.2]));
    lamp(g, refs, TAGS.makeupComp, 3.2);
    add(TAGS.makeupComp, g, 'Syngas makeup compressor', 'compressor', { pos: [-40, 8, -2], target: [-32, 2, -8] });
  }

  // ---- K-302 recycle compressor --------------------------------------------
  {
    const g = new THREE.Group();
    g.add(withMotor(compressorTrain({ stages: 2, d: 1.1, l: 2.0 }), TAGS.recycleComp, refs));
    g.add(withPos(instrument({ label: 'FIT' }), [0, 2.3, 1.5]));
    lamp(g, refs, TAGS.recycleComp, 3.0);
    add(TAGS.recycleComp, g, 'Synthesis loop recycle compressor', 'compressor', { pos: [-40, 8, 12], target: [-32, 2, 5] });
  }

  // ---- R-301 ammonia converter ---------------------------------------------
  {
    const d = DIM.converter, g = new THREE.Group();
    const col = column({ d: d.d, h: d.h, trays: d.trays });
    g.add(col);
    col.traverse(o => {
      if (o.isMesh && o.material === MAT.vessel) { o.material = o.material.clone(); refs.shells.push(o); }
    });
    g.add(withPos(ladder({ h: d.h - 2 }), [-d.d / 2 - 0.5, 0, 0]));
    g.add(withPos(platform({ w: d.d + 3, d: 2.4, y: d.h * 0.55, rails: true }), [0, 0, d.d / 2 + 1.2]));
    g.add(withPos(platform({ w: d.d + 3, d: 2.4, y: d.h * 0.85, rails: true }), [0, 0, d.d / 2 + 1.2]));
    g.add(withPos(nozzle({ d: 0.3, l: 0.8 }), [0, d.h, 0]));
    g.add(withPos(flange({ d: 0.3 }), [d.d / 2 + 0.6, 1.6, 0]));
    g.add(withPos(instrument({ label: 'TIT' }), [d.d / 2 + 0.5, d.h * 0.4, 0]));
    g.add(withPos(instrument({ label: 'TIT' }), [d.d / 2 + 0.5, d.h * 0.7, 0]));
    lamp(g, refs, TAGS.converter, d.h + 1.8);
    add(TAGS.converter, g, 'Ammonia synthesis converter', 'reactor', { pos: [-30, 14, 14], target: [-21, 8, 0] });
  }

  // ---- E-301 waste-heat boiler ---------------------------------------------
  {
    const g = new THREE.Group();
    g.add(shellTubeExchanger({ d: 1.6, l: 6 }));
    g.add(withPos(tank({ d: 1.8, h: 3.2, mat: MAT.steel }), [0, 0, -3.2]));
    g.add(withPos(instrument({ label: 'TIT' }), [3.2, 2, 0]));
    g.add(withPos(pipeSupport({ w: 1.4, h: 0.6 }), [-2, 0, 2.4]));
    lamp(g, refs, TAGS.wasteHeatBoiler, 3.4);
    add(TAGS.wasteHeatBoiler, g, 'Synthesis waste-heat boiler', 'exchanger', { pos: [-18, 9, -15], target: [-13, 2, -7.5] });
  }

  // ---- E-302 ammonia chiller -----------------------------------------------
  {
    const g = new THREE.Group();
    g.add(shellTubeExchanger({ d: 1.4, l: 5.4, }));
    g.add(withPos(verticalVessel({ d: 1.4, h: 3.4, mat: MAT.separation }), [0, 0, 3.0]));
    g.add(withPos(instrument({ label: 'TIC' }), [3, 2, 0]));
    lamp(g, refs, TAGS.chiller, 3.2);
    add(TAGS.chiller, g, 'Refrigerated ammonia chiller', 'exchanger', { pos: [-18, 9, 15], target: [-13, 2, 7] });
  }

  // ---- V-301 ammonia separator ---------------------------------------------
  {
    const d = DIM.separator, g = new THREE.Group();
    g.add(verticalVessel({ d: d.d, h: d.h, mat: MAT.separation }));
    liquidIn(g, TAGS.separator, refs, { d: d.d, h: d.h, frac0: 0.6 });
    g.add(withPos(ladder({ h: d.h }), [-d.d / 2 - 0.45, 0, 0]));
    g.add(withPos(platform({ w: d.d + 2.6, d: 2, y: d.h * 0.75, rails: true }), [0, 0, d.d / 2 + 1]));
    g.add(withPos(instrument({ label: 'LIT' }), [d.d / 2 + 0.45, d.h * 0.45, 0]));
    g.add(withPos(nozzle({ d: 0.22, l: 0.6 }), [0, d.h + 0.4, 0]));
    lamp(g, refs, TAGS.separator, d.h + 2.2);
    add(TAGS.separator, g, 'Ammonia separator', 'vessel', { pos: [-12, 10, 12], target: [-5, 4, 0] });
  }

  // ---- V-302 purge gas recovery --------------------------------------------
  {
    const d = DIM.purgeRecovery, g = new THREE.Group();
    g.add(verticalVessel({ d: d.d, h: d.h, mat: MAT.utility }));
    g.add(withPos(verticalVessel({ d: 1.2, h: 4.4, mat: MAT.utility }), [2.6, 0, 0]));
    g.add(withPos(ladder({ h: d.h }), [-d.d / 2 - 0.4, 0, 0]));
    g.add(withPos(valve({ s: 1.1 }), [0, 1.2, d.d / 2 + 0.5]));
    g.add(withPos(instrument({ label: 'AIT' }), [d.d / 2 + 0.4, 3, 0]));
    lamp(g, refs, TAGS.purgeRecovery, d.h + 1.6);
    add(TAGS.purgeRecovery, g, 'Purge gas hydrogen recovery', 'vessel', { pos: [-10, 8, -18], target: [-5, 3, -11] });
  }

  // ---- T-301 liquid ammonia storage ----------------------------------------
  {
    const d = DIM.ammoniaSphere, g = new THREE.Group();
    g.add(sphereTank({ d: d.d, legs: 8, mat: MAT.product }));
    g.add(withPos(ladder({ h: d.d / 2 + 1.6 }), [-d.d / 2 - 0.3, 0, 0]));
    g.add(withPos(instrument({ label: 'LIT' }), [d.d / 2 + 0.4, 4, 0]));
    [[-1, -1], [1, 1]].forEach(([sx, sz]) => g.add(withPos(bollard({}), [sx * 5.5, 0, sz * 5.5])));
    lamp(g, refs, TAGS.ammoniaStorage, d.d + 3.2);
    add(TAGS.ammoniaStorage, g, 'Liquid ammonia storage', 'tank', { pos: [10, 11, -20], target: [3, 5, -10] });
  }

  // ---- K-303 carbon dioxide compressor -------------------------------------
  {
    const g = new THREE.Group();
    g.add(withMotor(compressorTrain({ stages: 4, d: 1.0, l: 1.8, mat: MAT.utility }), TAGS.co2Comp, refs));
    g.add(withPos(instrument({ label: 'PIT' }), [0, 2.2, 1.5]));
    lamp(g, refs, TAGS.co2Comp, 3.0);
    add(TAGS.co2Comp, g, 'Carbon dioxide compressor', 'compressor', { pos: [10, 9, 18], target: [3, 2, 10] });
  }

  // ---- R-302 urea reactor --------------------------------------------------
  {
    const d = DIM.ureaReactor, g = new THREE.Group();
    const col = column({ d: d.d, h: d.h, trays: 8 });
    g.add(col);
    liquidIn(g, TAGS.ureaReactor, refs, { d: d.d, h: d.h, frac0: 0.8, mat: MAT.liquid });
    g.add(withPos(ladder({ h: d.h - 2 }), [-d.d / 2 - 0.55, 0, 0]));
    [0.4, 0.7, 0.95].forEach(fr =>
      g.add(withPos(platform({ w: d.d + 3.2, d: 2.4, y: d.h * fr, rails: true }), [0, 0, d.d / 2 + 1.3])));
    g.add(withPos(nozzle({ d: 0.3, l: 0.8 }), [0, d.h, 0]));
    g.add(withPos(instrument({ label: 'TIT' }), [d.d / 2 + 0.5, d.h * 0.5, 0]));
    g.add(withPos(instrument({ label: 'PIT' }), [d.d / 2 + 0.5, d.h * 0.8, 0]));
    lamp(g, refs, TAGS.ureaReactor, d.h + 1.9);
    add(TAGS.ureaReactor, g, 'Urea synthesis reactor', 'reactor', { pos: [4, 16, 18], target: [12, 9, 0] });
  }

  // ---- C-301 high-pressure stripper ----------------------------------------
  {
    const d = DIM.stripper, g = new THREE.Group();
    g.add(column({ d: d.d, h: d.h, trays: d.trays }));
    g.add(withPos(ladder({ h: d.h - 1.5 }), [-d.d / 2 - 0.45, 0, 0]));
    g.add(withPos(platform({ w: d.d + 2.8, d: 2.2, y: d.h * 0.7, rails: true }), [0, 0, d.d / 2 + 1.1]));
    g.add(withPos(instrument({ label: 'TIT' }), [d.d / 2 + 0.45, d.h * 0.5, 0]));
    lamp(g, refs, TAGS.stripper, d.h + 1.7);
    add(TAGS.stripper, g, 'High-pressure carbamate stripper', 'column', { pos: [12, 13, 16], target: [19, 7, 0] });
  }

  // ---- V-303 carbamate condenser -------------------------------------------
  {
    const d = DIM.carbamateCondenser, g = new THREE.Group();
    g.add(shellTubeExchanger({ d: d.d, l: d.l }));
    g.add(withPos(verticalVessel({ d: 1.5, h: 4, mat: MAT.utility }), [0, 0, 3.2]));
    g.add(withPos(instrument({ label: 'TIT' }), [3.4, 2.1, 0]));
    lamp(g, refs, TAGS.carbamateCondenser, 3.6);
    add(TAGS.carbamateCondenser, g, 'Carbamate condenser', 'exchanger', { pos: [24, 10, 17], target: [19, 3, 9] });
  }

  // ---- E-303 urea evaporator -----------------------------------------------
  {
    const d = DIM.evaporator, g = new THREE.Group();
    g.add(verticalVessel({ d: d.d, h: d.h, mat: MAT.heating }));
    g.add(withPos(shellTubeExchanger({ d: 1.2, l: 4 }), [0, 0, 3.4]));
    g.add(withPos(ladder({ h: d.h }), [-d.d / 2 - 0.45, 0, 0]));
    g.add(withPos(platform({ w: d.d + 2.6, d: 2, y: d.h * 0.75, rails: true }), [0, 0, d.d / 2 + 1]));
    g.add(withPos(instrument({ label: 'TIC' }), [d.d / 2 + 0.45, d.h * 0.5, 0]));
    lamp(g, refs, TAGS.evaporator, d.h + 1.8);
    add(TAGS.evaporator, g, 'Urea evaporation section', 'exchanger', { pos: [32, 11, 15], target: [26, 5, 0] });
  }

  // ---- T-302 prilling tower ------------------------------------------------
  {
    const d = DIM.prillTower, g = new THREE.Group();
    g.add(tank({ d: d.d, h: d.h, mat: TOWER_SHELL }));
    // Banding at each lift, so the height reads at a distance.
    for (let y = 8; y < d.h - 4; y += 9) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(d.d / 2 + 0.06, 0.13, 6, 40), MAT.steelDark);
      band.position.set(0, y, 0);
      band.rotation.x = Math.PI / 2;
      g.add(band);
    }
    // Melt bucket house on the top, and the louvred air inlets at the base.
    g.add(withPos(tank({ d: d.d * 0.45, h: 4, mat: MAT.steel }), [0, d.h, 0]));
    g.add(withPos(nozzle({ d: 0.3, l: 1.2 }), [0, d.h + 4, 0]));
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      g.add(withPos(new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.2, 0.2), MAT.grating),
        [Math.cos(a) * d.d / 2, 1.4, Math.sin(a) * d.d / 2]));
      g.children[g.children.length - 1].rotation.y = -a;
    }
    // The falling curtain of prills, shown only when the engine reports product.
    const curtain = new THREE.Mesh(
      new THREE.CylinderGeometry(d.d * 0.3, d.d * 0.36, d.h - 6, 24, 1, true),
      new THREE.MeshStandardMaterial({
        color: PRODUCT_ON, transparent: true, opacity: 0.22, roughness: 1,
        side: THREE.DoubleSide, depthWrite: false
      })
    );
    curtain.position.y = (d.h - 6) / 2 + 3;
    curtain.visible = false;
    g.add(curtain);
    refs.curtain = curtain;
    g.add(withPos(ladder({ h: d.h - 4 }), [-d.d / 2 - 0.4, 0, 0]));
    g.add(withPos(platform({ w: d.d + 3, d: 2.4, y: d.h - 2, rails: true }), [0, 0, d.d / 2 + 1.2]));
    g.add(withPos(instrument({ label: 'TIT' }), [d.d / 2 + 0.4, 6, 0]));
    lamp(g, refs, TAGS.prillTower, d.h + 6);
    add(TAGS.prillTower, g, 'Urea prilling tower', 'column', { pos: [52, 30, 34], target: [36, 24, 0] });
  }

  // ---- V-304 product bin ---------------------------------------------------
  {
    const d = DIM.bin, g = new THREE.Group();
    g.add(hopperVessel({ w: d.w, l: d.l, h: d.h, hopper: d.hopper, mat: MAT.product }));
    const bed = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(d.l, d.w) * 0.62, d.h * 0.9, 4),
      new THREE.MeshStandardMaterial({ color: PRODUCT_ON, roughness: .95 })
    );
    bed.position.set(0, d.hopper + d.h * 0.45, 0);
    bed.rotation.y = Math.PI / 4;
    g.add(bed);
    trackLevel(refs, TAGS.productBin, bed, { base: d.hopper, span: d.h * 0.9, cone: true });
    refs.product.push(bed);
    g.add(withPos(ladder({ h: d.hopper + d.h }), [-d.l / 2 - 0.4, 0, 0]));
    g.add(withPos(instrument({ label: 'AIT' }), [d.l / 2 + 0.4, d.hopper + 1.5, 0]));
    lamp(g, refs, TAGS.productBin, d.hopper + d.h + 1.8);
    add(TAGS.productBin, g, 'Prilled product bin', 'tank', { pos: [54, 12, 14], target: [46, 4, 0] });
  }

  // ---- MCC-301 -------------------------------------------------------------
  {
    const g = new THREE.Group();
    const shed = new THREE.Mesh(new THREE.BoxGeometry(8, 3.6, 5), MAT.cabinet);
    shed.position.y = 1.8; shed.castShadow = shed.receiveShadow = true;
    g.add(shed);
    g.add(withPos(new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.22, 5.6), MAT.concrete), [0, 3.7, 0]));
    [-2.6, 0, 2.6].forEach(x => g.add(withPos(cabinet({ w: 1.2, h: 2.2, d: 0.7 }), [x, 0, 3.1])));
    g.add(withPos(instrument({ label: 'JI' }), [4.3, 2.2, 0]));
    lamp(g, refs, TAGS.mcc, 4.3);
    add(TAGS.mcc, g, 'Motor control centre', 'block', { pos: [31, 8, -5], target: [26, 2, -11] });
  }

  // ---- rack, cabling and tracer paths --------------------------------------
  buildRack(view);
  const tray = cableTray({ l: 48, w: 0.6, y: 4.4 });
  tray.position.set(6, 0, -6.6);
  view.add(tray);
  for (const [bx, bz] of [[-26, 3], [-16, -4], [8, 5], [22, -5], [40, 5]]) {
    const b = bollard({}); b.position.set(bx, 0, bz); view.add(b);
  }

  const routes = streamRoutes();
  for (const [id, r] of Object.entries(routes)) {
    view.add(pipe(r.path, { r: r.bore, mat: r.mat ?? MAT.pipe }));
    streams?.add(id, r.path, { phase: r.phase, maxTracers: r.tracers ?? 24 });
  }

  live = refs;
  return { presets: PRESETS, refs };
}

/** High-level pipe rack running the length of the plot. */
function buildRack(view) {
  const z = -4.2, y = 6.2;
  for (let x = -26; x <= 30; x += 6.5) {
    const bent = frame({ w: 1.8, h: y, d: 1.8 });
    bent.position.set(x, 0, z);
    view.add(bent);
  }
  [-0.55, 0, 0.55].forEach(o => view.add(pipe([[-26.9, y - 0.4, z + o], [30.9, y - 0.4, z + o]], { r: 0.12 })));
}

/**
 * Tracer paths. The ids are engine stream ids, so a path only animates when the
 * engine has reported a non-zero flow for that exact stream.
 */
function streamRoutes() {
  const cv = DIM.converter, sp = DIM.separator, ur = DIM.ureaReactor, st = DIM.stripper;
  const P = t => L[t];
  return {
    [STREAMS.makeupSyngas]: {
      phase: 'gas', bore: 0.16,
      path: [[-40, 1.4, -8], [-35.5, 1.4, -8], [P(TAGS.makeupComp).x - 2.5, 1.6, -8]]
    },
    [STREAMS.compressedSyngas]: {
      phase: 'gas', bore: 0.15,
      path: [[-28.5, 1.8, -8], [-25, 3.2, -5], [P(TAGS.converter).x - 1.6, 3.6, -1.2]]
    },
    [STREAMS.converterFeed]: {
      phase: 'gas', bore: 0.2,
      path: [[P(TAGS.recycleComp).x + 3, 2.0, 5], [-26, 4.6, 3], [P(TAGS.converter).x - 1.5, 5.2, 1.2], [P(TAGS.converter).x - cv.d / 2, 5.6, 0]]
    },
    [STREAMS.converterEffluent]: {
      phase: 'gas', bore: 0.2,
      path: [[P(TAGS.converter).x, cv.h + 0.8, 0], [-19, cv.h + 0.8, -3], [P(TAGS.wasteHeatBoiler).x, 6, -7.5], [P(TAGS.wasteHeatBoiler).x, 2.6, -7.5]]
    },
    [STREAMS.cooledEffluent]: {
      phase: 'gas', bore: 0.2,
      path: [[P(TAGS.wasteHeatBoiler).x + 3.2, 2.2, -7.5], [-8.5, 3.4, -5], [P(TAGS.chiller).x + 2.6, 3.4, 5.2]]
    },
    [STREAMS.chilledEffluent]: {
      phase: 'gas', bore: 0.2,
      path: [[P(TAGS.chiller).x + 3, 2.2, 7], [-8, 4.4, 4], [P(TAGS.separator).x, 6.6, sp.d / 2 + 0.4]]
    },
    [STREAMS.recycleGas]: {
      phase: 'gas', bore: 0.2, tracers: 30,
      path: [[P(TAGS.separator).x, sp.h + 0.6, 0], [-8, 9.2, 3], [-22, 7.6, 8], [P(TAGS.recycleComp).x + 3.2, 2.4, 5]]
    },
    [STREAMS.purgeGas]: {
      phase: 'gas', bore: 0.09, tracers: 14,
      path: [[P(TAGS.separator).x, sp.h + 0.4, -1], [-5.4, 7.4, -6], [P(TAGS.purgeRecovery).x, 6.4, -11 + 1.2]]
    },
    [STREAMS.recoveredHydrogen]: {
      phase: 'gas', bore: 0.07, tracers: 12,
      path: [[P(TAGS.purgeRecovery).x + 2.6, 4.6, -11], [-16, 5.6, -10], [P(TAGS.makeupComp).x, 2.4, -9.4]]
    },
    [STREAMS.liquidAmmonia]: {
      phase: 'liquid', bore: 0.1,
      path: [[P(TAGS.separator).x, 1.2, 0], [-2, 1.2, -4], [P(TAGS.ammoniaStorage).x - 4.4, 2.2, -10]]
    },
    [STREAMS.ammoniaToUrea]: {
      phase: 'liquid', bore: 0.1,
      path: [[P(TAGS.ammoniaStorage).x + 4.4, 2.2, -10], [8, 3.2, -6], [P(TAGS.ureaReactor).x - ur.d / 2 - 0.4, 3.6, -0.8]]
    },
    [STREAMS.co2Feed]: {
      phase: 'gas', bore: 0.16,
      path: [[P(TAGS.co2Comp).x - 6, 1.4, 10], [P(TAGS.co2Comp).x - 3, 1.6, 10]]
    },
    [STREAMS.compressedCo2]: {
      phase: 'gas', bore: 0.12,
      path: [[P(TAGS.co2Comp).x + 3.4, 1.8, 10], [8, 3.4, 6], [P(TAGS.ureaReactor).x - ur.d / 2 - 0.4, 3.2, 0.8]]
    },
    [STREAMS.reactorEffluent]: {
      phase: 'liquid', bore: 0.13,
      path: [[P(TAGS.ureaReactor).x, ur.h + 0.6, 0], [15, ur.h * 0.8, 0], [P(TAGS.stripper).x, st.h + 0.6, 0]]
    },
    [STREAMS.carbamateRecycle]: {
      phase: 'slurry', bore: 0.11, tracers: 18,
      path: [[P(TAGS.stripper).x, st.h * 0.55, st.d / 2 + 0.4], [19, 9.4, 6], [P(TAGS.carbamateCondenser).x, 4.2, 8], [15, 6.4, 4], [P(TAGS.ureaReactor).x + ur.d / 2 + 0.4, 5.4, 1.4]]
    },
    [STREAMS.ureaSolution]: {
      phase: 'liquid', bore: 0.13,
      path: [[P(TAGS.stripper).x, 1.4, 0], [22, 1.8, 0], [P(TAGS.evaporator).x - DIM.evaporator.d / 2 - 0.4, 3.2, 0]]
    },
    [STREAMS.ureaMelt]: {
      phase: 'liquid', bore: 0.1, tracers: 20,
      path: [[P(TAGS.evaporator).x, DIM.evaporator.h + 0.6, 0], [30, 30, 0], [P(TAGS.prillTower).x, DIM.prillTower.h + 5.4, 0]]
    },
    [STREAMS.prilledProduct]: {
      phase: 'solid', bore: 0.2, tracers: 22,
      path: [[P(TAGS.prillTower).x + DIM.prillTower.d / 2, 1.4, 0], [42, 2.4, 0], [P(TAGS.productBin).x - 1.4, 5.6, 0]]
    }
  };
}

/**
 * Paints the solved state onto the plant. Called on every result change, never
 * per frame. Anything the engine has not reported is left showing nothing rather
 * than a plausible default.
 */
export function applyState(equipment = {}, streams = []) {
  const refs = live;
  if (!refs) return;

  for (const [key, l] of refs.lamps) {
    const st = equipment[key];
    const c = stateColor(st);
    l.material.color.setHex(c);
    l.material.emissive.setHex(c);
    l.material.emissiveIntensity = st ? 1.0 : 0.35;
  }
  for (const [key, m] of refs.motors) {
    m.material.color.setHex(stateColor(equipment[key.split('#')[0]]));
  }
  for (const [key, lv] of refs.levels) {
    const st = equipment[key.split('#')[0]];
    const frac = st?.level;
    if (!Number.isFinite(frac) || frac <= 0) { lv.mesh.visible = false; continue; }
    lv.mesh.visible = true;
    if (lv.cone) {
      lv.mesh.scale.y = Math.max(frac, 0.02);
      lv.mesh.position.y = lv.base + lv.span * frac * 0.5;
    } else {
      lv.mesh.scale.y = Math.max(frac / lv.frac0, 0.02);
      lv.mesh.position.y = lv.base + lv.h * frac / 2;
    }
  }

  // The converter shell carries the exotherm the engine reports.
  const duty = equipment[TAGS.converter]?.duty;
  for (const mesh of refs.shells) {
    if (!Number.isFinite(duty)) mesh.material.color.copy(SHELL_COLD);
    else mesh.material.color.copy(SHELL_COLD).lerp(SHELL_HOT, Math.min(Math.max(duty, 0), 1));
  }

  // The curtain of falling prills only exists while the tower is making product.
  const towerRunning = equipment[TAGS.prillTower]?.state === 'running'
    || equipment[TAGS.prillTower]?.state === 'warning';
  if (refs.curtain) refs.curtain.visible = !!towerRunning;

  for (const mesh of refs.product) {
    mesh.material.color.copy(towerRunning ? PRODUCT_ON : PRODUCT_OFF);
  }
}

export default { build, applyState, presets: PRESETS, layout: L };
