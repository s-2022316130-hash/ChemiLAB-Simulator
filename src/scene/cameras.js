import * as THREE from 'three';

/**
 * Camera presets.
 *
 * A preset used to be a pair of hand-typed coordinates, and hand-typed
 * coordinates go stale the moment anything moves. Worse, they were guesses:
 * measured against the built geometry, every overview cropped its own plot —
 * the fertilizer works needed 191 % of the frame height to fit, and the paint
 * works 218 % of the width. A "show me the whole plant" button that cannot show
 * the whole plant is the wrong kind of wrong.
 *
 * So a preset now declares *what it looks at* and *from where in the round*,
 * and the distance is computed from the actual bounding box of those items once
 * the plant has been built:
 *
 *   { subject: '*' | [tags], azimuth: deg, elevation: deg, fill: 0…1, label? }
 *
 *   subject    the tags this preset is about, or '*' for the whole plot
 *   azimuth    compass bearing of the camera from the subject, measured from
 *              +Z towards +X, so 0° stands due front and 90° due right
 *   elevation  how far above the subject the camera sits, in degrees
 *   fill       how much of the frame the subject should occupy
 *
 * Choosing a bearing is still a judgement — which side of a unit is worth
 * seeing, and what is standing in the way — and that judgement stays with the
 * plant module that knows the layout. What is no longer a judgement is how far
 * back to stand, which is arithmetic and was being done by eye.
 */

export const PRESET_ORDER = ['overview', 'feed', 'main', 'separation', 'utilities', 'products', 'control'];
export const PRESET_LABEL = {
  overview: 'Overview', feed: 'Feed', main: 'Main process', separation: 'Separation',
  utilities: 'Utilities', products: 'Products', control: 'Control room'
};

/**
 * The panel shape and lens the presets are composed for — measured, not assumed.
 * The 3D view in the three-column desktop workspace is 782 × 416 CSS pixels at a
 * 1512-wide window, which is 1.88 and not the 1.55 this was originally written
 * against. Budgeting for a narrower panel than exists makes the camera stand
 * back to buy width it already had, and every preset comes out small with empty
 * margins down both sides.
 *
 * scene/renderer.js imports this rather than keeping its own copy: the number
 * that decides how a preset is framed and the number that decides when a narrow
 * viewport needs correcting have to be the same number.
 */
export const REFERENCE_ASPECT = 1.88;
export const BASE_FOV = 45;
const DEG = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);
const round = n => Math.round(n * 10) / 10;

/**
 * Where to stand so that `box` fills `fill` of the frame from the given bearing.
 *
 * The distance is solved rather than estimated: for each corner of the box,
 * work out how far back the camera has to be for that corner to fall inside the
 * frustum, and take the largest answer. Using the bounding sphere instead would
 * be simpler and would stand much too far back from a long, low plot — which is
 * the shape of most of these plants.
 */
export function frameBox(box, {
  azimuth = 38, elevation = 24, fill = 0.82,
  aspect = REFERENCE_ASPECT, fov = BASE_FOV, aim = 0.45, minDistance = 7
} = {}) {
  const centre = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  // Aim below the middle of a tall subject. A column looked at from its waist
  // reads as tall; one looked at from its centre reads as a cylinder.
  const target = new THREE.Vector3(centre.x, box.min.y + size.y * aim, centre.z);

  const a = azimuth * DEG, e = elevation * DEG;
  const dir = new THREE.Vector3(
    Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)
  ).normalize();
  const forward = dir.clone().negate();
  const right = new THREE.Vector3().crossVectors(forward, UP).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();

  const tanV = Math.tan(fov * DEG / 2) * fill;
  const tanH = tanV * aspect;

  let distance = minDistance;
  const v = new THREE.Vector3();
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        v.set(x, y, z).sub(target);
        const along = v.dot(dir);
        distance = Math.max(
          distance,
          Math.abs(v.dot(up)) / tanV + along,
          Math.abs(v.dot(right)) / tanH + along
        );
      }
    }
  }

  const pos = target.clone().addScaledVector(dir, distance);
  return {
    pos: [round(pos.x), round(pos.y), round(pos.z)],
    target: [round(target.x), round(target.y), round(target.z)]
  };
}

/** The union of the boxes of the named tags, in world space. */
function subjectBox(view, subject) {
  const tags = subject === '*'
    ? (view.listEquipment?.() || []).map(m => m.tag)
    : subject;
  const box = new THREE.Box3();
  for (const tag of tags) {
    const entry = view.getEquipment?.(tag);
    if (entry?.group) box.expandByObject(entry.group);
  }
  return box.isEmpty() ? null : box;
}

/**
 * Turn declared presets into camera positions, once, after the plant is built.
 * A preset whose subject is not in the scene is dropped rather than pointed at
 * the origin — a button that flies the camera into the ground is worse than a
 * button that is not there.
 */
export function resolvePresets(view, specs) {
  const out = {};
  for (const [id, spec] of Object.entries(specs)) {
    const box = subjectBox(view, spec.subject);
    if (!box) continue;
    out[id] = { ...frameBox(box, spec), label: spec.label || PRESET_LABEL[id] || id };
  }
  return out;
}

export function createCameraPresets(view, presets) {
  return {
    list: () => Object.keys(presets)
      .sort((a, b) => PRESET_ORDER.indexOf(a) - PRESET_ORDER.indexOf(b))
      .map(id => ({ id, label: presets[id].label || PRESET_LABEL[id] || id })),
    go(id) { const p = presets[id]; if (p) view.flyTo(p.pos, p.target); },
    get(id) { return presets[id] || null; }
  };
}
