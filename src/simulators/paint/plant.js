/**
 * 04 — PAINT MANUFACTURING PLANT — 3D plant.
 *
 * Composes scene/geometry.js primitives only. This module owns geometry and
 * nothing else: it never computes a process value. Everything it shows comes
 * from engine.getEquipmentState() and engine.getStreams(), handed to it by the
 * workspace as plain data.
 *
 * Equipment tags come from engine.js so the 3D group's userData.tag, the
 * flowsheet node tag and the engine's own key are guaranteed to be one string.
 *
 * The plot runs along +X in the order the batch does: raw materials at the west
 * end, the disperser and the bead mill in the middle, the let-down and the
 * filling line at the east. It is a building rather than a yard — a paint plant
 * is indoors — so the vessels are close together and the structure is a
 * mezzanine rather than a pipe rack.
 */
import * as THREE from 'three';
import {
  tank, verticalVessel, horizontalVessel, hopperVessel, centrifugalPump, blower,
  pipe, valve, platform, stairs, frame, instrument, cabinet, statusLamp, agitator,
  sawtoothBlade, fillingConveyor, ladder, flange, nozzle, cableTray, bollard, pipeSupport,
  setLampState, pulseLamps, plume
} from '../../scene/geometry.js';
import { MAT, STATE_COLOR } from '../../scene/materials.js';
import { TAGS, STREAMS } from './engine.js';

// ---------------------------------------------------------------------------
// Plot plan. One place to move a unit; every pipe run is derived from it.
// ---------------------------------------------------------------------------
const L = {
  [TAGS.resinTank]: { x: -28.0, z: -7.0 },
  [TAGS.solventTank]: { x: -28.0, z: 3.0 },
  [TAGS.additiveSkid]: { x: -27.0, z: 12.0 },
  [TAGS.bagDump]: { x: -13.0, z: -9.5 },
  [TAGS.dustCollector]: { x: -13.0, z: -17.0 },
  [TAGS.disperser]: { x: -6.0, z: 0 },
  [TAGS.chiller]: { x: -6.0, z: 11.0 },
  [TAGS.beadMill]: { x: 5.0, z: 0 },
  [TAGS.letdownTank]: { x: 15.0, z: 0 },
  [TAGS.transferPump]: { x: 22.5, z: 0 },
  [TAGS.filter]: { x: 26.0, z: 0 },
  [TAGS.fillingLine]: { x: 33.0, z: 0 },
  [TAGS.qualityLab]: { x: 31.0, z: -12.0 },
  [TAGS.mcc]: { x: -22.0, z: 15.0 }
};
// Vessel dimensions, shared between the geometry and the pipe routing.
const DIM = {
  resin: { d: 4.4, h: 6.5 },
  solvent: { d: 4.4, h: 6.5 },
  disperser: { d: 3.6, h: 4.6, blade: 1.2, shaft: 5.6 },
  letdown: { d: 4.6, h: 5.0 },
  beadMill: { d: 0.9, l: 3.4, axis: 1.5 },
  dust: { d: 1.8, h: 5.2 },
  bag: { w: 2.4, l: 2.4, h: 2.0, hopper: 1.4 },
  filter: { d: 0.9, h: 1.8 }
};

