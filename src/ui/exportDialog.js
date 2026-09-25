import { el } from '../shared/dom.js';
import { icon } from '../shared/icons.js';
import { resolvePresets } from '../scene/cameras.js';
import { composeSheet, IMAGE_ASPECT } from './exportSheet.js';

/**
 * Export a plant sheet.
 *
 * Choose the part of the plant — any of its camera positions, the view you are
 * looking through now, or the unit you have selected — what to include, and a
 * size; see the sheet as it will be; download it as a PNG.
 *
 * The preview is the real sheet at a third of the size, composed by the same
 * code as the download, so what you see is what you get rather than an
 * approximation of it. It is recomposed a moment after each change rather than
 * on every click, so stepping through the options stays quick.
 *
 * A dialog, not a page: it keeps the workspace behind it exactly as it was, and
 * closing it puts focus back on the button that opened it.
 */

const SIZES = [
  { id: 'standard', label: 'Standard', note: '2400 × 1800', scale: 1 },
  { id: 'high', label: 'High', note: '4800 × 3600', scale: 2 }
];

const PREVIEW_SCALE = 0.34;

function stamp() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

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

  const choice = {
    part: state.selection ? 'unit' : 'current',
    size: 'standard',
    options: { callouts: true, readings: true, schematic: true, legend: true }
  };
  const usable = state.status === 'COMPLETE' || state.status === 'WARNING';

  // --- markup ---------------------------------------------------------------
  const previewHost = el('div', { class: 'xd-preview', 'aria-live': 'polite' });
  const busy = el('div', { class: 'xd-busy', text: 'Composing the sheet…' });
  previewHost.appendChild(busy);

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

  const partSet = el('fieldset', { class: 'xd-set' }, [
    el('legend', { text: 'Part of the plant' }),
    el('div', { class: 'xd-parts' }, parts.map(p => radio('xd-part', p.id, p.label, p.id === 'current' ? 'As you see it now' : p.id === 'unit' ? 'The unit you selected' : null, p.id === choice.part)))
  ]);
  const incSet = el('fieldset', { class: 'xd-set' }, [
    el('legend', { text: 'Include' }),
    check('callouts', 'Equipment callouts', 'Tags and names, with leader lines'),
    check('readings', 'Readings on callouts', usable ? 'As the engine reported them' : 'Run the simulation first', !usable),
    check('schematic', 'Process flow diagram', 'With the part marked on it'),
    check('legend', 'Legend', 'Stream phases and colour mode')
  ]);
  const sizeSet = el('fieldset', { class: 'xd-set' }, [
    el('legend', { text: 'Size' }),
    el('div', { class: 'xd-sizes' }, SIZES.map(z => radio('xd-size', z.id, z.label, z.note, z.id === choice.size)))
  ]);

  const download = el('button', { class: 'btn primary', type: 'button', html: `${icon('download')} Download PNG` });
  const cancel = el('button', { class: 'btn', type: 'button', text: 'Cancel' });
  const closeX = el('button', { class: 'iconbtn', type: 'button', html: icon('close'), 'aria-label': 'Close' });

  const dialog = el('div', { class: 'xd', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'xd-title' }, [
    el('header', { class: 'xd-head' }, [
      el('div', {}, [
        el('h2', { id: 'xd-title', text: 'Export plant sheet' }),
        el('p', { text: `${name} — a 3D view with its units marked, the flow diagram and the run’s readings, as one image.` })
      ]),
      closeX
    ]),
    el('div', { class: 'xd-body' }, [previewHost, el('div', { class: 'xd-side' }, [partSet, incSet, sizeSet])]),
    el('footer', { class: 'xd-foot' }, [
      el('span', { class: 'xd-note', text: usable ? 'Readings are the engine’s, exactly as reported.' : 'Nothing has been calculated yet — units will be named, not measured.' }),
      el('div', { class: 'btnrow' }, [cancel, download])
    ])
  ]);
  const backdrop = el('div', { class: 'xd-backdrop' }, [dialog]);
  document.body.appendChild(backdrop);

  // --- behaviour ------------------------------------------------------------
  const partOf = () => parts.find(p => p.id === choice.part) || parts[0];
  let seq = 0, timer = 0;
  async function preview() {
    const my = ++seq;
    previewHost.dataset.busy = 'true';
    // A beat's delay so the busy state paints before the composition, which
    // runs on the main thread, starts.
    await new Promise(r => setTimeout(r, 30));
    if (my !== seq) return;
    try {
      const c = await composeSheet({ sim, name, view, flowsheet, part: partOf(), state: store.get(), options: choice.options, mode, scale: PREVIEW_SCALE });
      if (my !== seq) return;
      c.className = 'xd-canvas';
      c.setAttribute('role', 'img');
      c.setAttribute('aria-label', `Preview of the plant sheet: ${partOf().label}`);
      previewHost.querySelector('.xd-canvas')?.remove();
      previewHost.appendChild(c);
    } catch (e) {
      busy.textContent = `The preview could not be drawn: ${e.message}`;
    } finally {
      if (my === seq) previewHost.dataset.busy = 'false';
    }
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(preview, 140); };

  dialog.addEventListener('change', e => {
    const t = e.target;
    if (t.name === 'xd-part') choice.part = t.value;
    else if (t.name === 'xd-size') { choice.size = t.value; return; }   // size does not change the preview
    else if (t.name in choice.options) choice.options[t.name] = t.checked;
    schedule();
  });

  download.addEventListener('click', async () => {
    download.disabled = true;
    download.innerHTML = `${icon('spinner')} Composing…`;
    try {
      const scale = SIZES.find(z => z.id === choice.size)?.scale || 1;
      const c = await composeSheet({ sim, name, view, flowsheet, part: partOf(), state: store.get(), options: choice.options, mode, scale });
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      if (!blob) throw new Error('the browser would not encode the image');
      const a = el('a', { href: URL.createObjectURL(blob), download: `chemilab-${sim.engine.id}-${choice.part}-${stamp()}.png` });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      close();
    } catch (e) {
      download.disabled = false;
      download.innerHTML = `${icon('download')} Download PNG`;
      dialog.querySelector('.xd-note').textContent = `Export failed: ${e.message}`;
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
    const f = [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled])')];
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  document.addEventListener('keydown', onKey, true);
  cancel.addEventListener('click', close);
  closeX.addEventListener('click', close);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });

  dialog.querySelector('input[name="xd-part"]:checked')?.focus();
  preview();
  return { close };
}
