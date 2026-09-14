import { el, clear } from '../shared/dom.js';
import { panel } from '../shared/components/panel.js';
import { gradeChallenge } from '../simulation/scenarios.js';
export function createScenarioPanel(sim, store) {
  const host = el('div');
  const p = panel({ title: 'Scenarios and faults', body: [host] });
  function render() {
    const { scenario, faults, result } = store.get();
    const set = sim.scenarios;
    clear(host);
    host.appendChild(el('div', { class: 'field' }, [
      el('label', { text: 'Operating mode' }),
      el('select', {
        onChange: e => store.set({ scenario: e.target.value, faults: e.target.value === 'fault' ? faults : [] })
      }, set.modes.map(m => el('option', { value: m.id, selected: m.id === scenario || null, text: m.name })))
    ]));
    host.appendChild(el('p', { style: 'font-size:12px;color:var(--ink-dim)', text: set.modes.find(m => m.id === scenario)?.description || '' }));
    if (scenario === 'fault') {
      host.appendChild(el('div', { style: 'font-family:var(--mono);font-size:11px;color:var(--ink-faint);margin:8px 0 4px', text: 'Introduce a problem' }));
      for (const f of set.faults) {
        host.appendChild(el('label', { style: 'display:flex;gap:8px;align-items:flex-start;font-size:12.5px;margin-bottom:6px' }, [
          el('input', {
            type: 'checkbox', checked: faults.includes(f.id) || null,
            onChange: e => store.set({ faults: e.target.checked ? [...faults, f.id] : faults.filter(x => x !== f.id) })
          }),
          el('span', {}, [el('span', { text: f.name }), el('div', { style: 'color:var(--ink-faint)', text: f.description })])
        ]));
      }
    }
    if (set.challenges?.length) {
      host.appendChild(el('div', { style: 'font-family:var(--mono);font-size:11px;color:var(--ink-faint);margin:12px 0 4px', text: 'Challenges' }));
      for (const c of set.challenges) {
        const g = gradeChallenge(c, result);
        host.appendChild(el('div', { class: 'msg', dataset: { lvl: g.graded ? (g.pass ? 'info' : 'warning') : '' } }, [
          el('div', { text: c.title }),
          el('div', { style: 'color:var(--ink-faint);font-size:11.5px', text: g.detail ?? g.text })
        ]));
      }
    }
  }
  store.subKeys(['scenario', 'faults', 'result'], render);
  return p;
}
