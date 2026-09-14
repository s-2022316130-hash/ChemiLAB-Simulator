/**
 * 02 — INDUSTRIAL DRYER — 3D plant.
 *
 * Composes scene/geometry.js primitives only. This module owns geometry and
 * nothing else: it never computes a process value. Everything it shows comes
 * from engine.getEquipmentState() and engine.getStreams(), handed to it by the
 * workspace as plain data.
 *
 * Tags come from engine.js so the 3D group's userData.tag, the flowsheet node
 * tag and the engine's own key are one string by construction.
 *
 * Solids run along +X: feed hopper at the west end, product bin at the east.
 * The air train runs on -Z into the drum and the gas cleaning plant on +Z.
 */
import * as THREE from 'three';
import { resolvePresets } from '../../scene/cameras.js';
import {
  rotaryDrum, cyclone, hopperVessel, screwConveyor, tank, horizontalVessel,
  blower, pipe, valve, platform, stairs, frame, instrument, cabinet, statusLamp,
  ladder, flange, nozzle, cableTray, bollard, pipeSupport,
  setLampState, pulseLamps, plume
} from '../../scene/geometry.js';
import { MAT, STATE_COLOR } from '../../scene/materials.js';
import { TAGS, STREAMS } from './engine.js';

// ---------------------------------------------------------------------------
// Plot plan. One place to move a unit; every duct run is derived from it.
// ---------------------------------------------------------------------------
const L = {
  [TAGS.feedHopper]: { x: -21.0, z: 0 },
  [TAGS.feedScrew]: { x: -15.5, z: 0 },
  [TAGS.supplyFan]: { x: -20.0, z: -9.0 },
  [TAGS.heater]: { x: -15.0, z: -9.0 },
  [TAGS.drum]: { x: 0.0, z: 0 },
  [TAGS.cyclone]: { x: 12.0, z: 7.5 },
  [TAGS.bagFilter]: { x: 19.0, z: 7.5 },
  [TAGS.exhaustFan]: { x: 24.5, z: 7.5 },
  [TAGS.stack]: { x: 28.5, z: 7.5 },
  [TAGS.productScrew]: { x: 13.5, z: 0 },
  [TAGS.cooler]: { x: 20.0, z: 0 },
  [TAGS.productBin]: { x: 27.0, z: 0 },
  [TAGS.mcc]: { x: 20.0, z: -9.5 }
};
// Principal dimensions, shared between the geometry and the duct routing.
const DIM = {
  drum: { d: 2.2, l: 18, axis: 3.2, slope: 0.02 },
  cooler: { d: 1.4, l: 7, axis: 2.2 },
  cyclone: { d: 2.0, barrel: 2.6, cone: 3.0 },
  bagFilter: { w: 3.6, l: 4.4, h: 4.0, hopper: 2.0 },
  hopper: { w: 3.2, l: 3.2, h: 3.4, hopper: 2.0 },
  bin: { w: 3.0, l: 3.0, h: 3.6, hopper: 2.0 },
  stack: { d: 1.3, h: 14 }
};
const drumTilt = -Math.atan(DIM.drum.slope);

// ---------------------------------------------------------------------------
// Camera presets — what each one looks at, and from which bearing.
// ---------------------------------------------------------------------------
// The drum runs along +X and stands in the way of almost everything, so the gas
// cleaning train is viewed from +Z and the combustion air side from −Z. Camera
// distances are solved from the tags named here by scene/cameras.js rather than
// typed, so they cannot drift when the plot plan changes.
const PRESETS = {
  overview: { subject: '*', azimuth: 38, elevation: 25, fill: 0.84, aim: 0.4 },
  feed: { subject: [TAGS.feedHopper, TAGS.feedScrew], azimuth: -40, elevation: 26, fill: 0.78 },
  main: { subject: [TAGS.drum], azimuth: 22, elevation: 24, fill: 0.86 },
  separation: { subject: [TAGS.cyclone, TAGS.bagFilter, TAGS.exhaustFan, TAGS.stack], azimuth: 36, elevation: 22, fill: 0.84 },
  utilities: { label: 'Combustion air', subject: [TAGS.supplyFan, TAGS.heater], azimuth: 202, elevation: 24, fill: 0.78 },
  products: { subject: [TAGS.productScrew, TAGS.cooler, TAGS.productBin], azimuth: 46, elevation: 25, fill: 0.82 },
  control: { subject: [TAGS.mcc], azimuth: 158, elevation: 24, fill: 0.62 }
};

