import { el, clear } from '../shared/dom.js';
import { panel } from '../shared/components/panel.js';
import { val, isEmpty } from '../shared/format.js';
import { Status } from '../simulation/contract.js';

/**
 * Run history — the runs made this session, newest first.
 *
 * A saved case is something you decided to keep. A run is something you did,
 * and most of the useful ones are never saved: you nudge a temperature, run,
 * nudge it back, run again, and by the fourth attempt the second one is gone.
 * This keeps them, so a comparison nobody planned to make is still available.
 *
 * Clicking a row puts its inputs back into the panel. It deliberately does not
 * re-run. The result on the rail goes on belonging to the run that produced it
 * until someone presses the button — the same rule the rest of this interface
 * holds to, and the reason `dirty` exists.
 *
 * It lives in memory only. A session's worth of nudging does not deserve to
 * outlive the tab, and saved cases already exist for anything that does.
 */
const LIMIT = 12;

export function createRunHistory(sim, store, runtime) {
  const host = el('div');
  const chip = el('span', { class: 'tag' });
  const p = panel({ title: 'Run history', right: chip, body: [host] });

  let runs = [];
  let lastStamp = null;

  /** The headline figure of a run, so the list can be scanned by outcome. */
  function leadOf(result) {
    const k = result?.kpis?.[0];
    if (!k || isEmpty(k.value)) return '';
    return val(k.value, k.unit, k.digits ?? 2);
  }

  function conditionsOf(s) {
    const mode = sim.scenarios?.modes?.find(m => m.id === s.scenario)?.name || s.scenario;
    const n = s.faults?.length || 0;
    const faults = n ? `${n} fault${n > 1 ? 's' : ''}` : null;
    return [mode, faults].filter(Boolean).join(' · ');
  }

  function render() {
    clear(host);
    chip.textContent = runs.length ? `${runs.length} run${runs.length > 1 ? 's' : ''}` : '';
    if (!runs.length) {
      host.appendChild(el('p', {
        class: 'fallback',
        text: 'Every run this session lands here. Click one to put its inputs back into the panel.'
      }));
      return;
    }
    for (const r of runs) {
      host.appendChild(el('button', {
        class: 'runrow', dataset: { s: r.status },
        title: 'Load these inputs back into the control panel',
        onClick: () => {
          runtime.reset({ ...r.inputs });
          store.set({ scenario: r.scenario, faults: [...r.faults], level: r.level, dirty: false });
        }
      }, [
        el('span', { class: 'rh-time', text: r.at }),
        el('span', { class: 'rh-what' }, [
          el('b', { text: r.conditions || 'Base case' }),
          el('span', { text: r.note })
        ]),
        el('span', { class: 'rh-lead', text: r.lead })
      ]));
    }
  }
  render();

  // Recorded when the status settles rather than when the button is pressed: a
  // run superseded before it finished never happened, and an invalid one has no
  // inputs worth coming back to.
  store.subKeys(['status', 'result'], s => {
    if (s.status !== Status.COMPLETE && s.status !== Status.WARNING) return;
    const stamp = [s.status, JSON.stringify(s.inputs), s.scenario, s.faults.join(','), s.result?.solveMs].join('|');
    if (stamp === lastStamp) return;
    lastStamp = stamp;
    const ms = s.result?.solveMs;
    runs = [{
      at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      status: s.status,
      inputs: { ...s.inputs },
      scenario: s.scenario,
      faults: [...s.faults],
      level: s.level,
      conditions: conditionsOf(s),
      note: isEmpty(ms) ? 'solved' : `solved in ${ms < 10 ? ms.toFixed(2) : Math.round(ms)} ms`,
      lead: leadOf(s.result)
    }, ...runs].slice(0, LIMIT);
    render();
  });

  return p;
}
