/**
 * Water treatment engine — SKELETON ONLY.
 * Fill this in when building Simulator 01. Rules that apply:
 *  - every returned number is computed here, never in the UI;
 *  - anything not calculated stays null so the UI prints an em dash;
 *  - `converged` is only true when the solver actually met tolerance;
 *  - every correlation is declared in `assumptions` with its KIND.
 */
import { KIND, Status, emptyResult } from '../../simulation/contract.js';
import { rules } from '../../shared/validation.js';
import { U } from '../../shared/units.js';

export const inputSpec = {
  feedFlow: { label: 'Raw water flow', unit: U.volFlow, min: 50, max: 5000, step: 10, default: 1000, group: 'Feed', level: 'student', rules: [rules.required(), rules.positive('Flow')] },
  turbidityIn: { label: 'Raw water turbidity', unit: U.turbidity, min: 1, max: 500, step: 1, default: 25, group: 'Feed', level: 'student', rules: [rules.required(), rules.positive('Turbidity')] },
  coagulantDose: { label: 'Coagulant dose', unit: U.conc, min: 0, max: 120, step: 1, default: 30, group: 'Coagulation', level: 'student', rules: [rules.required(), rules.nonNegative('Dose')] }
  // TODO: pH, alkalinity, temperature, G value, basin volumes, filtration rate, chlorine dose…
};
export const assumptions = [
  { text: 'Steady-state operation; no storage dynamics in any basin.', kind: KIND.APPROX },
  { text: 'Turbidity removal is correlated against dose and overflow rate rather than modelled from particle kinetics.', kind: KIND.CORR },
  { text: 'Basin geometry and design overflow rates are teaching values, not a specific real plant.', kind: KIND.REF }
];
export const equations = [
  // { what, why, equation, inputs:[], units, interpretation }
];
export default {
  id: 'water-treatment',
  modelVersion: '0.0.0-skeleton',
  inputSpec, assumptions, equations,
  validate() { throw new Error('Water treatment model not implemented yet.'); },
  getInitialState() { return emptyResult(); },
  run() { throw new Error('Water treatment model not implemented yet.'); },
  getDiagnostics() { return []; },
  getEquipmentState() { return {}; },
  getStreams() { return []; },
  getSteps() { return []; },
  Status
};
