import * as THREE from 'three';
import { MAT, STATE_COLOR } from './materials.js';
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
/**
 * Rectangular open-top concrete basin: mixing chambers, flocculators, clarifiers,
 * contact tanks, clearwells. `l` runs along X, `w` along Z.
 * The liquid body is named 'liquid' so a plant module can drive its level.
 */
export function basin({ w = 6, l = 10, h = 4, wall = .3, mat = MAT.concrete, liquidFrac = null }) {
  const grp = new THREE.Group();
  grp.add(g(new THREE.BoxGeometry(l, wall, w), mat, [0, wall / 2, 0]));
  grp.add(g(new THREE.BoxGeometry(l, h, wall), mat, [0, h / 2, -w / 2 + wall / 2]));
  grp.add(g(new THREE.BoxGeometry(l, h, wall), mat, [0, h / 2, w / 2 - wall / 2]));
  grp.add(g(new THREE.BoxGeometry(wall, h, w - wall * 2), mat, [-l / 2 + wall / 2, h / 2, 0]));
  grp.add(g(new THREE.BoxGeometry(wall, h, w - wall * 2), mat, [l / 2 - wall / 2, h / 2, 0]));
  if (liquidFrac !== null) {
    const lh = Math.max(h * liquidFrac, .01);
    const lq = g(new THREE.BoxGeometry(l - wall * 2, lh, w - wall * 2), MAT.liquid, [0, wall + lh / 2, 0]);
    lq.name = 'liquid'; grp.add(lq);
  }
  return grp;
}
/**
 * Shaft agitator with paddle blades, sitting on the basin floor with its drive
 * above the coping. The turning parts are grouped as 'rotor' so a plant module
 * can spin them at a speed the engine reports, and leave them still when it does not.
 */
export function agitator({ h = 4, d = 1.6, blades = 2 }) {
  const grp = new THREE.Group();
  grp.add(g(new THREE.BoxGeometry(.8, .12, .8), MAT.frame, [0, h + .2, 0]));
  grp.add(g(new THREE.BoxGeometry(.55, .3, .55), MAT.steelDark, [0, h + .41, 0]));
  grp.add(g(new THREE.CylinderGeometry(.26, .26, .62, 14), MAT.motor, [0, h + .87, 0]));
  const rotor = new THREE.Group(); rotor.name = 'rotor';
  rotor.add(g(new THREE.CylinderGeometry(.08, .08, h + .2, 10), MAT.steelDark, [0, (h + .2) / 2, 0]));
  for (let i = 0; i < blades; i++) {
    const y = h * (.26 + .46 * (blades === 1 ? 0 : i / (blades - 1)));
    rotor.add(g(new THREE.BoxGeometry(d, .3, .05), MAT.steel, [0, y, 0]));
    rotor.add(g(new THREE.BoxGeometry(.05, .3, d), MAT.steel, [0, y, 0]));
  }
  grp.add(rotor);
  return grp;
}
/**
 * Granular media bed on its support floor: sand and anthracite filters, packed
 * adsorbers, ion-exchange beds. The bed is named 'media' so its loading can be shown.
 */
export function mediaBed({ w = 3, l = 3, h = 1.1, mat = MAT.steelDark }) {
  const grp = new THREE.Group();
  grp.add(g(new THREE.BoxGeometry(l, .16, w), MAT.concrete, [0, .08, 0]));
  const bed = g(new THREE.BoxGeometry(l, h, w), mat.clone(), [0, .16 + h / 2, 0]);
  bed.name = 'media'; grp.add(bed);
  return grp;
}
/**
 * Equipment status lamp. Carries its own material so colouring one never
 * colours every other item sharing a palette entry.
 */
export function statusLamp({ r = .17 } = {}) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), new THREE.MeshStandardMaterial({
    color: STATE_COLOR.idle, emissive: STATE_COLOR.idle, emissiveIntensity: .9, roughness: .4
  }));
  m.name = 'lamp'; m.castShadow = false; return m;
}
/**
 * Inclined rotating drum on trunnion piers: rotary dryers, kilns, coolers,
 * granulators. The axis runs along local X so the turning parts, grouped as
 * 'shell', spin about x. Tilt the whole group to give it its slope.
 */