// ---------------------------------------------------------------------------
// Camera presets. The ids are fixed by scene/cameras.js PRESET_ORDER.
// ---------------------------------------------------------------------------
const PRESETS = {
  overview: { pos: [26, 21, 34], target: [2, 2, 0] },
  feed: { pos: [-34, 12, 12], target: [-24, 3, -1] },
  main: { pos: [-13, 10, 12], target: [-6, 3, 0] },
  separation: { pos: [8, 8, 13], target: [8, 2, 0] },
  utilities: { pos: [-10, 9, 20], target: [-8, 2, 11] },
  products: { pos: [34, 9, 15], target: [27, 2, 0] },
  control: { pos: [36, 8, -4], target: [31, 2, -11] }
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
// The mill base goes from a grey, unwetted slurry to a smooth white as the
// grind comes in, and the finished paint is whiter still.
const GRIND_COARSE = new THREE.Color(0x8d8578);
const GRIND_FINE = new THREE.Color(0xf2f0ea);
const PAINT_OFF = new THREE.Color(0x9aa0a8);
const PAINT_ON = new THREE.Color(0xf6f5f1);

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
function trackLiquid(refs, tag, grp, dims) {
  const mesh = grp.getObjectByName('liquid');
  if (!mesh) return null;
  mesh.visible = false;
  mesh.material = mesh.material.clone();
  refs.levels.set(tag, { mesh, h: dims.h, base: dims.base ?? 0, frac0: dims.frac0 });
  return mesh;
}

export function build(view, streams) {
  const refs = {
    lamps: new Map(), levels: new Map(), motors: new Map(),
    rotors: [], millBase: [], product: [], view
  };
  const add = (tag, group, name, type, camera) => {
    group.position.set(L[tag].x, 0, L[tag].z);
    view.addEquipment(group, { tag, name, type, camera });
    return group;
  };

  // ---- TK-401 resin storage ------------------------------------------------
  {
    const d = DIM.resin, g = new THREE.Group();
    const t = tank({ d: d.d, h: d.h, mat: MAT.feed, liquidFrac: 0.7 });
    g.add(t);
    trackLiquid(refs, TAGS.resinTank, t, { h: d.h, frac0: 0.7 });
    // Bund wall: a solvent-borne resin store is bunded to its largest vessel.
    g.add(withPos(new THREE.Mesh(new THREE.BoxGeometry(d.d + 3, 0.7, 0.25), MAT.concrete), [0, 0.35, -(d.d / 2 + 1.3)]));
    g.add(withPos(new THREE.Mesh(new THREE.BoxGeometry(d.d + 3, 0.7, 0.25), MAT.concrete), [0, 0.35, d.d / 2 + 1.3]));
    g.add(withPos(new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.7, d.d + 2.85), MAT.concrete), [-(d.d / 2 + 1.5), 0.35, 0]));
    g.add(withPos(ladder({ h: d.h }), [-d.d / 2 - 0.3, 0, 0]));
    g.add(withPos(platform({ w: d.d + 1.4, d: 1.4, y: d.h + 0.1, rails: true }), [0, 0, d.d / 2 + 0.6]));
    g.add(withPos(nozzle({ d: 0.2, l: 0.5 }), [0.8, d.h, 0]));
    g.add(withPos(instrument({ label: 'LIT' }), [d.d / 2 + 0.3, 2.2, 0]));
    g.add(withPos(valve({ s: 1.1 }), [d.d / 2 + 0.6, 0.8, 0.6]));
    lamp(g, refs, TAGS.resinTank, d.h + 1.4);
    add(TAGS.resinTank, g, 'Resin storage tank', 'tank', { pos: [-34, 10, 2], target: [-28, 3, -7] });
  }

  // ---- TK-402 solvent storage ---------------------------------------------
  {
    const d = DIM.solvent, g = new THREE.Group();
    const t = tank({ d: d.d, h: d.h, mat: MAT.utility, liquidFrac: 0.55 });
    g.add(t);
    trackLiquid(refs, TAGS.solventTank, t, { h: d.h, frac0: 0.55 });
    g.add(withPos(new THREE.Mesh(new THREE.BoxGeometry(d.d + 3, 0.7, 0.25), MAT.concrete), [0, 0.35, d.d / 2 + 1.3]));
    g.add(withPos(new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.7, d.d + 2.85), MAT.concrete), [-(d.d / 2 + 1.5), 0.35, 0]));
    g.add(withPos(ladder({ h: d.h }), [-d.d / 2 - 0.3, 0, 0]));
    // Vapour recovery line off the vent, which is why the store is not a smell.
    g.add(withPos(nozzle({ d: 0.22, l: 0.6 }), [0, d.h, 0]));
    g.add(pipe([[0, d.h + 0.6, 0], [1.6, d.h + 1.2, 0], [3.2, d.h + 0.6, -2]], { r: 0.1, mat: MAT.steelDark }));
    g.add(withPos(instrument({ label: 'LIT' }), [d.d / 2 + 0.3, 2.2, 0]));
    g.add(withPos(bollard({ h: 1.0 }), [d.d / 2 + 1.8, 0, 1.8]));
    lamp(g, refs, TAGS.solventTank, d.h + 1.4);
    add(TAGS.solventTank, g, 'Solvent storage tank', 'tank', { pos: [-34, 10, 11], target: [-28, 3, 3] });
  }

  // ---- TK-403 additive dosing skid ----------------------------------------
  {
    const g = new THREE.Group();
    [-1.6, 0, 1.6].forEach((x, i) => {
      const v = verticalVessel({ d: 1.1, h: 2.0, mat: MAT.utility });
      v.position.set(x, 0.5, 0);
      g.add(v);
      if (i === 1) {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 1.5, 24), MAT.liquid.clone());
        body.name = 'liquid';
        body.position.set(x, 1.25, 0);
        g.add(body);
        trackLiquid(refs, TAGS.additiveSkid, g, { h: 1.5, base: 0.5, frac0: 0.75 });
      }
    });
    g.add(withPos(new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.4, 2.2), MAT.grating), [0, 0.2, 0]));
    const dp = centrifugalPump({ s: 0.5 });
    dp.position.set(0, 0.4, -1.5);
    const dm = dp.getObjectByName('motor');
    if (dm) { dm.material = dm.material.clone(); refs.motors.set(TAGS.additiveSkid, dm); }
    g.add(dp);
    g.add(withPos(instrument({ label: 'WIT' }), [2.3, 1.6, 0]));
    lamp(g, refs, TAGS.additiveSkid, 3.4);
    add(TAGS.additiveSkid, g, 'Additive dosing skid', 'tank', { pos: [-31, 7, 17], target: [-27, 2, 12] });
  }

  // ---- BD-401 pigment bag dump --------------------------------------------
  {
    const d = DIM.bag, g = new THREE.Group();
    g.add(withPos(hopperVessel({ w: d.w, l: d.l, h: d.h, hopper: d.hopper, mat: MAT.feed }), [0, 1.6, 0]));
    // Working platform with the slitting hood over it.
    g.add(platform({ w: 4.2, d: 3.4, y: 1.6, rails: true }));
    g.add(withPos(stairs({ steps: 7, w: 1.0 }), [2.4, 0, 2.2]));
    const hood = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.1, 2.8), MAT.steelDark);
    hood.position.set(0, 6.0, 0);
    hood.castShadow = hood.receiveShadow = true;
    g.add(hood);
    g.add(withPos(instrument({ label: 'WIT' }), [d.l / 2 + 0.4, 2.6, 0]));
    // Vacuum eductor line down to the disperser vortex.
    g.add(pipe([[0, 1.5, 0], [1.2, 1.2, 1.6], [3.2, 1.4, 5.0]], { r: 0.16, mat: MAT.feed }));
    lamp(g, refs, TAGS.bagDump, 7.0);
    add(TAGS.bagDump, g, 'Pigment bag dump station', 'vessel', { pos: [-18, 8, -4], target: [-13, 3, -9.5] });
  }

  // ---- DC-401 dust collector ----------------------------------------------
  {
    const d = DIM.dust, g = new THREE.Group();
    g.add(withPos(tank({ d: d.d, h: d.h, mat: MAT.separation }), [0, 1.6, 0]));
    g.add(withPos(new THREE.Mesh(new THREE.ConeGeometry(d.d / 2, 1.6, 22), MAT.separation), [0, 0.8, 0]));
    g.add(frame({ w: 2.2, h: 1.6, d: 2.2 }));
    // Fan and stack on the clean side.
    const fan = blower({ s: 0.8 });
    fan.position.set(1.9, d.h + 1.6, 0);
    const fm = fan.children.find(c => c.isMesh && c.material === MAT.motor);
    if (fm) { fm.material = fm.material.clone(); refs.motors.set(TAGS.dustCollector, fm); }
    g.add(fan);
    g.add(withPos(tank({ d: 0.6, h: 3.0, mat: MAT.steelDark }), [1.9, d.h + 2.4, 0]));
    g.add(withPos(ladder({ h: d.h }), [-d.d / 2 - 0.3, 1.6, 0]));
    g.add(withPos(instrument({ label: 'PDI' }), [d.d / 2 + 0.3, 4.0, 0]));
    lamp(g, refs, TAGS.dustCollector, d.h + 2.2, -1.2);
    add(TAGS.dustCollector, g, 'Dust collector', 'filter', { pos: [-18, 9, -22], target: [-13, 4, -17] });
  }

  // ---- DS-401 high-speed disperser ----------------------------------------
  {
    const d = DIM.disperser, g = new THREE.Group();
    const t = tank({ d: d.d, h: d.h, mat: MAT.vessel, liquidFrac: 0.55 });
    g.add(t);
    const mill = trackLiquid(refs, TAGS.disperser, t, { h: d.h, frac0: 0.55 });
    if (mill) refs.millBase.push(mill);
    // The jacket, drawn as a slightly larger shell around the working height.
    g.add(withPos(new THREE.Mesh(new THREE.CylinderGeometry(d.d / 2 + 0.14, d.d / 2 + 0.14, d.h * 0.7, 36, 1, true), MAT.painted), [0, d.h * 0.4, 0]));
    // Blade on its lift column. The teeth are what make the doughnut.
    const rotor = sawtoothBlade({ d: d.blade, teeth: 18, shaft: d.shaft, mat: MAT.steel });
    rotor.position.y = 1.0;
    g.add(rotor);
    refs.rotors.push({ tag: TAGS.disperser, obj: rotor, base: 26, speed: 0 });
    const column = new THREE.Mesh(new THREE.BoxGeometry(0.34, d.shaft + 2.6, 0.34), MAT.frame);
    column.position.set(-(d.d / 2 + 0.9), (d.shaft + 2.6) / 2, 0);
    column.castShadow = column.receiveShadow = true;
    g.add(column);
    g.add(withPos(new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.3, 0.7), MAT.frame), [-(d.d / 2 + 0.1), d.shaft + 1.0, 0]));
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.1, 20), MAT.motor.clone());
    motor.position.set(0, d.shaft + 1.75, 0);
    motor.name = 'motor';
    motor.castShadow = true;
    g.add(motor);
    refs.motors.set(TAGS.disperser, motor);
    g.add(withPos(platform({ w: 2.0, d: d.d + 1.6, y: d.h + 0.1, rails: true }), [d.d / 2 + 1.1, 0, 0]));
    g.add(withPos(stairs({ steps: 19, w: 1.0 }), [d.d / 2 + 1.1, 0, d.d / 2 + 2.4]));
    g.add(withPos(instrument({ label: 'TIT' }), [-d.d / 2 - 0.3, 2.4, 1.2]));
    g.add(withPos(instrument({ label: 'JI' }), [-d.d / 2 - 0.3, 2.4, -1.2]));
    g.add(withPos(ladder({ h: d.h, cage: false }), [0, 0, -d.d / 2 - 0.3]));
    lamp(g, refs, TAGS.disperser, d.shaft + 2.6);
    add(TAGS.disperser, g, 'High-speed disperser', 'mixer', { pos: [-12, 8, 9], target: [-6, 3, 0] });
  }

  // ---- CH-401 jacket chiller ----------------------------------------------
  {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.9, 2.0), MAT.cabinet);
    body.position.y = 1.05; body.castShadow = body.receiveShadow = true;
    g.add(body);
    g.add(withPos(new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.14, 2.2), MAT.concrete), [0, 0.07, 0]));
    // Condenser fans on the roof, grouped so they can turn.
    [-0.9, 0.9].forEach(x => {
      const fanGroup = new THREE.Group();
      fanGroup.name = 'rotor';
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.03, 0.16), MAT.steelDark);
        b.position.set(Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32);
        b.rotation.set(0, -a, 0.28);
        fanGroup.add(b);
      }
      fanGroup.position.set(x, 2.08, 0);
      g.add(fanGroup);
      g.add(withPos(new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.045, 8, 22), MAT.frame), [x, 2.06, 0], [Math.PI / 2, 0, 0]));
      refs.rotors.push({ tag: TAGS.chiller, obj: fanGroup, base: 10, speed: 0, axis: 'y' });
    });
    g.add(withPos(instrument({ label: 'TIC' }), [1.9, 1.4, 0]));
    // Glycol flow and return across to the disperser jacket.
    g.add(pipe([[-1.8, 1.2, -1.0], [-4.0, 1.2, -4.0], [-4.0, 1.2, -9.4]], { r: 0.08, mat: MAT.separation }));
    g.add(pipe([[-1.8, 0.9, -1.3], [-4.4, 0.9, -4.2], [-4.4, 0.9, -9.4]], { r: 0.08, mat: MAT.steelDark }));
    lamp(g, refs, TAGS.chiller, 2.9, 1.6);
    add(TAGS.chiller, g, 'Jacket chiller', 'exchanger', { pos: [-10, 7, 17], target: [-6, 2, 11] });
  }

  // ---- BM-401 bead mill ----------------------------------------------------
  {
    const d = DIM.beadMill, g = new THREE.Group();
    g.add(withPos(new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.35, 1.8), MAT.concrete), [0, 0.17, 0]));
    g.add(withPos(horizontalVessel({ d: d.d, l: d.l, mat: MAT.separation }), [0, 0.9, 0]));
    // Drive end: motor, coupling guard and the belt housing.
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 1.2, 20), MAT.motor.clone());
    motor.position.set(-2.2, 1.4, 0);
    motor.rotation.z = Math.PI / 2;
    motor.name = 'motor';
    motor.castShadow = true;
    g.add(motor);
    refs.motors.set(TAGS.beadMill, motor);
    g.add(withPos(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.6), MAT.frame), [-1.5, 1.4, 0]));
    // Feed and discharge, and the jacket water that keeps the chamber cool.
    g.add(withPos(flange({ d: 0.16 }), [-d.l / 2 - 0.1, 1.45, 0]));
    g.add(withPos(flange({ d: 0.16 }), [d.l / 2 + 0.1, 1.45, 0]));
    g.add(withPos(valve({ s: 0.9 }), [d.l / 2 + 0.6, 1.45, 0]));
    g.add(withPos(instrument({ label: 'PI' }), [-0.8, 2.1, 0.5]));
    g.add(withPos(instrument({ label: 'TIT' }), [0.8, 2.1, 0.5]));
    g.add(withPos(pipeSupport({ w: 1.0, h: 0.9 }), [2.6, 0, 0]));
    lamp(g, refs, TAGS.beadMill, 2.6, 0, -0.9);
    add(TAGS.beadMill, g, 'Horizontal bead mill', 'dryer', { pos: [8, 6, 8], target: [5, 1.6, 0] });
  }

  // ---- LD-401 let-down tank ------------------------------------------------
  {
    const d = DIM.letdown, g = new THREE.Group();
    const t = tank({ d: d.d, h: d.h, mat: MAT.product, liquidFrac: 0.6 });
    g.add(t);
    const body = trackLiquid(refs, TAGS.letdownTank, t, { h: d.h, frac0: 0.6 });
    if (body) refs.product.push(body);
    // A slow anchor agitator, not a disperser: the grind is already made.
    const ag = agitator({ h: d.h * 0.92, d: d.d * 0.62, blades: 2 });
    g.add(ag);
    const rotor = ag.getObjectByName('rotor');
    refs.rotors.push({ tag: TAGS.letdownTank, obj: rotor, base: 1.1, speed: 0 });
    const am = ag.children.find(c => c.isMesh && c.material === MAT.motor);
    if (am) { am.material = am.material.clone(); refs.motors.set(TAGS.letdownTank, am); }
    g.add(withPos(platform({ w: 2.0, d: d.d + 1.6, y: d.h + 0.1, rails: true }), [d.d / 2 + 1.1, 0, 0]));
    g.add(withPos(stairs({ steps: 20, w: 1.0 }), [d.d / 2 + 1.1, 0, d.d / 2 + 2.6]));
    g.add(withPos(ladder({ h: d.h, cage: false }), [-d.d / 2 - 0.3, 0, 0]));
    g.add(withPos(instrument({ label: 'LIT' }), [-d.d / 2 - 0.3, 2.6, 1.4]));
    g.add(withPos(instrument({ label: 'AIT' }), [-d.d / 2 - 0.3, 2.6, -1.4]));
    g.add(withPos(nozzle({ d: 0.2, l: 0.5 }), [1.0, d.h, 0.8]));
    g.add(withPos(nozzle({ d: 0.2, l: 0.5 }), [-1.0, d.h, 0.8]));
    lamp(g, refs, TAGS.letdownTank, d.h + 2.4);
    add(TAGS.letdownTank, g, 'Let-down tank', 'mixer', { pos: [21, 9, 11], target: [15, 3, 0] });
  }

  // ---- P-401 transfer pump -------------------------------------------------
  {
    const g = new THREE.Group();
    const p = centrifugalPump({ s: 1.0 });
    const m = p.getObjectByName('motor');
    if (m) { m.material = m.material.clone(); refs.motors.set(TAGS.transferPump, m); }
    g.add(p);
    g.add(withPos(valve({ s: 1.0 }), [1.5, 0.8, 0]));
    g.add(withPos(flange({ d: 0.16 }), [1.0, 0.8, 0]));
    g.add(withPos(instrument({ label: 'PI' }), [-1.2, 1.4, 0]));
    lamp(g, refs, TAGS.transferPump, 2.0);
    add(TAGS.transferPump, g, 'Paint transfer pump', 'pump', { pos: [25, 5, 7], target: [22.5, 1, 0] });
  }

  // ---- FL-401 bag filter ---------------------------------------------------
  {
    const d = DIM.filter, g = new THREE.Group();
    g.add(withPos(verticalVessel({ d: d.d, h: d.h, mat: MAT.separation }), [0, 0.9, 0]));
    g.add(frame({ w: 1.3, h: 0.9, d: 1.3 }));
    g.add(withPos(valve({ s: 0.9 }), [-0.9, 1.2, 0]));
    g.add(withPos(valve({ s: 0.9 }), [0.9, 1.2, 0]));
    g.add(withPos(instrument({ label: 'PDI' }), [0, 2.9, 0.4]));
    g.add(withPos(nozzle({ d: 0.14, l: 0.4 }), [0, 2.7, 0]));
    lamp(g, refs, TAGS.filter, 3.5);
    add(TAGS.filter, g, 'Bag filter', 'filter', { pos: [29, 5, 7], target: [26, 1.6, 0] });
  }

  // ---- FP-401 filling line -------------------------------------------------
  {
    const g = new THREE.Group();
    const conveyor = fillingConveyor({ l: 7.0, w: 0.9, h: 1.0, cans: 8, canR: 0.19, canH: 0.34 });
    g.add(conveyor);
    const load = conveyor.getObjectByName('load');
    if (load) refs.tins = load;
    // Filling head, lidding head and the check weigher over the belt.
    g.add(withPos(frame({ w: 2.2, h: 2.6, d: 1.6 }), [-1.6, 0, 0]));
    g.add(withPos(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 1.0), MAT.cabinet), [-1.6, 2.2, 0]));
    [-2.0, -1.2].forEach(x => g.add(withPos(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.7, 12), MAT.steelDark), [x, 1.75, 0])));
    g.add(withPos(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.9), MAT.cabinet), [1.4, 2.0, 0]));
    g.add(withPos(frame({ w: 1.4, h: 2.2, d: 1.4 }), [1.4, 0, 0]));
    g.add(withPos(cabinet({ w: 0.9, h: 1.8, d: 0.6 }), [3.6, 0, 1.4]));
    g.add(withPos(instrument({ label: 'WI' }), [2.6, 1.7, 0.6]));
    // Stacked pallets of filled product at the end of the line.
    for (let i = 0; i < 3; i++) {
      g.add(withPos(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.16, 1.0), MAT.feed), [4.6, 0.08 + i * 0.72, -1.6]));
      g.add(withPos(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.54, 0.92), MAT.product), [4.6, 0.44 + i * 0.72, -1.6]));
    }
    lamp(g, refs, TAGS.fillingLine, 3.4, -1.6);
    add(TAGS.fillingLine, g, 'Filling line', 'block', { pos: [37, 7, 10], target: [33, 2, 0] });
  }

  // ---- QC-401 quality control laboratory ----------------------------------
  {
    const g = new THREE.Group();
    const shed = new THREE.Mesh(new THREE.BoxGeometry(6.4, 3.2, 4.6), MAT.cabinet);
    shed.position.y = 1.6; shed.castShadow = shed.receiveShadow = true;
    g.add(shed);
    g.add(withPos(new THREE.Mesh(new THREE.BoxGeometry(6.9, 0.2, 5.1), MAT.concrete), [0, 3.3, 0]));
    // Windows onto the plant, which is what a laboratory on a batch plant has.
    [-1.8, 0, 1.8].forEach(x => g.add(withPos(new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.1, 0.06), MAT.instrument), [x, 2.0, 2.33])));
    g.add(withPos(new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.1, 0.08), MAT.steelDark), [2.6, 1.05, 2.33]));
    g.add(withPos(instrument({ label: 'QI' }), [3.4, 2.2, 0]));
    g.add(withPos(bollard({ h: 0.9 }), [3.8, 0, 2.8]));
    lamp(g, refs, TAGS.qualityLab, 3.9);
    add(TAGS.qualityLab, g, 'Quality control laboratory', 'instrument', { pos: [35, 7, -6], target: [31, 2, -12] });
  }

  // ---- MCC-401 motor control centre ---------------------------------------
  {
    const g = new THREE.Group();
    const shed = new THREE.Mesh(new THREE.BoxGeometry(7.0, 3.3, 4.6), MAT.cabinet);
    shed.position.y = 1.65; shed.castShadow = shed.receiveShadow = true;
    g.add(shed);
    g.add(withPos(new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.2, 5.2), MAT.concrete), [0, 3.4, 0]));
    [-2.2, 0, 2.2].forEach(x => g.add(withPos(cabinet({ w: 1.1, h: 2.1, d: 0.7 }), [x, 0, 2.9])));
    g.add(withPos(instrument({ label: 'JI' }), [3.7, 2.1, 0]));
    lamp(g, refs, TAGS.mcc, 4.1);
    add(TAGS.mcc, g, 'Motor control centre', 'block', { pos: [-26, 7, 21], target: [-22, 2, 15] });
  }

  // ---- building steel, services and stream tracer paths -------------------
  buildStructure(view);
  const tray = cableTray({ l: 44, w: 0.55, y: 4.2 });
  tray.position.set(4, 0, 8.4);
  view.add(tray);
  for (const [bx, bz] of [[-20, -6], [-9, -6], [2, 6], [20, 6], [29, -6]]) {
    const b = bollard({ h: 0.9 }); b.position.set(bx, 0, bz); view.add(b);
  }
  // Solvent vapour off the disperser hood, only while the batch is warm.
  const vent = plume({ h: 6.5, r: 0.5, spread: 2.6, count: 80, colour: 0xdfe6f0, rise: 1.2, size: 1.1, opacity: 0.22 });
  vent.position.set(L[TAGS.disperser].x, DIM.disperser.h + 3.4, L[TAGS.disperser].z);
  view.add(vent);
  refs.vent = vent;

  const routes = streamRoutes();
  for (const [id, r] of Object.entries(routes)) {
    view.add(pipe(r.path, { r: r.bore, mat: r.mat ?? MAT.pipe }));
    streams?.add(id, r.path, { phase: r.phase, maxTracers: r.tracers ?? 22 });
  }

  // ---- one ticker for everything that moves -------------------------------
  // Rendering stays on the shared rAF loop; nothing here rebuilds geometry.
  view.onTick((dt, t) => {
    for (const r of refs.rotors) if (r.speed > 0 && r.obj) r.obj.rotation.y += dt * r.speed;
    pulseLamps(refs.lamps.values(), t);
    refs.vent?.userData.update(dt, refs.ventRate ?? 0);
    // Filled containers move down the belt while the line is running, and wrap
    // round at the end rather than being created and destroyed.
    if (refs.tins && refs.lineSpeed > 0) {
      const span = refs.tins.userData.span;
      for (const can of refs.tins.children) {
        can.position.x += dt * refs.lineSpeed;
        if (can.position.x > span / 2) can.position.x -= span;
      }
    }
  });

  live = refs;
  return { presets: PRESETS, refs };
}

