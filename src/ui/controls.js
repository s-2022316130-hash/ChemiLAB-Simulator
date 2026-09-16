import { el, clear } from '../shared/dom.js';
import { panel } from '../shared/components/panel.js';
import { visibleAt, Status } from '../simulation/contract.js';
import { icon } from '../shared/icons.js';

/**
 * Operator control panel, built from engine.inputSpec.
 *
 * Controls write raw user values into the store. They never pre-compute
 * anything, never clamp, and never repair a value on the way past — an input
 * outside the validated range is rejected by the engine with a reason, which is
 * the whole point of having one.
 *
 * Two decisions are worth knowing about.
 *
 * The fields are built once per detail level and then *patched*, not rebuilt.
 * The obvious implementation re-renders the panel whenever `inputs` changes,
 * and since typing into a field changes `inputs`, the field is destroyed and
 * replaced between one keystroke and the next — which takes the caret with it.
 * Rebuilding happens only when the level changes, because that is the only
 * thing that changes which fields exist.
 *
 * The slider track is filled to the value. A bare track says where the handle
 * is; a filled one says where the value sits in the range the model was
 * validated over, which is information the student needs and the engine
 * already declared.
 */
export function createControls(engine, store, { onRun } = {}) {
  const host = el('div');
  const countChip = el('span', { class: 'tag' });

  const runBtn = el('button', {
    class: 'btn primary', html: `${icon('play')} Run simulation`,
    onClick: () => onRun?.()
  });
  const resetBtn = el('button', {
    class: 'btn', html: `${icon('reset')} Base case`,
    title: 'Return every input to the design case for this unit',
    onClick: () => store.set({ resetRequest: Date.now() })
  });
  const runNote = el('div', {
    style: 'margin-top:8px;font-size:var(--t-fine);color:var(--ink-ghost);line-height:1.45'
  });
  const actions = el('div', { class: 'runbar' }, [
    el('div', { class: 'btnrow' }, [runBtn, resetBtn]),
    runNote
  ]);

  const p = panel({ title: 'Operator controls', right: countChip, body: [host, actions] });

  let fields = new Map();     // key -> {row, input, slider, err}
  let builtLevel = null;

  /** Set the filled proportion of a slider track from its own value. */
  function paintTrack(slider) {
    const min = Number(slider.min), max = Number(slider.max), v = Number(slider.value);
    const k = max > min ? ((v - min) / (max - min)) * 100 : 0;
    slider.style.setProperty('--fill', `${Math.max(0, Math.min(100, k))}%`);
  }

  function write(key, value) {
    // `dirty` travels with the value: the moment an input moves, whatever is on
    // the results rail describes the previous case and says so.
    store.set({ inputs: { ...store.get().inputs, [key]: value }, dirty: true });
  }

  function build(level) {
    builtLevel = level;
    fields = new Map();
    clear(host);

    const groups = new Map();
    for (const [key, def] of Object.entries(engine.inputSpec)) {
      if (!visibleAt(def.level || 'student', level)) continue;
      const g = def.group || 'Process';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push([key, def]);
    }

    let shown = 0;
    for (const [group, items] of groups) {
      // Each group folds away. At student level there are five inputs and this
      // does nothing; at expert level there are twenty and being able to shut
      // the three sections you are not working on is the difference between a
      // panel and a wall. Open by default, always — a control you cannot see is
      // a control you do not know exists.
      const body = el('div', { class: 'ctrl-body' });
      const g = el('details', { class: 'ctrl-group', open: true }, [
        el('summary', {}, [
          el('span', { class: 'ctrl-name', text: group }),
          el('span', { class: 'ctrl-count', text: String(items.length) })
        ]),
        body
      ]);
      host.appendChild(g);
      for (const [key, def] of items) {
        shown++;
        const input = el('input', {
          type: 'number', step: def.step ?? 'any', min: def.min, max: def.max,
          'aria-label': def.label,
          onInput: e => {
            const v = e.target.value === '' ? null : Number(e.target.value);
            if (slider && Number.isFinite(v)) { slider.value = String(v); paintTrack(slider); }
            write(key, v);
          }
        });

        const hasRange = def.min !== undefined && def.max !== undefined;
        const slider = hasRange ? el('input', {
          type: 'range', min: def.min, max: def.max,
          step: def.step ?? (def.max - def.min) / 100,
          tabindex: '-1', 'aria-hidden': 'true',
          onInput: e => {
            input.value = e.target.value;
            paintTrack(e.target);
            write(key, Number(e.target.value));
          }
        }) : null;

        // The value sits on the label's own line, at the size of a readout
        // rather than of a form field. A control whose current setting is the
        // smallest thing in the row reads as a form; one whose setting is the
        // largest reads as an instrument, which is what this is. It stays a
        // real number input — typing a value is still the fastest way to enter
        // an exact one — it is simply not dressed as a box until you touch it.
        input.style.width = `${valueChars(def)}ch`;

        const err = el('div', { class: 'err', style: 'display:none' });
        const row = el('div', { class: 'field' }, [
          el('div', { class: 'field-top' }, [
            el('label', { text: def.label }),
            el('div', { class: 'field-val' }, [
              input,
              def.unit ? el('span', { class: 'unit', text: def.unit }) : null
            ].filter(Boolean))
          ]),
          slider,
          hasRange ? el('div', { class: 'range-ends' }, [
            el('span', { text: fmtEnd(def.min) }),
            el('span', { text: fmtEnd(def.max) })
          ]) : null,
          err
        ].filter(Boolean));

        body.appendChild(row);
        fields.set(key, { row, input, slider, err });
      }
    }
    countChip.textContent = `${shown} inputs`;
  }

  /** Patch the built fields from the store without touching their identity. */
  function sync(state) {
    const { inputs, errors, status, dirty } = state;
    for (const [key, f] of fields) {
      const v = inputs[key];
      // Never overwrite a field someone is typing into. Anything else is the
      // interface arguing with the person using it.
      if (document.activeElement !== f.input) f.input.value = v ?? '';
      if (f.slider && Number.isFinite(v)) { f.slider.value = String(v); paintTrack(f.slider); }
      const msg = errors?.[key];
      f.err.textContent = msg || '';
      f.err.style.display = msg ? '' : 'none';
      f.row.dataset.invalid = String(!!msg);
    }
    const busy = status === Status.CALCULATING || status === Status.CONVERGING;
    runBtn.disabled = busy;
    runBtn.innerHTML = busy ? `${icon('spinner')} Solving…` : `${icon('play')} Run simulation`;
    runBtn.dataset.busy = String(busy);
    runNote.textContent = busy
      ? 'Closing the balances.'
      : dirty && (status === Status.COMPLETE || status === Status.WARNING)
        ? 'Inputs have changed since the last run — the results rail still shows the previous case.'
        : status === Status.READY
          ? 'Nothing has been calculated yet.'
          : '';
    actions.dataset.dirty = String(!!dirty);
  }

  store.subKeys(['level'], s => { if (s.level !== builtLevel) { build(s.level); sync(store.get()); } });
  store.subKeys(['inputs', 'errors', 'status', 'dirty'], sync);
  return p;
}

/**
 * How wide the value needs to be, in characters, from what the spec declares.
 *
 * Sized from the range and the step rather than left to shrink-to-fit, because
 * a field that resizes as you type moves the unit beside it on every keystroke,
 * and a column of controls whose values do not share an edge is much harder to
 * scan than one whose values do.
 */
function valueChars(def) {
  const decimals = (String(def.step ?? '').split('.')[1] || '').length;
  const digits = Math.max(
    String(Math.trunc(Math.abs(def.max ?? 0))).length,
    String(Math.trunc(Math.abs(def.min ?? 0))).length,
    1);
  const sign = (def.min ?? 0) < 0 ? 1 : 0;
  return Math.min(10, digits + (decimals ? decimals + 1 : 0) + sign + 0.5);
}

/** Range ends read as bounds, not as measurements: no trailing zeros. */
function fmtEnd(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '';
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e5 || a < 1e-3)) return v.toExponential(1);
  return String(Math.round(v * 1000) / 1000);
}
