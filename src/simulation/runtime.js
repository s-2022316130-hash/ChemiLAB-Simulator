import { Status, emptyResult } from './contract.js';
/**
 * Runs an engine on behalf of the UI and owns the status lifecycle.
 * Invalid input or a failed run clears the previous result — stale numbers are
 * never left on screen as if they belonged to the new case.
 */
export function createRuntime(engine, store) {
  let token = 0;
  async function run() {
    const { inputs, scenario, faults } = store.get();
    const v = engine.validate(inputs);
    if (!v.ok) {
      store.set({ status: Status.ERROR, result: emptyResult('Invalid input'), errors: v.errors,
        messages: Object.values(v.errors).map(text => ({ level: 'error', text })) });
      return null;
    }
    const my = ++token;
    store.set({ status: Status.CALCULATING, errors: {}, messages: [] });
    await new Promise(r => setTimeout(r, 0)); // yield so the UI can paint CALCULATING
    let result;
    try {
      result = engine.run(inputs, { scenario, faults });
    } catch (err) {
      if (my !== token) return null;
      store.set({ status: Status.ERROR, result: emptyResult('Calculation failed'),
        messages: [{ level: 'error', text: `Calculation failed: ${err.message}` }] });
      return null;
    }
    if (my !== token) return null; // superseded by a newer run
    const messages = [...(result.messages || []), ...engine.getDiagnostics(result)];
    const status = result.status ?? (result.converged
      ? (messages.some(m => m.level === 'warning') ? Status.WARNING : Status.COMPLETE)
      : Status.ERROR);
    store.set({ status, result: { ...result, messages }, messages });
    return result;
  }
  function reset(inputs) {
    token++;
    store.set({ inputs, errors: {}, messages: [], status: Status.READY, result: engine.getInitialState(inputs) });
  }
  return { run, reset, engine };
}
