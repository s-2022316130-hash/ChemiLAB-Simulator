/**
 * 04 — PAINT MANUFACTURING PLANT — scenarios, faults and challenges.
 *
 * Declaration only. How a fault propagates is decided in engine.js, which is
 * handed the active fault ids by the runtime; nothing here touches physics.
 * The ids are imported from the engine so a renamed fault cannot silently
 * become a fault that does nothing.
 *
 * `expectedSymptoms` is what a batch operator or a laboratory would observe, in
 * the order they would notice it. It is deliberately not a statement of the
 * cause: working that out from the symptoms is the exercise.
 */
import { createScenarioSet } from '../../simulation/scenarios.js';
import { TAGS, FAULT_IDS } from './engine.js';

// The engine owns fault propagation. This identity transform exists so that the
// shared applyFaults helper, if it is ever used, cannot double-apply a fault.
const engineOwned = inputs => inputs;

export const FAULTS = [
  {
    id: 'low-tip-speed', name: 'Disperser running slow', appliesTo: TAGS.disperser,
    description: 'The blade is turning well below its set point — a slipping belt, or the wrong blade fitted.',
    apply: engineOwned,
    expectedSymptoms: [
      'The grind stalls three or four Hegman points below where it should be, and stays there however long the batch is run.',
      'Gloss collapses with it, because the particles that are left stand proud of the film.',
      'Shaft power is a fraction of normal, and the batch barely warms up — which is the clue, because a disperser doing its job gets hot.',
      'The mill base viscosity reads normal. Nothing is wrong with the formulation.'
    ]
  },
  {
    id: 'thin-millbase', name: 'Mill base over-thinned', appliesTo: TAGS.disperser,
    description: 'Far more solvent has gone into the grind than the recipe called for.',
    apply: engineOwned,
    expectedSymptoms: [
      'The blade cuts a hole in the batch and spins in it. There is no doughnut of flowing material.',
      'The grind does not move at all: it reads what the pigment read in the bag.',
      'Shaft power is low, because there is nothing for the blade to work against.',
      'This is the fault that shows dispersion is not mixing. A thin mill base cannot carry stress, and stress is what breaks an agglomerate.'
    ]
  },
  {
    id: 'cooling-failure', name: 'Jacket cooling lost', appliesTo: TAGS.chiller,
    description: 'The chiller has tripped or the jacket is airlocked, so almost nothing is being removed.',
    apply: engineOwned,
    expectedSymptoms: [
      'The batch temperature climbs steadily instead of settling, and keeps climbing for as long as the blade turns.',
      'Solvent starts leaving, so the batch thickens while it is being worked.',
      'The grind gets slightly worse rather than better, because a hotter mill base is a thinner one and carries less stress.',
      'At a long enough dispersion this reaches the solvent flash point over an open vessel with a spark source in it.'
    ]
  },
  {
    id: 'wet-pigment', name: 'Damp pigment', appliesTo: TAGS.bagDump,
    description: 'The pigment has picked up moisture in store and has set into harder agglomerates.',
    apply: engineOwned,
    expectedSymptoms: [
      'The grind stalls around Hegman 5 with everything else reading normal.',
      'Tip speed, power, temperature and mill base viscosity are all exactly where they should be.',
      'Running longer helps very little, because the stress is now only just above what the agglomerates can take.',
      'Gloss is the first thing the laboratory notices, and the first thing the customer does.'
    ]
  },
  {
    id: 'letdown-shock', name: 'Let-down shock', appliesTo: TAGS.letdownTank,
    description: 'The thinners went in too fast and the resin came off the pigment surface, so it has flocculated.',
    apply: engineOwned,
    expectedSymptoms: [
      'The grind gauge still reads well. It is the one instrument this fault gets past, because the gauge blade shears the soft flocs flat.',
      'Gloss falls by a third and opacity with it, which is the real evidence.',
      'The paint is noticeably heavier at low shear than the recipe says it should be, and it may show a slight yield.',
      'Nothing upstream changed. Everything about the dispersion was right.'
    ]
  },
  {
    id: 'worn-beads', name: 'Worn bead charge', appliesTo: TAGS.beadMill,
    description: 'The grinding media in the bead mill are worn and rounded, so far less of the mill energy reaches the agglomerates.',
    apply: engineOwned,
    expectedSymptoms: [
      'Only visible when the bead mill is actually in circuit: with no passes selected the mill is bypassed and this fault does nothing.',
      'The mill draws its normal power and takes its normal time, and the grind barely improves on what left the disperser.',
      'Adding passes buys much less than it should, which is the diagnostic.',
      'Specific energy in the mill reads correctly. The energy is going in; it is not reaching the agglomerates.'
    ]
  }
];

// Targets are engine result keys. gradeChallenge reads the calculated value, so a
// challenge cannot be passed by a field that was never computed.
export const CHALLENGES = [
  {
    id: 'meet-fineness',
    title: 'Reach Hegman 7.5 on the grind gauge',
    target: { key: 'fineness', op: '>=', value: 7.5, unit: 'Hegman' },
    hint: 'Two things set the grind and they are not interchangeable. Stress decides whether anything breaks at all, and energy per kilogram decides how far it goes. Check the stress ratio first; if it is comfortably above one, the answer is time, speed or a bead mill pass.'
  },
  {
    id: 'meet-opacity',
    title: 'Reach a 96 % contrast ratio at the stated film thickness',
    target: { key: 'contrastRatio', op: '>=', value: 96, unit: '%' },
    hint: 'Hiding is a property of the dry film, so there are two levers: how much scattering the film contains, and how thick it is. More titanium dioxide is the obvious one and the one that runs into crowding soonest. Raising the volume solids thickens the dry film for the same wet film and costs nothing optically.'
  },
  {
    id: 'meet-voc',
    title: 'Bring the VOC under 420 g/L without losing the viscosity',
    target: { key: 'voc', op: '<=', value: 420, unit: 'g/L' },
    hint: 'On a solvent-borne paint the VOC is fixed by the formulation, not by anything the plant does: it is whatever volatile volume is left once the solids are in. Raising the volume solids is the only real route, and it will take the viscosity up with it — so something else has to come down.'
  }
];

export const SCENARIOS = createScenarioSet(FAULTS, CHALLENGES);

// Guard: a declared fault that the engine does not implement would be a control
// the student can switch on that quietly does nothing.
for (const f of FAULTS) {
  if (!FAULT_IDS.includes(f.id)) throw new Error(`Scenario "${f.id}" is not a fault the paint engine implements.`);
}

export default SCENARIOS;
