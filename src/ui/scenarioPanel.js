import { el, clear } from '../shared/dom.js';
import { panel } from '../shared/components/panel.js';
import { gradeChallenge } from '../simulation/scenarios.js';
import { icon } from '../shared/icons.js';

/**
 * Operating mode, faults and graded challenges.
 *
 * A fault is a switch that changes what the plant does and says nothing about
 * why — the symptoms are on the instruments and working back from them is the
 * exercise. So the list shows what each fault *is* in one line, and the plant
 * shows what it *does*. Nothing here explains the connection.
 *
 * A challenge shows its target as a target and its reading as a reading, with
 * the verdict carried by a mark rather than by a sentence that repeats the
 * title back.
 */
export function createScenarioPanel(sim, store) {
  const host = el('div');
  const armed = el('span', { class: 'tag' });
  const p = panel({ title: 'Scenarios and faults', right: armed, body: [host] });

  function render() {
    const { scenario, faults, result } = store.get();
    const set = sim.scenarios;
    clear(host);

    armed.textContent = faults.length
      ? `${faults.length} fault${faults.length > 1 ? 's' : ''} armed`
      : set.modes.find(m => m.id === scenario)?.name || '';
    armed.dataset.alarm = String(faults.length > 0);

    host.appendChild(el('div', { class: 'field', style: 'margin-bottom:8px' }, [
      el('label', { text: 'Operating mode' }),
      el('select', {
        'aria-label': 'Operating mode',
        onChange: e => store.set({ scenario: e.target.value, faults: e.target.value === 'fault' ? faults : [] })
      }, set.modes.map(m => el('option', { value: m.id, selected: m.id === scenario || null, text: m.name })))
    ]));
    host.appendChild(el('p', {
      style: 'margin:0 0 4px;font-size:var(--t-fine);color:var(--ink-ghost);line-height:1.5',
      text: set.modes.find(m => m.id === scenario)?.description || ''
    }));

    if (scenario === 'fault') {
      host.appendChild(el('h3', { class: 'sect', text: 'Introduce a problem' }));
      for (const f of set.faults) {
        const on = faults.includes(f.id);
        host.appendChild(el('label', { class: 'faultrow', dataset: { on: String(on) } }, [
          el('input', {
            type: 'checkbox', checked: on || null,
            'aria-label': f.name,
            onChange: e => store.set({ faults: e.target.checked ? [...faults, f.id] : faults.filter(x => x !== f.id) })
          }),
          el('span', {}, [
            el('span', { class: 'fname', text: f.name }),
            el('span', { class: 'fdesc', text: f.description })
          ])
        ]));
      }
      host.appendChild(el('p', {
        style: 'margin:8px 0 0;font-size:var(--t-fine);color:var(--ink-ghost);line-height:1.5',
        text: 'Arm a fault, run the plant, and read the instruments. What the fault is called is not what it looks like from the control room.'
      }));
    }

    if (set.challenges?.length) {
      host.appendChild(el('h3', { class: 'sect', text: 'Challenges' }));
      for (const c of set.challenges) {
        const g = gradeChallenge(c, result);
        const state = !g.graded ? 'idle' : g.pass ? 'pass' : 'fail';
        host.appendChild(el('div', { class: 'challenge', dataset: { state } }, [
          el('div', { class: 'ch-top' }, [
            el('span', { class: 'ch-mark', html: icon(state === 'pass' ? 'check' : state === 'fail' ? 'target' : 'cursor') }),
            el('span', { class: 'ch-title', text: c.title })
          ]),
          el('div', { class: 'ch-read', text: g.detail ?? g.text }),
          c.hint ? el('details', { class: 'ch-hint' }, [
            el('summary', { text: 'Hint' }),
            el('p', { text: c.hint })
          ]) : null
        ].filter(Boolean)));
      }
    }
  }

  store.subKeys(['scenario', 'faults', 'result'], render);
  return p;
}