// The framework calls applyState on the module rather than on the built plant,
// so one loaded module drives one live view. A second concurrent workspace on
// the same simulator would need that signature to carry the instance.
let live = null;

const stateColor = st => {
  if (!st) return STATE_COLOR.idle;
  if (st.state === 'tripped') return STATE_COLOR.tripped;
  if (st.alarm || st.state === 'warning') return STATE_COLOR.warning;
  if (st.state === 'running') return STATE_COLOR.running;
  if (st.state === 'stopped' || st.state === 'off') return STATE_COLOR.off;
  return STATE_COLOR.idle;
};
// The drum shell glows with its duty: cold steel when stopped, hot when fired.
const SHELL_COLD = new THREE.Color().copy(MAT.steel.color);
const SHELL_HOT = new THREE.Color(0xc2704a);
const SOLIDS_WET = new THREE.Color(0x6b5a3f);
const SOLIDS_DRY = new THREE.Color(0xc6b593);

const withPos = (obj, [x, y, z]) => { obj.position.set(x, y, z); return obj; };

function lamp(grp, refs, tag, y, x = 0, z = 0) {
  const l = statusLamp({});
  l.position.set(x, y, z);
  grp.add(l);
  refs.lamps.set(tag, l);
  return l;
}
/** A solids bed whose level is driven by the engine, hidden until it reports one. */
function trackLevel(refs, tag, mesh, geom) {
  if (!mesh) return;
  mesh.visible = false;
  refs.levels.set(tag, { mesh, ...geom });
}

