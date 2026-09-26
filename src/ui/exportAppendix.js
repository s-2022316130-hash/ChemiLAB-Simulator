import { val, isEmpty } from '../shared/format.js';
import { Status } from '../simulation/contract.js';
import { measure as pdfMeasure, fitText as pdfFit } from '../shared/pdf.js';

/**
 * The data appendix: the tables behind a plant sheet.
 *
 * The sheet is a picture, and a picture can only carry so many numbers before
 * it stops being one. The appendix carries the rest, as tables: how the run
 * went, every reading the engine reported for the units on the sheet, every
 * stream as the engine reported it, and any notes the person exporting added.
 * All of it is the engine's own output, formatted as the engine formatted it;
 * nothing here is derived for the page.
 *
 * It is laid out once, as a list of drawing operations in points, and then
 * drawn by whichever backend the export needs — onto a canvas for a PNG, into
 * PDF pages as real text for a PDF. One layout, two outputs, so the two formats
 * can never disagree about what the tables say.
 */

const fmtMs = ms => (ms >= 100 ? `${Math.round(ms)} ms` : ms >= 10 ? `${ms.toFixed(1)} ms` : `${ms.toFixed(2)} ms`);

/** What goes in the appendix, from the store's state at the moment of export. */
export function appendixModel({ sim, state, part, notes }) {
  const r = state.result;
  const usable = state.status === Status.COMPLETE || state.status === Status.WARNING;
  const sections = [];

  // --- the run -----------------------------------------------------------
  const run = [['Status', usable ? state.status : state.status === Status.ERROR ? 'No valid solution' : 'Not calculated']];
  if (usable) {
    run.push(['Converged', r.converged ? 'Yes — the solver met its tolerance' : 'No']);
    if (!isEmpty(r.iterations)) run.push(['Iterations', String(r.iterations)]);
    if (!isEmpty(r.residual)) run.push(['Residual', r.residual.toExponential(2)]);
    if (!isEmpty(r.solveMs)) run.push(['Solve time', fmtMs(r.solveMs)]);
    for (const t of r.convergence || []) {
      run.push([`${t.label}`, `${t.converged ? 'met' : 'did not meet'} ${t.tol.toExponential(0)} in ${t.iterations ?? t.history.length} iterations`]);
    }
    for (const f of Object.values(r.massBalance || {})) {
      if (f.side === 'closure' && !isEmpty(f.value)) run.push([f.label, val(f.value, f.unit, f.digits ?? 4)]);
    }
  }
  const faults = (state.faults || []).map(id => sim.scenarios?.faults?.find(x => x.id === id)?.name || id);
  run.push(['Case', sim.scenarios?.modes?.find(m => m.id === state.scenario)?.name || state.scenario || 'Base case']);
  run.push(['Faults', faults.length ? faults.join(', ') : 'None']);
  sections.push({ title: 'The run', kind: 'kv', rows: run });

  // --- equipment readings -------------------------------------------------
  const eq = usable ? sim.engine.getEquipmentState(r) : {};
  const tags = part.subject?.length ? part.subject : Object.values(sim.engine.TAGS || {});
  const names = Object.fromEntries((sim.flowsheetSpec?.nodes || []).map(n => [n.tag, n.label]));
  const rows = [];
  for (const tag of tags) {
    const name = sim.equipmentInfo?.[tag]?.name || names[tag] || '';
    const values = Object.entries(eq[tag]?.values || {}).filter(([, v]) => v && v !== '—');
    if (!values.length) { rows.push([tag, name, usable ? 'No readings reported' : 'Not calculated', '—']); continue; }
    values.forEach(([k, v], i) => rows.push([i ? '' : tag, i ? '' : name, k, v]));
  }
  sections.push({
    title: part.subject?.length ? `Equipment readings — ${part.label}` : 'Equipment readings',
    kind: 'table',
    columns: [
      { label: 'Tag', w: 0.11, font: 'mono' },
      { label: 'Unit', w: 0.3 },
      { label: 'Reading', w: 0.35 },
      { label: 'Value', w: 0.24, align: 'right', font: 'mono' }
    ],
    rows
  });

  // --- streams ------------------------------------------------------------
  const streams = usable ? sim.engine.getStreams(r) : [];
  if (streams.length) {
    sections.push({
      title: 'Streams',
      kind: 'table',
      columns: [
        { label: 'Stream', w: 0.12, font: 'mono' },
        { label: 'Phase', w: 0.14 },
        { label: 'Flowing', w: 0.1 },
        { label: 'As the engine reported it', w: 0.64, font: 'mono' }
      ],
      rows: streams.map(s => [s.id, s.phase || '', s.flow > 0 ? 'Yes' : 'No', s.label || '—'])
    });
  }

  if (notes?.trim()) sections.push({ title: 'Notes', kind: 'text', text: notes.trim() });
  return { sections, usable };
}

