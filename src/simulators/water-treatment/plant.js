/**
 * 01 — WATER TREATMENT PLANT — 3D plant.
 *
 * Composes scene/geometry.js primitives only. This module owns geometry and
 * nothing else: it never computes a process value. Everything it shows comes
 * from engine.getEquipmentState() and engine.getStreams(), handed to it by the
 * workspace as plain data.
 *
 * Equipment tags come from engine.js so the 3D group's userData.tag, the
 * flowsheet node tag and the engine's own key are guaranteed to be one string.
 *
 * Process direction runs along +X: intake at the west end, distribution at the
 * east. Cross-plant service and sludge runs sit on -Z, backwash utilities on +Z.
 */
import * as THREE from 'three';
import {
  basin, tank, agitator, mediaBed, centrifugalPump, blower, pipe, valve,
  platform, stairs, frame, instrument, cabinet, statusLamp, verticalVessel
} from '../../scene/geometry.js';
import { MAT, STATE_COLOR } from '../../scene/materials.js';
import { TAGS, STREAMS } from './engine.js';

// ---------------------------------------------------------------------------
// Plot plan. One place to move a unit; every pipe run is derived from it.
// ---------------------------------------------------------------------------
const L = {
  [TAGS.intakePump]: { x: -24.5, z: 0 },
  [TAGS.coagDosing]: { x: -21.0, z: 6.5 },
  [TAGS.rapidMix]: { x: -19.5, z: 0 },
  [TAGS.floc]: { x: -12.5, z: 0 },
  [TAGS.clarifier]: { x: 1.0, z: 0 },
  [TAGS.sludge]: { x: 4.0, z: -9.5 },
  [TAGS.filters]: { x: 13.5, z: 0 },
  [TAGS.washRecovery]: { x: 10.5, z: -10.5 },
  [TAGS.backwashTank]: { x: 15.0, z: 10.5 },
  [TAGS.backwashPump]: { x: 19.0, z: 10.5 },
  [TAGS.blower]: { x: 10.5, z: 8.5 },
  [TAGS.chlorineDosing]: { x: 20.0, z: 6.0 },
  [TAGS.contactTank]: { x: 21.0, z: 0 },
  [TAGS.clearwell]: { x: 28.0, z: 0 },
  [TAGS.highLiftPump]: { x: 32.5, z: 0 },
  [TAGS.mcc]: { x: 27.5, z: -10.5 }
};
// Basin dimensions, shared between the geometry and the pipe routing.
const DIM = {
  rapidMix: { l: 3.4, w: 3.4, h: 4.2 },
  floc: { l: 9.6, w: 6.4, h: 4.2, cells: 3 },
  clarifier: { l: 13, w: 9, h: 5 },
  filters: { l: 5.8, w: 1.9, h: 3.4, cells: 4, pitch: 2.3 },
  contact: { l: 6, w: 7, h: 4 },
  clearwell: { l: 6, w: 7, h: 4 },
  sludge: { l: 3.6, w: 3.6, h: 3 },
  washRecovery: { l: 5, w: 4.2, h: 3 }
};
const edge = (tag, dim, side) => L[tag].x + (side === 'in' ? -dim.l / 2 : dim.l / 2);

// ---------------------------------------------------------------------------
// Camera presets. The ids are fixed by scene/cameras.js PRESET_ORDER.
// ---------------------------------------------------------------------------
// Sight lines are checked against the plot plan: the scene fog starts at 55 m, so
// the overview sits inside that, and the filter gallery is viewed from -Z because
// the elevated backwash tank stands directly in the way on the +Z side.
const PRESETS = {
  overview: { pos: [33, 25, 37], target: [4, 2, 0] },
  feed: { pos: [-31, 11, 14], target: [-21, 2, 1] },
  main: { pos: [-10, 16, 22], target: [-6, 2, 0] },
  separation: { pos: [13, 13, -19], target: [13.5, 2, 0] },
  utilities: { pos: [21, 12, 22], target: [14, 3, 7] },
  products: { pos: [33, 11, 16], target: [25, 2, 0] },
  control: { pos: [31, 7, -2], target: [27, 2, -10] }
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
const MEDIA_CLEAN = new THREE.Color(0x6b7683);
const MEDIA_LOADED = new THREE.Color(0x6d5533);

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
  if (!mesh) return;
  mesh.visible = false;
  refs.levels.set(tag, { mesh, h: dims.h, wall: dims.wall ?? 0.3, frac0: dims.frac0 });
}

