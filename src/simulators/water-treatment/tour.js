/**
 * 01 — WATER TREATMENT PLANT — guided tour.
 *
 * Eight steps, following the water. Each step moves the camera, selects the
 * unit in both views at once, and names the result keys worth watching while
 * the operating conditions are changed.
 *
 * The text explains why a unit exists and what decision it represents. It never
 * quotes a number: the numbers are on the results rail, computed by the engine.
 */
import { TAGS } from './engine.js';

export const TOUR = [
  {
    id: 'overview',
    title: 'A works is a series of barriers',
    text: 'Nothing here removes everything. Coagulation conditions the particles, flocculation grows them, sedimentation takes out the bulk, filtration catches what is left and disinfection deals with what no filter can. Each barrier is sized on the assumption that the one before it did its job, so a failure early on is never contained where it happens — it moves downstream and gets more expensive. Work through the plant in that order and watch how each stage hands its result to the next.',
    preset: 'overview',
    watch: ['turbidityFiltered', 'giardiaTotal', 'recovery', 'runLength']
  },
  {
    id: 'intake',
    title: 'The intake sets everything downstream',
    text: 'The raw water flow is not just a throughput. Every design parameter in the plant is expressed per unit of flow: the coagulant dose in mg/L, the detention time as volume over flow, the overflow rate as flow over area, the filtration rate as flow over filter area. Raise the intake flow and you raise the loading on every single unit at once, without touching any of their own settings. Note too that the flow through the works is not the flow from the river, because the recovered backwash water joins here.',
    tag: TAGS.intakePump,
    watch: ['plantFlow', 'blendedTurbidity', 'productFlow', 'recovery']
  },
  {
    id: 'coagulation',
    title: 'Coagulation is a chemical decision, not a dial',
    text: 'The colloids that make water turbid carry a negative charge and repel each other, so they will never come together on their own. Alum neutralises that charge — but alum is an acid. It consumes alkalinity, releases carbon dioxide and pushes the pH down, and aluminium hydroxide only precipitates properly between about pH 6.0 and 7.8. So the dose and the pH are one decision, not two. Try increasing the dose on a low-alkalinity water and watch the coagulation pH fall out of the band, taking the floc quality with it even though you added more chemical.',
    tag: TAGS.coagDosing,
    watch: ['doseRequired', 'doseRatio', 'alkalinityResidual', 'pHCoagulation', 'flocQuality']
  },
  {
    id: 'mixing',
    title: 'Rapid mix and flocculation do opposite jobs',
    text: 'Rapid mix is violent and brief: alum hydrolyses in well under a second, so the coagulant has to reach every part of the flow before that happens. Flocculation is the opposite — slow, gentle and long, because its job is to let the destabilised particles collide and grow without tearing them apart again. The product G·t measures the collision opportunity offered. Push the flocculation gradient above about 70 1/s and you will see the floc index fall: you are now breaking floc faster than you build it, while spending more power to do it.',
    tag: TAGS.floc,
    watch: ['rapidMixGt', 'flocGt', 'flocQuality', 'flocPower']
  },
  {
    id: 'sedimentation',
    title: 'Overflow rate is a velocity, not a volume',
    text: 'A particle is captured if it settles faster than the water rises to the launders. That rate is flow divided by surface area, so it depends on the plan area of the basin and not on how deep it is. Two things can spoil the result and they look identical from the control room: floc that settles too slowly, or a basin that is hydraulically poor and lets water short-circuit to the weirs. The removal correlation separates them — one changes the settling velocity, the other changes the number of equivalent mixed cells. Watch both while you try the short-circuiting fault.',
    tag: TAGS.clarifier,
    watch: ['settlingVelocity', 'sedimentationRemoval', 'turbiditySettled', 'clarifierDetention']
  },
  {
    id: 'filtration',
    title: 'The filter multiplies quality, it cannot create it',
    text: 'Depth filtration removes a fixed fraction per unit of bed depth, so the filtrate is the settled turbidity multiplied by a factor — never a fixed outlet quality. That factor depends on how well the floc was conditioned upstream, which is why a filter can never repair coagulation that did not happen. Two things move together as you raise the filtration rate: capture falls and headloss rises, so the filtrate gets worse and the run gets shorter at the same time. Everything the clarifier fails to remove arrives here as extra load.',
    tag: TAGS.filters,
    watch: ['filterCoefficient', 'turbidityFiltered', 'headlossClean', 'runLength']
  },
  {
    id: 'backwash',
    title: 'The plant treats its own washwater',
    text: 'Washing the filters uses the plant\'s own product, and the spent water carries back everything the bed collected. Discharging it would waste two to three per cent of production, so it is settled and the clear supernatant is returned to the inlet. That return is a genuine recycle: it changes the flow and the solids arriving at the head of the works, which changes the backwash produced, which changes the return. The balance has to be solved iteratively, and the solver panel on the results rail shows the iterations it actually took.',
    tag: TAGS.washRecovery,
    watch: ['recovery', 'runLength', 'plantFlow', 'blendedTurbidity']
  },
  {
    id: 'disinfection',
    title: 'CT is the product of what is left and how long it really had',
    text: 'Disinfection depends on the free residual after the chlorine demand has been met, multiplied by the contact time the fastest-moving water actually gets — not the nominal detention time. A poorly baffled tank can lose two thirds of its volume to short-circuiting. On top of that, conventional treatment earns a pathogen removal credit, but only while the filtered turbidity stays at or below 0.30 NTU. Lose the filter and you lose the credit at the same moment the disinfection duty rises. Try the blocked filter fault and watch both move together.',
    tag: TAGS.contactTank,
    watch: ['chlorineResidual', 't10', 'ctAchieved', 'ctRequiredGiardia', 'giardiaCredit', 'giardiaTotal']
  }
];

export default TOUR;
