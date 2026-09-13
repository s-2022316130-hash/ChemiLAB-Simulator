import * as THREE from 'three';
/**
 * Scene furniture that exists to make a plant legible: floating equipment
 * captions, the sky gradient behind it and the ring that marks a selection.
 *
 * None of this computes a process value. A caption shows the tag and name a
 * plant module already declared, plus whatever live values the engine reported
 * for that tag — it never derives one, and it prints an em dash for anything
 * that has not been calculated.
 */

const MONO = '"IBM Plex Mono",ui-monospace,Menlo,monospace';
const SANS = '"IBM Plex Sans","Segoe UI",system-ui,sans-serif';

/** Caption detail levels, in order of how much they say. */
export const CAPTION_MODES = ['off', 'tag', 'name', 'values'];
export const CAPTION_LABEL = { off: 'Captions off', tag: 'Tags only', name: 'Tag + name', values: 'Tag + readings' };

/**
 * Draw a caption plate to a canvas and hand back the texture plus its size.
 * Kept separate from the sprite so a caption can be redrawn in place when the
 * engine reports new values, without rebuilding the object in the scene.
 */
function drawCaption(tag, name, values, hue) {
  const dpr = 2;
  const padX = 12, padY = 8, gap = 3, rowGap = 2;
  const tagSize = 21, nameSize = 14, valSize = 13;
  const hx = `#${hue.getHexString()}`;

  const probe = document.createElement('canvas').getContext('2d');
  probe.font = `600 ${tagSize}px ${MONO}`;
  let w = probe.measureText(tag).width;
  if (name) { probe.font = `400 ${nameSize}px ${SANS}`; w = Math.max(w, probe.measureText(name).width); }
  probe.font = `400 ${valSize}px ${MONO}`;
  const rows = values || [];
  for (const [k, v] of rows) w = Math.max(w, probe.measureText(`${k}  ${v}`).width);

  w = Math.ceil(w + padX * 2);
  let h = tagSize + padY * 2;
  if (name) h += gap + nameSize;
  if (rows.length) h += 6 + rows.length * (valSize + rowGap);
  h = Math.ceil(h);

  const cv = document.createElement('canvas');
  cv.width = w * dpr; cv.height = h * dpr;
  const c = cv.getContext('2d');
  c.scale(dpr, dpr);

  const r = 7;
  c.beginPath();
  c.moveTo(r, 0); c.arcTo(w, 0, w, h, r); c.arcTo(w, h, 0, h, r);
  c.arcTo(0, h, 0, 0, r); c.arcTo(0, 0, w, 0, r); c.closePath();
  c.fillStyle = 'rgba(21,18,26,0.86)';
  c.fill();
  c.lineWidth = 1.5; c.strokeStyle = hx; c.globalAlpha = .7; c.stroke(); c.globalAlpha = 1;
  c.fillStyle = hx; c.fillRect(0, r, 2.5, h - r * 2);

  c.textBaseline = 'top';
  let y = padY;
  c.fillStyle = hx; c.font = `600 ${tagSize}px ${MONO}`;
  c.fillText(tag, padX, y); y += tagSize;
  if (name) {
    y += gap;
    c.fillStyle = 'rgba(244,239,233,0.82)'; c.font = `400 ${nameSize}px ${SANS}`;
    c.fillText(name, padX, y); y += nameSize;
  }
  if (rows.length) {
    y += 4;
    c.strokeStyle = 'rgba(244,239,233,0.16)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(padX, y + .5); c.lineTo(w - padX, y + .5); c.stroke();
    y += 3;
    c.font = `400 ${valSize}px ${MONO}`;
    for (const [k, v] of rows) {
      c.fillStyle = 'rgba(182,169,184,0.9)';
      c.fillText(k, padX, y);
      const vw = c.measureText(v).width;
      c.fillStyle = v === '—' ? 'rgba(133,120,144,0.9)' : 'rgba(244,239,233,0.95)';
      c.fillText(v, w - padX - vw, y);
      y += valSize + rowGap;
    }
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, w, h };
}

/**
 * A billboard caption carrying the equipment tag, optionally its name, and
 * optionally the live readings the engine reported for it.
 */
export function makeLabel(tag, name = '', hue = new THREE.Color(0xf5a524)) {
  const { tex, w, h } = drawCaption(tag, name, null, hue);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: false, depthWrite: false
  }));
  // Sized in screen pixels by the renderer each frame, so a caption stays
  // legible close up without growing into a billboard when the camera pulls back.
  sprite.userData.pxW = w;
  sprite.userData.pxH = h;
  sprite.userData.tagText = tag;
  sprite.userData.nameText = name;
  sprite.userData.hue = hue;
  sprite.scale.set(w * 0.012, h * 0.012, 1);
  sprite.renderOrder = 10;
  return sprite;
}

/**
 * Redraw a caption at a new detail level. `values` is the engine's own
 * {label: formatted} map for this tag, already carrying em dashes for anything
 * it did not calculate; at most `max` rows are shown so the plate stays a label.
 */
export function updateLabel(sprite, mode, values = null, max = 3) {
  const showName = mode === 'name' || mode === 'values';
  const rows = mode === 'values' && values
    ? Object.entries(values).slice(0, max)
    : null;
  const sig = `${mode}|${rows ? rows.map(r => r.join('=')).join(';') : ''}`;
  if (sprite.userData.sig === sig) return;
  sprite.userData.sig = sig;
  const { tex, w, h } = drawCaption(
    sprite.userData.tagText,
    showName ? sprite.userData.nameText : '',
    rows,
    sprite.userData.hue
  );
  sprite.material.map?.dispose();
  sprite.material.map = tex;
  sprite.material.needsUpdate = true;
  sprite.userData.pxW = w;
  sprite.userData.pxH = h;
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
