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
  color, roughness: 0.55, metalness: 0.35, envMapIntensity: 1.1, ...o
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
    color, roughness: 0.3, metalness: 0.25, envMapIntensity: 1.25, ...rest
  });
};

export const MAT = {
  // --- structural ---------------------------------------------------------
  steel: std(0xa7b2c0, { roughness: 0.3, metalness: 0.92, envMapIntensity: 1.35 }),
  steelDark: std(0x6b7684, { roughness: 0.42, metalness: 0.86, envMapIntensity: 1.2 }),
  vessel: std(0xc6cfda, { roughness: 0.19, metalness: 0.9, envMapIntensity: 1.6 }),
  frame: painted(0x7f8da0, { roughness: 0.55, clearcoat: 0.35 }),
  grating: std(0x6d7783, { roughness: 0.82, metalness: 0.55, envMapIntensity: 0.8 }),
  concrete: std(0xa8a49b, { roughness: 0.96, metalness: 0.0, envMapIntensity: 0.5 }),
  pipe: std(0x8d98a8, { roughness: 0.27, metalness: 0.9, envMapIntensity: 1.4 }),

  // --- driven equipment ---------------------------------------------------
  pump: painted(0x0e9e8f),
  motor: painted(0x39434f, { roughness: 0.5, clearcoat: 0.5 }),
  blowerBody: painted(0x2f7fc4),

  // --- process sections ---------------------------------------------------
  feed: painted(0xd9902f),        // solids handling, warm ochre
  heating: painted(0xd6452f),     // burners, heaters, fired equipment
  separation: painted(0x1b8fad),  // cyclones, clarifiers, filters, columns
  product: painted(0x2f9e5e),     // coolers, bins, clearwells
  utility: painted(0x7a5ad8),     // chemical dosing, services
  painted: painted(0x2f7fc4),

  // --- detail -------------------------------------------------------------
  valve: painted(0xe0561f, { clearcoat: 1, clearcoatRoughness: 0.1 }),
  instrument: std(0xeef2f7, { roughness: 0.16, metalness: 0.25, envMapIntensity: 1.5 }),
  cabinet: painted(0x4a5b70),

  // --- media --------------------------------------------------------------
  // Water is the one surface a viewer already knows the look of, so it is
  // nearly mirror-smooth, faintly coloured and see-through. Front faces only:
  // a liquid body is a closed solid, and double-siding it doubles the cost of
  // the most expensive pixels in the scene for a back face nobody can see.
  liquid: std(0x2f9fe0, {
    transparent: true, opacity: 0.7,
    roughness: 0.05, metalness: 0.15, envMapIntensity: 1.8
  }),
  hot: std(0xe0763a, { emissive: 0x8a2c06, emissiveIntensity: 0.9, roughness: 0.6 })
};

/**
 * Neutral finishes that have to move with the interface: concrete and
 * galvanising are read relative to the ground they stand on, and the ground
 * changes with the theme. Coloured process equipment does not move — a red
 * fired heater is red in both themes, because that is what the paint means.
 */
const NEUTRALS = {
  light: { concrete: 0xa8a49b, grating: 0x606a76, frame: 0x738193, steelDark: 0x6b7684 },
  dark: { concrete: 0x6f6a63, grating: 0x515a66, frame: 0x5d6a7c, steelDark: 0x646e7b }
};

export function setSceneTheme(theme) {
  const n = NEUTRALS[theme] || NEUTRALS.light;
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
