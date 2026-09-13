import { stamp } from './format.js';
const KEY = 'cevp.cases.v1';
export const CASE_FORMAT = 1;

export function buildCase({ simulatorId, modelVersion, inputs, scenario, level, notes = '' }) {
  return { format: CASE_FORMAT, simulator: simulatorId, modelVersion, inputs, scenario, level, notes, timestamp: stamp() };
}
export function listCases() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
export function saveCase(c, name) {
  const all = listCases();
  all.unshift({ id: `${c.simulator}-${Date.now()}`, name: name || `${c.simulator} ${c.timestamp}`, data: c });
  localStorage.setItem(KEY, JSON.stringify(all.slice(0, 50)));
  return all[0].id;
}
export function deleteCase(id) {
  localStorage.setItem(KEY, JSON.stringify(listCases().filter(c => c.id !== id)));
}
export function duplicateCase(id) {
  const src = listCases().find(c => c.id === id);
  if (!src) return null;
  return saveCase({ ...src.data, timestamp: stamp() }, `${src.name} (copy)`);
}
export function exportCase(c) {
  const blob = new Blob([JSON.stringify(c, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${c.simulator}-case-${Date.now()}.json`;
  a.click(); URL.revokeObjectURL(a.href);
}
// Reject foreign / future cases instead of loading half-valid inputs.
export function checkCase(c, simulatorId, modelVersion) {
  if (!c || c.format !== CASE_FORMAT) return 'Unrecognised case format.';
  if (c.simulator !== simulatorId) return `Case belongs to simulator "${c.simulator}", not "${simulatorId}".`;
  if (c.modelVersion !== modelVersion) return `Case was saved with model ${c.modelVersion}; current model is ${modelVersion}. Inputs loaded, results must be recalculated.`;
  return null;
}