export function build(view, streams) {
  const refs = {
    lamps: new Map(), levels: new Map(), motors: new Map(),
    rotors: [], shells: [], solids: [], view
  };
  const add = (tag, group, name, type, camera) => {
    group.position.set(L[tag].x, 0, L[tag].z);
    view.addEquipment(group, { tag, name, type, camera });
    return group;
  };
  /** Material in a hopper or bin, shown as a cone that rises with the level. */
  function bedIn(grp, tag, refs, { w, l, hopper, h }) {
    const geo = new THREE.ConeGeometry(Math.max(l, w) * 0.62, h * 0.9, 4);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: SOLIDS_WET, roughness: .95 }));
    mesh.position.set(0, hopper + h * 0.45, 0);
    mesh.rotation.y = Math.PI / 4;
    mesh.castShadow = true;
    grp.add(mesh);
    trackLevel(refs, tag, mesh, { base: hopper, span: h * 0.9 });
    refs.solids.push(mesh);
    return mesh;
  }

  // ---- FH-201 feed hopper ---------------------------------------------------
  {
    const d = DIM.hopper, g = new THREE.Group();
    g.add(hopperVessel({ w: d.w, l: d.l, h: d.h, hopper: d.hopper, mat: MAT.feed }));
    bedIn(g, TAGS.feedHopper, refs, d);
    g.add(withPos(platform({ w: 1.4, d: d.w + 1.2, y: d.hopper + d.h + 0.2, rails: true }), [d.l / 2 + 0.9, 0, 0]));
    g.add(withPos(stairs({ steps: 22, w: 1 }), [d.l / 2 + 0.9, 0, d.w / 2 + 2.8]));
    g.add(withPos(instrument({ label: 'LIT' }), [-d.l / 2 - 0.3, d.hopper + 1.4, 0]));
    g.add(withPos(ladder({ h: d.hopper + d.h }), [-d.l / 2 - 0.35, 0, 0]));
    g.add(withPos(nozzle({ d: 0.22, l: 0.5 }), [0, d.hopper + d.h + 0.02, 0]));
    [[-1, -1], [1, 1]].forEach(([sx, sz]) => g.add(withPos(bollard({}), [sx * 2.6, 0, sz * 2.6])));
    lamp(g, refs, TAGS.feedHopper, d.hopper + d.h + 1.6);
    add(TAGS.feedHopper, g, 'Wet feed hopper', 'tank', { pos: [-26, 8, 9], target: [-21, 3, 0] });
  }

  // ---- SC-201 feed screw ----------------------------------------------------
  {
    const g = new THREE.Group();
    const sc = screwConveyor({ l: 8, d: 0.5, mat: MAT.feed });
    sc.position.set(0, 2.4, 0);
    sc.rotation.z = 0.08;
    g.add(sc);
    const m = sc.children.find(c => c.isMesh && c.material === MAT.motor);
    if (m) { m.material = m.material.clone(); refs.motors.set(TAGS.feedScrew, m); }
    g.add(withPos(frame({ w: 1.2, h: 2.4, d: 1.2 }), [-2.4, 0, 0]));
    g.add(withPos(frame({ w: 1.2, h: 2.6, d: 1.2 }), [2.4, 0, 0]));
    g.add(withPos(instrument({ label: 'WIT' }), [0, 3.2, 0.8]));
    lamp(g, refs, TAGS.feedScrew, 3.6);
    add(TAGS.feedScrew, g, 'Wet feed screw conveyor', 'block', { pos: [-17, 7, 8], target: [-15.5, 2.5, 0] });
  }

  // ---- FN-201 supply air fan ------------------------------------------------
  {
    const g = new THREE.Group();
    const b = blower({ s: 1.5 });
    g.add(b);
    const bm = b.children.find(c => c.isMesh && c.material === MAT.motor);
    if (bm) { bm.material = bm.material.clone(); refs.motors.set(TAGS.supplyFan, bm); }
    g.add(withPos(instrument({ label: 'FIT' }), [-1.8, 1.6, 0]));
    lamp(g, refs, TAGS.supplyFan, 2.8);
    add(TAGS.supplyFan, g, 'Drying air supply fan', 'blower', { pos: [-24, 6, -14], target: [-20, 1.5, -9] });
  }

  // ---- H-201 air heater -----------------------------------------------------
  {
    const g = new THREE.Group();
    const shell = horizontalVessel({ d: 1.8, l: 5.2, mat: MAT.heating });
    g.add(shell);
    // Burner front and fuel train.
    g.add(withPos(new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.3, 18), MAT.steelDark), [-3.1, 1.5, 0]));
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.5, 14), MAT.hot.clone());
    flame.position.set(-1.9, 1.5, 0);
    flame.rotation.z = -Math.PI / 2;
    flame.name = 'flame';
    g.add(flame);
    refs.flame = flame;
    g.add(withPos(valve({ s: 1.1 }), [-3.4, 0.7, 0.9]));
    g.add(withPos(flange({ d: 0.3 }), [2.9, 1.5, 0]));
    g.add(withPos(flange({ d: 0.3 }), [-2.9, 1.5, 0]));
    g.add(withPos(instrument({ label: 'TIC' }), [2.9, 2.3, 0]));
    g.add(withPos(instrument({ label: 'AIT' }), [1.4, 2.4, 0.9]));
    lamp(g, refs, TAGS.heater, 3.4);
    add(TAGS.heater, g, 'Direct-fired air heater', 'heater', { pos: [-18, 6, -15], target: [-15, 2, -9] });
  }

  // ---- D-201 rotary drum ----------------------------------------------------
  {
    const d = DIM.drum, g = new THREE.Group();
    const drum = rotaryDrum({ d: d.d, l: d.l, axisHeight: d.axis, flights: 10 });
    drum.rotation.z = drumTilt;
    g.add(drum);
    const shell = drum.getObjectByName('shell');
    refs.rotors.push({ tag: TAGS.drum, obj: shell, base: 0.9, speed: 0 });
    // The shell colour carries the firing duty.
    shell.traverse(o => {
      if (o.isMesh && o.material === MAT.steel) { o.material = o.material.clone(); refs.shells.push(o); }
    });
    // Feed and discharge breechings at each end.
    g.add(withPos(new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.6, 2.8), MAT.steelDark), [-d.l / 2 - 0.7, d.axis, 0]));
    g.add(withPos(new THREE.Mesh(new THREE.BoxGeometry(1.6, 3.2, 3.0), MAT.steelDark), [d.l / 2 + 0.8, d.axis - 0.3, 0]));
    g.add(withPos(instrument({ label: 'TIT' }), [-d.l / 2 - 1.3, d.axis + 1.5, 0]));
    g.add(withPos(instrument({ label: 'TIT' }), [d.l / 2 + 1.6, d.axis + 1.3, 0]));
    g.add(withPos(instrument({ label: 'MIT' }), [d.l / 2 + 1.6, 1.2, 1.4]));
    // Access and services along the shell: a drum this size is walked, not admired.
    g.add(withPos(ladder({ h: d.axis + 0.6 }), [-d.l / 2 - 1.3, 0, 1.6]));
    g.add(withPos(ladder({ h: d.axis + 0.3 }), [d.l / 2 + 1.5, 0, -1.6]));
    for (let x = -d.l / 2 + 2; x <= d.l / 2 - 2; x += 4.5) {
      g.add(withPos(pipeSupport({ w: 1.1, h: 0.55 }), [x, 0, -d.d / 2 - 2.2]));
    }
    g.add(withPos(flange({ d: 0.34 }), [-d.l / 2 - 1.35, d.axis, 0]));
    g.add(withPos(flange({ d: 0.34 }), [d.l / 2 + 1.55, d.axis - 0.3, 0]));
    lamp(g, refs, TAGS.drum, d.axis + d.d / 2 + 1.4);
    add(TAGS.drum, g, 'Rotary drum dryer', 'dryer', { pos: [-3, 11, 16], target: [0, 3, 0] });
  }

  // ---- CY-201 cyclone -------------------------------------------------------
  {
    const d = DIM.cyclone, g = new THREE.Group();
    g.add(withPos(cyclone({ d: d.d, barrel: d.barrel, cone: d.cone, mat: MAT.separation }), [0, 2.6, 0]));
    g.add(frame({ w: d.d + 1.2, h: 2.6, d: d.d + 1.2 }));
    g.add(withPos(platform({ w: 1.4, d: d.d + 1.6, y: 2.6 + d.cone + d.barrel * 0.4, rails: true }), [d.d / 2 + 1.1, 0, 0]));
    g.add(withPos(stairs({ steps: 26, w: 1 }), [d.d / 2 + 1.1, 0, d.d / 2 + 3.2]));
    g.add(withPos(instrument({ label: 'PDI' }), [-d.d / 2 - 0.4, 5.2, 0]));
    g.add(withPos(ladder({ h: 2.6 + d.cone + d.barrel }), [-d.d / 2 - 0.9, 0, 0]));
    g.add(withPos(valve({ s: 0.9 }), [0, 1.5, 0]));
    lamp(g, refs, TAGS.cyclone, 2.6 + d.cone + d.barrel + 1.9);
    add(TAGS.cyclone, g, 'Product recovery cyclone', 'clarifier', { pos: [9, 10, 14], target: [12, 5, 7.5] });
  }

  // ---- BF-201 bag filter ----------------------------------------------------
  {
    const d = DIM.bagFilter, g = new THREE.Group();
    g.add(hopperVessel({ w: d.w, l: d.l, h: d.h, hopper: d.hopper, mat: MAT.separation }));
    // Clean-air plenum and the pulse-jet air receiver on the roof.
    g.add(withPos(new THREE.Mesh(new THREE.BoxGeometry(d.l * 0.9, 0.8, d.w * 0.9), MAT.steelDark), [0, d.hopper + d.h + 0.4, 0]));
    g.add(withPos(tank({ d: 0.5, h: 2.6, mat: MAT.steel }), [d.l * 0.3, d.hopper + d.h + 0.8, -d.w * 0.32]));
    g.add(withPos(platform({ w: 1.4, d: d.w + 1.2, y: d.hopper + d.h + 0.9, rails: true }), [d.l / 2 + 0.9, 0, 0]));
    g.add(withPos(stairs({ steps: 28, w: 1 }), [d.l / 2 + 0.9, 0, d.w / 2 + 3.0]));
    g.add(withPos(instrument({ label: 'PDI' }), [-d.l / 2 - 0.3, d.hopper + 1.8, 0]));
    g.add(withPos(ladder({ h: d.hopper + d.h + 0.8 }), [-d.l / 2 - 0.4, 0, 1.2]));
    g.add(withPos(valve({ s: 0.9 }), [0, 1.3, 0]));
    lamp(g, refs, TAGS.bagFilter, d.hopper + d.h + 2.4);
    add(TAGS.bagFilter, g, 'Pulse-jet bag filter', 'filter', { pos: [16, 10, 15], target: [19, 4, 7.5] });
  }

  // ---- FN-202 exhaust fan ---------------------------------------------------
  {
    const g = new THREE.Group();
    const b = blower({ s: 1.7 });
    g.add(b);
    const bm = b.children.find(c => c.isMesh && c.material === MAT.motor);
    if (bm) { bm.material = bm.material.clone(); refs.motors.set(TAGS.exhaustFan, bm); }
    g.add(withPos(instrument({ label: 'PI' }), [-2.0, 1.8, 0]));
    lamp(g, refs, TAGS.exhaustFan, 3.0);
    add(TAGS.exhaustFan, g, 'Induced draught exhaust fan', 'blower', { pos: [27, 7, 13], target: [24.5, 1.5, 7.5] });
  }

  // ---- ST-201 stack ---------------------------------------------------------
  {
    const d = DIM.stack, g = new THREE.Group();
    g.add(tank({ d: d.d, h: d.h, mat: MAT.steelDark }));
    g.add(withPos(new THREE.Mesh(new THREE.TorusGeometry(d.d / 2 + 0.1, 0.06, 6, 20), MAT.steel), [0, d.h - 0.5, 0], [Math.PI / 2, 0, 0]));
    g.add(withPos(instrument({ label: 'AIT' }), [d.d / 2 + 0.3, 3.2, 0]));
    // Guy frame and access at the base.
    g.add(frame({ w: 2.4, h: 1.2, d: 2.4 }));
    g.add(withPos(ladder({ h: d.h - 1.5 }), [d.d / 2 + 0.25, 0, 0]));
    lamp(g, refs, TAGS.stack, d.h + 1.2);
    // Vapour leaving the stack. Added to the scene rather than to the group so
    // it is neither pickable nor counted into the caption box.
    const vent = plume({ h: 13, r: .6, spread: 4.4, count: 130, colour: 0xdde4ee, rise: 1.9, size: 1.6, opacity: .3 });
    vent.position.set(L[TAGS.stack].x, d.h + 0.5, L[TAGS.stack].z);
    view.add(vent);
    refs.plume = vent;
    add(TAGS.stack, g, 'Exhaust stack', 'column', { pos: [33, 12, 13], target: [28.5, 7, 7.5] });
  }

  // ---- SC-202 product screw -------------------------------------------------
  {
    const g = new THREE.Group();
    const sc = screwConveyor({ l: 6.5, d: 0.45, mat: MAT.product });
    sc.position.set(0, 1.5, 0);
    g.add(sc);
    const m = sc.children.find(c => c.isMesh && c.material === MAT.motor);
    if (m) { m.material = m.material.clone(); refs.motors.set(TAGS.productScrew, m); }
    g.add(withPos(frame({ w: 1.1, h: 1.5, d: 1.1 }), [-2.2, 0, 0]));
    g.add(withPos(frame({ w: 1.1, h: 1.5, d: 1.1 }), [2.2, 0, 0]));
    lamp(g, refs, TAGS.productScrew, 2.5);
    add(TAGS.productScrew, g, 'Product screw conveyor', 'block', { pos: [12, 6, 9], target: [13.5, 1.5, 0] });
  }

  // ---- CL-201 product cooler ------------------------------------------------
  {
    const d = DIM.cooler, g = new THREE.Group();
    const drum = rotaryDrum({ d: d.d, l: d.l, axisHeight: d.axis, flights: 8, mat: MAT.product });
    drum.rotation.z = drumTilt;
    g.add(drum);
    refs.rotors.push({ tag: TAGS.cooler, obj: drum.getObjectByName('shell'), base: 1.4, speed: 0 });
    g.add(withPos(instrument({ label: 'TIT' }), [d.l / 2 + 0.9, d.axis, 0]));
    lamp(g, refs, TAGS.cooler, d.axis + d.d / 2 + 1.2);
    add(TAGS.cooler, g, 'Rotary product cooler', 'exchanger', { pos: [21, 8, 11], target: [20, 2, 0] });
  }

  // ---- PB-201 product bin ---------------------------------------------------
  {
    const d = DIM.bin, g = new THREE.Group();
    g.add(hopperVessel({ w: d.w, l: d.l, h: d.h, hopper: d.hopper, mat: MAT.product }));
    bedIn(g, TAGS.productBin, refs, d);
    g.add(withPos(instrument({ label: 'LIT' }), [-d.l / 2 - 0.3, d.hopper + 1.5, 0]));
    g.add(withPos(instrument({ label: 'MIT' }), [d.l / 2 + 0.3, d.hopper + 1.5, 0]));
    lamp(g, refs, TAGS.productBin, d.hopper + d.h + 1.6);
    add(TAGS.productBin, g, 'Dried product bin', 'tank', { pos: [32, 8, 10], target: [27, 3, 0] });
  }

  // ---- MCC-201 motor control centre -----------------------------------------
  {
    const g = new THREE.Group();
    const shed = new THREE.Mesh(new THREE.BoxGeometry(7, 3.3, 4.6), MAT.cabinet);
    shed.position.y = 1.65; shed.castShadow = shed.receiveShadow = true;
    g.add(shed);
    g.add(withPos(new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.2, 5.2), MAT.concrete), [0, 3.4, 0]));
    [-2.2, 0, 2.2].forEach(x => g.add(withPos(cabinet({ w: 1.1, h: 2.1, d: 0.7 }), [x, 0, 2.9])));
    g.add(withPos(instrument({ label: 'JI' }), [3.7, 2.1, 0]));
    lamp(g, refs, TAGS.mcc, 4.0);
    add(TAGS.mcc, g, 'Motor control centre', 'block', { pos: [24, 6, -3], target: [20, 2, -9.5] });
  }

  // ---- ducting, pipe rack and tracer paths ----------------------------------
  buildRack(view);
  // Power and instrument cabling from the motor control centre out to the plant.
  const tray = cableTray({ l: 34, w: 0.55, y: 3.9 });
  tray.position.set(6, 0, -6.4);
  view.add(tray);
  // Bollards protecting the road-side equipment.
  for (const [bx, bz] of [[-12, 4.5], [-6, 4.5], [6, 4.5], [17, -3.4], [24, -3.4]]) {
    const b = bollard({}); b.position.set(bx, 0, bz); view.add(b);
  }
  const routes = streamRoutes();
  for (const [id, r] of Object.entries(routes)) {
    view.add(pipe(r.path, { r: r.bore, mat: r.mat ?? MAT.pipe }));
    streams?.add(id, r.path, { phase: r.phase, maxTracers: r.tracers ?? 24 });
  }

  // ---- one ticker for every turning part ------------------------------------
  // Rendering stays on the shared rAF loop; nothing here rebuilds geometry.
  view.onTick((dt, t) => {
    for (const r of refs.rotors) if (r.speed > 0 && r.obj) r.obj.rotation.x += dt * r.speed;
    pulseLamps(refs.lamps.values(), t);
    // A burner that is alight moves. The flicker is cosmetic; how bright the
    // flame is set in applyState, from the duty the engine reported.
    if (refs.flame?.visible) {
      const f = 0.92 + 0.11 * Math.sin(t * 21) + 0.06 * Math.sin(t * 37.4);
      refs.flame.scale.set(f, 1 + (f - 1) * 2.4, f);
    }
    refs.plume?.userData.update(dt, refs.plumeRate ?? 0);
  });

  live = refs;
  return { presets: resolvePresets(view, PRESETS), refs };
}

