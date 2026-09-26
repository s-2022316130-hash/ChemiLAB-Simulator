import { el } from '../shared/dom.js';
import { icon } from '../shared/icons.js';
import { resolvePresets } from '../scene/cameras.js';
import { createPdf, PAPER } from '../shared/pdf.js';
import { composeSheet, sheetPalette, IMAGE_ASPECT } from './exportSheet.js';
import { appendixModel, layoutAppendix, drawOps, pdfOps, canvasMetrics } from './exportAppendix.js';

/**
 * Export a plant sheet, as an image or as a document.
 *
 * Choose the part of the plant — any of its camera positions, the view you are
 * looking through now, or the unit you have selected — what to include, and
 * how it should come out:
 *
 *   PNG   one image. The sheet, and the data appendix under it if asked for.
 *   PDF   a printable document on A4, A3 or US Letter, landscape. The sheet
 *         fills the first page edge to edge, composed to the paper's own
 *         proportions; the data appendix follows as pages of real text, which
 *         can be searched, selected and printed sharp at any size.
 *
 * Either can be drawn in the app's colours or on white for printing, and
 * either can carry a title, the name of whoever prepared it, and notes.
 *
 * The preview is the real output at a third of the size, composed by the same
 * code as the download, page for page, so what you see is what you get rather
 * than an approximation of it. It is recomposed a moment after each change
 * rather than on every keystroke, so working through the options stays quick.
 *
 * A dialog, not a page: it keeps the workspace behind it exactly as it was, and
 * closing it puts focus back on the button that opened it. The choices that
 * are about the person rather than the run — format, paper, colours, their
 * name — are remembered for next time, in this browser only.
 */

const SIZES = [
  { id: 'standard', label: 'Standard', note: '2400 × 1800 px', scale: 1 },
  { id: 'high', label: 'High', note: '4800 × 3600 px', scale: 2 }
];
const PAPER_NOTE = { a4: '297 × 210 mm', a3: '420 × 297 mm', letter: '11 × 8.5 in' };
// Pixels per point the sheet is rasterised at for each paper: a little over
// 300 dpi on the page, which is what a printer can use and no more.
const PAPER_SCALE = { a4: 1.5, a3: 2, letter: 1.5 };

const PREVIEW_SCALE = 0.34;
// The PNG appendix is laid out in points like the PDF's, at this many pixels
// per point on the standard sheet, which puts its text at the sheet's own size.
const PNG_PT = 2.4;
const PDF_FONTS = { sans: 'Helvetica, Arial, "Liberation Sans", sans-serif', mono: '"Courier New", Courier, "Liberation Mono", monospace' };

// Browsers cap the size of one canvas, and a phone's cap is far below a
// desktop's: Safari on iOS draws nothing at all past about 16.7 million
// pixels. An export that would pass the cap is made at the largest scale under
// it, and the summary says so before the button is pressed, rather than the
// download failing after it.
const HANDHELD = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const PIXEL_CAP = HANDHELD ? 16e6 : 64e6;
const capped = (w, h, s) => Math.min(s, Math.sqrt(PIXEL_CAP / (w * h)));

const KEY = 'chemilab.export.v1';
const remembered = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const remember = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode: not remembered */ } };

function stamp() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

const encode = (canvas, type, quality) => new Promise((ok, fail) =>
  canvas.toBlob(b => (b ? ok(b) : fail(new Error('the browser would not encode the image'))), type, quality));

