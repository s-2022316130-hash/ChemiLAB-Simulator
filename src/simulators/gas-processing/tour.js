/**
 * 05 — NATURAL GAS PROCESSING PLANT — guided tour.
 *
 * Eight steps, following the gas from the wellhead to the pipeline. Each step
 * moves the camera, selects the unit in both views at once, and names the
 * result keys worth watching while conditions are changed.
 *
 * The text explains why a unit exists and what decision it represents. It never
 * quotes a number: the numbers are on the results rail, computed by the engine.
 */
import { TAGS } from './engine.js';

export const TOUR = [
  {
    id: 'overview',
    title: 'A sequence of specifications',
    text: 'This plant is not a sequence of units, it is a sequence of numbers someone else wrote down. The pipeline will not take more than four parts per million of hydrogen sulphide, so there is an amine unit. It will not take water, because water and hydrocarbon make hydrates that block a line solid, so there is a glycol unit. It has a heating value band, and ethane is sometimes worth more as liquid than as fuel, so there is a cold section. Nothing here was built because it was interesting. Watch the specification count on the results rail: that is the only score this plant has.',
    preset: [[52, 32, 54], [6, 6, 0]],
    watch: ['salesH2S', 'salesCO2', 'waterOut', 'salesWobbe', 'recoveryC2']
  },
  {
    id: 'separation',
    title: 'The easy separation, done first',
    text: 'Gas arrives from the field carrying condensate and water, and the cheapest way to remove them is to let them fall out. The inlet separator is a flash and nothing more: at the pressure and temperature the gas arrives at, some of it is liquid, and the vessel is simply large enough and quiet enough for that liquid to settle. Everything downstream is harder and more expensive than this, which is why anything that can be taken out here is.',
    tag: TAGS.inletSeparator,
    watch: ['inletBeta', 'condensate', 'producedWater', 'feedWater', 'feedGPM']
  },
  {
    id: 'sweetening',
    title: 'An amine chosen for what it leaves behind',
    text: 'Hydrogen sulphide has to come out to four parts per million. Carbon dioxide only has to come down to two per cent, and taking out more costs money and reboiler steam for nothing. Methyldiethanolamine is used because it reacts with hydrogen sulphide instantly and with carbon dioxide slowly, so a contactor sized for contact time takes one and slips the other. Watch the two absorption factors: they are the same calculation with a different equilibrium slope, and the gap between them is the whole reason this amine was chosen.',
    tag: TAGS.amineContactor,
    watch: ['absorptionH2S', 'absorptionCO2', 'kremserH2S', 'kremserCO2', 'h2sOut', 'co2Slip']
  },
  {
    id: 'regeneration',
    title: 'Where the energy actually goes',
    text: 'The contactor is not the expensive part of an amine unit. The regenerator is, and most of its duty is not the heat of reaction at all — it is the stripping steam, and stripping steam follows circulation rather than acid gas load. That is why circulating comfortably more than the load needs is such an expensive habit: the reboiler pays for every cubic metre whether it was carrying anything or not. Cut the circulation and watch the duty fall almost proportionally, and then watch the rich loading climb towards the corrosion limit and the carbon dioxide start to slip. Somewhere in between is the answer.',
    tag: TAGS.amineRegenerator,
    watch: ['reboilerDuty', 'strippingDuty', 'reactionDuty', 'richLoading', 'specificReboiler']
  },
  {
    id: 'dehydration',
    title: 'Glycol sets a floor, not a rate',
    text: 'The contactor cannot dry the gas below equilibrium with the glycol coming into the top of it, however many trays it has and however much is circulated. That floor is set by the lean purity and nothing else, which is why the regenerator rather than the contactor is where a dehydration problem usually lives. Triethylene glycol works because it holds water far more tightly than an ideal solution would — the activity coefficient is about a half — and that is the whole product. Drop the purity and watch the dew point rise while the circulation reads perfectly normal.',
    tag: TAGS.glycolContactor,
    watch: ['glycolActivity', 'absorptionWater', 'waterOut', 'dewPointOut', 'dewPointDepression']
  },
  {
    id: 'expander',
    title: 'Cold bought with pressure',
    text: 'Liquids condense when the gas gets cold, and the cold comes from letting the pressure down through a machine that takes work out of the gas as it goes. An expander cools two or three times as much as a valve across the same pressure drop, and it hands back a few megawatts of shaft power as well. Trip it and the valve takes over: the same pressure is thrown away, nothing comes back, and the cold end warms by twenty degrees within minutes. That single comparison is the reason the machine exists.',
    tag: TAGS.expander,
    watch: ['isentropicOut', 'expanderOut', 'expanderPower', 'coldBeta', 'coldLiquid']
  },
  {
    id: 'demethaniser',
    title: 'The same equation, run backwards',
    text: 'The liquid from the cold separator is mostly ethane and heavier, but it carries dissolved methane, and methane in a liquid product is vapour pressure the storage tank has to hold. The demethaniser boils it back out. It is the same Kremser calculation as the two contactors upstream, with the factor inverted: an absorber pulls a component out of a gas into a liquid, a stripper pulls it out of a liquid into a gas. Once that is seen, three very different-looking towers on this plant stop being three separate things.',
    tag: TAGS.demethaniser,
    watch: ['bottomTemp', 'stripVapour', 'methaneInNgl', 'recoveryC2', 'recoveryC3', 'nglRate']
  },
  {
    id: 'compression',
    title: 'Paying the pressure back',
    text: 'Everything the expander took out of the pressure has to be put back before the gas can enter the pipeline, and the expander never covers it. Drop the expander discharge and more ethane condenses and the compressor gets bigger, in that order and by more than the recovery gains. That trade is the whole economics of liquids recovery, and which way it goes is decided not here but by what ethane is worth against natural gas that week — which is why the same plant runs in recovery mode one month and rejection the next.',
    tag: TAGS.residueCompressor,
    watch: ['compressorPower', 'expanderPower', 'netPower', 'salesWobbe', 'energyIntensity']
  }
];

export default TOUR;
