import * as THREE from 'three';
import { token } from '../shared/theme.js';
import { STATE_COLOR } from './materials.js';

/**
 * Scene furniture that exists to make a plant legible: floating equipment
 * captions, and the ring that marks a selection.
 *
 * None of this computes a process value. A caption shows the tag and name a
 * plant module already declared, plus whatever live values the engine reported
 * for that tag — it never derives one, and it prints an em dash for anything
 * that has not been calculated.
 *
 * Captions are three independent switches rather than one ladder of detail,
 * because the three answer different questions: which unit is this, what is it
 * called, and what is it doing. Turning all three off turns captions off.
 */

const MONO = '"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace';
const SANS = '"Inter","Segoe UI",system-ui,sans-serif';

export const CAPTION_FIELDS = ['tags', 'names', 'values'];
export const CAPTION_LABEL = { tags: 'Tags', names: 'Names', values: 'Readings' };
export const CAPTION_DEFAULT = { tags: true, names: true, values: false };

const css = (name, fallback) => token(name, fallback);

/** Rounded rectangle path, used for the plate and its state stripe. */
function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/**
 * Draw a caption plate to a canvas and hand back the texture plus its size.
 * Kept separate from the sprite so a caption can be redrawn in place when the
 * engine reports new values, without rebuilding the object in the scene.
 */
function drawCaption({ tag, name, rows, accent, hue }) {
  const dpr = 2;
  const padX = 13, padY = 9, gap = 3, rowGap = 3, shadow = 6;
  const tagSize = 20, nameSize = 13.5, valSize = 12.5;

  const plateBg = css('--caption-bg', 'rgba(255,255,255,0.94)');
  const ink = css('--caption-ink', '#111723');
  const dim = css('--caption-dim', '#4d586a');
  const shadowColour = css('--caption-shadow', 'rgba(17,23,35,0.18)');

  const probe = document.createElement('canvas').getContext('2d');
  let w = 0;
  if (tag) { probe.font = `600 ${tagSize}px ${MONO}`; w = Math.max(w, probe.measureText(tag).width); }
  if (name) { probe.font = `500 ${nameSize}px ${SANS}`; w = Math.max(w, probe.measureText(name).width); }
  probe.font = `400 ${valSize}px ${MONO}`;
  for (const [k, v] of rows || []) w = Math.max(w, probe.measureText(`${k}     ${v}`).width);

  const plateW = Math.ceil(w + padX * 2 + 5);
  let plateH = padY * 2;
  if (tag) plateH += tagSize;
  if (name) plateH += (tag ? gap : 0) + nameSize;
  if (rows?.length) plateH += 8 + rows.length * (valSize + rowGap);
  plateH = Math.ceil(plateH);

  const W = plateW + shadow * 2, H = plateH + shadow * 2;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(W * dpr); cv.height = Math.ceil(H * dpr);
  const c = cv.getContext('2d');
  c.scale(dpr, dpr);
  c.translate(shadow, shadow);

  // Plate, with a soft drop shadow so it floats above the plant rather than
  // being lost against a pale vessel behind it.
  c.save();
  c.shadowColor = shadowColour;
  c.shadowBlur = shadow * 1.6;
  c.shadowOffsetY = 2;
  roundRect(c, 0, 0, plateW, plateH, 8);
  c.fillStyle = plateBg;
  c.fill();
  c.restore();

  roundRect(c, 0.5, 0.5, plateW - 1, plateH - 1, 8);
  c.strokeStyle = accent; c.globalAlpha = 0.4; c.lineWidth = 1.25; c.stroke(); c.globalAlpha = 1;

  // State stripe down the left edge: colour is the equipment state when the
  // engine has reported one, and the simulator hue when it has not.
  c.save();
  roundRect(c, 0, 0, plateW, plateH, 8); c.clip();
  c.fillStyle = accent; c.fillRect(0, 0, 3.5, plateH);
  c.restore();

  c.textBaseline = 'top';
  let y = padY;
  if (tag) {
    c.fillStyle = accent; c.font = `600 ${tagSize}px ${MONO}`;
    c.fillText(tag, padX, y); y += tagSize;
  }
  if (name) {
    if (tag) y += gap;
    c.fillStyle = dim; c.font = `500 ${nameSize}px ${SANS}`;
    c.fillText(name, padX, y); y += nameSize;
  }
  if (rows?.length) {
    y += 5;
    c.strokeStyle = hue; c.globalAlpha = 0.22; c.lineWidth = 1;
    c.beginPath(); c.moveTo(padX, y + 0.5); c.lineTo(plateW - padX, y + 0.5); c.stroke();
    c.globalAlpha = 1;
    y += 4;
    c.font = `400 ${valSize}px ${MONO}`;
    for (const [k, v] of rows) {
      c.fillStyle = dim;
      c.fillText(k, padX, y);
      const vw = c.measureText(v).width;
      // An uncalculated field prints as an em dash in the faint colour: a
      // caption never fills a gap with something that looks like a reading.
      c.fillStyle = v === '—' ? dim : ink;
      c.globalAlpha = v === '—' ? 0.55 : 1;
      c.fillText(v, plateW - padX - vw, y);
      c.globalAlpha = 1;
      y += valSize + rowGap;
    }
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.anisotropy = 4;
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, w: W, h: H };
}

