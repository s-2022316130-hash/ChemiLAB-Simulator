/**
 * 04 — PAINT MANUFACTURING PLANT — guided tour.
 *
 * Eight steps, following a batch from a bag of pigment to a filled tin. Each
 * step moves the camera, selects the unit in both views at once, and names the
 * result keys worth watching while conditions are changed.
 *
 * The text explains why a unit exists and what decision it represents. It never
 * quotes a number: the numbers are on the results rail, computed by the engine.
 */
import { TAGS } from './engine.js';

export const TOUR = [
  {
    id: 'overview',
    title: 'A batch, not a flow',
    text: 'Nothing here runs at steady state. A charge is made up, work is put into it for a while, it is thinned to its final recipe, and what comes out is judged against a specification. That changes what the questions are. There is no operating point to settle at, only a sequence of decisions, and the one that matters most was taken before anything was weighed out — because almost every property of the dried film is set by the ratio of pigment to binder in it. Watch Λ as you change the formulation: it is the number this whole plant exists to hit.',
    preset: [[34, 22, 34], [2, 3, 0]],
    watch: ['lambda', 'cpvc', 'fineness', 'gloss', 'contrastRatio', 'voc']
  },
  {
    id: 'formulation',
    title: 'The critical pigment volume concentration',
    text: 'Pack pigment particles together and they need a certain amount of binder to fill the space between them. Below that amount you have a continuous film with pigment suspended in it; above it you have a pigment skeleton with air in the gaps. That crossing point is the critical pigment volume concentration, and it is calculated here from the oil absorption of the pigment — the amount of oil a hundred grams of it will take before it goes from a powder to a paste. Gloss, permeability, scrub resistance and hiding all turn at that point, some of them sharply, and not all in the same direction.',
    tag: TAGS.bagDump,
    watch: ['cpvc', 'lambda', 'oilAbsorption', 'pigmentDensity', 'tio2Concentration']
  },
  {
    id: 'millbase',
    title: 'The mill base has a window, not an optimum',
    text: 'The grind is not made in the finished paint. It is made in a mill base: all of the pigment with only part of the resin and part of the solvent, made up to a consistency that will disperse. Too thin and the blade cuts a hole and spins. Too thick and no flow develops at all. The suspension viscosity does not rise smoothly towards that limit either — it diverges as the pigment approaches close packing, so the last few percent of loading cost more than everything before them. Move the two mill base shares and watch the viscosity, not the recipe.',
    tag: TAGS.disperser,
    watch: ['millBasePhi', 'vehicleViscosity', 'relativeViscosity', 'millBaseViscosity', 'millBaseVolume']
  },
  {
    id: 'dispersion',
    title: 'Dispersion is not mixing',
    text: 'A pigment agglomerate is held together, and to break it the flow has to pull on it harder than it holds. That is a stress, and a stress needs both a shear rate and something viscous to carry it. Below the threshold the blade can turn for an hour and change nothing, which is what a thin mill base looks like. Above it, how far the grind goes is set by the energy put in per kilogram — so time and speed are interchangeable in a way that speed and viscosity are not. Sweep the disperser speed and watch the stress ratio cross one.',
    tag: TAGS.disperser,
    watch: ['tipSpeed', 'shearRate', 'shearStress', 'stressRatio', 'specificEnergy', 'fineness']
  },
  {
    id: 'heat',
    title: 'Every watt on the shaft ends up in the batch',
    text: 'A disperser is a very efficient heater. Nothing leaves as useful work: all of the shaft power is dissipated in the fluid, and the only way out is the jacket. Whether that matters depends on how long the batch runs and how much jacket there is, and the two are coupled, because a hotter batch is a thinner one and a thinner one draws less power. That is why the temperature here is solved rather than assumed. Lose the cooling and the batch does not settle at a higher temperature — it keeps climbing towards the solvent flash point.',
    tag: TAGS.chiller,
    watch: ['batchTemp', 'ua', 'jacketArea', 'shaftPower', 'solventEvaporated']
  },
  {
    id: 'beadmill',
    title: 'What a media mill can do that a blade cannot',
    text: 'A high-speed disperser has a floor. It separates agglomerates and wets the surface, but it will not reduce a primary particle, and below a few microns it stops earning its energy. A bead mill works differently: the energy goes into collisions between grinding media rather than into bulk shear, so it does not need the mill base to carry the stress and it reaches far finer. It is also slow and expensive, so the question is never whether it is better but whether the specification needs it. Add a pass and watch what it buys.',
    tag: TAGS.beadMill,
    watch: ['particleSize', 'beadMillEnergy', 'fineness', 'millTime', 'cycleTime']
  },
  {
    id: 'letdown',
    title: 'The let-down is where a good grind is lost',
    text: 'The rest of the resin, the rest of the solvent and the additives go in here, and nothing about the dispersion is supposed to change. It often does. Add thinners too quickly and the resin comes off the pigment surface faster than it can re-adsorb, and the pigment flocculates — loose clusters that the grind gauge cannot see, because its blade shears them flat, but which cost a third of the gloss and a good deal of the opacity. The rheology set here is the paint the customer meets: heavy enough not to sag, light enough to level.',
    tag: TAGS.letdownTank,
    watch: ['krebs', 'lowShearViscosity', 'yieldStress', 'sagLimit', 'levelTime']
  },
  {
    id: 'quality',
    title: 'What the laboratory actually measures',
    text: 'Four numbers decide whether the batch ships. Fineness says whether the grind went far enough. Gloss says whether the film surface is smooth and whether there was enough binder for the pigment. Contrast ratio says whether it hides, which is an optical property of the dry film rather than an amount of white pigment — crowded particles scatter less than spaced ones, so doubling the titanium dioxide does not double the hiding. And viscosity says whether anyone can apply it. Three of the four can be argued about. The VOC on the tin cannot.',
    tag: TAGS.qualityLab,
    watch: ['fineness', 'gloss', 'contrastRatio', 'krebs', 'voc', 'dryFilm']
  }
];

export default TOUR;
