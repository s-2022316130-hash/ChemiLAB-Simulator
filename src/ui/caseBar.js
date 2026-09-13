import { el } from '../shared/dom.js';
import { buildCase, saveCase, listCases, exportCase, checkCase, duplicateCase } from '../shared/persistence.js';
export function createCaseBar(sim, store, runtime) {
  const sel = el('select', { style: 'max-width:180px' });
  function refresh() {
    sel.innerHTML = '';
    sel.appendChild(el('option', { value: '', text: 'Saved cases…' }));
    listCases().filter(c => c.data.simulator === sim.id).forEach(c => sel.appendChild(el('option', { value: c.id, text: c.name })));
  }
  refresh();
  sel.addEventListener('change', () => {
    const c = listCases().find(x => x.id === sel.value); if (!c) return;
    const problem = checkCase(c.data, sim.id, sim.engine.modelVersion);
    runtime.reset(c.data.inputs);
    store.set({ scenario: c.data.scenario, level: c.data.level, messages: problem ? [{ level: 'warning', text: problem }] : [] });
  });
  const snapshot = () => buildCase({
    simulatorId: sim.id, modelVersion: sim.engine.modelVersion,
    inputs: store.get().inputs, scenario: store.get().scenario, level: store.get().level
  });
  return el('div', { class: 'btnrow', style: 'align-items:center' }, [
    sel,
    el('button', { class: 'btn', text: 'Save case', onClick: () => { saveCase(snapshot(), prompt('Case name') || undefined); refresh(); } }),
    el('button', { class: 'btn', text: 'Duplicate', onClick: () => { if (sel.value) { duplicateCase(sel.value); refresh(); } } }),
    el('button', { class: 'btn', text: 'Export JSON', onClick: () => exportCase(snapshot()) })
  ]);
}
