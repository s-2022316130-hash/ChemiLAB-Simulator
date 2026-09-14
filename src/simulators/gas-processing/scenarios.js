/**
 * 05 — NATURAL GAS PROCESSING PLANT — scenarios, faults and challenges.
 *
 * Declaration only. How a fault propagates is decided in engine.js, which is
 * handed the active fault ids by the runtime; nothing here touches physics.
 * The ids are imported from the engine so a renamed fault cannot silently
 * become a fault that does nothing.
 *
 * `expectedSymptoms` is what a control room would see, in the order it would
 * see it. It is deliberately not a statement of the cause: working that out
 * from the symptoms is the exercise.
 */
import { createScenarioSet } from '../../simulation/scenarios.js';
import { TAGS, FAULT_IDS } from './engine.js';

// The engine owns fault propagation. This identity transform exists so that the
// shared applyFaults helper, if it is ever used, cannot double-apply a fault.
const engineOwned = inputs => inputs;

export const FAULTS = [
  {
    id: 'amine-foaming', name: 'Amine contactor foaming', appliesTo: TAGS.amineContactor,
    description: 'The solution is foaming, so a fraction of the gas is getting past the trays without being contacted.',
    apply: engineOwned,
    expectedSymptoms: [
      'Hydrogen sulphide in the treated gas jumps by an order of magnitude and goes straight through the pipeline specification.',
      'The liquid product goes off specification with it, and by more — hydrogen sulphide is far more soluble in a cold liquid than in methane.',
      'Circulation, lean loading, temperatures and the tray count all read exactly where they should be. Nothing in the numbers says why.',
      'Rich loading comes back slightly low, because the amine met less acid gas than it should have.'
    ]
  },
  {
    id: 'lean-amine-hot', name: 'Lean amine returning hot', appliesTo: TAGS.leanRichExchanger,
    description: 'The lean amine cooler has lost duty, so the solution is arriving at the contactor far above design.',
    apply: engineOwned,
    expectedSymptoms: [
      'Treated gas hydrogen sulphide rises several-fold, and the liquid product with it.',
      'The floor the lean amine sets rises exponentially with its temperature — so this is not a contacting problem and no amount of circulation fixes it.',
      'Carbon dioxide slips more as well, which looks like better selectivity and is not.',
      'The contactor is warmer than usual at the top, which is the only instrument that points at the cause.'
    ]
  },
  {
    id: 'glycol-contaminated', name: 'Lean glycol off purity', appliesTo: TAGS.glycolRegenerator,
    description: 'The regenerator is not stripping the glycol back to purity, so it returns to the contactor wet.',
    apply: engineOwned,
    expectedSymptoms: [
      'Water in the dry gas roughly trebles and goes through the pipeline specification.',
      'The dew point rises with it, and if there is a cold section downstream the exchanger starts to ice.',
      'Glycol circulation reads normal. Lean purity is the number that sets the floor a contactor can reach; circulation only decides how close it gets.',
      'Nothing about the gas side changed at all.'
    ]
  },
  {
    id: 'expander-trip', name: 'Turboexpander tripped', appliesTo: TAGS.expander,
    description: 'The machine has tripped and the Joule–Thomson valve across it has taken the flow.',
    apply: engineOwned,
    expectedSymptoms: [
      'The cold end warms by twenty degrees or more in minutes, and liquid production collapses with it.',
      'Ethane recovery falls to almost nothing while propane and heavier hold up better — the lighter the component, the more the temperature mattered.',
      'The residue compressor gets harder, not easier: there is more gas going through it because so little condensed.',
      'The same pressure is still being thrown away. None of it is coming back as shaft work any more.'
    ]
  },
  {
    id: 'fouled-cold-box', name: 'Cold box fouled', appliesTo: TAGS.coldBox,
    description: 'The gas/gas exchanger has lost duty, so the gas reaches the expander far warmer than it should.',
    apply: engineOwned,
    expectedSymptoms: [
      'The expander inlet is twenty degrees warm, so its outlet is too, and the cold separator makes much less liquid.',
      'Ethane recovery halves. Propane and heavier fall less, because they were going to condense anyway.',
      'Everything about the expander itself is normal: speed, efficiency and the pressure ratio are all where they were.',
      'On a plant fed by a glycol unit this fault hides the hydrate risk rather than causing it, because the warmer box is further from the dew point.'
    ]
  },
  {
    id: 'high-feed-co2', name: 'Carbon dioxide breakthrough', appliesTo: TAGS.inletSeparator,
    description: 'The field has begun producing far more carbon dioxide than the plant was designed around.',
    apply: engineOwned,
    expectedSymptoms: [
      'Carbon dioxide in the sales gas climbs towards and through the two per cent specification.',
      'Rich amine loading rises sharply, and with it the risk of corroding the rich line and the exchanger.',
      'The reboiler gets heavier, because there is more acid gas to drive off.',
      'Hydrogen sulphide is barely affected, which is the amine doing exactly what it was chosen to do.'
    ]
  }
];

// Targets are engine result keys. gradeChallenge reads the calculated value, so a
// challenge cannot be passed by a field that was never computed.
export const CHALLENGES = [
  {
    id: 'meet-recovery',
    title: 'Recover 60 % of the ethane',
    target: { key: 'recoveryC2', op: '>=', value: 60, unit: '%' },
    hint: 'Ethane recovery is decided almost entirely by how cold the expander outlet gets, and that follows the cold box. Going colder is free in principle — the expander is already there — but the gas has to be dry enough to survive it, which is a different unit entirely.'
  },
  {
    id: 'no-hydrates',
    title: 'Keep five degrees of margin between the cold box and the water dew point',
    target: { key: 'freezeMargin', op: '>=', value: 5, unit: 'K' },
    hint: 'A glycol contactor cannot dry below the equilibrium set by its lean glycol, so purity is the floor and circulation only decides how close the column gets to it. Trays help too, up to about four — beyond that a contactor stops behaving like one.'
  },
  {
    id: 'cut-reboiler',
    title: 'Bring the amine reboiler below 18 MW',
    target: { key: 'reboilerDuty', op: '<=', value: 18, unit: 'MW' },
    hint: 'Most of that duty is stripping steam, and stripping steam follows circulation rather than acid gas load. Circulate less and it falls almost proportionally — but watch two things on the way down: the rich loading against the corrosion limit, and the carbon dioxide, which this amine only slips while there is not enough solution to take it.'
  }
];

export const SCENARIOS = createScenarioSet(FAULTS, CHALLENGES);

// Guard: a declared fault that the engine does not implement would be a control
// the student can switch on that quietly does nothing.
for (const f of FAULTS) {
  if (!FAULT_IDS.includes(f.id)) throw new Error(`Scenario "${f.id}" is not a fault the gas-processing engine implements.`);
}

export default SCENARIOS;
