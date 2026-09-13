/**
 * 01 — WATER TREATMENT PLANT — scenarios, faults and challenges.
 *
 * Declaration only. How a fault propagates is decided in engine.js, which is
 * handed the active fault ids by the runtime; nothing here touches physics.
 * The ids are imported from the engine so a renamed fault cannot silently
 * become a fault that does nothing.
 *
 * `expectedSymptoms` is what an operator would observe, in the order they
 * would notice it. It is deliberately not a statement of the cause: diagnosing
 * that from the symptoms is the exercise.
 */
import { createScenarioSet } from '../../simulation/scenarios.js';
import { TAGS, FAULT_IDS } from './engine.js';

// The engine owns fault propagation. This identity transform exists so that the
// shared applyFaults helper, if it is ever used, cannot double-apply a fault.
const engineOwned = inputs => inputs;

export const FAULTS = [
  {
    id: 'coagulant-underdose', name: 'Coagulant underdose', appliesTo: TAGS.coagDosing,
    description: 'The alum metering pump is delivering well below its set point.',
    apply: engineOwned,
    expectedSymptoms: [
      'Settled water turbidity rises well above the 1–5 NTU a clarifier should deliver.',
      'Floc looks small and will not settle in a jar test.',
      'Filtered water turbidity climbs above the 0.30 NTU limit.',
      'Filter runs shorten, because the filter is holding solids the clarifier should have removed.',
      'Total Giardia reduction collapses, because losing the turbidity limit also loses the filtration credit.'
    ]
  },
  {
    id: 'turbidity-spike', name: 'Raw water turbidity spike', appliesTo: TAGS.intakePump,
    description: 'Storm runoff has raised the river turbidity sharply while the dose has stayed where it was.',
    apply: engineOwned,
    expectedSymptoms: [
      'Raw turbidity is far above normal while the dose is unchanged, so the dose ratio falls.',
      'Settled and filtered turbidity both rise.',
      'Filter run length drops steeply as the solids load multiplies.',
      'Chlorine demand rises with the extra organic load and the residual may disappear entirely.',
      'Water recovery falls, because more of the product is being spent on washing filters.'
    ]
  },
  {
    id: 'blocked-filter', name: 'Blinded filter media', appliesTo: TAGS.filters,
    description: 'Mudballs and surface blinding from inadequate backwashing have fouled the bed.',
    apply: engineOwned,
    expectedSymptoms: [
      'Clean-bed headloss is far higher than normal at the same filtration rate.',
      'Run length is much shorter, because less headloss is available before the backwash trigger.',
      'Filtered turbidity rises as the flow channels through the bed instead of passing through it evenly.',
      'The pathogen removal credit steps down as soon as the filtrate passes 0.30 NTU.',
      'At a high enough rate or a low enough temperature the filter has no usable headloss at all and the plant has no operable state.'
    ]
  },
  {
    id: 'pump-failure', name: 'Intake pump trip', appliesTo: TAGS.intakePump,
    description: 'The duty intake pump has tripped and the standby has not picked up.',
    apply: engineOwned,
    expectedSymptoms: [
      'No flow anywhere in the works.',
      'Every calculated process value is blank rather than held at its last value.',
      'No stream animates in either view, because the engine reports zero flow on all of them.',
      'P-101 shows a trip, and the alarm is at the pump rather than downstream.'
    ]
  },
  {
    id: 'short-circuiting', name: 'Basin short-circuiting', appliesTo: TAGS.clarifier,
    description: 'A damaged baffle is letting flow reach the launders without crossing the settling zone, and the contact tank is affected the same way.',
    apply: engineOwned,
    expectedSymptoms: [
      'Settled turbidity is high even though the overflow rate and the floc quality are both normal.',
      'The basin reports far fewer equivalent mixed cells than its design value.',
      'Effective contact time t₁₀ is a small fraction of the nominal detention time.',
      'CT and the log inactivation fall without the chlorine residual having changed at all.'
    ]
  },
  {
    id: 'chlorine-dosing-failure', name: 'Chlorine dosing failure', appliesTo: TAGS.chlorineDosing,
    description: 'The hypochlorite metering pump has stopped delivering.',
    apply: engineOwned,
    expectedSymptoms: [
      'No free chlorine residual leaving the clearwell.',
      'CT is zero, so no inactivation credit can be claimed however long the contact tank is.',
      'Total Giardia reduction falls back to the filtration credit alone and misses the 3-log target.',
      'Turbidity and every upstream result are completely normal, which is what points at the dosing skid.'
    ]
  }
];

// Targets are engine result keys. gradeChallenge reads the calculated value, so a
// challenge cannot be passed by a field that was never computed.
export const CHALLENGES = [
  {
    id: 'meet-turbidity',
    title: 'Meet the finished water turbidity limit',
    target: { key: 'turbidityFiltered', op: '<=', value: 0.30, unit: 'NTU' },
    hint: 'The filter multiplies the quality it is given, so start upstream. Check the dose against the correlated optimum and the coagulation pH before touching the filtration rate.'
  },
  {
    id: 'hit-ct',
    title: 'Hit the 3-log Giardia target',
    target: { key: 'giardiaTotal', op: '>=', value: 3.0, unit: 'log' },
    hint: 'Two and a half of the three logs are credited to filtration, but only while the filtrate stays at or below 0.30 NTU. Fix the turbidity first, then top up with residual or contact time. Remember that cold water needs considerably more CT.'
  },
  {
    id: 'minimise-coagulant',
    title: 'Minimise alum consumption',
    target: { key: 'alumRate', op: '<=', value: 22, unit: 'kg/h' },
    hint: 'Only worth claiming while the finished water still meets 0.30 NTU — check that challenge at the same time. Coagulation pH inside the 6.0–7.8 band buys more removal than extra dose does, and gentler flocculation for longer costs nothing in chemical.'
  }
];

export const SCENARIOS = createScenarioSet(FAULTS, CHALLENGES);

// Guard: a declared fault that the engine does not implement would be a control
// the student can switch on that quietly does nothing.
for (const f of FAULTS) {
  if (!FAULT_IDS.includes(f.id)) throw new Error(`Scenario "${f.id}" is not a fault the water treatment engine implements.`);
}

export default SCENARIOS;
