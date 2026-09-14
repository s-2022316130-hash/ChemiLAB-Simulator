import * as THREE from 'three';
import { token } from '../shared/theme.js';

/**
 * Shared material palette.
 *
 * Reuse matters for draw-call count, so every entry here is a single instance
 * shared across the whole scene. A plant module that needs to tint one item
 * clones the material first — see the `applyState` implementations.
 *
 * Colours are grouped by what a thing does rather than by what it is made of,
 * so a plant reads as a sequence of process sections instead of as one mass of
 * grey steel: feed and solids handling run warm, heating runs hot, separation
 * runs cool, product runs green, utilities run violet. That is a real
 * convention — process plants are painted by service — and it is what lets a
 * student find the separation section without reading a single label.
 *
 * Finish is carried by roughness, metalness and clearcoat rather than by the
 * colour alone. Polished stainless, painted carbon steel, galvanised grating
 * and concrete all reflect the environment differently, and it is that
 * difference that makes the plant look like equipment rather than like a
 * diagram that happens to be in three dimensions.
 */

const std = (color, o = {}) => new THREE.MeshStandardMaterial({
  color, roughness: 0.55, metalness: 0.35, envMapIntensity: 1.45, ...o
});
/**
 * Painted equipment: a coloured base with a gloss finish.
 *
 * The gloss is a low roughness against the reflection probe rather than a
 * clearcoat layer. A clearcoat is a second specular lobe and a second image
 * lighting sample on every one of these surfaces, and on the integrated GPU
 * this has to run on it costs several milliseconds a frame for a difference
 * nobody can see at plant scale.
 */
const painted = (color, o = {}) => {
  const { clearcoat, clearcoatRoughness, ...rest } = o;   // accepted, not used
  return new THREE.MeshStandardMaterial({
    color, roughness: 0.28, metalness: 0.25, envMapIntensity: 1.6, ...rest
  });
};

/**
 * Finishes are separated by roughness first and colour second. Two greys at the
 * same roughness are one material with two names; a polished vessel next to a
 * galvanised walkway next to a concrete plinth reads as three things even in
 * silhouette, and that legibility is what the roughness spread below buys.
 */
export const MAT = {
  // --- structural ---------------------------------------------------------
  steel: std(0xb2bcc9, { roughness: 0.22, metalness: 0.95, envMapIntensity: 1.85 }),
  steelDark: std(0x707c8b, { roughness: 0.36, metalness: 0.9, envMapIntensity: 1.55 }),
  vessel: std(0xcfd7e2, { roughness: 0.13, metalness: 0.94, envMapIntensity: 2.15 }),
  frame: painted(0x7f8da0, { roughness: 0.5 }),
  grating: std(0x6d7783, { roughness: 0.84, metalness: 0.55, envMapIntensity: 0.9 }),
  concrete: std(0xa8a49b, { roughness: 0.95, metalness: 0.0, envMapIntensity: 0.6 }),
  pipe: std(0x97a2b2, { roughness: 0.2, metalness: 0.93, envMapIntensity: 1.9 }),

  // --- driven equipment ---------------------------------------------------
  pump: painted(0x11ab9a),
  motor: painted(0x39434f, { roughness: 0.42 }),
  blowerBody: painted(0x2f7fc4),

  // --- process sections ---------------------------------------------------
  feed: painted(0xe09a2f),        // solids handling, warm ochre
  heating: painted(0xdd4a30),     // burners, heaters, fired equipment
  separation: painted(0x1d9bbd),  // cyclones, clarifiers, filters, columns
  product: painted(0x2fa864),     // coolers, bins, clearwells
  utility: painted(0x8360e4),     // chemical dosing, services
  painted: painted(0x2f86cf),

  // --- detail -------------------------------------------------------------
  valve: painted(0xef5c1f, { roughness: 0.16 }),
  instrument: std(0xf2f6fb, { roughness: 0.12, metalness: 0.3, envMapIntensity: 1.9 }),
  cabinet: painted(0x4a5b70),

  // --- media --------------------------------------------------------------
  // Water is the one surface a viewer already knows the look of, so it is
  // nearly mirror-smooth, faintly coloured and see-through. Front faces only:
  // a liquid body is a closed solid, and double-siding it doubles the cost of
  // the most expensive pixels in the scene for a back face nobody can see.
  liquid: std(0x2f9fe0, {
    transparent: true, opacity: 0.72,
    roughness: 0.035, metalness: 0.18, envMapIntensity: 2.4
  }),
  hot: std(0xe0763a, { emissive: 0x9a3208, emissiveIntensity: 1.1, roughness: 0.55 })
};