/**
 * The building this plant sits in: a mezzanine over the grinding area and the
 * steel that carries it. A paint plant is a shed, not a yard.
 */
function buildStructure(view) {
  for (let x = -10; x <= 18; x += 7) {
    const bent = frame({ w: 2.0, h: 6.4, d: 2.0 });
    bent.position.set(x, 0, -6.5);
    view.add(bent);
  }
  [-0.4, 0.4].forEach(o => view.add(pipe([[-11.5, 5.9, -6.5 + o], [19.5, 5.9, -6.5 + o]], { r: 0.09 })));
  view.add(pipe([[-11.5, 5.3, -6.5], [19.5, 5.3, -6.5]], { r: 0.07, mat: MAT.steelDark }));
  for (let x = -8; x <= 16; x += 6) {
    const sup = pipeSupport({ w: 1.1, h: 0.6 });
    sup.position.set(x, 0, 5.6);
    view.add(sup);
  }
}

/**
 * Tracer paths. The ids are engine stream ids, so a path only ever animates
 * when the engine has reported a non-zero flow for that exact stream.
 */
function streamRoutes() {
  const P = tag => L[tag];
  const ds = DIM.disperser, ld = DIM.letdown, bm = DIM.beadMill;
  return {
    [STREAMS.resinToMill]: {
      phase: 'liquid', bore: 0.11,
      path: [[P(TAGS.resinTank).x + DIM.resin.d / 2, 1.2, -7], [-20, 1.6, -5], [-12, 2.4, -2], [P(TAGS.disperser).x, 4.6, -0.6]]
    },
    [STREAMS.solventToMill]: {
      phase: 'liquid', bore: 0.11,
      path: [[P(TAGS.solventTank).x + DIM.solvent.d / 2, 1.2, 3], [-20, 1.6, 2.4], [-12, 2.4, 1.6], [P(TAGS.disperser).x, 4.6, 0.6]]
    },
    [STREAMS.pigmentFeed]: {
      phase: 'solid', bore: 0.16, tracers: 16, mat: MAT.feed,
      path: [[P(TAGS.bagDump).x, 1.5, P(TAGS.bagDump).z], [-11.0, 1.8, -6.2], [-8.0, 3.6, -2.6], [P(TAGS.disperser).x, 5.2, 0]]
    },
    [STREAMS.dustToCollector]: {
      phase: 'air', bore: 0.2, tracers: 14,
      path: [[P(TAGS.bagDump).x, 6.6, P(TAGS.bagDump).z], [-13, 7.2, -13], [P(TAGS.dustCollector).x, 6.2, P(TAGS.dustCollector).z + 1]]
    },
    [STREAMS.solventVapour]: {
      phase: 'gas', bore: 0.22, tracers: 12,
      path: [[P(TAGS.disperser).x, ds.h + 1.4, 0], [-9, 7.4, -6], [-12, 7.4, -13], [P(TAGS.dustCollector).x + 0.6, 6.0, P(TAGS.dustCollector).z + 1.2]]
    },
    [STREAMS.coolingWater]: {
      phase: 'liquid', bore: 0.08, tracers: 26, mat: MAT.separation,
      path: [[P(TAGS.chiller).x - 1.8, 1.2, P(TAGS.chiller).z - 1], [-10, 1.2, 7], [-10, 1.6, 2], [P(TAGS.disperser).x - ds.d / 2 - 0.2, 2.0, 0.8]]
    },
    [STREAMS.millBaseToMill]: {
      phase: 'slurry', bore: 0.12,
      path: [[P(TAGS.disperser).x + ds.d / 2, 0.9, 0], [-2, 1.0, -0.6], [P(TAGS.beadMill).x - bm.l / 2 - 0.4, 1.45, 0]]
    },
    [STREAMS.milledBase]: {
      phase: 'slurry', bore: 0.12,
      path: [[P(TAGS.beadMill).x + bm.l / 2 + 0.4, 1.45, 0], [10, 2.4, -0.6], [P(TAGS.letdownTank).x, ld.h + 0.6, 0.8]]
    },
    [STREAMS.millBaseDirect]: {
      phase: 'slurry', bore: 0.12,
      path: [[P(TAGS.disperser).x + ds.d / 2, 1.4, 1.2], [0, 1.6, 3.4], [9, 2.6, 3.4], [P(TAGS.letdownTank).x, ld.h + 0.6, 1.6]]
    },
    [STREAMS.resinLetdown]: {
      phase: 'liquid', bore: 0.11,
      path: [[P(TAGS.resinTank).x + DIM.resin.d / 2, 5.6, -7], [-14, 6.1, -6.5], [4, 6.1, -6.5], [14, 6.1, -3], [P(TAGS.letdownTank).x, ld.h + 1.0, -0.8]]
    },
    [STREAMS.solventLetdown]: {
      phase: 'liquid', bore: 0.11,
      path: [[P(TAGS.solventTank).x + DIM.solvent.d / 2, 5.6, 3], [-14, 5.6, -6.1], [4, 5.6, -6.1], [13, 5.6, -2.4], [P(TAGS.letdownTank).x - 0.8, ld.h + 1.0, -1.4]]
    },
    [STREAMS.additives]: {
      phase: 'liquid', bore: 0.06, tracers: 12, mat: MAT.valve,
      path: [[P(TAGS.additiveSkid).x + 2.6, 1.6, 12], [-10, 2.4, 12], [6, 3.6, 8], [P(TAGS.letdownTank).x, ld.h + 1.0, 1.4]]
    },
    [STREAMS.finishedPaint]: {
      phase: 'liquid', bore: 0.13,
      path: [[P(TAGS.letdownTank).x + ld.d / 2, 1.0, 0], [19, 1.0, 0], [P(TAGS.transferPump).x - 1.0, 1.0, 0]]
    },
    [STREAMS.pumpedPaint]: {
      phase: 'liquid', bore: 0.13,
      path: [[P(TAGS.transferPump).x + 0.6, 0.9, 0], [24.5, 1.3, 0], [P(TAGS.filter).x, 1.6, 0]]
    },
    [STREAMS.filteredPaint]: {
      phase: 'liquid', bore: 0.13,
      path: [[P(TAGS.filter).x, 2.7, 0], [28.5, 3.0, 0], [P(TAGS.fillingLine).x - 1.6, 2.6, 0]]
    },
    [STREAMS.packedProduct]: {
      phase: 'solid', bore: 0.16, tracers: 10, mat: MAT.product,
      path: [[P(TAGS.fillingLine).x + 3.5, 1.2, 0], [37.0, 1.2, -0.8], [38.5, 1.2, -1.6]]
    }
  };
}

