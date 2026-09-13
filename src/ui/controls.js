import { el, clear } from '../shared/dom.js';
import { panel } from '../shared/components/panel.js';
import { visibleAt } from '../simulation/contract.js';
/**
 * Operator control panel built from engine.inputSpec.
 * Controls write raw user values into the store; they never pre-compute anything.
 */
export function createControls(engine, store, { onRun } = {}) {
  const host = el('div');
  const p = panel({ title: 'Operator controls', body: [host] });
  function render() {
    const { inputs, errors, level, status } = store.get();
    clear(host);
    const groups = {};
    for (const [key, def] of Object.entries(engine.inputSpec)) {
      if (!visibleAt(def.level || 'student', level)) continue;
      (groups[def.group || 'Process'] ||= []).push([key, def]);
    }
    for (const [g, items] of Object.entries(groups)) {
      host.appendChild(el('div', { style: 'font-family:var(--mono);font-size:11px;color:var(--ink-faint);margin:10px 0 6px', text: g }));
      for (const [key, def] of items) {
        const input = el('input', {
          type: 'number', value: inputs[key] ?? '', step: def.step ?? 'any',
          min: def.min, max: def.max,
          onInput: e => {
            const v = e.target.value === '' ? null : Number(e.target.value);
            store.set({ inputs: { ...store.get().inputs, [key]: v } });
          }
        });
        const slider = def.min !== undefined && def.max !== undefined ? el('input', {
          type: 'range', min: def.min, max: def.max, step: def.step ?? (def.max - def.min) / 100, value: inputs[key] ?? def.min,
          onInput: e => { input.value = e.target.value; store.set({ inputs: { ...store.get().inputs, [key]: Number(e.target.value) } }); }
        }) : null;
        host.appendChild(el('div', { class: 'field' }, [
          el('label', { text: def.label }), el('span', { class: 'unit', text: def.unit || '' }),
          input, slider, errors?.[key] && el('div', { class: 'err', text: errors[key] })
        ].filter(Boolean)));
      }
    }
    host.appendChild(el('div', { class: 'btnrow', style: 'margin-top:12px' }, [
      el('button', { class: 'btn primary', text: 'Run simulation', disabled: status === 'CALCULATING', onClick: () => onRun?.() }),
      el('button', { class: 'btn', text: 'Reset to base case', onClick: () => store.set({ resetRequest: Date.now() }) })
    ]));
  }
  store.subKeys(['inputs', 'errors', 'level', 'status'], render);
  return p;
}