const accentFor = entry => {
  if (!entry) return null;
  if (entry.state === 'tripped') return STATE_COLOR.tripped;
  if (entry.alarm || entry.state === 'warning') return STATE_COLOR.warning;
  if (entry.state === 'running') return STATE_COLOR.running;
  if (entry.state === 'stopped' || entry.state === 'off') return STATE_COLOR.off;
  return null;
};
const hexOf = n => `#${new THREE.Color(n).getHexString()}`;

/**
 * A billboard caption carrying the equipment tag, optionally its name, and
 * optionally the live readings the engine reported for it.
 */
export function makeLabel(tag, name = '', hue = new THREE.Color(0x0e7490)) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: true,
    // Composited outside the tone-mapped image, so the plate is exactly the
    // colour it was drawn and never picks up bloom from the plant behind it.
    toneMapped: false, fog: false
  }));
  sprite.userData.tagText = tag;
  sprite.userData.nameText = name;
  sprite.userData.hue = hue;
  sprite.userData.pxW = 120;
  sprite.userData.pxH = 44;
  sprite.renderOrder = 20;
  return sprite;
}

/**
 * Redraw a caption for the current switches. `entry` is the engine's own
 * equipment-state record for this tag — `{state, alarm, values}` — already
 * carrying em dashes for anything it did not calculate. At most `max` rows are
 * shown so the plate stays a label rather than becoming a second results rail.
 */
export function updateLabel(sprite, fields, entry = null, max = 3) {
  const tag = fields.tags ? sprite.userData.tagText : '';
  const name = fields.names ? sprite.userData.nameText : '';
  const rows = fields.values && entry?.values ? Object.entries(entry.values).slice(0, max) : null;
  if (!tag && !name && !rows?.length) { sprite.visible = false; sprite.userData.sig = 'empty'; return; }

  const accentHex = accentFor(entry);
  const hue = `#${sprite.userData.hue.getHexString()}`;
  const accent = accentHex === null ? css('--hue', hue) : hexOf(accentHex);
  const sig = [
    document.documentElement.dataset.theme, tag, name, accent,
    rows ? rows.map(r => r.join('=')).join(';') : ''
  ].join('|');
  if (sprite.userData.sig === sig) { sprite.visible = true; return; }
  sprite.userData.sig = sig;

  const { tex, w, h } = drawCaption({ tag, name, rows, accent, hue });
  sprite.material.map?.dispose();
  sprite.material.map = tex;
  sprite.material.needsUpdate = true;
  sprite.userData.pxW = w;
  sprite.userData.pxH = h;
  sprite.visible = true;
}

/**
 * Ground ring drawn under the selected item, so a selection reads from any
 * angle rather than only when the highlighted face happens to be visible.
 * Two rings and a set of ticks: it has to survive being seen almost edge-on.
 */
export function selectionRing(hue = new THREE.Color(0x0e7490)) {
  const grp = new THREE.Group();
  const mat = (opacity = 0.55) => new THREE.MeshBasicMaterial({
    color: hue, transparent: true, opacity, side: THREE.DoubleSide,
    depthWrite: false, toneMapped: false
  });
  const flat = mesh => { mesh.rotation.x = -Math.PI / 2; mesh.renderOrder = 6; return mesh; };

  const outer = flat(new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 72, 1), mat(0.55)));
  const inner = flat(new THREE.Mesh(new THREE.RingGeometry(0.7, 0.725, 64, 1), mat(0.3)));
  grp.add(outer, inner);

  // Four ticks on the cardinal axes, the way a target reticle is drawn. Each
  // sits in its own group so the spin is one rotation about the vertical.
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group();
    arm.rotation.y = (i / 4) * Math.PI * 2;
    const tick = flat(new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.03), mat(0.5)));
    tick.position.x = 1.12;
    arm.add(tick);
    grp.add(arm);
  }
  grp.userData.rings = [outer, inner];
  return grp;
}
