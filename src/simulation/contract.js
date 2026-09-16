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
 *   kpis[], results{}, massBalance{}, energyBalance{}, quality{}, messages[], streams[], equipment{},
 *   convergence: Trace[]
 * }
 *
 * ---------------------------------------------------------------------------
 * Trace — how a solve got where it got.
 *
 *   { id, label, what, tol, history: number[], converged, iterations, residual }
 *
 * `converged: true` and a residual are the verdict. The trace is the working.
 * They answer different questions: the verdict says whether to believe the
 * numbers, the trace says whether the model is well posed — a residual that
 * falls like a stone and a residual that crawls across eighty sweeps to land
 * just inside tolerance are both "converged", and they are not the same plant.
 *
 * `history` is the residual after each iteration the solver actually took, in
 * whatever measure that solver uses; `what` is the engine saying what that
 * measure physically is, because the solver cannot know. `tol` is carried
 * explicitly rather than read back off the solve: a solver is not obliged to
 * remember what it was asked for, and a tolerance line drawn from a guess is
 * worse than no line. Build one with `trace()` in solver.js.
 *
 * A run with no iterative solve returns an empty array. "Solved directly" is a
 * real answer and better than an empty chart.
 *
 * ---------------------------------------------------------------------------
 * Equipment `metrics` — numbers, beside `values`, which are strings.
 *
 *   getEquipmentState(result)[tag] = { state, alarm, duty?, load?, level?,
 *                                      values: {label: '62.4 °C'},   // to read
 *                                      metrics: {tempC: 62.4} }      // to compare
 *
 * The two are not redundant. `values` is formatted for a human and carries its
 * unit inside the string; `metrics` is a raw number a legend can scale, a ramp
 * can colour and two units can be compared by. Parsing a number back out of a
 * display string would be the UI deriving a process value, which it may not do
 * — so the engine publishes both, or the feature does without.
 *
 * `metrics` is optional and every key in it is nullable: a unit with no
 * temperature reports null and shades as "no reading", never as zero.
 *
 * ---------------------------------------------------------------------------
 * engine.colourModes — optional. How this plant may be shaded, declared by the
 * only layer entitled to decide.
 *
 *   { id, label, what, kind, metric?, unit?, domain?: [lo, hi], digits? }
 *
 *   kind 'scale'   `metric` names a key in equipment `metrics`; `domain` is the
 *                  reading range the ramp spans. The domain is an engine
 *                  declaration in the spirit of KIND.REF — the design range of
 *                  the plant, not something measured — so it stays put between
 *                  runs and two runs can be compared by eye. A UI that picked
 *                  its own domain from the data would make every plant look
 *                  equally hot.
 *   kind 'state'   shades by the equipment state already reported. No new data.
 *
 * ---------------------------------------------------------------------------
 * Balance entries may carry, beyond {label, value, unit, digits, kind}:
 *
 *   side    'in' | 'out' | 'closure' | 'total' | 'context'
 *   family  entries that sum together share one, e.g. 'water' and 'solids' are
 *           two balances living in one object
 *   phase   the phase word of the matching stream, for the colour chip
 *   share   this entry as a fraction of its family's basis, 0..1
 *
 * `share` is computed in the engine. A percentage of a basis is a process
 * quantity like any other, and the rule is the rule.
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
    messages: [], streams: [], equipment: {}, steps: [], convergence: []
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
