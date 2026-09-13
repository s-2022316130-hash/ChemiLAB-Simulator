import * as THREE from 'three';
/**
 * Scene furniture that exists to make a plant legible: floating equipment
 * labels, the sky gradient behind it and the ring that marks a selection.
 *
 * None of this computes a process value. The label text is the tag and the name
 * a plant module already declared; nothing here reads a result.
 */

const LABEL_FONT = '"IBM Plex Mono",ui-monospace,Menlo,monospace';
const BODY_FONT = '"IBM Plex Sans","Segoe UI",system-ui,sans-serif';

/**
 * A billboard label carrying the equipment tag and its name.
 * Drawn once to a canvas; the renderer turns it to face the camera each frame.
 */
export function makeLabel(tag, name = '', hue = new THREE.Color(0xf5a524)) {
  const dpr = 2;
  const padX = 12, padY = 8, gap = 3;
  const tagSize = 21, nameSize = 14;

  const probe = document.createElement('canvas').getContext('2d');
  probe.font = `600 ${tagSize}px ${LABEL_FONT}`;
  const tagW = probe.measureText(tag).width;
  probe.font = `400 ${nameSize}px ${BODY_FONT}`;
  const nameW = name ? probe.measureText(name).width : 0;

  const w = Math.ceil(Math.max(tagW, nameW) + padX * 2);
  const h = Math.ceil(tagSize + (name ? gap + nameSize : 0) + padY * 2);

  const cv = document.createElement('canvas');
  cv.width = w * dpr; cv.height = h * dpr;
  const c = cv.getContext('2d');
  c.scale(dpr, dpr);

  const hx = `#${hue.getHexString()}`;
  // Plate
  const r = 7;
  c.beginPath();
  c.moveTo(r, 0); c.arcTo(w, 0, w, h, r); c.arcTo(w, h, 0, h, r);
  c.arcTo(0, h, 0, 0, r); c.arcTo(0, 0, w, 0, r); c.closePath();
  c.fillStyle = 'rgba(21,18,26,0.82)';
  c.fill();
  c.lineWidth = 1.5; c.strokeStyle = hx; c.globalAlpha = 0.7; c.stroke(); c.globalAlpha = 1;
  // Hue bar down the leading edge
  c.fillStyle = hx;
  c.fillRect(0, r, 2.5, h - r * 2);

  c.textBaseline = 'top';
  c.fillStyle = hx;
  c.font = `600 ${tagSize}px ${LABEL_FONT}`;
  c.fillText(tag, padX, padY);
  if (name) {
    c.fillStyle = 'rgba(244,239,233,0.82)';
    c.font = `400 ${nameSize}px ${BODY_FONT}`;
    c.fillText(name, padX, padY + tagSize + gap);
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: false, depthWrite: false
  }));
  // Sized in screen pixels by the renderer each frame, so a label stays legible
  // close up without growing into a billboard when the camera pulls back.
  sprite.userData.pxW = w;
  sprite.userData.pxH = h;
  sprite.scale.set(w * 0.012, h * 0.012, 1);
  sprite.renderOrder = 10;
  return sprite;
}

/**
 * Vertical gradient sky, tinted towards the simulator's signature hue near the
 * horizon. A flat background colour makes every plant look like the same plant.
 */
export function skyTexture(hue = new THREE.Color(0xf5a524)) {
  const cv = document.createElement('canvas');
  cv.width = 8; cv.height = 256;
  const c = cv.getContext('2d');
  const top = new THREE.Color(0x0f0d14);
  const mid = new THREE.Color(0x241f30).lerp(hue, 0.07);
  const low = new THREE.Color(0x322a3e).lerp(hue, 0.17);
  const g = c.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, `#${top.getHexString()}`);
  g.addColorStop(0.62, `#${mid.getHexString()}`);
  g.addColorStop(1, `#${low.getHexString()}`);
  c.fillStyle = g; c.fillRect(0, 0, 8, 256);
  const tex = new THREE.CanvasTexture(cv);
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}

/** Ground ring drawn under the selected item, so a selection reads from any angle. */
export function selectionRing(hue = new THREE.Color(0xf5a524)) {
  const g = new THREE.RingGeometry(0.86, 1, 64, 1);
  const m = new THREE.MeshBasicMaterial({
    color: hue, transparent: true, opacity: .5, side: THREE.DoubleSide, depthWrite: false
  });
  const ring = new THREE.Mesh(g, m);
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 5;
  return ring;
}