export function build(view, streams) {
  const refs = {
    lamps: new Map(), levels: new Map(), motors: new Map(),
    rotors: [], media: [], view
  };
  const add = (tag, group, name, type, camera) => {
    group.position.set(L[tag].x, 0, L[tag].z);
    view.addEquipment(group, { tag, name, type, camera });
    return group;
  };

  // ---- P-101 raw water intake ---------------------------------------------
  {
    const g = new THREE.Group();
    // Screened intake chamber drawing from the river channel.
    g.add(withPos(basin({ l: 3.2, w: 4.4, h: 2.6, liquidFrac: 0.7 }), [-2.4, 0, 0]));
    const p1 = centrifugalPump({ s: 1.15 });
    const p2 = centrifugalPump({ s: 1.15 });
    p1.position.set(0, 0, -1.3); p2.position.set(0, 0, 1.3);
    [p1, p2].forEach((p, i) => {
      const m = p.getObjectByName('motor');
      if (m) { m.material = m.material.clone(); refs.motors.set(`${TAGS.intakePump}#${i}`, m); }
      g.add(p);
    });
    g.add(withPos(valve({ s: 1.2 }), [1.6, 0.9, -1.3]));
    g.add(withPos(valve({ s: 1.2 }), [1.6, 0.9, 1.3]));
    g.add(withPos(instrument({ label: 'FIT' }), [2.3, 1.6, 0]));
    lamp(g, refs, TAGS.intakePump, 2.4);
    add(TAGS.intakePump, g, 'Raw water intake pumps', 'pump', { pos: [-30, 7, 8], target: [-24, 1.5, 0] });
  }

  // ---- CH-101 coagulant dosing --------------------------------------------
  {
    const g = new THREE.Group();
    g.add(withPos(tank({ d: 3, h: 4, mat: MAT.painted, liquidFrac: 0.65 }), [-1.6, 0, 0]));
    g.add(withPos(tank({ d: 2.2, h: 3, mat: MAT.painted, liquidFrac: 0.5 }), [1.6, 0, 0]));
    const dp = centrifugalPump({ s: 0.65 });
    dp.position.set(0, 0, -2.2);
    const dm = dp.getObjectByName('motor');
    if (dm) { dm.material = dm.material.clone(); refs.motors.set(TAGS.coagDosing, dm); }
    g.add(dp);
    g.add(withPos(instrument({ label: 'FQI' }), [0, 1.5, -3]));
    g.add(withPos(stairs({ steps: 8, w: 0.9 }), [-1.6, 0, 2.6]));
    lamp(g, refs, TAGS.coagDosing, 4.7, -1.6);
    add(TAGS.coagDosing, g, 'Coagulant dosing skid', 'tank', { pos: [-25, 7, 12], target: [-21, 2, 6.5] });
  }

  // ---- MX-101 rapid mix ----------------------------------------------------
  {
    const d = DIM.rapidMix, g = new THREE.Group();
    const b = basin({ l: d.l, w: d.w, h: d.h, liquidFrac: 0.85 });
    g.add(b);
    trackLiquid(refs, TAGS.rapidMix, b, { h: d.h, frac0: 0.85 });
    const ag = agitator({ h: d.h * 0.85, d: 1.5, blades: 1 });
    g.add(ag);
    refs.rotors.push({ tag: TAGS.rapidMix, obj: ag.getObjectByName('rotor'), base: 7.0, speed: 0 });
    g.add(withPos(platform({ w: 1.6, d: d.w + 1.4, y: d.h + 0.1, rails: true }), [d.l / 2 + 0.9, 0, 0]));
    g.add(withPos(stairs({ steps: 17, w: 1 }), [d.l / 2 + 0.9, 0, d.w / 2 + 2.6]));
    g.add(withPos(instrument({ label: 'AIT' }), [-d.l / 2 - 0.4, 2.2, 0]));
    lamp(g, refs, TAGS.rapidMix, d.h + 1.9);
    add(TAGS.rapidMix, g, 'Rapid mix basin', 'mixer', { pos: [-24, 8, 8], target: [-19.5, 2, 0] });
  }

  // ---- FL-101 flocculator train -------------------------------------------
  {
    const d = DIM.floc, g = new THREE.Group();
    const b = basin({ l: d.l, w: d.w, h: d.h, liquidFrac: 0.88 });
    g.add(b);
    trackLiquid(refs, TAGS.floc, b, { h: d.h, frac0: 0.88 });
    const cell = d.l / d.cells;
    // Baffle walls between cells, with the transfer opening left open at alternate ends.
    for (let i = 1; i < d.cells; i++) {
      const x = -d.l / 2 + i * cell;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.25, d.h * 0.95, d.w * 0.62), MAT.concrete);
      wall.position.set(x, d.h * 0.475, i % 2 ? -d.w * 0.19 : d.w * 0.19);
      wall.castShadow = wall.receiveShadow = true;
      g.add(wall);
    }
    // Tapered flocculation: the paddles get smaller as the floc grows.
    const paddle = [2.3, 1.95, 1.6];
    for (let i = 0; i < d.cells; i++) {
      const x = -d.l / 2 + cell * (i + 0.5);
      const ag = agitator({ h: d.h * 0.88, d: paddle[i], blades: 2 });
      ag.position.set(x, 0, 0);
      g.add(ag);
      refs.rotors.push({ tag: TAGS.floc, obj: ag.getObjectByName('rotor'), base: 1.5 - i * 0.35, speed: 0 });
    }
    g.add(withPos(platform({ w: d.l + 1, d: 1.6, y: d.h + 0.1, rails: true }), [0, 0, d.w / 2 + 0.9]));
    g.add(withPos(stairs({ steps: 17, w: 1 }), [-d.l / 2 + 0.6, 0, d.w / 2 + 3.4]));
    lamp(g, refs, TAGS.floc, d.h + 1.9);
    add(TAGS.floc, g, 'Flocculation basin', 'mixer', { pos: [-14, 10, 12], target: [-12.5, 2, 0] });
  }

  // ---- CL-101 clarifier ----------------------------------------------------
  {
    const d = DIM.clarifier, g = new THREE.Group();
    const b = basin({ l: d.l, w: d.w, h: d.h, liquidFrac: 0.82 });
    g.add(b);
    trackLiquid(refs, TAGS.clarifier, b, { h: d.h, frac0: 0.82 });
    // Sludge hopper under the inlet end.
    const hop = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, d.w - 0.8), MAT.concrete);
    hop.position.set(-d.l / 2 + 1.8, -0.55, 0);
    hop.castShadow = hop.receiveShadow = true;
    g.add(hop);
    // Inlet diffuser wall.
    const diff = new THREE.Mesh(new THREE.BoxGeometry(0.22, d.h * 0.8, d.w - 0.7), MAT.concrete);
    diff.position.set(-d.l / 2 + 1.1, d.h * 0.4, 0);
    g.add(diff);
    // Effluent launders across the outlet end, each a shallow trough on corbels.
    for (let i = 0; i < 3; i++) {
      const x = d.l / 2 - 1.2 - i * 1.7;
      const tr = basin({ l: 0.75, w: d.w - 1.2, h: 0.62, wall: 0.1, liquidFrac: null });
      tr.position.set(x, d.h - 0.72, 0);
      g.add(tr);
      // Saw-tooth weir plate on the launder lip.
      const weir = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, d.w - 1.2), MAT.steel);
      weir.position.set(x - 0.42, d.h - 0.02, 0);
      g.add(weir);
    }
    g.add(withPos(platform({ w: 2, d: d.w + 1.6, y: d.h + 0.1, rails: true }), [d.l / 2 + 1.1, 0, 0]));
    g.add(withPos(stairs({ steps: 20, w: 1.1 }), [d.l / 2 + 1.1, 0, d.w / 2 + 3.2]));
    g.add(withPos(instrument({ label: 'AIT' }), [d.l / 2 + 0.35, 2.4, -2]));
    g.add(withPos(instrument({ label: 'LIT' }), [-d.l / 2 - 0.35, 2.4, 2]));
    lamp(g, refs, TAGS.clarifier, d.h + 2.1);
    add(TAGS.clarifier, g, 'Sedimentation basin', 'clarifier', { pos: [4, 13, 15], target: [1, 2, 0] });
  }

  // ---- SL-101 sludge sump --------------------------------------------------
  {
    const d = DIM.sludge, g = new THREE.Group();
    const b = basin({ l: d.l, w: d.w, h: d.h, liquidFrac: 0.5 });
    g.add(b);
    trackLiquid(refs, TAGS.sludge, b, { h: d.h, frac0: 0.5 });
    const sp = centrifugalPump({ s: 0.8 });
    sp.position.set(d.l / 2 + 1.4, 0, 0);
    const sm = sp.getObjectByName('motor');
    if (sm) { sm.material = sm.material.clone(); refs.motors.set(TAGS.sludge, sm); }
    g.add(sp);
    lamp(g, refs, TAGS.sludge, d.h + 1.2);
    add(TAGS.sludge, g, 'Sludge sump', 'tank', { pos: [6, 7, -16], target: [4, 1.5, -9.5] });
  }

  // ---- F-101 filter gallery ------------------------------------------------
  {
    const d = DIM.filters, g = new THREE.Group();
    const z0 = -((d.cells - 1) * d.pitch) / 2;
    for (let i = 0; i < d.cells; i++) {
      const z = z0 + i * d.pitch;
      const cellGrp = new THREE.Group();
      cellGrp.position.set(0, 0, z);
      const b = basin({ l: d.l, w: d.w, h: d.h, wall: 0.22, liquidFrac: 0.55 });
      cellGrp.add(b);
      const liq = b.getObjectByName('liquid');
      if (liq) { liq.visible = false; refs.levels.set(`${TAGS.filters}#${i}`, { mesh: liq, h: d.h, wall: 0.22, frac0: 0.55 }); }
      const bed = mediaBed({ l: d.l - 0.5, w: d.w - 0.5, h: 1.0 });
      bed.position.set(0, 0.22, 0);
      cellGrp.add(bed);
      refs.media.push(bed.getObjectByName('media'));
      // Wash water trough down the centre of each cell.
      const tr = basin({ l: d.l - 0.6, w: 0.5, h: 0.45, wall: 0.08, liquidFrac: null });
      tr.position.set(0, d.h - 0.55, 0);
      cellGrp.add(tr);
      cellGrp.add(withPos(valve({ s: 0.9 }), [-d.l / 2 - 0.5, 0.7, 0]));
      cellGrp.add(withPos(valve({ s: 0.9 }), [d.l / 2 + 0.5, 0.7, 0]));
      g.add(cellGrp);
    }
    const span = (d.cells - 1) * d.pitch + d.w;
    g.add(withPos(platform({ w: 2.2, d: span + 1.4, y: d.h + 0.1, rails: true }), [d.l / 2 + 1.4, 0, 0]));
    g.add(withPos(stairs({ steps: 14, w: 1.1 }), [d.l / 2 + 1.4, 0, span / 2 + 2.6]));
    g.add(withPos(instrument({ label: 'PDI' }), [-d.l / 2 - 1.1, 2.2, 0]));
    g.add(withPos(instrument({ label: 'AIT' }), [d.l / 2 + 0.4, 2.2, span / 2 - 0.5]));
    lamp(g, refs, TAGS.filters, d.h + 2.2);
    add(TAGS.filters, g, 'Rapid gravity filter gallery', 'filter', { pos: [13, 12, 14], target: [13.5, 2, 0] });
  }

  // ---- WR-101 washwater recovery ------------------------------------------
  {
    const d = DIM.washRecovery, g = new THREE.Group();
    const b = basin({ l: d.l, w: d.w, h: d.h, liquidFrac: 0.5 });
    g.add(b);
    trackLiquid(refs, TAGS.washRecovery, b, { h: d.h, frac0: 0.5 });
    const rp = centrifugalPump({ s: 0.8 });
    rp.position.set(-d.l / 2 - 1.5, 0, 0);
    const rm = rp.getObjectByName('motor');
    if (rm) { rm.material = rm.material.clone(); refs.motors.set(TAGS.washRecovery, rm); }
    g.add(rp);
    lamp(g, refs, TAGS.washRecovery, d.h + 1.2);
    add(TAGS.washRecovery, g, 'Washwater recovery basin', 'tank', { pos: [12, 8, -17], target: [10.5, 1.5, -10.5] });
  }

  // ---- BW-101 backwash tank (elevated) ------------------------------------
  {
    const g = new THREE.Group();
    g.add(frame({ w: 5.4, h: 7, d: 5.4 }));
    const t = tank({ d: 5, h: 4.6, mat: MAT.steel, liquidFrac: 0.8 });
    t.position.y = 7;
    g.add(t);
    const liq = t.getObjectByName('liquid');
    if (liq) { liq.visible = false; refs.levels.set(TAGS.backwashTank, { mesh: liq, h: 4.6, wall: 0, frac0: 0.8 }); }
    g.add(withPos(platform({ w: 6.4, d: 1.6, y: 7.1, rails: true }), [0, 0, 3.6]));
    g.add(withPos(stairs({ steps: 28, w: 1 }), [0, 0, 5.6]));
    g.add(withPos(instrument({ label: 'LIT' }), [2.8, 9.2, 0]));
    lamp(g, refs, TAGS.backwashTank, 12.3);
    add(TAGS.backwashTank, g, 'Backwash water tank', 'tank', { pos: [21, 12, 18], target: [15, 6, 10.5] });
  }

  // ---- P-102 backwash pump -------------------------------------------------
  {
    const g = new THREE.Group();
    const p = centrifugalPump({ s: 1.3 });
    const m = p.getObjectByName('motor');
    if (m) { m.material = m.material.clone(); refs.motors.set(TAGS.backwashPump, m); }
    g.add(p);
    g.add(withPos(valve({ s: 1.2 }), [1.9, 0.9, 0]));
    lamp(g, refs, TAGS.backwashPump, 2.1);
    add(TAGS.backwashPump, g, 'Backwash pump', 'pump', { pos: [22, 6, 15], target: [19, 1, 10.5] });
  }

  // ---- B-101 air scour blower ---------------------------------------------
  {
    const g = new THREE.Group();
    const b = blower({ s: 1.1 });
    g.add(b);
    const bm = b.children.find(c => c.isMesh && c.material === MAT.motor);
    if (bm) { bm.material = bm.material.clone(); refs.motors.set(TAGS.blower, bm); }
    g.add(withPos(instrument({ label: 'PI' }), [-1.2, 1.6, 0]));
    lamp(g, refs, TAGS.blower, 2.4);
    add(TAGS.blower, g, 'Air scour blower', 'blower', { pos: [8, 6, 14], target: [10.5, 1.5, 8.5] });
  }

  // ---- CH-102 chlorine dosing ---------------------------------------------
  {
    const g = new THREE.Group();
    g.add(withPos(verticalVessel({ d: 1.7, h: 3.4, mat: MAT.painted }), [-1.3, 0, 0]));
    g.add(withPos(verticalVessel({ d: 1.7, h: 3.4, mat: MAT.painted }), [1.3, 0, 0]));
    const dp = centrifugalPump({ s: 0.6 });
    dp.position.set(0, 0, -2.1);
    const dm = dp.getObjectByName('motor');
    if (dm) { dm.material = dm.material.clone(); refs.motors.set(TAGS.chlorineDosing, dm); }
    g.add(dp);
    g.add(withPos(instrument({ label: 'AIT' }), [0, 1.6, -2.9]));
    lamp(g, refs, TAGS.chlorineDosing, 4.3);
    add(TAGS.chlorineDosing, g, 'Chlorine dosing skid', 'tank', { pos: [24, 7, 11], target: [20, 2, 6] });
  }

  // ---- CT-101 chlorine contact tank ---------------------------------------
  {
    const d = DIM.contact, g = new THREE.Group();
    const b = basin({ l: d.l, w: d.w, h: d.h, liquidFrac: 0.85 });
    g.add(b);
    trackLiquid(refs, TAGS.contactTank, b, { h: d.h, frac0: 0.85 });
    // Serpentine baffles: the reason t10 is a fraction of the nominal detention time.
    for (let i = 1; i <= 3; i++) {
      const z = -d.w / 2 + (d.w / 4) * i;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(d.l * 0.78, d.h * 0.95, 0.2), MAT.concrete);
      wall.position.set(i % 2 ? -d.l * 0.11 : d.l * 0.11, d.h * 0.475, z);
      wall.castShadow = wall.receiveShadow = true;
      g.add(wall);
    }
    g.add(withPos(platform({ w: 1.6, d: d.w + 1.2, y: d.h + 0.1, rails: true }), [d.l / 2 + 0.9, 0, 0]));
    g.add(withPos(instrument({ label: 'AIT' }), [d.l / 2 + 0.35, 2.2, 2]));
    lamp(g, refs, TAGS.contactTank, d.h + 1.9);
    add(TAGS.contactTank, g, 'Chlorine contact tank', 'tank', { pos: [24, 10, 12], target: [21, 2, 0] });
  }

  // ---- CW-101 clearwell ----------------------------------------------------
  {
    const d = DIM.clearwell, g = new THREE.Group();
    const b = basin({ l: d.l, w: d.w, h: d.h, liquidFrac: 0.75 });
    g.add(b);
    trackLiquid(refs, TAGS.clearwell, b, { h: d.h, frac0: 0.75 });
    // Roof slab on columns: the clearwell is a covered contact volume.
    const roof = new THREE.Mesh(new THREE.BoxGeometry(d.l + 0.4, 0.22, d.w + 0.4), MAT.concrete);
    roof.position.y = d.h + 0.5; roof.castShadow = roof.receiveShadow = true;
    g.add(roof);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.3, d.h + 0.5, 0.3), MAT.concrete);
      col.position.set(sx * (d.l / 2 - 0.6), (d.h + 0.5) / 2, sz * (d.w / 2 - 0.6));
      g.add(col);
    });
    g.add(withPos(instrument({ label: 'LIT' }), [-d.l / 2 - 0.35, 2.4, 0]));
    g.add(withPos(instrument({ label: 'AIT' }), [d.l / 2 + 0.35, 2.4, -2]));
    lamp(g, refs, TAGS.clearwell, d.h + 1.4);
    add(TAGS.clearwell, g, 'Clearwell', 'tank', { pos: [31, 10, 12], target: [28, 2, 0] });
  }

  // ---- P-103 high lift pumps ----------------------------------------------
  {
    const g = new THREE.Group();
    [-1.5, 0, 1.5].forEach((z, i) => {
      const p = centrifugalPump({ s: 1.25 });
      p.position.set(0, 0, z);
      const m = p.getObjectByName('motor');
      if (m) { m.material = m.material.clone(); refs.motors.set(`${TAGS.highLiftPump}#${i}`, m); }
      g.add(p);
      g.add(withPos(valve({ s: 1.2 }), [1.8, 0.9, z]));
    });
    g.add(withPos(instrument({ label: 'PI' }), [2.6, 1.7, 0]));
    lamp(g, refs, TAGS.highLiftPump, 2.4);
    add(TAGS.highLiftPump, g, 'High lift pumps', 'pump', { pos: [37, 7, 9], target: [32.5, 1.5, 0] });
  }

  // ---- MCC-101 motor control centre ---------------------------------------
  {
    const g = new THREE.Group();
    const shed = new THREE.Mesh(new THREE.BoxGeometry(7.5, 3.4, 5), MAT.cabinet);
    shed.position.y = 1.7; shed.castShadow = shed.receiveShadow = true;
    g.add(shed);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(8.1, 0.2, 5.6), MAT.concrete);
    roof.position.y = 3.5; g.add(roof);
    [-2.4, 0, 2.4].forEach(x => g.add(withPos(cabinet({ w: 1.1, h: 2.1, d: 0.7 }), [x, 0, 3.1])));
    g.add(withPos(instrument({ label: 'JI' }), [3.9, 2.2, 0]));
    lamp(g, refs, TAGS.mcc, 4.1);
    add(TAGS.mcc, g, 'Motor control centre', 'block', { pos: [31, 6, -4], target: [27.5, 2, -10.5] });
  }

  // ---- pipe rack, pipework and stream tracer paths ------------------------
  buildPipeRack(view);
  const routes = streamRoutes();
  for (const [id, r] of Object.entries(routes)) {
    view.add(pipe(r.path, { r: r.bore, mat: r.mat ?? MAT.pipe }));
    streams?.add(id, r.path, { phase: r.phase, maxTracers: r.tracers ?? 24 });
  }

  // ---- one ticker for every turning part ----------------------------------
  // Rendering stays on the shared rAF loop; nothing here rebuilds geometry.
  view.onTick(dt => {
    for (const r of refs.rotors) if (r.speed > 0 && r.obj) r.obj.rotation.y += dt * r.speed;
  });

  live = refs;
  return { presets: PRESETS, refs };
}

