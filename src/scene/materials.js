import * as THREE from 'three';
// One shared material palette. Reuse matters for draw-call count.
const mk = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .62, metalness: .35, ...o });
export const MAT = {
  steel: mk(0x8b99a6), steelDark: mk(0x5c6874), painted: mk(0x3f6f86),
  vessel: mk(0xa8b4bf, { roughness: .45, metalness: .55 }),
  pump: mk(0x2f7f9e), motor: mk(0x2b3d4a), frame: mk(0x4a5967, { roughness: .8, metalness: .2 }),
  grating: mk(0x39464f, { roughness: .95, metalness: .1 }),
  pipe: mk(0x707e8a, { roughness: .5, metalness: .6 }),
  valve: mk(0xc0562f), instrument: mk(0xd7dde2, { roughness: .3 }),
  cabinet: mk(0x37525f), concrete: mk(0x2a3138, { roughness: 1, metalness: 0 }),
  liquid: new THREE.MeshStandardMaterial({ color: 0x2f8fd0, transparent: true, opacity: .55, roughness: .15 }),
  hot: mk(0xd06a3a, { emissive: 0x521c08, emissiveIntensity: .4 })
};
export const STATE_COLOR = { running: 0x3ddc97, idle: 0x5d7286, warning: 0xf2b441, tripped: 0xff5f57, off: 0x39464f };
export function highlight(mesh, on) {
  mesh.traverse(o => {
    if (!o.isMesh) return;
    if (on) { o.userData._em = o.material.emissive?.getHex?.(); o.material = o.material.clone(); o.material.emissive?.setHex(0x0f5f74); }
    else if (o.userData._em !== undefined) { o.material.emissive?.setHex(o.userData._em); delete o.userData._em; }
  });
}