/** Service rack carrying the fuel and instrument runs across the plot. */
function buildRack(view) {
  const z = -5.0, y = 4.6;
  for (let x = -14; x <= 22; x += 6) {
    const bent = frame({ w: 1.4, h: y, d: 1.4 });
    bent.position.set(x, 0, z);
    view.add(bent);
  }
  [-0.4, 0.4].forEach(o => view.add(pipe([[-14.8, y - 0.3, z + o], [22.8, y - 0.3, z + o]], { r: 0.09 })));
}

/**
 * Tracer paths. The ids are engine stream ids, so a path only animates when the
 * engine has reported a non-zero flow for that exact stream.
 */
function streamRoutes() {
  const d = DIM.drum, cy = DIM.cyclone, bf = DIM.bagFilter, co = DIM.cooler;
  const drumIn = L[TAGS.drum].x - d.l / 2, drumOut = L[TAGS.drum].x + d.l / 2;
  return {
    [STREAMS.wetFeed]: {
      phase: 'solid', bore: 0.14, tracers: 16,
      path: [[L[TAGS.feedHopper].x, 1.4, 0], [L[TAGS.feedHopper].x + 1.2, 1.9, 0], [L[TAGS.feedScrew].x - 4.0, 2.2, 0]]
    },
    [STREAMS.feedToDrum]: {
      phase: 'solid', bore: 0.13, tracers: 16,
      path: [[L[TAGS.feedScrew].x + 4.0, 2.7, 0], [drumIn - 1.4, 3.6, 0], [drumIn - 0.2, 3.4, 0]]
    },
    [STREAMS.ambientAir]: {
      phase: 'air', bore: 0.3,
      path: [[L[TAGS.supplyFan].x - 2.6, 1.4, 0 + L[TAGS.supplyFan].z], [L[TAGS.supplyFan].x - 1.2, 1.4, L[TAGS.supplyFan].z]]
    },
    [STREAMS.fanDischarge]: {
      phase: 'air', bore: 0.3,
      path: [[L[TAGS.supplyFan].x + 1.4, 1.4, L[TAGS.supplyFan].z], [L[TAGS.heater].x - 3.4, 1.5, L[TAGS.heater].z]]
    },
    [STREAMS.fuel]: {
      phase: 'gas', bore: 0.06, tracers: 12, mat: MAT.valve,
      path: [[L[TAGS.heater].x - 3.4, 4.3, -5.0], [L[TAGS.heater].x - 3.4, 2.0, -7.4], [L[TAGS.heater].x - 3.4, 0.9, L[TAGS.heater].z + 0.9]]
    },
    [STREAMS.hotAir]: {
      phase: 'gas', bore: 0.3,
      path: [[L[TAGS.heater].x + 2.9, 1.6, L[TAGS.heater].z], [-9.5, 2.2, -8.4], [drumIn - 1.0, 3.0, -1.2], [drumIn - 0.3, 3.2, 0]]
    },
    [STREAMS.drumExhaust]: {
      phase: 'gas', bore: 0.34,
      path: [[drumOut + 0.9, 4.4, 0], [drumOut + 2.4, 5.6, 2.4], [L[TAGS.cyclone].x - 0.4, 6.2, L[TAGS.cyclone].z - 1.3]]
    },
    [STREAMS.cycloneFines]: {
      phase: 'solid', bore: 0.08, tracers: 14,
      path: [[L[TAGS.cyclone].x, 2.4, L[TAGS.cyclone].z], [L[TAGS.cyclone].x + 0.6, 1.6, L[TAGS.cyclone].z - 3.2], [L[TAGS.productScrew].x + 1.0, 1.7, 0.4]]
    },
    [STREAMS.cycloneGas]: {
      phase: 'gas', bore: 0.34,
      path: [[L[TAGS.cyclone].x, 9.6, L[TAGS.cyclone].z], [15.5, 9.6, L[TAGS.cyclone].z], [L[TAGS.bagFilter].x - 0.4, 6.4, L[TAGS.bagFilter].z]]
    },
    [STREAMS.filterFines]: {
      phase: 'solid', bore: 0.07, tracers: 12,
      path: [[L[TAGS.bagFilter].x, 1.6, L[TAGS.bagFilter].z], [L[TAGS.bagFilter].x - 1.2, 1.3, 3.6], [L[TAGS.productScrew].x + 2.6, 1.6, 0.4]]
    },
    [STREAMS.cleanExhaust]: {
      phase: 'gas', bore: 0.34,
      path: [[L[TAGS.bagFilter].x + 2.4, 6.2, L[TAGS.bagFilter].z], [L[TAGS.exhaustFan].x - 1.6, 2.4, L[TAGS.exhaustFan].z]]
    },
    [STREAMS.stackGas]: {
      phase: 'gas', bore: 0.36,
      path: [[L[TAGS.exhaustFan].x + 1.6, 2.0, L[TAGS.exhaustFan].z], [L[TAGS.stack].x, 1.8, L[TAGS.stack].z], [L[TAGS.stack].x, DIM.stack.h - 0.4, L[TAGS.stack].z]]
    },
    [STREAMS.driedProduct]: {
      phase: 'solid', bore: 0.13, tracers: 16,
      path: [[drumOut + 1.2, 1.8, 0], [L[TAGS.productScrew].x - 3.4, 1.6, 0]]
    },
    [STREAMS.productToCooler]: {
      phase: 'solid', bore: 0.13, tracers: 16,
      path: [[L[TAGS.productScrew].x + 3.4, 1.4, 0], [L[TAGS.cooler].x - co.l / 2 - 0.6, 2.4, 0]]
    },
    [STREAMS.coolProduct]: {
      phase: 'solid', bore: 0.13, tracers: 16,
      path: [[L[TAGS.cooler].x + co.l / 2 + 0.4, 1.9, 0], [23.8, 2.6, 0], [L[TAGS.productBin].x - 1.2, 4.4, 0]]
    }
  };
}

