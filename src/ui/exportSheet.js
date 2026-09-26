import { token } from '../shared/theme.js';
import { val, isEmpty } from '../shared/format.js';
import { Status } from '../simulation/contract.js';
import { rampAt, rampNone } from '../shared/ramp.js';
import { AUTHOR, DEPARTMENT, INSTITUTION } from '../shared/components/signature.js';
import logoMark from '../../assets/chemilab-logo.svg?raw';

/**
 * The plant sheet: one image of one part of the plant, marked up.
 *
 * What goes on it is what is on screen and nothing else. The 3D picture is the
 * plant's own renderer; the callouts name the units in it and carry the
 * readings the engine reported for them, as the engine formatted them; the
 * schematic is the live flowsheet, with the same stream values; the headline
 * figures are the run's own. A unit the engine gave no reading, or a sheet
 * made before any run, says so rather than being filled in to look complete.
 *
 * Laid out like a drawing rather than a screenshot: a title block that says
 * what, where and when; the picture with its callouts in the margins, where
 * they can be read without covering the plant; the schematic underneath with
 * the same part marked on it; a legend; and a line at the foot saying where the
 * numbers came from.
 *
 * All dimensions are at the standard size (2400 × 1800) and multiplied by
 * `scale`, so a preview and a high-resolution export are the same drawing. A
 * sheet made for paper takes the paper's proportions instead: the height stays
 * 1800 and the width follows, so the picture and the lower band widen with it
 * and the page is filled edge to edge rather than letterboxed.
 */

const W0 = 2400, H = 1800, M = 56;
const GUT = 340, GAP = 22;                 // callout gutters either side of the picture
export const IMAGE_ASPECT = 1.9;           // at or above the renderer's reference, so framing is exact

const loadImage = src => new Promise((ok, fail) => {
  const img = new Image();
  img.onload = () => ok(img);
  img.onerror = () => fail(new Error('image failed to load'));
  img.src = src;
});

/**
 * The live flowsheet as a standalone picture.
 *
 * An SVG drawn as an image sees none of the page's stylesheet, so every
 * `var(--token)` in it would resolve to nothing and draw black or not at all.
 * The clone has each one replaced by the value the page is using right now —
 * in this theme, for this simulator — and the one style that only exists in
 * CSS, the dash on a flowing line, written onto the elements that need it.
 * The viewBox goes back to the whole diagram, whatever it is zoomed to on
 * screen.
 */
/** Room round the diagram: some captions sit just past its declared edge. */
export const SVG_PAD = { x: 24, top: 18, bottom: 46 };

/**
 * The colours a sheet is drawn in.
 *
 * `match` is the app as it is on screen: the theme in force, the simulator's
 * own hue. `white` is the light theme's palette whatever the screen is showing,
 * for a sheet that is going to be printed — read from a hidden element that
 * carries the light theme and this simulator, so the stylesheet assigns it the
 * same tokens it would assign the page, rather than a second palette being
 * kept here. Two tokens are aliases declared once on the root (`--accent` is
 * `var(--hue)`); a custom property inherits its root value already resolved,
 * so the probe declares the aliases again for them to follow its own hue.
 * The one token it overrides is the ground, which on paper is white.
 *
 * The probe stays in the document until the sheet is finished with it —
 * computed style is live, and reads nothing once the element has gone.
 */