/**
 * Text metrics for a layout that will be drawn on a canvas in the app's own
 * faces, rather than in a PDF's standard fonts. Weights match drawOps().
 */
export function canvasMetrics({ sans, mono }) {
  const ctx = document.createElement('canvas').getContext('2d');
  const measure = (str, size, font = 'regular') => {
    ctx.font = `${font === 'bold' ? 600 : 400} ${size}px ${font === 'mono' ? mono : sans}`;
    return ctx.measureText(String(str)).width;
  };
  const fitText = (str, size, font, max) => {
    let s = String(str);
    if (measure(s, size, font) <= max) return s;
    while (s.length > 1 && measure(`${s}…`, size, font) > max) s = s.slice(0, -1);
    return `${s}…`;
  };
  return { measure, fitText };
}

/**
 * Lay the appendix out as drawing operations, in points.
 *
 * `height` may be Infinity, which gives one continuous block — what a PNG
 * wants — instead of pages. Returns an array of pages, each an array of ops.
 * `metrics` measures text in the faces it will be drawn in: the PDF's
 * standard fonts unless told otherwise.
 */
export function layoutAppendix(model, { width, height, margin = 36, pal, heading, metrics = { measure: pdfMeasure, fitText: pdfFit } }) {
  const { measure, fitText } = metrics;
  const pages = [];
  let ops, y;
  const cw = width - 2 * margin;
  const bottom = () => height - margin;

  const newPage = () => {
    ops = [];
    pages.push(ops);
    ops.push({ t: 'rect', x: 0, y: 0, w: width, h: Number.isFinite(height) ? height : 0, fill: pal.paper });
    y = margin;
    ops.push({ t: 'text', x: margin, y: y + 12, str: heading.title, size: 15, font: 'bold', color: pal.ink });
    ops.push({ t: 'text', x: width - margin, y: y + 12, str: heading.right, size: 8, font: 'regular', color: pal.faint, align: 'right' });
    y += 22;
    ops.push({ t: 'text', x: margin, y: y + 6, str: heading.sub, size: 8.5, font: 'regular', color: pal.dim });
    y += 16;
    ops.push({ t: 'rect', x: margin, y, w: cw, h: 1.4, fill: pal.accent });
    y += 18;
  };
  const room = need => { if (y + need > bottom()) newPage(); };

  newPage();
  for (const sec of model.sections) {
    room(40);
    ops.push({ t: 'rect', x: margin, y: y - 1, w: 3, h: 12, fill: pal.accent });
    ops.push({ t: 'text', x: margin + 9, y: y + 9, str: sec.title, size: 11, font: 'bold', color: pal.ink });
    y += 22;

    if (sec.kind === 'kv') {
      // Two columns of field and value, like a data sheet's header block.
      const colW = cw / 2, kw = 130;
      for (let i = 0; i < sec.rows.length; i += 2) {
        room(15);
        for (let c = 0; c < 2; c++) {
          const row = sec.rows[i + c];
          if (!row) continue;
          const x = margin + c * colW;
          ops.push({ t: 'text', x, y: y + 9, str: fitText(row[0], 8.5, 'regular', kw - 8), size: 8.5, font: 'regular', color: pal.faint });
          ops.push({ t: 'text', x: x + kw, y: y + 9, str: fitText(row[1], 8.5, 'bold', colW - kw - 14), size: 8.5, font: 'bold', color: pal.ink });
        }
        ops.push({ t: 'line', x1: margin, y1: y + 14, x2: margin + cw, y2: y + 14, width: 0.4, color: pal.rule });
        y += 16;
      }
      y += 14;
      continue;
    }

    if (sec.kind === 'text') {
      const words = sec.text.split(/\s+/);
      let line = '';
      const flush = () => { room(13); ops.push({ t: 'text', x: margin, y: y + 9, str: line, size: 9, font: 'regular', color: pal.ink }); y += 13; line = ''; };
      for (const w of words) {
        const next = line ? `${line} ${w}` : w;
        if (measure(next, 9, 'regular') > cw && line) { flush(); line = w; } else line = next;
      }
      if (line) flush();
      y += 14;
      continue;
    }

    // A table: header row, then rows, the header repeated on each new page.
    const xs = []; let acc = margin;
    for (const c of sec.columns) { xs.push(acc); acc += c.w * cw; }
    const header = () => {
      ops.push({ t: 'rect', x: margin, y, w: cw, h: 15, fill: pal.band });
      sec.columns.forEach((c, i) => {
        const x = c.align === 'right' ? xs[i] + c.w * cw - 6 : xs[i] + 6;
        ops.push({ t: 'text', x, y: y + 10.5, str: c.label, size: 7.5, font: 'bold', color: pal.dim, align: c.align || 'left' });
      });
      y += 17;
    };
    // The header and at least the first rows together: a header alone at the
    // foot of a page is a table that starts on the next one.
    room(21 + Math.min(3, sec.rows.length) * 14);
    header();
    // Rows continuing a unit carry no tag of their own; the last one seen is
    // kept so that a unit split across a page break is named again at the top
    // of the next page rather than continuing anonymously.
    let group = null;
    sec.rows.forEach((row, r) => {
      const rest = sec.rows.length - r;
      // A page break never leaves one or two rows stranded on a page of their
      // own: the last three rows of a table travel together.
      const top = y;
      if (y + 14 > bottom() || (rest <= 3 && y + rest * 14 > bottom())) { newPage(); header(); }
      const broke = y < top;
      if (row[0]) group = row;
      const cells = broke && !row[0] && group ? [group[0], `${group[1]} (continued)`, ...row.slice(2)] : row;
      sec.columns.forEach((c, i) => {
        const maxW = c.w * cw - 12;
        const str = fitText(cells[i] ?? '', 8.3, c.font || 'regular', maxW);
        const x = c.align === 'right' ? xs[i] + c.w * cw - 6 : xs[i] + 6;
        ops.push({ t: 'text', x, y: y + 9.5, str, size: 8.3, font: c.font || 'regular', color: i === 0 ? pal.accentInk : pal.ink, align: c.align || 'left' });
      });
      ops.push({ t: 'line', x1: margin, y1: y + 13.5, x2: margin + cw, y2: y + 13.5, width: 0.35, color: pal.rule });
      y += 14;
    });
    y += 16;
  }

  // A continuous block ends where its content does.
  if (!Number.isFinite(height)) pages[0][0].h = y + margin;
  return { pages, height: Number.isFinite(height) ? height : y + margin };
}

