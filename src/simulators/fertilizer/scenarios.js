/**
 * 03 — AMMONIA–UREA FERTILIZER PLANT — scenarios, faults and challenges.
 *
 * Declaration only. How a fault propagates is decided in engine.js, which is
 * handed the active fault ids by the runtime; nothing here touches physics.
 * The ids are imported from the engine so a renamed fault cannot silently
 * become a fault that does nothing.
 *
 * `expectedSymptoms` is what an operator would observe, in the order they would
 * notice it. It is deliberately not a statement of the cause: working that out
 * from the symptoms is the exercise.
 */
import { createScenarioSet } from '../../simulation/scenarios.js';
import { TAGS, FAULT_IDS } from './engine.js';

// The engine owns fault propagation. This identity transform exists so that the
// shared applyFaults helper, if it is ever used, cannot double-apply a fault.
const engineOwned = inputs => inputs;

export const FAULTS = [
  {
    id: 'compressor-trip', name: 'Recycle compressor trip', appliesTo: TAGS.recycleComp,
    description: 'The synthesis loop recycle compressor has stopped.',
    apply: engineOwned,
    expectedSymptoms: [
      'Ammonia production falls to roughly a third: the loop is running once-through on makeup gas alone.',
      'Loop inerts collapse to the makeup level, because nothing is going round to accumulate them.',
      'Per-pass conversion actually rises, which looks like good news and is not — the converter is seeing fresh gas with no ammonia in it.',
      'Almost all the hydrogen and nitrogen fed is leaving unreacted.',
      'This is the fault that shows most clearly what the recycle is worth.'
    ]
  },
  {
    id: 'low-loop-pressure', name: 'Low synthesis loop pressure', appliesTo: TAGS.converter,
    description: 'The loop is running well below its normal operating pressure.',
    apply: engineOwned,
    expectedSymptoms: [
      'Per-pass conversion drops sharply: the reaction loses moles, so pressure is what drives it.',
      'Ammonia at the converter outlet falls with it.',
      'The separator recovers a smaller fraction, because it is the ratio of vapour pressure to loop pressure that sets what stays in the gas.',
      'Ammonia production falls, but less than the per-pass figure alone would suggest — the recycle absorbs part of it.'
    ]
  },
  {
    id: 'catalyst-deactivation', name: 'Catalyst deactivation', appliesTo: TAGS.converter,
    description: 'The synthesis catalyst has aged or been poisoned.',
    apply: engineOwned,
    expectedSymptoms: [
      'The approach to equilibrium collapses while the equilibrium itself is unchanged. That distinction is the diagnosis.',
      'Ammonia at the converter outlet falls to a third of normal.',
      'Loop inerts fall as well, because less ammonia condensing out means more gas leaving as purge for the same purge setting.',
      'Temperature and pressure are both exactly where they were set, which rules out the operating conditions.'
    ]
  },
  {
    id: 'recycle-failure', name: 'Carbamate recycle failure', appliesTo: TAGS.carbamateCondenser,
    description: 'The carbamate condenser is returning far less than it should.',
    apply: engineOwned,
    expectedSymptoms: [
      'Overall carbon dioxide conversion falls steeply while the per-pass figure barely moves.',
      'That gap between the two is the whole diagnosis: the reactor is fine and the recovery is not.',
      'Urea production falls in proportion.',
      'It shows how much of the plant output depends on the recycle rather than on the reactor.'
    ]
  },
  {
    id: 'inert-buildup', name: 'Purge valve throttled', appliesTo: TAGS.purgeRecovery,
    description: 'The purge has been cut back hard, so inerts are accumulating in the loop.',
    apply: engineOwned,
    expectedSymptoms: [
      'Loop inerts climb to several times normal.',
      'Hydrogen and nitrogen partial pressures fall with them, so conversion falls even though nothing about the converter has changed.',
      'Ammonia at the converter outlet drops well below the normal band.',
      'Ammonia production may even rise slightly at first, because less hydrogen is leaving with the purge — which is exactly the trap the fault is built to show.'
    ]
  },
  {
    id: 'high-reactor-water', name: 'Water carryover to the urea reactor', appliesTo: TAGS.ureaReactor,
    description: 'The recycle is returning more water to the reactor than it should.',
    apply: engineOwned,
    expectedSymptoms: [
      'The water to carbon dioxide ratio in the reactor rises well above normal.',
      'Equilibrium conversion falls, because water is the product of the dehydration step and also inhibits it.',
      'Per-pass and overall conversion both drop, with the ammonia side completely unaffected.',
      'Nothing on the loop side has changed, which places the fault firmly in the urea recycle.'
    ]
  }
];

// Targets are engine result keys. gradeChallenge reads the calculated value, so a
// challenge cannot be passed by a field that was never computed.
export const CHALLENGES = [
  {
    id: 'meet-nitrogen',
    title: 'Meet the 46.0 wt % nitrogen specification',
    target: { key: 'nitrogen', op: '>=', value: 46.0, unit: 'wt %' },
    hint: 'Pure urea is 46.65 %, so biuret and moisture together have almost no room. Biuret comes from the evaporator rather than the reactor, and moisture from a melt that is too dilute or a tower that is too short for the day.'
  },
  {
    id: 'hold-inerts',
    title: 'Hold loop inerts below 10 %',
    target: { key: 'inertLoop', op: '<=', value: 10, unit: '%' },
    hint: 'The purge alone sets this, because inerts leave the loop nowhere else. But every mole purged takes hydrogen with it, so watch the ammonia production while you open it up — the cheaper answer may be cleaner makeup gas.'
  },
  {
    id: 'push-conversion',
    title: 'Push overall CO₂ conversion above 96 %',
    target: { key: 'ureaOverall', op: '>=', value: 96, unit: '%' },
    hint: 'Look at the recycle relation before touching the reactor: at a given carbamate recovery there is a ceiling the per-pass conversion cannot lift you past. Excess ammonia and the right temperature help the reactor; recovery raises the ceiling itself.'
  }
];

export const SCENARIOS = createScenarioSet(FAULTS, CHALLENGES);

// Guard: a declared fault that the engine does not implement would be a control
// the student can switch on that quietly does nothing.
for (const f of FAULTS) {
  if (!FAULT_IDS.includes(f.id)) throw new Error(`Scenario "${f.id}" is not a fault the fertilizer engine implements.`);
}

export default SCENARIOS;