export function rotaryDrum({ d = 2, l = 12, axisHeight = 2.2, mat = MAT.steel, flights = 8 }) {
  const grp = new THREE.Group();
  const shell = new THREE.Group(); shell.name = 'shell';
  shell.position.y = axisHeight;
  shell.add(g(new THREE.CylinderGeometry(d / 2, d / 2, l, 32, 1, true), mat, [0, 0, 0], [0, 0, Math.PI / 2]));
  // Riding rings and the girth gear turn with the shell.
  [-l * 0.3, l * 0.3].forEach(xp =>
    shell.add(g(new THREE.TorusGeometry(d / 2 + .07, .11, 8, 28), MAT.steelDark, [xp, 0, 0], [0, Math.PI / 2, 0])));
  shell.add(g(new THREE.TorusGeometry(d / 2 + .13, .09, 8, 44), MAT.steelDark, [l * 0.14, 0, 0], [0, Math.PI / 2, 0]));
  // Lifting flights, seen through the open ends.
  for (let i = 0; i < flights; i++) {
    const a = (i / flights) * Math.PI * 2;
    const f = g(new THREE.BoxGeometry(l * .96, .16, .04), MAT.steelDark,
      [0, Math.cos(a) * (d / 2 - .12), Math.sin(a) * (d / 2 - .12)], [a, 0, 0]);
    shell.add(f);
  }
  grp.add(shell);
  // Trunnion piers and their rollers stay still.
  [-l * 0.3, l * 0.3].forEach(xp => {
    const pierH = Math.max(axisHeight - d / 2 - .25, .3);
    grp.add(g(new THREE.BoxGeometry(.9, pierH, d + .9), MAT.concrete, [xp, pierH / 2, 0]));
    [-1, 1].forEach(sz => grp.add(g(new THREE.CylinderGeometry(.22, .22, .34, 14), MAT.steelDark,
      [xp, pierH + .22, sz * (d / 2 + .12)], [0, 0, Math.PI / 2])));
  });
  // Drive: motor, reducer and pinion beside the girth gear.
  grp.add(g(new THREE.BoxGeometry(1.5, .3, 1.2), MAT.concrete, [l * .14, .15, d / 2 + 1.1]));
  grp.add(g(new THREE.BoxGeometry(.7, .55, .6), MAT.steelDark, [l * .14, .58, d / 2 + 1.3]));
  grp.add(g(new THREE.CylinderGeometry(.27, .27, .8, 16), MAT.motor, [l * .14, .72, d / 2 + .7], [Math.PI / 2, 0, 0]));
  return grp;
}
/**
 * Reverse-flow cyclone: barrel, cone, tangential inlet and vortex finder.
 * The standard gas–solid separator, so it recurs across the simulators.
 */
export function cyclone({ d = 1.2, barrel = 1.8, cone = 2.2, mat = MAT.vessel }) {
  const grp = new THREE.Group();
  const base = cone;
  grp.add(g(new THREE.CylinderGeometry(d / 2, d / 2, barrel, 28, 1, true), mat, [0, base + barrel / 2, 0]));
  grp.add(g(new THREE.ConeGeometry(d / 2, cone, 28, 1, true), mat, [0, base / 2, 0]));
  grp.add(g(new THREE.CylinderGeometry(d * .18, d * .18, .5, 14), MAT.steelDark, [0, .25, 0]));
  // Tangential inlet and the vortex finder out of the roof.
  grp.add(g(new THREE.BoxGeometry(d * .5, barrel * .45, d * .28), MAT.steelDark,
    [d * .42, base + barrel * .72, d * .3]));
  grp.add(g(new THREE.CylinderGeometry(d * .22, d * .22, barrel * .9, 16), MAT.steelDark,
    [0, base + barrel + barrel * .25, 0]));
  return grp;
}
/**
 * Rectangular vessel on a pyramidal hopper: feed hoppers, product bins,
 * baghouses. The hopper is what makes it discharge rather than bridge.
 */
export function hopperVessel({ w = 2.4, l = 2.4, h = 3, hopper = 1.6, mat = MAT.steel }) {
  const grp = new THREE.Group();
  grp.add(g(new THREE.BoxGeometry(l, h, w), mat, [0, hopper + h / 2, 0]));
  const cone = new THREE.ConeGeometry(Math.max(l, w) * .72, hopper, 4);
  grp.add(g(cone, mat, [0, hopper / 2, 0], [Math.PI, Math.PI / 4, 0]));
  grp.add(g(new THREE.CylinderGeometry(.16, .16, .45, 12), MAT.steelDark, [0, -.15, 0]));
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) =>
    grp.add(g(new THREE.BoxGeometry(.12, hopper, .12), MAT.frame, [sx * l * .46, hopper / 2, sz * w * .46])));
  return grp;
}
/**
 * Enclosed screw conveyor with its drive. Solids handling between units.
 * The trough runs along local X.
 */
export function screwConveyor({ l = 4, d = .45, mat = MAT.steelDark }) {
  const grp = new THREE.Group();
  grp.add(g(new THREE.CylinderGeometry(d / 2, d / 2, l, 16), mat, [0, 0, 0], [0, 0, Math.PI / 2]));
  grp.add(g(new THREE.BoxGeometry(.5, .45, .5), MAT.steelDark, [l / 2 + .3, 0, 0]));
  grp.add(g(new THREE.CylinderGeometry(.2, .2, .55, 14), MAT.motor, [l / 2 + .75, 0, 0], [0, 0, Math.PI / 2]));
  grp.add(g(new THREE.BoxGeometry(.4, .35, .4), mat, [-l / 2 + .3, d / 2 + .16, 0]));
  grp.add(g(new THREE.BoxGeometry(.4, .35, .4), mat, [l / 2 - .3, -d / 2 - .16, 0]));
  return grp;
}
export function ground({ size = 60 }) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), MAT.concrete);
  m.rotation.x = -Math.PI / 2; m.receiveShadow = true; return m;
}