/** Draw laid-out ops onto a 2D canvas at `k` pixels per point. */
export function drawOps(ctx, ops, k, fonts) {
  for (const o of ops) {
    if (o.t === 'rect') {
      if (o.fill) { ctx.fillStyle = o.fill; ctx.fillRect(o.x * k, o.y * k, o.w * k, o.h * k); }
    } else if (o.t === 'line') {
      ctx.strokeStyle = o.color; ctx.lineWidth = Math.max(1, o.width * k);
      ctx.beginPath(); ctx.moveTo(o.x1 * k, o.y1 * k); ctx.lineTo(o.x2 * k, o.y2 * k); ctx.stroke();
    } else if (o.t === 'text') {
      ctx.fillStyle = o.color;
      ctx.font = `${o.font === 'bold' ? 600 : 400} ${o.size * k}px ${o.font === 'mono' ? fonts.mono : fonts.sans}`;
      ctx.textAlign = o.align === 'right' ? 'right' : o.align === 'center' ? 'center' : 'left';
      ctx.fillText(o.str, o.x * k, o.y * k);
    }
  }
  ctx.textAlign = 'left';
}

/** Draw laid-out ops into a PDF page. */
export function pdfOps(page, ops) {
  for (const o of ops) {
    if (o.t === 'rect') page.rect(o.x, o.y, o.w, o.h, { fill: o.fill });
    else if (o.t === 'line') page.line(o.x1, o.y1, o.x2, o.y2, { width: o.width, color: o.color });
    else if (o.t === 'text') page.text(o.str, o.x, o.y, { size: o.size, font: o.font, color: o.color, align: o.align });
  }
}