/**
 * Paints the solved state onto the plant. Called on every result change, never
 * per frame. Anything the engine has not reported is left showing nothing rather
 * than a plausible default: beds hide, lamps go idle, the drum stops turning.
 */
export function applyState(equipment = {}, streams = []) {
  const refs = live;
  if (!refs) return;

  // Lamp bodies and their halos move together, and a unit in alarm flashes —
  // which is the one thing on a real plot that catches the eye from anywhere.
  for (const [key, l] of refs.lamps) {
    const st = equipment[key];
    setLampState(l, stateColor(st), {
      on: !!st && st.state !== "off" && st.state !== "stopped",
      alarm: !!st && (st.alarm === true || st.state === "tripped")
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
    lv.mesh.scale.y = Math.max(frac, 0.02);
    lv.mesh.position.y = lv.base + lv.span * frac * 0.5;
  }

  // Drum shell colour follows the heater duty the engine reports.
  const duty = equipment[TAGS.heater]?.duty;
  for (const mesh of refs.shells) {
    if (!Number.isFinite(duty)) mesh.material.color.copy(SHELL_COLD);
    else mesh.material.color.copy(SHELL_COLD).lerp(SHELL_HOT, Math.min(Math.max(duty, 0), 1));
  }
  // The stack only shows a plume when the engine says something is leaving it.
  const stack = streams.find(x => x.id === STREAMS.stackGas);
  refs.plumeRate = Number.isFinite(stack?.flow) && stack.flow > 0 ? 1 : 0;

  if (refs.flame) {
    const firing = Number.isFinite(duty) && duty > 0;
    refs.flame.visible = firing;
    if (firing) refs.flame.material.emissiveIntensity = 0.3 + 0.9 * Math.min(duty, 1);
  }

  // Bed colour carries how wet the material in that vessel is.
  const wetness = (tag, key) => {
    const raw = equipment[tag]?.values?.[key];
    if (typeof raw !== 'string') return null;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : null;
  };
  const feedX = wetness(TAGS.feedHopper, 'Moisture');
  const prodX = wetness(TAGS.productBin, 'Moisture');
  for (const mesh of refs.solids) {
    const isFeed = refs.levels.get(TAGS.feedHopper)?.mesh === mesh;
    const x = isFeed ? feedX : prodX;
    if (x === null) { mesh.material.color.copy(SOLIDS_DRY).lerp(SOLIDS_WET, 0.5); continue; }
    mesh.material.color.copy(SOLIDS_DRY).lerp(SOLIDS_WET, Math.min(Math.max(x / 0.5, 0), 1));
  }

  for (const r of refs.rotors) {
    const st = equipment[r.tag];
    const running = st && st.state !== 'stopped' && st.state !== 'tripped' && st.state !== 'off';
    // The drum reports its own speed; anything else turns at its nominal rate.
    const rpm = Number.isFinite(st?.speed) ? st.speed : null;
    r.speed = running ? (rpm !== null ? rpm * 2 * Math.PI / 60 : r.base) : 0;
  }
}

export default { build, applyState, presetSpec: PRESETS, layout: L };