/**
 * Neutral finishes that have to move with the interface: concrete and
 * galvanising are read relative to the ground they stand on, and the ground
 * changes with the theme. Coloured process equipment does not move — a red
 * fired heater is red in both themes, because that is what the paint means.
 */
const NEUTRALS = {
  light: {
    concrete: 0xa8a49b, grating: 0x606a76, frame: 0x738193,
    steelDark: 0x6b7684, steel: 0xb2bcc9, vessel: 0xcfd7e2, pipe: 0x97a2b2
  },
  // Under a night rig the metals are lit almost entirely by reflection, so they
  // are lifted rather than darkened: a mid grey that reads correctly in daylight
  // goes to mud when the only thing to reflect is a dark sky.
  dark: {
    concrete: 0x6e6a64, grating: 0x59636f, frame: 0x66748a,
    steelDark: 0x77828f, steel: 0xc2ccd8, vessel: 0xdae1ea, pipe: 0xa4aebc
  }
};

export function setSceneTheme(theme) {
  const n = NEUTRALS[theme] || NEUTRALS.dark;
  for (const [k, hex] of Object.entries(n)) MAT[k]?.color.setHex(hex);
}

/** Equipment state colours. Matched to the CSS status palette in theme.css. */
export const STATE_COLOR = {
  running: 0x22c55e, idle: 0x94a1b6, warning: 0xf59e0b, tripped: 0xef4444, off: 0x64748b
};

// The highlight tint is the simulator's own hue, read once per theme so a
// hover on the water plant does not glow the same colour as one on the dryer.
let hiColour = new THREE.Color(0x38bdf8), hiKey = '';
function highlightColour() {
  const key = `${document.documentElement.dataset.theme}|${document.documentElement.dataset.sim}`;
  if (key !== hiKey) { hiKey = key; hiColour = new THREE.Color(token('--hue', '#38bdf8')); }
  return hiColour;
}

/**
 * Hover and selection highlight. Clones the material on the way in so the
 * shared palette entry is never mutated, and restores the original on the way
 * out. The lift is emissive rather than a colour change, so a warning amber
 * stays amber while the pointer is over it.
 */
export function highlight(mesh, on) {
  const tint = highlightColour();
  mesh.traverse(o => {
    if (!o.isMesh || !o.material) return;
    if (on) {
      if (o.userData._orig) return;
      o.userData._orig = o.material;
      const m = o.material.clone();
      if (m.emissive) {
        m.emissive.copy(tint);
        m.emissiveIntensity = Math.max(m.emissiveIntensity ?? 0, 0.42);
      }
      if ('envMapIntensity' in m) m.envMapIntensity = (m.envMapIntensity ?? 1) * 1.5;
      o.material = m;
    } else if (o.userData._orig) {
      const cur = o.material, orig = o.userData._orig;
      // A plant module may have re-coloured this mesh while the highlight was on
      // — equipment state does not pause for the mouse — so carry that across
      // rather than restoring a colour the engine has already moved past.
      if (cur.color && orig.color && !cur.color.equals(orig.color)) orig.color.copy(cur.color);
      o.material = orig;
      cur.dispose();
      delete o.userData._orig;
    }
  });
}