function save(blob, filename) {
  const a = el('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** Appendix colours: opaque, on the sheet's own ground. */
const appendixColours = pal => ({
  paper: pal.solid('--bg-0'), ink: pal.solid('--ink'), dim: pal.solid('--ink-dim'), faint: pal.solid('--ink-faint'),
  rule: pal.solid('--line'), band: pal.solid('--bg-2'), accent: pal.solid('--hue'), accentInk: pal.solid('--hue')
});

export function openExportDialog({ sim, name, view, flowsheet, store, mode, trigger }) {
  const state = store.get();

  // The parts of the plant, framed for the sheet's own picture shape rather
  // than the panel's, so a preset looks on the sheet as it was composed to.
  const specs = sim.plant?.presetSpec || {};
  const framed = resolvePresets(view, Object.fromEntries(
    Object.entries(specs).map(([id, spec]) => [id, { ...spec, aspect: IMAGE_ASPECT }])));
  const parts = [{ id: 'current', label: 'Current view', pose: null, subject: null }];
  if (state.selection) {
    const unit = view.getEquipment(state.selection);
    const one = resolvePresets(view, { unit: { subject: [state.selection], azimuth: 32, elevation: 20, fill: 0.62, aspect: IMAGE_ASPECT } }).unit;
    if (one) parts.push({ id: 'unit', label: `${state.selection} — ${unit?.meta?.name || 'selected unit'}`, pose: one, subject: [state.selection] });
  }
  for (const [id, p] of Object.entries(framed)) {
    parts.push({ id, label: p.label, pose: { pos: p.pos, target: p.target }, subject: specs[id]?.subject === '*' ? null : specs[id]?.subject });
  }

  const prior = remembered();
  // The appendix is remembered per format: a PDF is a document and wants its
  // tables; a PNG is usually going onto a slide, where a sheet with a column
  // of tables under it is the wrong shape.
  const appendixBy = { png: prior.appendixPng ?? false, pdf: prior.appendixPdf ?? true };
  const choice = {
    part: state.selection ? 'unit' : 'current',
    format: prior.format === 'pdf' ? 'pdf' : 'png',
    size: SIZES.some(z => z.id === prior.size) ? prior.size : 'standard',
    paper: PAPER[prior.paper] ? prior.paper : 'a4',
    colours: prior.colours === 'white' ? 'white' : 'match',
    options: { callouts: true, readings: true, schematic: true, legend: true, appendix: false },
    info: { title: '', preparedBy: prior.preparedBy || '', notes: '' }
  };
  choice.options.appendix = appendixBy[choice.format];
  const usable = state.status === 'COMPLETE' || state.status === 'WARNING';

  // --- markup ---------------------------------------------------------------
  const previewHost = el('div', { class: 'xd-preview', 'aria-live': 'polite' });
  const busy = el('div', { class: 'xd-busy', text: 'Composing the sheet…' });
  previewHost.appendChild(busy);
  const pageStrip = el('div', { class: 'xd-pages', role: 'group', 'aria-label': 'Pages' });
  const spec = el('dl', { class: 'xd-spec' });

  const radio = (group, value, label, note, checked) => {
    const input = el('input', { type: 'radio', name: group, value });
    input.checked = checked;
    return el('label', { class: 'xd-opt' }, [input, el('span', {}, [el('b', { text: label }), note ? el('small', { text: note }) : null].filter(Boolean))]);
  };
  const check = (key, label, note, disabled = false) => {
    const input = el('input', { type: 'checkbox', name: key });
    input.checked = choice.options[key] && !disabled;
    input.disabled = disabled;
    return el('label', { class: 'xd-opt', dataset: { disabled: String(disabled) } }, [input, el('span', {}, [el('b', { text: label }), note ? el('small', { text: note }) : null].filter(Boolean))]);
  };
  const field = (key, label, control, hint) => el('label', { class: 'xd-field' }, [
    el('span', { class: 'xd-field-l', text: label }), control, hint ? el('small', { text: hint }) : null
  ].filter(Boolean));

  const partSet = el('fieldset', { class: 'xd-set' }, [
    el('legend', { text: 'Part of the plant' }),
    el('div', { class: 'xd-parts' }, parts.map(p => radio('xd-part', p.id, p.label, p.id === 'current' ? 'As you see it now' : p.id === 'unit' ? 'The unit you selected' : null, p.id === choice.part)))
  ]);
  const formatSet = el('fieldset', { class: 'xd-set' }, [
    el('legend', { text: 'Format' }),
    el('div', { class: 'xd-grid2' }, [
      radio('xd-format', 'png', 'PNG image', 'For slides and reports', choice.format === 'png'),
      radio('xd-format', 'pdf', 'PDF document', 'Printable, searchable', choice.format === 'pdf')
    ])
  ]);
  const sizeSet = el('fieldset', { class: 'xd-set', dataset: { for: 'png' } }, [
    el('legend', { text: 'Image size' }),
    el('div', { class: 'xd-grid2' }, SIZES.map(z => radio('xd-size', z.id, z.label, z.note, z.id === choice.size)))
  ]);
  const paperSet = el('fieldset', { class: 'xd-set', dataset: { for: 'pdf' } }, [
    el('legend', { text: 'Paper, landscape' }),
    el('div', { class: 'xd-grid3' }, Object.entries(PAPER).map(([id, p]) => radio('xd-paper', id, p.label, PAPER_NOTE[id], id === choice.paper)))
  ]);
  const colourSet = el('fieldset', { class: 'xd-set' }, [
    el('legend', { text: 'Sheet colours' }),
    el('div', { class: 'xd-grid2' }, [
      radio('xd-colours', 'match', 'Match the app', 'As on screen now', choice.colours === 'match'),
      radio('xd-colours', 'white', 'White paper', 'For printing', choice.colours === 'white')
    ]),
    el('p', { class: 'xd-hint', text: 'The 3D picture keeps the lighting it has on screen.' })
  ]);
  const incSet = el('fieldset', { class: 'xd-set' }, [
    el('legend', { text: 'Include' }),
    check('callouts', 'Equipment callouts', 'Tags and names, with leader lines'),
    check('readings', 'Readings on callouts', usable ? 'As the engine reported them' : 'Run the simulation first', !usable),
    check('schematic', 'Process flow diagram', 'With the part marked on it'),
    check('legend', 'Legend', 'Stream phases and colour mode'),
    check('appendix', 'Data appendix', 'The run, every reading and every stream, as tables')
  ]);

  const titleInput = el('input', { type: 'text', name: 'title', maxlength: 90, placeholder: name, autocomplete: 'off', spellcheck: 'true' });
  const byInput = el('input', { type: 'text', name: 'preparedBy', maxlength: 60, placeholder: 'Your name', autocomplete: 'name' });
  byInput.value = choice.info.preparedBy;
  const notesInput = el('textarea', { name: 'notes', rows: 4, maxlength: 1200, placeholder: 'What was run, what to look at, what to explain' });
  const detailSet = el('fieldset', { class: 'xd-set' }, [
    el('legend', { text: 'Sheet details' }),
    field('title', 'Title', titleInput, 'Leave empty to use the plant’s name'),
    field('preparedBy', 'Prepared by', byInput),
    field('notes', 'Notes', notesInput, 'Shown on the sheet where there is room, and in full in the appendix')
  ]);

  const download = el('button', { class: 'btn primary', type: 'button' });
  const cancel = el('button', { class: 'btn', type: 'button', text: 'Cancel' });
  const closeX = el('button', { class: 'iconbtn', type: 'button', html: icon('close'), 'aria-label': 'Close' });
  const note = el('span', { class: 'xd-note', 'aria-live': 'polite' });

  const dialog = el('div', { class: 'xd', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'xd-title' }, [
    el('header', { class: 'xd-head' }, [
      el('div', {}, [
        el('h2', { id: 'xd-title', text: 'Export plant sheet' }),
        el('p', { text: `${name}: a 3D view with its units marked, the flow diagram and the run’s readings, as an image or a printable document.` })
      ]),
      closeX
    ]),
    el('div', { class: 'xd-body' }, [
      el('div', { class: 'xd-stage' }, [previewHost, pageStrip, spec]),
      el('div', { class: 'xd-side' }, [partSet, formatSet, sizeSet, paperSet, colourSet, incSet, detailSet])
    ]),
    el('footer', { class: 'xd-foot' }, [note, el('div', { class: 'btnrow' }, [cancel, download])])
  ]);
  const backdrop = el('div', { class: 'xd-backdrop' }, [dialog]);
  document.body.appendChild(backdrop);

  // --- what the output is ---------------------------------------------------
  const partOf = () => parts.find(p => p.id === choice.part) || parts[0];
  const paper = () => PAPER[choice.paper];
  const aspect = () => (choice.format === 'pdf' ? paper().w / paper().h : 0);
  const filename = () => `chemilab-${sim.engine.id}-${choice.part}-${stamp()}.${choice.format}`;
  const heading = st => {
    const when = new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    const ok = st.status === 'COMPLETE' || st.status === 'WARNING';
    return {
      title: 'Data appendix',
      right: `${choice.info.title.trim() || name}, ${when}`,
      sub: `${name}, ${partOf().label}. ${ok ? 'Every value is the engine’s own, as it reported it.' : 'Nothing has been calculated yet, so units are listed without readings.'}`
    };
  };
  // Pages and footers of the appendix, laid out for the chosen format. The
  // layout does not depend on colour, so it is also what the summary counts.
  function appendixLayout(pal) {
    if (!choice.options.appendix) return null;
    const st = store.get();
    const model = appendixModel({ sim, state: st, part: partOf(), notes: choice.info.notes });
    if (choice.format === 'pdf') {
      const { w, h } = paper();
      const out = layoutAppendix(model, { width: w, height: h, margin: 36, pal, heading: heading(st) });
      const n = out.pages.length + 1;
      out.pages.forEach((ops, i) => ops.push(
        { t: 'line', x1: 36, y1: h - 25, x2: w - 36, y2: h - 25, width: 0.4, color: pal.rule },
        { t: 'text', x: 36, y: h - 14, str: `ChemiLAB Simulator, model ${sim.engine.modelVersion}`, size: 7.5, font: 'regular', color: pal.faint },
        { t: 'text', x: w - 36, y: h - 14, str: `Page ${i + 2} of ${n}`, size: 7.5, font: 'regular', color: pal.faint, align: 'right' }
      ));
      return { ...out, width: w, fonts: PDF_FONTS };
    }
    const width = Math.round(2400 / PNG_PT);
    const fonts = { sans: palFonts.sans, mono: palFonts.mono };
    return { ...layoutAppendix(model, { width, height: Infinity, margin: 36, pal, heading: heading(st), metrics: canvasMetrics(fonts) }), width, fonts };
  }
  // The app's faces, for a PNG's appendix; read once.
  const palFonts = (() => { const p = sheetPalette('match'); const f = { sans: p.font, mono: p.mono }; p.dispose(); return f; })();
  const NO_COLOUR = new Proxy({}, { get: () => '#000000' });
  const sizeScale = () => SIZES.find(z => z.id === choice.size)?.scale || 1;
  const pdfScale = () => { const p = paper(); return capped(Math.round(1800 * p.w / p.h), 1800, PAPER_SCALE[choice.paper] || 1.5); };
  const pngScale = layout => capped(2400, 1800 + (layout ? layout.height * PNG_PT : 0), sizeScale());

  function summary() {
    const st = store.get();
    const layout = appendixLayout(NO_COLOUR);
    const cells = [];
    if (choice.format === 'pdf') {
      const n = 1 + (layout?.pages.length || 0);
      cells.push(['File', `PDF, ${paper().label} landscape`]);
      const s = pdfScale(), p = paper();
      const dpi = Math.round(Math.round(Math.round(1800 * p.w / p.h) * s) / (p.w / 72));   // points are 1/72 in
      cells.push(['Size', `${PAPER_NOTE[choice.paper]}, sheet at ${dpi} dpi${s < (PAPER_SCALE[choice.paper] || 1.5) ? ' (this device’s limit)' : ''}`]);
      cells.push(['Pages', n === 1 ? '1, the sheet' : `${n}: the sheet and ${n - 1} of tables`]);
    } else {
      const s = pngScale(layout);
      const h = Math.round(1800 * s) + (layout ? Math.round(layout.height * PNG_PT * s) : 0);
      cells.push(['File', 'PNG image']);
      cells.push(['Size', `${Math.round(2400 * s)} × ${h} px${s < sizeScale() ? ', the most this device can draw' : ''}`]);
      cells.push(['Contents', layout ? 'The sheet, tables under it' : 'The sheet']);
    }
    const r = st.result;
    cells.push(['Run', st.status === 'COMPLETE' || st.status === 'WARNING'
      ? `${st.status === 'COMPLETE' ? 'Complete' : 'Warning'}${r?.converged ? `, converged${r.iterations != null ? ` in ${r.iterations} iterations` : ''}` : ', not converged'}`
      : st.status === 'ERROR' ? 'No valid solution' : 'Not calculated']);
    spec.replaceChildren(...cells.flatMap(([k, v]) => [el('div', {}, [el('dt', { text: k }), el('dd', { text: v })])]));
    note.textContent = choice.format === 'pdf'
      ? `Saves ${filename()}. Tables are real text, so they print sharp and can be searched.`
      : `Saves ${filename()}.${usable ? ' Readings are the engine’s, exactly as reported.' : ' Nothing has been calculated yet — units will be named, not measured.'}`;
    download.innerHTML = `${icon('download')} Download ${choice.format.toUpperCase()}`;
    dialog.dataset.format = choice.format;
  }

  // --- preview --------------------------------------------------------------
  let seq = 0, timer = 0, shown = 0, pages = [];
  function show(i) {
    shown = Math.max(0, Math.min(i, pages.length - 1));
    const c = pages[shown];
    if (!c) return;
    previewHost.querySelector('.xd-canvas')?.remove();
    previewHost.style.setProperty('--ar', `${c.width} / ${c.height}`);
    previewHost.dataset.tall = String(c.height > c.width * 1.1);
    previewHost.appendChild(c);
    for (const [k, b] of [...pageStrip.children].entries()) b.setAttribute('aria-pressed', String(k === shown));
  }
  async function preview() {
    const my = ++seq;
    previewHost.dataset.busy = 'true';
    // A beat's delay so the busy state paints before the composition, which
    // runs on the main thread, starts.
    await new Promise(r => setTimeout(r, 30));
    if (my !== seq) return;
    const pal = sheetPalette(choice.colours, sim.engine.id);
    try {
      const sheet = await composeSheet({
        sim, name, view, flowsheet, part: partOf(), state: store.get(), options: choice.options, mode,
        scale: PREVIEW_SCALE, palette: pal, aspect: aspect(), info: choice.info
      });
      if (my !== seq) return;
      const out = [sheet];
      const layout = appendixLayout(appendixColours(pal));
      if (layout) {
        const k = sheet.width / layout.width;
        for (const ops of layout.pages) {
          const c = document.createElement('canvas');
          c.width = Math.round(layout.width * k);
          c.height = Math.round((Number.isFinite(ops[0].h) && ops[0].h > 0 ? ops[0].h : layout.height) * k);
          drawOps(c.getContext('2d'), ops, k, layout.fonts);
          out.push(c);
        }
      }
      out.forEach((c, i) => {
        c.className = 'xd-canvas';
        c.setAttribute('role', 'img');
        c.setAttribute('aria-label', i ? `Preview of the data appendix, ${choice.format === 'pdf' ? `page ${i + 1}` : 'under the sheet'}` : `Preview of the plant sheet: ${partOf().label}`);
      });
      pages = out;
      pageStrip.replaceChildren(...(out.length > 1 ? out.map((c, i) => {
        const t = document.createElement('canvas');
        t.width = 132; t.height = Math.round(132 * Math.min(c.height / c.width, 1.4));
        t.getContext('2d').drawImage(c, 0, 0, c.width, Math.min(c.height, c.width * 1.4), 0, 0, t.width, t.height);
        const label = i === 0 ? 'Sheet' : choice.format === 'pdf' ? `Page ${i + 1}` : 'Appendix';
        const b = el('button', { class: 'xd-page', type: 'button', 'aria-label': `Show ${label.toLowerCase()}` }, [t, el('span', { text: label })]);
        b.addEventListener('click', () => show(i));
        return b;
      }) : []));
      show(shown < out.length ? shown : 0);
    } catch (e) {
      busy.textContent = `The preview could not be drawn: ${e.message}`;
    } finally {
      pal.dispose();
      if (my === seq) previewHost.dataset.busy = 'false';
    }
  }
  const schedule = (ms = 140) => { clearTimeout(timer); timer = setTimeout(preview, ms); };
  const keep = () => remember({
    format: choice.format, size: choice.size, paper: choice.paper, colours: choice.colours,
    appendixPng: appendixBy.png, appendixPdf: appendixBy.pdf, preparedBy: choice.info.preparedBy
  });

  dialog.addEventListener('change', e => {
    const t = e.target;
    if (t.name === 'xd-part') choice.part = t.value;
    else if (t.name === 'xd-format') {
      choice.format = t.value; shown = 0;
      choice.options.appendix = appendixBy[choice.format];
      dialog.querySelector('input[name="appendix"]').checked = choice.options.appendix;
    }
    else if (t.name === 'xd-paper') choice.paper = t.value;
    else if (t.name === 'xd-colours') choice.colours = t.value;
    else if (t.name === 'xd-size') { choice.size = t.value; keep(); summary(); return; }   // size does not change the preview
    else if (t.name in choice.options) {
      choice.options[t.name] = t.checked;
      if (t.name === 'appendix') appendixBy[choice.format] = t.checked;
    } else return;
    keep(); summary(); schedule();
  });
  // Typing is recomposed after a pause, not per key.
  dialog.addEventListener('input', e => {
    const t = e.target;
    if (!(t.name in choice.info)) return;
    choice.info[t.name] = t.value;
    if (t.name === 'preparedBy') keep();
    summary(); schedule(420);
  });

  async function build() {
    const st = store.get();
    const pal = sheetPalette(choice.colours, sim.engine.id);
    try {
      const common = { sim, name, view, flowsheet, part: partOf(), state: st, options: choice.options, mode, palette: pal, info: choice.info };
      if (choice.format === 'pdf') {
        const p = paper();
        const sheet = await composeSheet({ ...common, scale: pdfScale(), aspect: p.w / p.h });
        const jpeg = new Uint8Array(await (await encode(sheet, 'image/jpeg', 0.92)).arrayBuffer());
        const pdf = createPdf({
          title: choice.info.title.trim() || `${name}: plant sheet`,
          author: choice.info.preparedBy.trim(),
          subject: `${name}, ${partOf().label}`,
          keywords: `ChemiLAB Simulator, plant sheet, ${sim.engine.id}`
        });
        // The sheet was composed to the paper's proportions, so it fills the page.
        pdf.page(p.w, p.h).image(jpeg, sheet.width, sheet.height, 0, 0, p.w, p.h);
        const layout = appendixLayout(appendixColours(pal));
        for (const ops of layout?.pages || []) pdfOps(pdf.page(p.w, p.h), ops);
        return pdf.toBlob();
      }
      const layout = appendixLayout(appendixColours(pal));
      const scale = pngScale(layout);
      const sheet = await composeSheet({ ...common, scale });
      if (!layout) return encode(sheet, 'image/png');
      const k = PNG_PT * scale;
      const c = document.createElement('canvas');
      c.width = sheet.width;
      c.height = sheet.height + Math.round(layout.height * k);
      const ctx = c.getContext('2d');
      ctx.drawImage(sheet, 0, 0);
      ctx.translate(0, sheet.height);
      drawOps(ctx, layout.pages[0], k, layout.fonts);
      return encode(c, 'image/png');
    } finally {
      pal.dispose();
    }
  }

  download.addEventListener('click', async () => {
    download.disabled = true;
    download.innerHTML = `${icon('spinner')} Composing…`;
    try {
      save(await build(), filename());
      close();
    } catch (e) {
      download.disabled = false;
      summary();
      note.textContent = `Export failed: ${e.message}`;
    }
  });

  function close() {
    clearTimeout(timer); seq++;
    document.removeEventListener('keydown', onKey, true);
    backdrop.dataset.closing = 'true';
    setTimeout(() => backdrop.remove(), 180);
    trigger?.focus?.();
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    // Keep focus inside the dialog while it is open.
    const f = [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled])')]
      .filter(n => n.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  document.addEventListener('keydown', onKey, true);
  cancel.addEventListener('click', close);
  closeX.addEventListener('click', close);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });

  summary();
  dialog.querySelector('input[name="xd-part"]:checked')?.focus();
  preview();
  return { close };
}
