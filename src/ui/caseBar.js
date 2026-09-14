import { el } from '../shared/dom.js';
import { buildCase, saveCase, listCases, exportCase, checkCase, duplicateCase } from '../shared/persistence.js';
import { icon } from '../shared/icons.js';

/**
 * Saved cases: a named set of inputs, the scenario they were run under and the
 * detail level, with the model version they were saved against.
 *
 * Loading a case from a different model version is allowed but reported: the
 * inputs are still meaningful, the results are not, and saying so is better
 * than refusing or than pretending nothing changed.
 */
export function createCaseBar(sim, store, runtime) {
  const sel = el('select', { class: 'casesel', 'aria-label': 'Saved cases' });
  const note = el('div', {
    style: 'margin-top:7px;font-size:var(--t-fine);color:var(--ink-ghost);line-height:1.45'
  });

  function refresh() {
    const mine = listCases().filter(c => c.data.simulator === sim.id);
    sel.innerHTML = '';
    sel.appendChild(el('option', { value: '', text: mine.length ? 'Saved cases…' : 'No saved cases' }));
    mine.forEach(c => sel.appendChild(el('option', { value: c.id, text: c.name })));
    sel.disabled = !mine.length;
    note.textContent = mine.length
      ? `${mine.length} case${mine.length > 1 ? 's' : ''} saved in this browser.`
      : 'Save the current inputs to come back to them later. Cases live in this browser only.';
  }
  refresh();

  sel.addEventListener('change', () => {
    const c = listCases().find(x => x.id === sel.value);
    if (!c) return;
    const problem = checkCase(c.data, sim.id, sim.engine.modelVersion);
    runtime.reset(c.data.inputs);
    store.set({
      scenario: c.data.scenario, level: c.data.level, dirty: false,
      messages: problem ? [{ level: 'warning', text: problem }] : []
    });
  });

  const snapshot = () => buildCase({
    simulatorId: sim.id, modelVersion: sim.engine.modelVersion,
    inputs: store.get().inputs, scenario: store.get().scenario, level: store.get().level
  });

  const say = text => { note.textContent = text; };

  return el('div', {}, [
    sel,
    el('div', { class: 'btnrow', style: 'margin-top:8px' }, [
      el('button', {
        class: 'btn', html: `${icon('save')} Save`, title: 'Save the current inputs as a named case',
        onClick: () => {
          const name = prompt('Case name') || undefined;
          // Storage is not always there to be written to. A failure is reported
          // rather than swallowed, and it points at the route that always works.
          if (saveCase(snapshot(), name)) refresh();
          else say('This browser is not keeping storage for this page, so the case was not saved. Export JSON instead — that always works.');
        }
      }),
      el('button', {
        class: 'btn', html: `${icon('layers')} Duplicate`, title: 'Copy the selected case',
        onClick: () => { if (sel.value) { duplicateCase(sel.value); refresh(); } }
      }),
      el('button', {
        class: 'btn', html: `${icon('download')} JSON`, title: 'Download the current case as a JSON file',
        onClick: () => exportCase(snapshot())
      })
    ]),
    note
  ]);
}