export function sheetPalette(paper = 'match', simId = '') {
  let probe = null, css;
  if (paper === 'white') {
    probe = document.createElement('i');
    probe.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden;pointer-events:none';
    probe.style.setProperty('--accent', 'var(--hue)');
    probe.style.setProperty('--accent-deep', 'var(--hue-deep)');
    // The light theme's page is a pale blue-grey, chosen for a screen. On
    // paper the ground is the paper: white, with the panels ruled on it.
    probe.style.setProperty('--bg-0', '#ffffff');
    probe.dataset.theme = 'light';
    if (simId) probe.dataset.sim = simId;
    document.body.appendChild(probe);
    css = getComputedStyle(probe);
  } else {
    css = getComputedStyle(document.documentElement);
  }
  const cache = new Map();
  const col = (name, fb = '#888888') => {
    if (!cache.has(name)) cache.set(name, css.getPropertyValue(name).trim() || fb);
    return cache.get(name);
  };

  // A token as an opaque #rrggbb, composited over the sheet's ground. The PDF
  // writer takes plain RGB; a translucent rule or a `color-mix()` has to
  // become the colour it actually looks like on the paper first.
  const px = document.createElement('canvas');
  px.width = px.height = 1;
  const pctx = px.getContext('2d', { willReadFrequently: true });
  const normal = document.createElement('i');
  const solid = (name, over = col('--bg-0', '#000000')) => {
    const key = `solid|${name}|${over}`;
    if (cache.has(key)) return cache.get(key);
    const v = name.startsWith('--') ? col(name) : name;
    // Through a computed style first, which turns any colour syntax the page
    // understands into one a canvas does.
    normal.style.color = '';
    normal.style.color = v;
    (probe || document.body).appendChild(normal);
    const c = getComputedStyle(normal).color || v;
    normal.remove();
    pctx.globalCompositeOperation = 'copy';
    pctx.fillStyle = over; pctx.fillRect(0, 0, 1, 1);
    pctx.globalCompositeOperation = 'source-over';
    pctx.fillStyle = c; pctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = pctx.getImageData(0, 0, 1, 1).data;
    const hex = `#${[r, g, b].map(n => n.toString(16).padStart(2, '0')).join('')}`;
    cache.set(key, hex);
    return hex;
  };

  return {
    paper, css, col, solid,
    font: col('--font', 'system-ui, sans-serif'),
    mono: col('--mono', 'ui-monospace, monospace'),
    dispose() { probe?.remove(); probe = null; }
  };
}

function resolvedSvg(svg, spec, width, height, css = getComputedStyle(document.documentElement)) {
  const clone = svg.cloneNode(true);
  const sub = s => s.replace(/var\((--[a-z0-9-]+)\s*(?:,\s*([^)]+))?\)/gi,
    (_, name, fb) => css.getPropertyValue(name).trim() || (fb || '').trim() || 'none');
  const walk = node => {
    if (node.nodeType !== 1) return;
    for (const a of [...node.attributes]) if (a.value.includes('var(')) node.setAttribute(a.name, sub(a.value));
    if (node.classList?.contains('fs-flow')) node.setAttribute('stroke-dasharray', '9 19');
    for (const c of node.childNodes) walk(c);
  };
  walk(clone);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('viewBox', `${-SVG_PAD.x} ${-SVG_PAD.top} ${spec.width + 2 * SVG_PAD.x} ${spec.height + SVG_PAD.top + SVG_PAD.bottom}`);
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.removeAttribute('style');
  clone.removeAttribute('class');
  return new XMLSerializer().serializeToString(clone);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Text cut to a width with an ellipsis, rather than running off a box. */
function fit(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let t = String(text);
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

/**
 * Callout positions down one margin.
 *
 * Each label wants to sit level with the unit it names. Where two want the
 * same place, the lower one is pushed down; anything pushed off the bottom is
 * then walked back up. Order down the margin is always order down the picture,
 * so no two leaders ever cross.
 */
function place(items, top, bottom, gap) {
  items.sort((a, b) => a.want - b.want);
  let y = top;
  for (const it of items) { it.y = Math.max(it.want - it.h / 2, y); y = it.y + it.h + gap; }
  let floor = bottom;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.y + it.h > floor) it.y = floor - it.h;
    floor = it.y - gap;
  }
  for (const it of items) it.y = Math.max(it.y, top);
  return items;
}

/**
 * Compose the sheet.
 *
 * view       the workspace plant view (for the snapshot)
 * flowsheet  the workspace flowsheet (for its live SVG)
 * part       { id, label, pose, subject } — what to picture
 * state      the store's state at the time of export
 * options    { callouts, readings, schematic, legend }
 * mode       the active colour mode, or null
 * palette    from sheetPalette(); the app's own colours if left out
 * aspect     width over height, for a sheet made to fit a paper size
 * info       { title, preparedBy, notes } — what the person exporting added
 */