function withPos(obj, [x, y, z]) { obj.position.set(x, y, z); return obj; }

/** Cross-plant pipe rack carrying the service and return runs on the -Z side. */
function buildPipeRack(view) {
  const z = -6.5, y = 5.2;
  for (let x = -17; x <= 27; x += 5.5) {
    const bent = frame({ w: 1.6, h: y, d: 1.6 });
    bent.position.set(x, 0, z);
    view.add(bent);
  }
  [-0.5, 0.5].forEach(o => view.add(pipe([[-17.8, y - 0.35, z + o], [27.8, y - 0.35, z + o]], { r: 0.11 })));
  view.add(pipe([[-17.8, y - 0.95, z], [27.8, y - 0.95, z]], { r: 0.08, mat: MAT.steelDark }));
}

/**
 * Tracer paths. The ids are engine stream ids, so a path only ever animates when
 * the engine has reported a non-zero flow for that exact stream.
 */
function streamRoutes() {
  const rm = DIM.rapidMix, fl = DIM.floc, cl = DIM.clarifier, f = DIM.filters;
  const ct = DIM.contact, cw = DIM.clearwell;
  const fIn = L[TAGS.filters].x - f.l / 2, fOut = L[TAGS.filters].x + f.l / 2;
  return {
    [STREAMS.raw]: {
      phase: 'liquid', bore: 0.16,
      path: [[L[TAGS.intakePump].x, 1.0, 0], [-22.6, 1.0, 0], [edge(TAGS.rapidMix, rm, 'in') - 0.5, 2.6, 0], [edge(TAGS.rapidMix, rm, 'in'), 2.6, 0]]
    },
    [STREAMS.coagulant]: {
      phase: 'liquid', bore: 0.06, tracers: 12, mat: MAT.valve,
      path: [[L[TAGS.coagDosing].x, 2.6, L[TAGS.coagDosing].z - 2.2], [-20.4, 3.6, 3.4], [-19.8, 4.4, 1.2], [L[TAGS.rapidMix].x, 4.4, 0.3]]
    },
    [STREAMS.mixed]: {
      phase: 'liquid', bore: 0.16,
      path: [[edge(TAGS.rapidMix, rm, 'out'), 3.1, 0], [edge(TAGS.floc, fl, 'in'), 3.1, 0]]
    },
    [STREAMS.flocculated]: {
      phase: 'slurry', bore: 0.18,
      path: [[edge(TAGS.floc, fl, 'out'), 3.2, 0], [edge(TAGS.clarifier, cl, 'in'), 3.2, 0]]
    },
    [STREAMS.settled]: {
      phase: 'liquid', bore: 0.16,
      path: [[edge(TAGS.clarifier, cl, 'out'), 4.0, 0], [9.4, 4.0, 0], [fIn - 0.6, 2.9, 0], [fIn, 2.9, 0]]
    },
    [STREAMS.sludge]: {
      phase: 'slurry', bore: 0.09, tracers: 14,
      path: [[L[TAGS.clarifier].x - 3.2, 0.5, -cl.w / 2], [-1.5, 0.5, -6.4], [2.2, 0.8, -8.4], [L[TAGS.sludge].x - DIM.sludge.l / 2, 1.2, L[TAGS.sludge].z]]
    },
    [STREAMS.filtrate]: {
      phase: 'liquid', bore: 0.16,
      path: [[fOut, 1.1, 0], [17.4, 1.4, 0], [L[TAGS.contactTank].x - ct.l / 2, 2.4, 0]]
    },
    [STREAMS.backwashSupply]: {
      phase: 'liquid', bore: 0.14,
      path: [[L[TAGS.backwashTank].x, 6.6, L[TAGS.backwashTank].z - 2.8], [15, 6.6, 6.5], [14.2, 4.2, 5.2], [13.8, 3.0, 4.9]]
    },
    [STREAMS.backwashWaste]: {
      phase: 'slurry', bore: 0.13,
      path: [[12.6, 2.9, -4.9], [12.2, 2.2, -6.5], [11.4, 1.8, -8.6], [L[TAGS.washRecovery].x + DIM.washRecovery.l / 2, 1.6, L[TAGS.washRecovery].z]]
    },
    [STREAMS.recovered]: {
      phase: 'liquid', bore: 0.1, tracers: 30,
      path: [[L[TAGS.washRecovery].x - DIM.washRecovery.l / 2 - 2.2, 1.2, L[TAGS.washRecovery].z], [6, 4.25, -6.5], [-10, 4.25, -6.5], [-22.8, 3.0, -6.5], [-24.5, 1.4, -2.6], [-24.5, 1.2, -1.4]]
    },
    [STREAMS.chlorine]: {
      phase: 'liquid', bore: 0.06, tracers: 12, mat: MAT.valve,
      path: [[L[TAGS.chlorineDosing].x, 2.4, L[TAGS.chlorineDosing].z - 2.1], [20.3, 3.2, 3.2], [20.8, 3.8, 1.4], [L[TAGS.contactTank].x, 3.8, 0.4]]
    },
    [STREAMS.disinfected]: {
      phase: 'liquid', bore: 0.16,
      path: [[L[TAGS.contactTank].x + ct.l / 2, 2.4, 0], [L[TAGS.clearwell].x - cw.l / 2, 2.4, 0]]
    },
    [STREAMS.product]: {
      phase: 'liquid', bore: 0.16,
      path: [[L[TAGS.clearwell].x + cw.l / 2, 1.4, 0], [L[TAGS.highLiftPump].x - 1.2, 1.0, 0], [L[TAGS.highLiftPump].x, 1.0, 0], [36.5, 1.0, 0]]
    },
    [STREAMS.airScour]: {
      phase: 'air', bore: 0.09, tracers: 16,
      path: [[L[TAGS.blower].x + 1.4, 1.5, L[TAGS.blower].z], [11.6, 1.5, 6.4], [11.8, 1.0, 5.0], [12, 0.6, 4.6]]
    }
  };
}