/**
 * Paints the solved state onto the plant. Called on every result change, never
 * per frame. Anything the engine has not reported is left showing nothing
 * rather than a plausible default: liquid bodies hide, lamps go idle, the
 * blade stops turning.
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

  // The mill base goes from a grey unwetted slurry to a smooth white as the
  // grind comes in. The reading is the engine's own, parsed back out of the
  // formatted value it reported for the disperser.
  const hegman = readNumber(equipment[TAGS.disperser]?.values?.Fineness);
  for (const mesh of refs.millBase) {
    if (hegman === null) mesh.material.color.copy(GRIND_COARSE);
    else mesh.material.color.copy(GRIND_COARSE).lerp(GRIND_FINE, Math.min(Math.max((hegman - 3) / 5, 0), 1));
  }

  const letdownRunning = equipment[TAGS.letdownTank]?.state === 'running'
    || equipment[TAGS.letdownTank]?.state === 'warning';
  for (const mesh of refs.product) {
    mesh.material.color.copy(letdownRunning ? PAINT_ON : PAINT_OFF);
  }

  // The hood only sees vapour when the batch is warm enough to give any off.
  const vapour = streams.find(s => s.id === STREAMS.solventVapour);
  const batchTemp = readNumber(equipment[TAGS.disperser]?.values?.['Batch temperature']);
  refs.ventRate = (Number.isFinite(vapour?.flow) && vapour.flow > 0 && batchTemp !== null)
    ? Math.min(Math.max((batchTemp - 22) / 28, 0), 1) : 0;

  const fillingRunning = equipment[TAGS.fillingLine]?.state === 'running'
    || equipment[TAGS.fillingLine]?.state === 'warning';
  refs.lineSpeed = fillingRunning ? 0.55 : 0;

  for (const r of refs.rotors) {
    const st = equipment[r.tag];
    const running = st && st.state !== 'stopped' && st.state !== 'tripped' && st.state !== 'off';
    // The disperser reports its own speed; everything else turns at its nominal rate.
    const rpm = Number.isFinite(st?.speed) ? st.speed : null;
    r.speed = running ? (rpm !== null ? rpm * 2 * Math.PI / 60 * 0.05 : r.base) : 0;
  }
}

/** Read a number back out of an engine-formatted value, or null if there is none. */
function readNumber(formatted) {
  if (typeof formatted !== 'string') return null;
  const n = parseFloat(formatted);
  return Number.isFinite(n) ? n : null;
}

export default { build, applyState, presets: PRESETS, layout: L };