export async function composeSheet({ sim, name, view, flowsheet, part, state, options, mode, scale = 1, palette = null, aspect = 0, info = {} }) {
  const s = scale;
  const px = v => Math.round(v * s);
  const W = aspect > 0 ? Math.round(H * aspect) : W0;
  const canvas = document.createElement('canvas');
  canvas.width = px(W); canvas.height = px(H);
  const ctx = canvas.getContext('2d');

  const pal = palette || { col: n => token(n, '#888'), css: getComputedStyle(document.documentElement), font: token('--font', 'system-ui, sans-serif'), mono: token('--mono', 'ui-monospace, monospace') };
  const col = n => pal.col(n, '#888');
  const font = pal.font, mono = pal.mono;
  const f = (size, weight = 400, face = font) => `${weight} ${px(size)}px ${face}`;
  const hue = col('--hue');
  const title = info.title?.trim() || name;
  const preparedBy = info.preparedBy?.trim() || '';
  const notes = info.notes?.trim() || '';

  const usable = state.status === Status.COMPLETE || state.status === Status.WARNING;
  const eq = usable ? sim.engine.getEquipmentState(state.result) : {};

  // --- ground ---------------------------------------------------------------
  ctx.fillStyle = col('--bg-0');
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // --- title block ----------------------------------------------------------
  try {
    const logo = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(logoMark)}`);
    ctx.drawImage(logo, px(M), px(M), px(84), px(84));
  } catch { /* the sheet is still a sheet without its mark */ }
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = col('--ink-faint');
  ctx.font = f(17, 600, mono);
  ctx.fillText('CHEMILAB SIMULATOR  ·  PLANT SHEET', px(M + 108), px(M + 26));
  ctx.fillStyle = col('--ink');
  ctx.font = f(44, 700);
  const titleMax = W - M - 1000 - 32 - (M + 106);
  ctx.fillText(fit(ctx, title, px(titleMax)), px(M + 106), px(M + 76));
  ctx.fillStyle = hue;
  ctx.font = f(22, 600, mono);
  // A sheet given its own title still says which plant it is.
  const subject = title === name ? part.label.toUpperCase() : `${name.toUpperCase()}  ·  ${part.label.toUpperCase()}`;
  ctx.fillText(fit(ctx, subject, px(titleMax)), px(M + 108), px(M + 108));

  const modeName = sim.scenarios?.modes?.find(m => m.id === state.scenario)?.name || state.scenario || 'Base case';
  const faultNames = (state.faults || []).map(id => sim.scenarios?.faults?.find(x => x.id === id)?.name || id);
  const statusText = usable ? state.status : state.status === Status.ERROR ? 'NO VALID SOLUTION' : 'NOT CALCULATED';
  const statusCol = state.status === Status.COMPLETE ? col('--ok') : state.status === Status.WARNING ? col('--warn')
    : state.status === Status.ERROR ? col('--err') : col('--ink-faint');
  const meta = [
    ['Case', modeName],
    ['Faults', faultNames.length ? faultNames.join(', ') : 'None'],
    ['Detail', (state.level || 'student').replace(/^./, c => c.toUpperCase())],
    ['Generated', new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })],
    ['Model', `v${sim.engine.modelVersion}`]
  ];
  if (preparedBy) meta.splice(4, 0, ['Prepared by', preparedBy]);
  // Two columns of three, like the fields of a drawing's title block; the
  // status badge sits under the second.
  const mx0 = W - M - 1000, colW = 500, kw = 150;
  meta.forEach(([k, v], i) => {
    const mx = px(mx0 + Math.floor(i / 3) * colW), y = px(M + 22 + (i % 3) * 26);
    ctx.fillStyle = col('--ink-ghost');
    ctx.font = f(16, 600, mono);
    ctx.fillText(k.toUpperCase(), mx, y);
    ctx.fillStyle = col('--ink-dim');
    ctx.font = f(18, 500);
    ctx.fillText(fit(ctx, v, px(colW - kw - 24)), mx + px(kw), y);
  });
  ctx.font = f(16, 600, mono);
  // Run status, as a badge, so it is the first thing read in the corner.
  ctx.font = f(16, 700, mono);
  const sw = ctx.measureText(statusText).width + px(28);
  roundRect(ctx, px(W - M) - sw, px(M + 88), sw, px(30), px(6));
  ctx.fillStyle = col('--bg-2'); ctx.fill();
  ctx.strokeStyle = statusCol; ctx.lineWidth = px(1.5); ctx.stroke();
  ctx.fillStyle = statusCol;
  ctx.fillText(statusText, px(W - M) - sw + px(14), px(M + 108));

  ctx.fillStyle = hue;
  ctx.fillRect(px(M), px(M + 128), px(W - 2 * M), px(3));

  // --- the picture ------------------------------------------------------------
  const ix = M + GUT + GAP, iy = M + 156;
  const iw = W - 2 * M - 2 * (GUT + GAP), ih = Math.round(iw / IMAGE_ASPECT);
  const shot = view.snapshot({ width: px(iw), height: px(ih), pose: part.pose });
  ctx.save();
  roundRect(ctx, px(ix), px(iy), px(iw), px(ih), px(12));
  ctx.clip();
  ctx.drawImage(shot.image, px(ix), px(iy), px(iw), px(ih));
  ctx.restore();
  roundRect(ctx, px(ix), px(iy), px(iw), px(ih), px(12));
  ctx.strokeStyle = col('--line-strong'); ctx.lineWidth = px(1.5); ctx.stroke();
  // What this picture is, in its own corner.
  ctx.font = f(15, 700, mono);
  const chip = `${part.label.toUpperCase()}  ·  3D`;
  const cw = ctx.measureText(chip).width + px(24);
  roundRect(ctx, px(ix + 16), px(iy + 16), cw, px(30), px(6));
  ctx.fillStyle = col('--bg-1'); ctx.globalAlpha = 0.88; ctx.fill(); ctx.globalAlpha = 1;
  ctx.fillStyle = col('--ink-dim');
  ctx.fillText(chip, px(ix + 28), px(iy + 36));

  // --- callouts -----------------------------------------------------------------
  const focus = new Set(Array.isArray(part.subject) ? part.subject : []);
  // A sheet of one part calls out that part. Everything else in the picture is
  // still in the picture, and still on the schematic below; labelling it too
  // put a dozen leaders across the plant and buried the four that mattered.
  // A sheet of the whole view has no subject, so every unit in it is named.
  const onScreen = shot.anchors.filter(a => a.onScreen && (!focus.size || focus.has(a.tag)));
  if (options.callouts && onScreen.length) {
    const lines = a => {
      if (!options.readings || !usable) return [];
      const v = eq[a.tag]?.values || {};
      // The units this part is about get their readings in full; the rest of
      // what happens to be in the picture is named, so the drawing is complete
      // without the context crowding out the subject.
      const n = !focus.size || focus.has(a.tag) ? 3 : 0;
      return Object.entries(v).filter(([, x]) => x && x !== '—').slice(0, n);
    };
    const make = a => {
      const rows = lines(a);
      return { a, rows, h: 16 + 28 + 24 + rows.length * 25 + (rows.length ? 8 : 0) + 8, want: iy + a.y / s };
    };
    const left = [], right = [];
    // Split between the margins at the median unit, not the middle of the
    // picture. A plant that sits left of centre otherwise sends most of its
    // labels to one margin, which then has to drop every name to fit them while
    // the other margin stands half empty.
    const xs = onScreen.map(a => a.x).sort((p, q) => p - q);
    const mid = onScreen.length > 3 ? xs[Math.floor((xs.length - 1) / 2)] : (iw * s) / 2;
    for (const a of onScreen) (a.x <= mid ? left : right).push(make(a));
    // A margin that cannot hold every label in full drops their readings
    // before it drops any of the labels themselves.
    for (const side of [left, right]) {
      const need = side.reduce((t, it) => t + it.h + 10, 0);
      if (need > ih) for (const it of side) { it.rows = it.rows.slice(0, !focus.size || focus.has(it.a.tag) ? 1 : 0); it.h = 16 + 28 + 24 + it.rows.length * 25 + (it.rows.length ? 8 : 0) + 8; }
      const need2 = side.reduce((t, it) => t + it.h + 10, 0);
      if (need2 > ih) for (const it of side) { it.rows = []; it.h = 16 + 28 + 8; it.compact = true; }
      place(side, iy, iy + ih, 10);
    }

    const draw = (it, sideLeft) => {
      const bx = sideLeft ? M : W - M - GUT, by = it.y, bw = GUT;
      const isFocus = !focus.size || focus.has(it.a.tag);
      // Leader: out of the box, level to the picture's edge, then to the unit.
      const ex = sideLeft ? bx + bw : bx, ey = by + Math.min(it.h / 2, 30);
      const edge = sideLeft ? ix : ix + iw;
      const tx = ix + it.a.x / s, ty = iy + it.a.y / s;
      ctx.strokeStyle = hue; ctx.globalAlpha = isFocus ? 0.9 : 0.5; ctx.lineWidth = px(1.6);
      ctx.beginPath(); ctx.moveTo(px(ex), px(ey)); ctx.lineTo(px(edge), px(ey)); ctx.lineTo(px(tx), px(ty)); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(px(tx), px(ty), px(isFocus ? 7 : 5), 0, Math.PI * 2);
      ctx.fillStyle = hue; ctx.fill();
      ctx.lineWidth = px(2.5); ctx.strokeStyle = col('--bg-0'); ctx.stroke();

      roundRect(ctx, px(bx), px(by), px(bw), px(it.h), px(8));
      ctx.fillStyle = col('--bg-1'); ctx.fill();
      ctx.strokeStyle = isFocus ? hue : col('--line'); ctx.lineWidth = px(isFocus ? 1.6 : 1); ctx.stroke();
      ctx.fillStyle = hue;
      ctx.fillRect(px(sideLeft ? bx + bw - 4 : bx), px(by + 8), px(4), px(it.h - 16));

      const tx0 = bx + 16;
      ctx.fillStyle = hue; ctx.font = f(21, 700, mono);
      ctx.fillText(it.a.tag, px(tx0), px(by + 34));
      if (!it.compact) {
        ctx.fillStyle = col('--ink-dim'); ctx.font = f(17, 500);
        ctx.fillText(fit(ctx, it.a.name, px(bw - 36)), px(tx0), px(by + 58));
      }
      it.rows.forEach(([k, v], i) => {
        const y = by + 58 + 30 + i * 25;
        ctx.fillStyle = col('--ink-faint'); ctx.font = f(15, 500);
        ctx.fillText(fit(ctx, k, px(150)), px(tx0), px(y));
        ctx.fillStyle = col('--ink'); ctx.font = f(16, 600, mono);
        const vv = fit(ctx, v, px(bw - 190));
        ctx.fillText(vv, px(bx + bw - 20) - ctx.measureText(vv).width, px(y));
      });
    };
    left.forEach(it => draw(it, true));
    right.forEach(it => draw(it, false));
  }

  // --- lower band: schematic, then headline and legend -------------------------
  const ly = iy + ih + 44, lh = H - M - 70 - ly;
  // The schematic takes the same share of a wider sheet as of the standard one.
  const sx = M, swid = Math.round((W - 2 * M) * (1480 / (W0 - 2 * M)));
  const panel = (x, y, w, h, title) => {
    roundRect(ctx, px(x), px(y), px(w), px(h), px(12));
    ctx.fillStyle = col('--bg-1'); ctx.fill();
    ctx.strokeStyle = col('--line'); ctx.lineWidth = px(1); ctx.stroke();
    ctx.fillStyle = hue; ctx.fillRect(px(x + 20), px(y + 22), px(4), px(16));
    ctx.fillStyle = col('--ink-faint'); ctx.font = f(15, 700, mono);
    ctx.fillText(title, px(x + 34), px(y + 36));
  };

  if (options.schematic && flowsheet?.svg && sim.flowsheetSpec) {
    panel(sx, ly, swid, lh, 'PROCESS FLOW DIAGRAM');
    const spec = sim.flowsheetSpec;
    const fw = spec.width + 2 * SVG_PAD.x, fh = spec.height + SVG_PAD.top + SVG_PAD.bottom;
    const aw = swid - 40, ah = lh - 70;
    const k = Math.min(aw / fw, ah / fh);
    const dw = fw * k, dh = fh * k;
    const dx = sx + 20 + (aw - dw) / 2, dy = ly + 56 + (ah - dh) / 2;
    // Where spec coordinate (0, 0) lands on the sheet, for marking nodes.
    const ox = dx + SVG_PAD.x * k, oy = dy + SVG_PAD.top * k;
    try {
      const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(resolvedSvg(flowsheet.svg, spec, px(dw), px(dh), pal.css))}`);
      ctx.drawImage(img, px(dx), px(dy), px(dw), px(dh));
      // The same part, marked on the schematic, so the picture above and the
      // diagram below are visibly about the same units.
      if (focus.size) {
        for (const n of spec.nodes) {
          if (!focus.has(n.tag)) continue;
          const cx = ox + n.x * k, cy = oy + n.y * k;
          ctx.beginPath(); ctx.arc(px(cx), px(cy), px(46 * k + 10), 0, Math.PI * 2);
          ctx.fillStyle = hue; ctx.globalAlpha = 0.12; ctx.fill(); ctx.globalAlpha = 1;
          ctx.setLineDash([px(6), px(5)]); ctx.strokeStyle = hue; ctx.lineWidth = px(2); ctx.stroke(); ctx.setLineDash([]);
        }
      }
    } catch {
      ctx.fillStyle = col('--ink-ghost'); ctx.font = f(18, 500);
      ctx.fillText('The diagram could not be drawn into the sheet.', px(sx + 34), px(ly + 90));
    }
  }

  const rx = options.schematic ? sx + swid + 28 : M, rw = W - M - rx;
  if (options.legend || usable || notes) {
    panel(rx, ly, rw, lh, notes && !options.legend && !usable ? 'NOTES' : 'HEADLINE AND LEGEND');
    let y = ly + 74;
    // Headline readings — the run's own, or a plain statement that there is none.
    if (usable && state.result?.kpis?.length) {
      const kp = state.result.kpis.slice(0, 4);
      const cw2 = (rw - 60) / 2;
      kp.forEach((kpi, i) => {
        const cx = rx + 20 + (i % 2) * (cw2 + 20), cy = y + Math.floor(i / 2) * 92;
        roundRect(ctx, px(cx), px(cy), px(cw2), px(80), px(8));
        ctx.fillStyle = col('--bg-2'); ctx.fill();
        ctx.fillStyle = col('--ink-faint'); ctx.font = f(14, 500);
        ctx.fillText(fit(ctx, kpi.label, px(cw2 - 24)), px(cx + 14), px(cy + 26));
        ctx.fillStyle = col('--ink'); ctx.font = f(26, 700, mono);
        ctx.fillText(fit(ctx, isEmpty(kpi.value) ? '—' : val(kpi.value, kpi.unit, kpi.digits ?? 2), px(cw2 - 24)), px(cx + 14), px(cy + 62));
      });
      y += Math.ceil(kp.length / 2) * 92 + 14;
    } else {
      ctx.fillStyle = col('--ink-ghost'); ctx.font = f(17, 500);
      ctx.fillText('Not calculated — run the simulation to put readings on the sheet.', px(rx + 22), px(y + 10));
      y += 44;
    }

    if (options.legend) {
      // Stream phases this plant actually uses, in the colours the drawing uses.
      const phases = [...new Set((sim.flowsheetSpec?.edges || []).map(e => e.phase).filter(Boolean))];
      ctx.font = f(15, 600, mono);
      let lx = rx + 22;
      for (const ph of phases) {
        const label = ph.toUpperCase();
        const w2 = ctx.measureText(label).width + px(40);
        if ((lx + w2 / s) > rx + rw - 20) { lx = rx + 22; y += 34; }
        ctx.fillStyle = col(`--stream-${ph}`);
        ctx.fillRect(px(lx), px(y - 4), px(22), px(4));
        ctx.fillStyle = col('--ink-dim');
        ctx.fillText(label, px(lx + 30), px(y + 2));
        lx += w2 / s + 18;
      }
      y += 40;
      // The colour mode, if the plant is shaded by one.
      if (mode?.kind === 'scale' && Array.isArray(mode.domain)) {
        ctx.fillStyle = col('--ink-faint'); ctx.font = f(15, 600, mono);
        ctx.fillText(`SHADED BY ${mode.label.toUpperCase()}${mode.scale === 'log' ? '  (LOG)' : ''}`, px(rx + 22), px(y));
        const gx = rx + 22, gy = y + 12, gw = rw - 44, gh = 14;
        const grad = ctx.createLinearGradient(px(gx), 0, px(gx + gw), 0);
        for (let i = 0; i <= 8; i++) grad.addColorStop(i / 8, rampAt(i / 8));
        roundRect(ctx, px(gx), px(gy), px(gw), px(gh), px(4));
        ctx.fillStyle = grad; ctx.fill();
        ctx.fillStyle = col('--ink-dim'); ctx.font = f(15, 600, mono);
        const d = mode.digits ?? 1;
        const lo = val(mode.domain[0], mode.unit, d), hi = val(mode.domain[1], mode.unit, d);
        ctx.fillText(lo, px(gx), px(gy + gh + 22));
        ctx.fillText(hi, px(gx + gw) - ctx.measureText(hi).width, px(gy + gh + 22));
        ctx.fillStyle = rampNone(); ctx.fillRect(px(gx), px(gy + gh + 36), px(14), px(14));
        ctx.fillStyle = col('--ink-ghost'); ctx.font = f(14, 500);
        ctx.fillText('no reading for this unit', px(gx + 22), px(gy + gh + 48));
        y = gy + gh + 72;
      }
    }

    // The exporter's own notes, in whatever room the panel has left. Whatever
    // does not fit ends in an ellipsis here and appears in full in the data
    // appendix.
    if (notes) {
      const bottom = ly + lh - 24, lineH = 24;
      const top = y + 8;
      if (bottom - top >= 30 + lineH) {
        ctx.fillStyle = col('--line'); ctx.fillRect(px(rx + 22), px(top), px(rw - 44), px(1));
        ctx.fillStyle = col('--ink-faint'); ctx.font = f(15, 700, mono);
        ctx.fillText('NOTES', px(rx + 22), px(top + 30));
        ctx.fillStyle = col('--ink-dim'); ctx.font = f(17, 500);
        const maxW = px(rw - 44), room = Math.floor((bottom - (top + 38)) / lineH);
        const lines = [];
        let line = '';
        for (const w of notes.split(/\s+/)) {
          const next = line ? `${line} ${w}` : w;
          if (ctx.measureText(next).width > maxW && line) { lines.push(line); line = w; } else line = next;
        }
        if (line) lines.push(line);
        const shown = lines.slice(0, room);
        if (lines.length > room && shown.length) shown[shown.length - 1] = fit(ctx, `${shown[shown.length - 1]} …`, maxW);
        shown.forEach((t, i) => ctx.fillText(fit(ctx, t, maxW), px(rx + 22), px(top + 38 + (i + 1) * lineH - 4)));
      }
    }
  }

  // --- foot ------------------------------------------------------------------
  const fy = H - M - 18;
  ctx.fillStyle = col('--line'); ctx.fillRect(px(M), px(fy - 34), px(W - 2 * M), px(1));
  ctx.fillStyle = col('--ink-ghost'); ctx.font = f(15, 500);
  const note = usable
    ? `Every reading on this sheet is from the engine run shown · model ${sim.engine.modelVersion} · nothing is estimated for the drawing`
    : `No run on this sheet — units are named, not measured · model ${sim.engine.modelVersion}`;
  ctx.fillText(note, px(M), px(fy));
  const who = `${AUTHOR} · ${DEPARTMENT}, ${INSTITUTION}`;
  ctx.fillText(who, px(W - M) - ctx.measureText(who).width, px(fy));

  return canvas;
}
