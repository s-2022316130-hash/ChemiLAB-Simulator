import * as THREE from 'three';
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
 * runs cool, product runs green, utilities run violet.
 */
const mk = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .55, metalness: .35, ...o });

export const MAT = {
  // --- structural ---------------------------------------------------------
  steel: mk(0x9aa6b4, { roughness: .42, metalness: .72 }),
  steelDark: mk(0x5f6a7a, { roughness: .5, metalness: .65 }),
  vessel: mk(0xb7c2ce, { roughness: .34, metalness: .68 }),
  frame: mk(0x6d6275, { roughness: .8, metalness: .25 }),
  grating: mk(0x4a4356, { roughness: .95, metalness: .12 }),
  concrete: mk(0x3b3545, { roughness: 1, metalness: 0 }),
  pipe: mk(0x8792a3, { roughness: .38, metalness: .75 }),

  // --- driven equipment ---------------------------------------------------
  pump: mk(0x1f9e8f, { roughness: .38, metalness: .55 }),
  motor: mk(0x2f3b4d, { roughness: .55, metalness: .5 }),
  blowerBody: mk(0x3f7fa8, { roughness: .4, metalness: .5 }),

  // --- process sections ---------------------------------------------------
  feed: mk(0xb8863f, { roughness: .62, metalness: .3 }),        // solids handling, warm ochre
  heating: mk(0xc0563a, { roughness: .5, metalness: .4 }),      // burners, heaters
  separation: mk(0x3f8fa8, { roughness: .42, metalness: .5 }),  // cyclones, clarifiers, filters
  product: mk(0x4f9e6a, { roughness: .55, metalness: .35 }),    // coolers, bins, clearwells
  utility: mk(0x7b5ea8, { roughness: .55, metalness: .4 }),     // chemical dosing, services
  painted: mk(0x3f7fa8, { roughness: .45, metalness: .35 }),

  // --- detail -------------------------------------------------------------
  valve: mk(0xd9613a, { roughness: .45, metalness: .4 }),
  instrument: mk(0xe6e9ee, { roughness: .25, metalness: .2 }),
  cabinet: mk(0x3d4f63, { roughness: .5, metalness: .35 }),

  // --- media --------------------------------------------------------------
  liquid: new THREE.MeshStandardMaterial({
    color: 0x2f9fe0, transparent: true, opacity: .62, roughness: .08, metalness: .25
  }),
  hot: mk(0xe0763a, { emissive: 0x8a2c06, emissiveIntensity: .85 })
};

/** Equipment state colours. Matched to the CSS status palette in theme.css. */
export const STATE_COLOR = {
  running: 0x3ddc97, idle: 0x857890, warning: 0xffb020, tripped: 0xff6b5e, off: 0x3d3449
};

/**
 * Hover and selection highlight. Clones the material on the way in so the shared
 * palette entry is never mutated, and restores the original on the way out.
 */
export function highlight(mesh, on) {
  mesh.traverse(o => {
    if (!o.isMesh || !o.material) return;
    if (on) {
      if (o.userData._orig) return;
      o.userData._orig = o.material;
      const m = o.material.clone();
      m.emissive?.setHex(0x2a6f7e);
      m.emissiveIntensity = Math.max(m.emissiveIntensity ?? 0, .55);
      o.material = m;
    } else if (o.userData._orig) {
      const cur = o.material, orig = o.userData._orig;
      // A plant module may have re-coloured this mesh while the highlight was on
      // — equipment state does not pause for the mouse — so carry that across
      // rather than restoring a colour the engine has already moved past.
      if (cur.color && orig.color && !cur.color.equals(orig.color)) orig.color.copy(cur.color);
      o.material = orig;
      delete o.userData._orig;
    }
  });
}
