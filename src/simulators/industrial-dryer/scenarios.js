/**
 * 02 — INDUSTRIAL DRYER — scenarios, faults and challenges.
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
    id: 'low-air-flow', name: 'Supply air flow low', appliesTo: TAGS.supplyFan,
    description: 'The supply fan is delivering well under its set point.',
    apply: engineOwned,
    expectedSymptoms: [
      'Product moisture well above target.',
      'Exhaust temperature much lower than normal and the relative humidity much higher — the air is leaving loaded rather than hot.',
      'Thermal efficiency barely changes, which is the clue that this is not a heat problem.',
      'Residence time actually lengthens, because less gas means less drag on the solids.',
      'Dust carryover falls at the same time, for the same reason.'
    ]
  },
  {
    id: 'insufficient-heating', name: 'Heater underfiring', appliesTo: TAGS.heater,
    description: 'The burner is not reaching its outlet temperature set point.',
    apply: engineOwned,
    expectedSymptoms: [
      'Product moisture above target.',
      'Both the drum inlet and the exhaust temperature are low.',
      'The log-mean temperature difference collapses, so the heat the drum can transfer falls with it.',
      'Exhaust relative humidity rises, but not as far as it does on a low air flow.',
      'Residence time and drum loading are completely normal, which rules the mechanical side out.'
    ]
  },
  {
    id: 'wet-feed-surge', name: 'Wet feed surge', appliesTo: TAGS.feedHopper,
    description: 'More feed arriving, and wetter than normal, with no setting changed to match.',
    apply: engineOwned,
    expectedSymptoms: [
      'Product moisture sharply above target — the worst of the six for product quality.',
      'Drum loading rises and the residence time changes as the gas-to-solids ratio falls.',
      'Exhaust temperature falls as the extra water absorbs the heat that was drying the original load.',
      'The air and the drum are both behaving exactly as set, which points upstream rather than at the dryer.',
      'Everything recovers on its own once the surge passes, which is what distinguishes it from an equipment fault.'
    ]
  },
  {
    id: 'high-ambient-humidity', name: 'High ambient humidity', appliesTo: TAGS.supplyFan,
    description: 'A warm, damp day: the air being drawn in is close to saturated.',
    apply: engineOwned,
    expectedSymptoms: [
      'At the base case the effect is small, and that is the lesson rather than a fault in the model.',
      'The air is heated several hundred degrees before it meets the solids, and at that temperature its capacity for moisture is enormous, so the humidity it started with barely matters.',
      'The wet-bulb temperature rises slightly, which lifts the product temperature a little.',
      'To see this one bite, drop the inlet air temperature towards 150 °C and run it again. On a low-temperature dryer the ambient humidity is a first-order variable.'
    ]
  },
  {
    id: 'drum-speed-high', name: 'Drum overspeed', appliesTo: TAGS.drum,
    description: 'The drum drive is running well above its normal speed.',
    apply: engineOwned,
    expectedSymptoms: [
      'Product moisture above target.',
      'Residence time roughly a third of normal, and the drum holdup falls with it.',
      'Drum loading drops well below the design figure, so there is less material cascading through the gas and the heat transfer falls too.',
      'The exhaust leaves much hotter than usual, and the thermal efficiency drops sharply — heat is going up the stack rather than into the product.',
      'The air side is set exactly as normal, which points at the drum rather than at the burner or the fan.'
    ]
  },
  {
    id: 'cyclone-fouling', name: 'Cyclone fouling', appliesTo: TAGS.cyclone,
    description: 'Build-up in the cyclone barrel has cut its collection efficiency.',
    apply: engineOwned,
    expectedSymptoms: [
      'Stack dust concentration several times normal.',
      'Product recovery falls slightly, and the shortfall is exactly what left by the stack.',
      'The bag filter is carrying a much larger share of the dust load, so its pressure drop will climb and the fans will follow.',
      'Product moisture, residence time and every temperature are completely normal, which localises the problem to the gas cleaning train.'
    ]
  }
];

// Targets are engine result keys. gradeChallenge reads the calculated value, so a
// challenge cannot be passed by a field that was never computed.
export const CHALLENGES = [
  {
    id: 'meet-moisture',
    title: 'Meet the product moisture specification',
    target: { key: 'moistureOut', op: '<=', value: 0.05, unit: 'kg/kg' },
    hint: 'Read which constraint the diagnostic names before touching anything. If it is time, slow the drum or take gas drag out of it; if it is heat, raise the inlet temperature; if it is humidity, the air has no room left and more heat will do nothing.'
  },
  {
    id: 'cut-energy',
    title: 'Cut the specific energy below 4200 kJ per kg of water',
    target: { key: 'specificEnergy', op: '<=', value: 4200, unit: 'kJ/kg water' },
    hint: 'Only worth claiming while the product still meets 0.05 kg/kg, so watch both together. The waste is sensible heat leaving up the stack: check the thermal utilisation figure, and remember that less air at a higher temperature carries the same duty with a smaller exhaust loss.'
  },
  {
    id: 'protect-product',
    title: 'Keep the product below 90 °C leaving the drum',
    target: { key: 'solidTempOut', op: '<=', value: 90, unit: '°C' },
    hint: 'This one fights the energy challenge directly. Once the solids pass the critical moisture they lose their evaporative cooling and track the gas temperature, so the cheap way to cut fuel — hotter air — is exactly what overheats a heat-sensitive product. Look for the settings that get the water out without the last stretch of the drum baking what is left.'
  }
];

export const SCENARIOS = createScenarioSet(FAULTS, CHALLENGES);

// Guard: a declared fault that the engine does not implement would be a control
// the student can switch on that quietly does nothing.
for (const f of FAULTS) {
  if (!FAULT_IDS.includes(f.id)) throw new Error(`Scenario "${f.id}" is not a fault the industrial dryer engine implements.`);
}

export default SCENARIOS;
