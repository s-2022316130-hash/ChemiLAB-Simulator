/**
 * ENGINE CONTRACT — every simulator implements this and nothing else talks physics.
 * The UI must never compute or invent a process value.
 *
 * interface SimulationEngine {
 *   id: string
 *   modelVersion: string
 *   inputSpec: Record<key, {label, unit, min, max, step, default, level, group, rules[]}>
 *   assumptions: Assumption[]          // see ASSUMPTION_KIND
 *   equations: EquationDoc[]           // what / why / equation / inputs / units / interpretation
 *   validate(inputs) -> {ok, errors}
 *   getInitialState(inputs) -> Result  // all calculated fields null, status READY
 *   run(inputs, {scenario, faults}) -> Result
 *   getDiagnostics(result) -> Message[]
 *   getEquipmentState(result) -> Record<tag, {state, duty?, load?, alarm?, values{}}>
 *   getStreams(result) -> Stream[]
 *   getSteps(result) -> CalcStep[]     // "show calculation" trace, engineering level
 * }
 *
 * Result = {
 *   status: Status, converged: boolean, iterations: number|null, residual: number|null,
 *   kpis[], results{}, massBalance{}, energyBalance{}, quality{}, messages[], streams[], equipment{}
 * }
 */
export const Status = Object.freeze({
  READY: 'READY', CALCULATING: 'CALCULATING', CONVERGING: 'CONVERGING',
  COMPLETE: 'COMPLETE', WARNING: 'WARNING', ERROR: 'ERROR'
});
// Provenance of every number shown on screen.
export const KIND = Object.freeze({
  USER: 'User input',
  CALC: 'Calculated value',
  FIRST: 'First-principles calculation',
  CORR: 'Engineering correlation',
  APPROX: 'Educational approximation',
  REF: 'Educational reference value'
});
export const LEVEL = Object.freeze({ STUDENT: 'student', ENGINEER: 'engineer', EXPERT: 'expert' });
export const LEVEL_ORDER = ['student', 'engineer', 'expert'];
export const visibleAt = (itemLevel = 'student', userLevel = 'student') =>
  LEVEL_ORDER.indexOf(userLevel) >= LEVEL_ORDER.indexOf(itemLevel);

export function emptyResult(reason = 'Not calculated') {
  return {
    status: Status.READY, converged: false, iterations: null, residual: null, reason,
    kpis: [], results: {}, massBalance: {}, energyBalance: {}, quality: {},
    messages: [], streams: [], equipment: {}, steps: []
  };
}
// Guard: a module claiming to be an engine must expose the full contract.
export function assertEngine(e) {
  for (const m of ['id', 'modelVersion', 'inputSpec', 'validate', 'run', 'getInitialState',
    'getDiagnostics', 'getEquipmentState', 'getStreams']) {
    if (e[m] === undefined) throw new Error(`Engine "${e.id || '?'}" is missing "${m}" from the engine contract.`);
  }
  return e;
}
