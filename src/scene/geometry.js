import * as THREE from 'three';
import { MAT } from './materials.js';
// Reusable industrial primitives. Simulator plants compose these — never raw boxes.
const g = (geo, mat, pos = [0, 0, 0], rot = [0, 0, 0]) => {
  const m = new THREE.Mesh(geo, mat); m.position.set(...pos); m.rotation.set(...rot);
  m.castShadow = m.receiveShadow = true; return m;
};
export function verticalVessel({ d = 2, h = 5, heads = true, mat = MAT.vessel }) {
  const grp = new THREE.Group();
  grp.add(g(new THREE.CylinderGeometry(d / 2, d / 2, h, 28), mat, [0, h / 2, 0]));
  if (heads) {
    const head = new THREE.SphereGeometry(d / 2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    grp.add(g(head, mat, [0, h, 0]));
    grp.add(g(head, mat, [0, 0, 0], [Math.PI, 0, 0]));
  }
  return grp;
}
export function horizontalVessel({ d = 2, l = 6, mat = MAT.vessel }) {
  const grp = new THREE.Group();
  grp.add(g(new THREE.CylinderGeometry(d / 2, d / 2, l, 24), mat, [0, d / 2 + .6, 0], [0, 0, Math.PI / 2]));
  [-l / 3, l / 3].forEach(x => grp.add(g(new THREE.BoxGeometry(.3, .6, d * .9), MAT.concrete, [x, .3, 0])));
  return grp;
}
export function tank({ d = 6, h = 4, cone = 0, mat = MAT.steel, liquidFrac = null }) {
  const grp = new THREE.Group();
  grp.add(g(new THREE.CylinderGeometry(d / 2, d / 2, h, 32, 1, true), mat, [0, h / 2, 0]));
  if (cone > 0) grp.add(g(new THREE.ConeGeometry(d / 2, cone, 32), mat, [0, -cone / 2, 0]));
  if (liquidFrac !== null) {
    const lq = g(new THREE.CylinderGeometry(d / 2 * .98, d / 2 * .98, Math.max(h * liquidFrac, .01), 32), MAT.liquid, [0, h * liquidFrac / 2, 0]);
    lq.name = 'liquid'; grp.add(lq);
  }
  return grp;
}
export function column({ d = 1.6, h = 14, trays = 8 }) {
  const grp = verticalVessel({ d, h });
  for (let i = 1; i <= trays; i++) grp.add(g(new THREE.TorusGeometry(d / 2 + .05, .04, 6, 24), MAT.steelDark, [0, (h / (trays + 1)) * i, 0], [Math.PI / 2, 0, 0]));
  grp.add(g(new THREE.CylinderGeometry(.12, .12, h * .9, 8), MAT.pipe, [d / 2 + .5, h * .45, 0]));
  return grp;
}
export function centrifugalPump({ s = 1 }) {
  const grp = new THREE.Group();
  grp.add(g(new THREE.BoxGeometry(1.8 * s, .25, 1 * s), MAT.concrete, [0, .12, 0]));
  grp.add(g(new THREE.CylinderGeometry(.42 * s, .42 * s, .38 * s, 20), MAT.pump, [-.45 * s, .5 * s, 0], [0, 0, Math.PI / 2]));
  const motor = g(new THREE.CylinderGeometry(.3 * s, .3 * s, .9 * s, 18), MAT.motor, [.45 * s, .5 * s, 0], [0, 0, Math.PI / 2]);
  motor.name = 'motor'; grp.add(motor);
  grp.add(g(new THREE.CylinderGeometry(.07, .07, .3, 8), MAT.steelDark, [0, .5 * s, 0], [0, 0, Math.PI / 2]));
  return grp;
}
export function blower({ s = 1 }) {
  const grp = new THREE.Group();
  const scroll = g(new THREE.TorusGeometry(.55 * s, .28 * s, 10, 24), MAT.painted, [0, .8 * s, 0]);
  grp.add(scroll);
  grp.add(g(new THREE.CylinderGeometry(.28 * s, .28 * s, .8 * s, 16), MAT.motor, [.9 * s, .8 * s, 0], [0, 0, Math.PI / 2]));
  grp.add(g(new THREE.BoxGeometry(2.2 * s, .2, 1.1 * s), MAT.concrete, [.2 * s, .1, 0]));
  return grp;
}
export function shellTubeExchanger({ d = 1, l = 4 }) {
  const grp = new THREE.Group();
  grp.add(g(new THREE.CylinderGeometry(d / 2, d / 2, l, 20), MAT.vessel, [0, d / 2 + .8, 0], [0, 0, Math.PI / 2]));
  [-l / 2, l / 2].forEach(x => grp.add(g(new THREE.CylinderGeometry(d / 2 * 1.08, d / 2 * 1.08, .25, 20), MAT.steelDark, [x, d / 2 + .8, 0], [0, 0, Math.PI / 2])));
  [-l / 3, l / 3].forEach(x => grp.add(g(new THREE.BoxGeometry(.3, .8, d), MAT.concrete, [x, .4, 0])));
  return grp;
}
export function pipe(points, { r = .09, mat = MAT.pipe } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), false, 'catmullrom', .02);
  return g(new THREE.TubeGeometry(curve, Math.max(points.length * 6, 24), r, 8, false), mat);
}
export function valve({ s = 1, hand = true }) {
  const grp = new THREE.Group();
  grp.add(g(new THREE.BoxGeometry(.3 * s, .3 * s, .3 * s), MAT.valve));
  if (hand) grp.add(g(new THREE.TorusGeometry(.2 * s, .03, 6, 16), MAT.steelDark, [0, .3 * s, 0], [Math.PI / 2, 0, 0]));
  return grp;
}
export function platform({ w = 4, d = 3, y = 4, rails = true }) {
  const grp = new THREE.Group();
  grp.add(g(new THREE.BoxGeometry(w, .08, d), MAT.grating, [0, y, 0]));
  const posts = [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]];
  posts.forEach(([x, z]) => grp.add(g(new THREE.CylinderGeometry(.06, .06, y, 6), MAT.frame, [x, y / 2, z])));
  if (rails) {
    [1, 1.5].forEach(hh => posts.forEach(([x, z], i) => {
      const [nx, nz] = posts[(i + 1) % 4];
      grp.add(pipe([[x, y + hh * .6, z], [nx, y + hh * .6, nz]], { r: .03, mat: MAT.frame }));
    }));
  }
  return grp;
}
export function stairs({ steps = 10, rise = .25, run = .28, w = 1 }) {
  const grp = new THREE.Group();
  for (let i = 0; i < steps; i++) grp.add(g(new THREE.BoxGeometry(w, .04, run), MAT.grating, [0, i * rise + rise, -i * run]));
  return grp;
}
export function frame({ w = 6, h = 6, d = 4 }) {
  const grp = new THREE.Group(); const c = .1;
  [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]].forEach(([x, z]) =>
    grp.add(g(new THREE.BoxGeometry(c, h, c), MAT.frame, [x, h / 2, z])));
  [0, h].forEach(y => {
    grp.add(g(new THREE.BoxGeometry(w, c, c), MAT.frame, [0, y, -d / 2]));
    grp.add(g(new THREE.BoxGeometry(w, c, c), MAT.frame, [0, y, d / 2]));
    grp.add(g(new THREE.BoxGeometry(c, c, d), MAT.frame, [-w / 2, y, 0]));
    grp.add(g(new THREE.BoxGeometry(c, c, d), MAT.frame, [w / 2, y, 0]));
  });
  return grp;
}
export function instrument({ label = 'PI' }) {
  const grp = new THREE.Group();
  grp.add(g(new THREE.CylinderGeometry(.16, .16, .06, 16), MAT.instrument, [0, 0, 0], [Math.PI / 2, 0, 0]));
  grp.add(g(new THREE.CylinderGeometry(.03, .03, .3, 8), MAT.steelDark, [0, -.18, 0]));
  grp.userData.label = label;
  return grp;
}
export function cabinet({ w = 1, h = 2, d = .6 }) {
  const grp = new THREE.Group();
  grp.add(g(new THREE.BoxGeometry(w, h, d), MAT.cabinet, [0, h / 2, 0]));
  grp.add(g(new THREE.BoxGeometry(w * .8, h * .25, .02), MAT.instrument, [0, h * .7, d / 2 + .01]));
  return grp;
}
export function ground({ size = 60 }) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), MAT.concrete);
  m.rotation.x = -Math.PI / 2; m.receiveShadow = true; return m;
}