/**
 * Paints the solved state onto the plant. Called on every result change, never
 * per frame. Anything the engine has not reported is left showing nothing rather
 * than a plausible default: liquid bodies hide, lamps go idle, rotors stop.
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
    const st = equipment[key.split('#')[0]];
    m.material.color.setHex(stateColor(st));
  }

  for (const [key, lv] of refs.levels) {
    const st = equipment[key.split('#')[0]];
    const frac = st?.level;
    if (!Number.isFinite(frac) || frac <= 0) { lv.mesh.visible = false; continue; }
    lv.mesh.visible = true;
    lv.mesh.scale.y = Math.max(frac / lv.frac0, 0.01);
    const hh = lv.h * frac;
    lv.mesh.position.y = lv.wall + hh / 2;
  }

  const load = equipment[TAGS.filters]?.load;
  for (const bed of refs.media) {
    if (!bed) continue;
    if (!Number.isFinite(load)) bed.material.color.copy(MEDIA_CLEAN);
    else bed.material.color.copy(MEDIA_CLEAN).lerp(MEDIA_LOADED, Math.min(Math.max(load, 0), 1));
  }

  for (const r of refs.rotors) {
    const st = equipment[r.tag];
    const running = st && st.state !== 'stopped' && st.state !== 'tripped' && st.state !== 'off';
    r.speed = running ? r.base * (0.3 + 0.7 * (Number.isFinite(st.load) ? st.load : 0.5)) : 0;
  }
}

export default { build, applyState, presets: PRESETS, layout: L };
