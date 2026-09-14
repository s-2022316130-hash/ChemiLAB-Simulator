/**
 * 03 — AMMONIA–UREA FERTILIZER PLANT — guided tour.
 *
 * Eight steps, following the nitrogen from a compressor suction to a bag of
 * prills. Each step moves the camera, selects the unit in both views at once,
 * and names the result keys worth watching while conditions are changed.
 *
 * The text explains why a unit exists and what decision it represents. It never
 * quotes a number: the numbers are on the results rail, computed by the engine.
 */
import { TAGS } from './engine.js';

export const TOUR = [
  {
    id: 'overview',
    title: 'One lesson, told twice',
    text: 'This plant is two recycle loops in series, and they teach the same thing. In both, the reactor converts only a fraction of what passes through it, and in both that barely matters, because what does not react is recovered and sent round again. The overall conversion is set by the recovery, not by the reactor. What actually limits each loop is what has to be bled out of it: inerts on the ammonia side, water on the urea side. Hold that idea and the rest of the plant follows from it.',
    preset: 'overview',
    watch: ['perPassN2', 'inertLoop', 'ureaPerPass', 'ureaOverall', 'nitrogen']
  },
  {
    id: 'equilibrium',
    title: 'The reaction that fights itself',
    text: 'Nitrogen and hydrogen make ammonia in a reaction that gives out heat and loses moles. Both of those mean equilibrium prefers a cold, high-pressure reactor. The rate prefers exactly the opposite: at a temperature where the equilibrium yield is good, the iron catalyst barely works. Every synthesis loop ever built is a compromise between those two, and that is why converters run hot and at high pressure and still only reach the yield you see here. Sweep the converter temperature and watch the two curves on the trend chart cross.',
    tag: TAGS.converter,
    watch: ['equilibriumK', 'equilibriumNH3', 'approach', 'converterNH3', 'perPassN2']
  },
  {
    id: 'separation',
    title: 'Refrigeration is what closes the loop',
    text: 'Only about a sixth of the gas leaving the converter is ammonia, and it has to come out before the rest goes round again. That is done by cooling until the ammonia condenses. How much comes out is not a matter of equipment size but of vapour pressure: the gas leaves carrying ammonia at its saturation pressure for whatever temperature the separator is held at. Colder recovers more and costs refrigeration, and the loop pressure changes the answer too, because it is the ratio of the two that sets the mole fraction left behind.',
    tag: TAGS.separator,
    watch: ['separatorPsat', 'recycleNH3', 'liquidAmmonia', 'ammoniaMass']
  },
  {
    id: 'purge',
    title: 'The purge is not waste, it is the inert balance',
    text: 'Methane and argon come in with the makeup gas, react with nothing, and cannot condense out with the ammonia. The only way out of the loop is the purge. At steady state the inerts leaving with the purge exactly equal those arriving with the makeup, so the purge rate alone decides what inert level the loop settles at. Halve the purge and the inerts roughly double, which takes partial pressure away from the reactants and costs conversion. Purging less to save hydrogen is a trade, never a saving. Try it and watch the loop inert figure and the converter outlet move together.',
    tag: TAGS.purgeRecovery,
    watch: ['inertLoop', 'purgeFlow', 'purgeH2', 'recoveredH2', 'converterNH3']
  },
  {
    id: 'urea',
    title: 'Water is the product and the poison',
    text: 'Ammonia and carbon dioxide first make ammonium carbamate, quickly and exothermically. The carbamate then loses water to become urea, slowly and endothermically, and that second step is what limits the reactor. The trouble is that the water it makes also inhibits it, and the carbamate recycle carries that water straight back in. This is why excess ammonia helps, why there is an optimum temperature rather than a maximum, and why the recycle is the real constraint on this loop rather than the reactor itself.',
    tag: TAGS.ureaReactor,
    watch: ['waterToCarbon', 'ureaEquilibrium', 'ureaApproach', 'ureaPerPass', 'ureaOverall']
  },
  {
    id: 'recovery',
    title: 'Recovery beats conversion',
    text: 'Under half the carbon dioxide converts on a single pass, and the plant still gets most of the way to complete conversion. The stripper and the carbamate condenser are what make that true: whatever did not react is separated and returned. The recycle relation is the same one that governs the ammonia loop, which is worth seeing written down twice. Drop the carbamate recovery a few points and watch how much more overall conversion you lose than the per-pass figure would suggest.',
    tag: TAGS.stripper,
    watch: ['ureaPerPass', 'ureaOverall', 'carbamateRecycled', 'ureaRate']
  },
  {
    id: 'finishing',
    title: 'A prill has to freeze before it lands',
    text: 'Molten urea is sprayed at the top of the tower and falls through cold air rising the other way. If a droplet reaches the floor still soft it flattens and the product cakes in the bag. So the tower height is not a chemical decision at all: it is the terminal velocity of a prill multiplied by how long it takes to freeze. Raise the air temperature and the freezing time lengthens, which is why prill quality is seasonal and why a tower that is adequate in winter can be short in summer.',
    tag: TAGS.prillTower,
    watch: ['solidifyTime', 'heightRequired', 'towerMargin', 'moisture']
  },
  {
    id: 'quality',
    title: 'The number on the bag',
    text: 'Urea is sold on its nitrogen content, and pure urea carries 46.65 per cent. A 46.0 per cent specification therefore leaves almost no room: biuret and water together have to stay under about one and a half per cent of the product. Biuret forms wherever urea sits hot and concentrated, which means the evaporator rather than the reactor, so pushing the melt concentration up to make prilling easier is paid for in biuret. Everything upstream ends up being judged by this one figure.',
    tag: TAGS.productBin,
    watch: ['nitrogen', 'biuret', 'moisture', 'ureaPurity', 'productRate']
  }
];

export default TOUR;
