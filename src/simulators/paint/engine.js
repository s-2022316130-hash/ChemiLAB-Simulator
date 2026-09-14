/**
 * 04 — PAINT MANUFACTURING PLANT — process model.
 *
 * A solvent-borne gloss enamel made in batches: resin and part of the solvent
 * are charged, pigment is added under a high-speed disperser, the mill base is
 * dispersed and optionally passed through a bead mill, then let down to the
 * final formulation, filtered and filled.
 *
 * Rules that apply here (see CLAUDE.md):
 *  - every returned number is computed in this file, never in the UI;
 *  - anything not calculated stays null so the UI prints an em dash;
 *  - `converged` is only true when the solver actually met tolerance;
 *  - every correlation and reference value is declared in `assumptions`.
 *
 * This is the first batch process in the set, and it is a different kind of
 * problem from the three before it. There is no steady state to solve for: a
 * charge is made up, work is put into it for a period, and what comes out is
 * judged against a specification. The quantity that decides almost everything
 * is not a flow or a temperature but a ratio — the pigment volume
 * concentration against the critical pigment volume concentration. Gloss,
 * opacity, permeability and mechanical strength all turn at that point,
 * because it is where there stops being enough binder to fill the space
 * between the pigment particles.
 *
 * The second idea worth having is that dispersion is not mixing. Breaking a
 * pigment agglomerate needs a hydrodynamic stress above its cohesive strength;
 * below that threshold the blade can turn for an hour and change nothing.
 * Above it, how far the grind goes is set by the energy put in per kilogram.
 *
 * This is a teaching model, not a validated formulation tool.
 */
import { KIND, Status } from '../../simulation/contract.js';
import { rules, validate as validateSpec } from '../../shared/validation.js';
import { U } from '../../shared/units.js';
import { bisect } from '../../simulation/solver.js';

// ---------------------------------------------------------------------------
// Shared identity between engine, plant.js (userData.tag) and flowsheet.js.
// ---------------------------------------------------------------------------
export const TAGS = Object.freeze({
  resinTank: 'TK-401', solventTank: 'TK-402', additiveSkid: 'TK-403',
  bagDump: 'BD-401', dustCollector: 'DC-401',
  disperser: 'DS-401', chiller: 'CH-401', beadMill: 'BM-401',
  letdownTank: 'LD-401', transferPump: 'P-401', filter: 'FL-401',
  fillingLine: 'FP-401', qualityLab: 'QC-401', mcc: 'MCC-401'
});
export const STREAMS = Object.freeze({
  resinToMill: 'S-01', solventToMill: 'S-02', pigmentFeed: 'S-03', dustToCollector: 'S-04',
  millBaseToMill: 'S-05', milledBase: 'S-06', millBaseDirect: 'S-07',
  resinLetdown: 'S-08', solventLetdown: 'S-09', additives: 'S-10',
  finishedPaint: 'S-11', pumpedPaint: 'S-12', filteredPaint: 'S-13',
  packedProduct: 'S-14', coolingWater: 'S-15', solventVapour: 'S-16'
});
export const FAULT_IDS = Object.freeze([
  'low-tip-speed', 'thin-millbase', 'cooling-failure',
  'wet-pigment', 'letdown-shock', 'worn-beads'
]);

// ---------------------------------------------------------------------------
// Reference data — teaching values, not a specific product. All KIND.REF.
// ---------------------------------------------------------------------------
const REF = Object.freeze({
  g: 9.81,
  // --- raw material properties, densities in g/L ---------------------------
  rhoTio2: 4000, rhoExtender: 2700, rhoResin: 1050, rhoSolvent: 870, rhoAdditive: 1000,
  resinSolids: 0.60,              // mass fraction of solids in the supplied resin solution
  resinViscosity: 12,             // Pa·s at 25 °C, as supplied
  solventViscosity: 0.0008,       // Pa·s
  // Oil absorption, g linseed oil per 100 g pigment — the input to the CPVC.
  oaTio2: 18, oaExtender: 25,
  // --- vehicle rheology ----------------------------------------------------
  vehicleExponent: 1.4,           // µ = µ_solvent · exp(α·c^β), β
  thickenerPotency: 5.12,         // per % on paint weight, in the exponent
  phiMax: 0.62,                   // maximum packing fraction for the Krieger–Dougherty relation
  intrinsicViscosity: 2.5,        // [η] for approximately spherical particles
  millBaseFlowIndex: 0.75,        // power-law n for the mill base
  paintFlowIndex: 0.80,           // power-law n for the let-down paint
  stormerShearRate: 200,          // 1/s, the shear rate a Stormer viscometer works at
  // --- dispersion ----------------------------------------------------------
  powerNumber: 0.18,              // sawtooth disperser disc, fully turbulent
  ratedTipSpeed: 28,              // m/s, the top of the working range a motor is sized for
  nominalMillBaseDensity: 1600,   // kg/m³, the mill base a machine is rated against
  laminarConstant: 110,           // P = K·µ·N²·D³ in the creeping-flow limit
  shearConstant: 200,             // γ̇ = C·u/D in the blade zone
  cohesiveTio2: 1150,             // Pa, stress needed to break a rutile agglomerate
  cohesiveExtender: 300,          // Pa, the same for a carbonate or talc extender
  dispersionRate: 3.8e-5,         // per J/kg, above the stress threshold
  agglomerateSize: 45,            // µm, pigment as supplied
  disperserFloor: 4.0,            // µm, the finest a high-speed disperser reaches
  beadMillFloor: 0.6,             // µm
  beadMillRate: 2.2e-5,           // per J/kg
  cpMillBase: 1.6,                // kJ/kg·K
  jacketU: 350,                   // W/m²·K, jacketed vessel with an agitated viscous organic
  bladeToTank: 3.0,               // tank diameter as a multiple of blade diameter
  viscosityActivation: 3000,      // K, Arrhenius temperature dependence of the vehicle
  evaporationRate: 0.004,         // fraction of mill-base solvent per hour at 25 °C
  dustLoss: 0.002,                // fraction of pigment lost to the dust collector
  flashPoint: 62,                 // °C, of the high-flash solvent blend
  // --- optics --------------------------------------------------------------
  scatteringPerVolume: 0.67,      // 1/µm per unit volume fraction of rutile
  crowdingOnset: 0.14,            // TiO2 volume concentration above which crowding starts
  crowdingStrength: 3.2,
  voidScattering: 0.9,            // 1/µm per unit volume fraction of air voids above CPVC
  absorptionWhite: 0.0016,        // 1/µm, the resin and extender alone
  absorptionPerColourant: 0.00042,// 1/µm per mL colourant per litre of paint
  whiteBacking: 0.80,             // reflectance of the white half of a contrast card
  // --- film and application ------------------------------------------------
  glossMax: 98,
  glossPvcExponent: 3.0, glossPvcStrength: 2.6,
  glossRoughnessOnset: 8, glossRoughnessScale: 10,
  yieldStressCoefficient: 3.75,   // Pa at the maximum packing fraction
  yieldStressExponent: 1.6,
  surfaceTension: 0.030,          // N/m
  brushWavelength: 0.002,         // m, the spacing of brush marks
  // --- plant ---------------------------------------------------------------
  chargeTimeBase: 20,             // min
  pigmentAddRate: 2400,           // kg/h, how fast the bag dump can be charged
  letdownTime: 25,                // min
  fillingRate: 900,               // L/min through the filter and filling line
  shiftHours: 8,
  // Nominal line bores, used only to turn a flow into a tracer velocity.
  bore: {
    'S-01': 0.08, 'S-02': 0.08, 'S-03': 0.20, 'S-04': 0.15,
    'S-05': 0.10, 'S-06': 0.10, 'S-07': 0.10,
    'S-08': 0.08, 'S-09': 0.08, 'S-10': 0.04,
    'S-11': 0.10, 'S-12': 0.10, 'S-13': 0.10, 'S-14': 0.12,
    'S-15': 0.06, 'S-16': 0.25
  }
});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---------------------------------------------------------------------------
// Formulation relationships
// ---------------------------------------------------------------------------
/**
 * Critical pigment volume concentration from the oil absorption of the pigment
 * blend. The oil absorption is the volume of binder the packed pigment needs to
 * fill its own voids, measured as grams of linseed oil per hundred grams of
 * pigment, and 93.5 is the density of linseed oil expressed in the same units.
 */
export function cpvcFromOilAbsorption(oaBlend, pigmentDensityGPerCm3) {
  return 1 / (1 + oaBlend * pigmentDensityGPerCm3 / 93.5);
}

/**
 * Krieger–Dougherty relative viscosity of a suspension. It diverges as the
 * solids fraction approaches the maximum packing fraction, which is the reason
 * a mill base has a workable window rather than a simple optimum.
 */
export function relativeViscosity(phi, phiMax = REF.phiMax, intrinsic = REF.intrinsicViscosity) {
  if (!(phi >= 0) || phi >= phiMax) return null;
  return Math.pow(1 - phi / phiMax, -intrinsic * phiMax);
}

/**
 * Vehicle viscosity from the polymer concentration dissolved in it, anchored on
 * the viscosity of the resin as supplied. Concentration in g/mL.
 */
function vehicleViscosity(concentration, alpha, tempC) {
  const base = REF.solventViscosity * Math.exp(alpha * Math.pow(Math.max(concentration, 0), REF.vehicleExponent));
  // Arrhenius correction, referred to the 25 °C at which the resin was measured.
  const t = tempC + 273.15;
  return base * Math.exp(REF.viscosityActivation * (1 / t - 1 / 298.15));
}

/** Power-law thinning from the low-shear value to a given shear rate. */
const atShearRate = (muLowShear, shearRate, n) =>
  muLowShear * Math.pow(Math.max(shearRate, 1e-6), n - 1);

/**
 * Krebs units from an apparent viscosity in centipoise. Fitted to the ASTM
 * D562 conversion table over 50–110 KU; it is a fit to a table, not a law.
 */
export const krebsUnits = cP => (cP > 0 ? 50 + 21.12 * (Math.log(cP) - 5.165) : null);

/**
 * Kubelka–Munk reflectance of a film of scattering power SX over a backing of
 * reflectance Rg. This is the two-flux solution, not an approximation of it.
 */
export function kubelkaMunk(K, S, thicknessUm, backing) {
  if (!(S > 0) || !(thicknessUm > 0)) return null;
  const a = 1 + K / S;
  const b = Math.sqrt(Math.max(a * a - 1, 0));
  if (b <= 0) return null;
  const bsx = b * S * thicknessUm;
  // coth overflows quickly; above about 20 it is 1 to within floating point.
  const coth = bsx > 20 ? 1 : 1 / Math.tanh(bsx);
  const denom = a - backing + b * coth;
  if (!(Math.abs(denom) > 1e-12)) return null;
  return (1 - backing * (a - b * coth)) / denom;
}

// ---------------------------------------------------------------------------
// Faults. The engine owns propagation; scenarios.js only declares the ids.
// ---------------------------------------------------------------------------
function faultEffects(faults = []) {
  const on = id => faults.includes(id);
  return {
    speedFactor: on('low-tip-speed') ? 0.55 : 1,
    extraMillBaseSolvent: on('thin-millbase') ? 45 : 0,
    coolingFactor: on('cooling-failure') ? 0.08 : 1,
    strengthFactor: on('wet-pigment') ? 2.4 : 1,
    agglomerateFactor: on('wet-pigment') ? 1.35 : 1,
    flocculation: on('letdown-shock') ? 2.6 : 1,
    beadFactor: on('worn-beads') ? 0.3 : 1,
    active: [...faults]
  };
}

/** Faults that move an operating input do so here, visibly, once. */
function effectiveInputs(inputs, fx) {
  const eff = { ...inputs };
  const notes = [];
  if (fx.speedFactor !== 1) {
    eff.dispSpeed = inputs.dispSpeed * fx.speedFactor;
    notes.push(`The disperser is turning at ${eff.dispSpeed.toFixed(0)} rpm against a set point of ${inputs.dispSpeed.toFixed(0)} rpm.`);
  }
  if (fx.extraMillBaseSolvent) {
    eff.millBaseSolventShare = Math.min(95, inputs.millBaseSolventShare + fx.extraMillBaseSolvent);
    notes.push(`The mill base is carrying ${eff.millBaseSolventShare.toFixed(0)} % of the solvent instead of the ${inputs.millBaseSolventShare.toFixed(0)} % it was made up to.`);
  }
  return { eff, notes };
}

// ---------------------------------------------------------------------------
// The batch
// ---------------------------------------------------------------------------
/**
 * Everything that follows from the formulation alone, worked per litre of
 * finished paint and then scaled to the batch. Volumes are taken as additive.
 */
function formulate(x) {
  const pvc = x.pvc / 100;
  const vs = x.volumeSolids / 100;
  const tio2Share = x.tio2Share / 100;

  // Per litre of finished paint.
  const vDry = vs;
  const vPigment = pvc * vDry;
  const vBinder = (1 - pvc) * vDry;
  const vVolatile = 1 - vDry;

  const vTio2 = tio2Share * vPigment;
  const vExtender = vPigment - vTio2;
  const mTio2 = vTio2 * REF.rhoTio2;
  const mExtender = vExtender * REF.rhoExtender;
  const mPigment = mTio2 + mExtender;
  const rhoPigment = vPigment > 0 ? mPigment / vPigment : null;

  // Oil absorption of the blend is mass weighted, because it is quoted per
  // hundred grams of pigment.
  const oaBlend = mPigment > 0 ? (mTio2 * REF.oaTio2 + mExtender * REF.oaExtender) / mPigment : REF.oaTio2;
  // Cohesive strength follows the blend by volume: it is a property of how much
  // of each kind of agglomerate the blade has to break, not of their mass.
  const cohesive = tio2Share * REF.cohesiveTio2 + (1 - tio2Share) * REF.cohesiveExtender;
  const cpvc = rhoPigment === null ? null : cpvcFromOilAbsorption(oaBlend, rhoPigment / 1000);
  const lambda = cpvc ? pvc / cpvc : null;

  // The binder arrives as a resin solution, which brings solvent with it.
  const mBinderSolid = vBinder * REF.rhoResin;
  const mResinSolution = mBinderSolid / REF.resinSolids;
  const mSolventInResin = mResinSolution - mBinderSolid;
  const vSolventInResin = mSolventInResin / REF.rhoSolvent;
  const vResinSolution = vBinder + vSolventInResin;

  // Additives: the rheology modifier and the colourant, both taken as liquids.
  const mThickener = (x.thickenerDose / 100) * 1000 * 1.15;   // per litre, on an assumed paint density
  const vThickener = mThickener / REF.rhoAdditive;
  const vColourant = x.colourantDose / 1000;
  const mColourant = vColourant * REF.rhoAdditive;
  const vAdditives = vThickener + vColourant;

  // Whatever volatile volume is left is the solvent that has to be added.
  const vSolventAdded = vVolatile - vSolventInResin - vAdditives;
  const mSolventAdded = vSolventAdded * REF.rhoSolvent;

  const mPaint = mPigment + mResinSolution + mSolventAdded + mThickener + mColourant;
  const density = mPaint;                              // g per litre
  const weightSolids = mPaint > 0 ? (mPigment + mBinderSolid) / mPaint : null;
  const voc = mSolventInResin + mSolventAdded;         // g per litre of paint

  return {
    pvc, vs, cpvc, lambda, oaBlend, cohesive, rhoPigment,
    vPigment, vBinder, vVolatile, vDry, vTio2, vExtender,
    mTio2, mExtender, mPigment, mBinderSolid, mResinSolution, mSolventInResin,
    vSolventInResin, vResinSolution, vSolventAdded, mSolventAdded,
    vThickener, mThickener, vColourant, mColourant, vAdditives,
    mPaint, density, weightSolids, voc,
    tio2Concentration: vDry > 0 ? vTio2 / vDry : null
  };
}

/**
 * The mill base: what is in the disperser vessel while the work is being done.
 * All of the pigment, and the share of the resin solution and of the added
 * solvent the operator chose to charge with it.
 */
function millBase(f, x, batchVolume) {
  const fB = x.millBaseBinderShare / 100;
  const fS = x.millBaseSolventShare / 100;

  const vPig = f.vPigment * batchVolume;
  const vResin = fB * f.vResinSolution * batchVolume;
  const vSolvent = fS * f.vSolventAdded * batchVolume;
  const volume = vPig + vResin + vSolvent;

  const mPig = f.mPigment * batchVolume;
  const mResin = fB * f.mResinSolution * batchVolume;
  const mSolvent = fS * f.mSolventAdded * batchVolume;
  const mass = (mPig + mResin + mSolvent) / 1000;      // kg

  const phi = volume > 0 ? vPig / volume : null;
  const vehicleVolume = vResin + vSolvent;
  const polymerMass = fB * f.mBinderSolid * batchVolume;
  // g polymer per mL of vehicle.
  const concentration = vehicleVolume > 0 ? polymerMass / (vehicleVolume * 1000) : null;

  return { fB, fS, vPig, vResin, vSolvent, volume, mPig, mResin, mSolvent, mass, phi, vehicleVolume, concentration };
}

/**
 * The disperser at a given batch temperature. Viscosity, stress, power and the
 * heat that power turns into are all one calculation, because each depends on
 * the others through the temperature.
 */
function disperserAt(tempC, f, mb, x, fx, alpha, geometry) {
  const speed = x.dispSpeed / 60;                       // rev/s
  const diameter = x.bladeDiameter;
  const tipSpeed = Math.PI * diameter * speed;

  const muVehicle = vehicleViscosity(mb.concentration, alpha, tempC);
  const relative = relativeViscosity(mb.phi);
  const muLow = relative === null ? null : muVehicle * relative;

  // Shear rate in the blade zone, and the stress that rate produces in a
  // shear-thinning mill base.
  const shearRate = diameter > 0 ? REF.shearConstant * tipSpeed / diameter : 0;
  const muAtShear = muLow === null ? null : atShearRate(muLow, shearRate, REF.millBaseFlowIndex);
  const stress = muAtShear === null ? null : muAtShear * shearRate;

  const density = mb.volume > 0 ? mb.mass / mb.volume * 1000 : 0;   // kg/m³, from kg per litre
  const volumeM3 = mb.volume / 1000;
  const reynolds = muAtShear > 0 ? density * speed * diameter * diameter / muAtShear : null;

  // Turbulent and creeping-flow contributions added, which is the usual way of
  // covering the transition without a correlation for it.
  const turbulent = REF.powerNumber * density * Math.pow(speed, 3) * Math.pow(diameter, 5);
  const laminar = muAtShear === null ? 0 : REF.laminarConstant * muAtShear * speed * speed * Math.pow(diameter, 3);
  const power = turbulent + laminar;                    // W

  const ua = geometry.jacketArea * REF.jacketU * fx.coolingFactor;   // W/K
  return { speed, diameter, tipSpeed, muVehicle, relative, muLow, shearRate, muAtShear, stress, density, volumeM3, reynolds, turbulent, laminar, power, ua };
}

/** Vessel geometry follows the blade by the usual one-to-three rule of thumb. */
function vesselGeometry(mb, x) {
  const tankDiameter = REF.bladeToTank * x.bladeDiameter;
  const area = Math.PI * tankDiameter * tankDiameter / 4;
  const fillHeight = area > 0 ? (mb.volume / 1000) / area : 0;
  const jacketArea = Math.PI * tankDiameter * fillHeight + area;
  return { tankDiameter, area, fillHeight, jacketArea, ratio: tankDiameter > 0 ? x.bladeDiameter / tankDiameter : null };
}

/**
 * End-of-dispersion batch temperature. The vessel is a lumped capacity heated
 * by the shaft power and cooled by the jacket, and the shaft power depends on
 * the temperature through the viscosity — so it is solved rather than assumed.
 */
function solveTemperature(f, mb, x, fx, alpha, geometry) {
  const t0 = x.chargeTemp;
  const tj = x.jacketTemp;
  const seconds = x.dispTime * 60;
  const capacity = mb.mass * REF.cpMillBase * 1000;     // J/K

  // Residual: the end temperature implied by a power evaluated at the mean of
  // the start and that same end temperature, against the temperature assumed.
  const endFrom = tEnd => {
    const mean = 0.5 * (t0 + tEnd);
    const d = disperserAt(mean, f, mb, x, fx, alpha, geometry);
    if (!(d.ua > 0)) return t0 + (capacity > 0 ? d.power * seconds / capacity : 0);
    const steady = tj + d.power / d.ua;
    const tau = capacity / d.ua;
    return steady + (t0 - steady) * Math.exp(-seconds / tau);
  };
  const residual = t => endFrom(t) - t;

  // The bracket has to reach wherever the shaft power actually puts the batch.
  // A fixed ceiling turns an overheating batch into a solver failure, which is
  // the wrong explanation for something the operator can see and smell.
  const first = disperserAt(t0, f, mb, x, fx, alpha, geometry);
  const reach = first.ua > 0 ? first.power / first.ua : 400;
  const lo = Math.min(t0, tj) - 5;
  const hi = Math.max(t0, tj) + Math.max(60, reach * 1.3 + 60);
  const solve = bisect(residual, lo, hi, { tol: 1e-6, maxIter: 200 });
  const tEnd = solve.x;
  const check = tEnd === null ? null : Math.abs(residual(tEnd));
  return { tEnd, converged: tEnd !== null && check !== null && check < 1e-4, iterations: solve.iterations, residual: check };
}

/**
 * Grind fineness. Breaking an agglomerate needs a hydrodynamic stress above its
 * cohesive strength; below that the blade turns and nothing happens. Above it,
 * how far the grind goes is set by the energy put in per kilogram.
 */
function grind(stress, specificEnergy, fx, floor, size, rate, strengthBase = REF.cohesiveTio2) {
  const strength = strengthBase * fx.strengthFactor;
  const excess = stress === null ? 0 : Math.max(0, stress / strength - 1);
  const k = rate * excess;
  const d = floor + (size - floor) * Math.exp(-k * Math.max(specificEnergy, 0));
  return { strength, excess, k, d, dispersing: excess > 0 };
}

/** Hegman fineness from the largest particles a grind gauge can still catch. */
const hegman = dMicron => (Number.isFinite(dMicron) ? clamp(8 - dMicron / 12.7, 0, 8) : null);

function solveBatch(x, fx) {
  const f = formulate(x);
  const batchVolume = x.batchVolume;

  // The resin brings its own solvent. If that alone exceeds the volatile volume
  // the formulation allows, there is no way to make this paint from this resin.
  if (!(f.vSolventAdded >= 0)) {
    return { f, infeasible: `The resin solution alone brings ${(f.vSolventInResin * 1000).toFixed(0)} mL of solvent per litre, and with the additives that is more than the ${(f.vVolatile * 1000).toFixed(0)} mL of volatile volume a ${x.volumeSolids.toFixed(0)} % volume-solids paint has room for. Either raise the volume solids or use a higher-solids resin.` };
  }

  const mb = millBase(f, x, batchVolume);
  if (!(mb.volume > 0) || !(mb.phi > 0)) {
    return { f, mb, infeasible: 'There is nothing in the disperser: the mill base has no volume at these settings.' };
  }
  if (mb.phi >= REF.phiMax) {
    return {
      f, mb,
      infeasible: `The mill base is ${(mb.phi * 100).toFixed(1)} % pigment by volume, at or above the ${(REF.phiMax * 100).toFixed(0)} % maximum packing fraction. There is not enough vehicle to fill the space between the particles, so the charge is a damp powder rather than a fluid and no viscosity exists for it. Charge more resin or more solvent to the mill base.`
    };
  }

  // Anchor the vehicle viscosity law on the resin as supplied.
  const resinConcentration = f.vResinSolution > 0 ? f.mBinderSolid / (f.vResinSolution * 1000) : null;
  const alpha = resinConcentration > 0
    ? Math.log(REF.resinViscosity / REF.solventViscosity) / Math.pow(resinConcentration, REF.vehicleExponent)
    : null;
  if (!(alpha > 0)) return { f, mb, infeasible: 'The resin solution has no polymer in it, so there is no vehicle viscosity to anchor.' };

  const geometry = vesselGeometry(mb, x);
  const temperature = solveTemperature(f, mb, x, fx, alpha, geometry);
  if (!temperature.converged) {
    return { f, mb, geometry, temperature, infeasible: null, unconverged: true };
  }

  const tEnd = temperature.tEnd;
  const tMean = 0.5 * (x.chargeTemp + tEnd);
  const d = disperserAt(tMean, f, mb, x, fx, alpha, geometry);

  // --- dispersion ----------------------------------------------------------
  const dispSeconds = x.dispTime * 60;
  const specificEnergy = mb.mass > 0 ? d.power * dispSeconds / mb.mass : 0;    // J/kg
  const disperse = grind(d.stress, specificEnergy, fx, REF.disperserFloor, REF.agglomerateSize * fx.agglomerateFactor, REF.dispersionRate, f.cohesive);

  // --- bead mill -----------------------------------------------------------
  const passes = Math.round(x.beadMillPasses);
  const passSeconds = x.beadMillFlow > 0 ? (mb.volume / x.beadMillFlow) * 60 : 0;
  const millSeconds = passes * passSeconds;
  const millEnergy = mb.mass > 0 ? x.beadMillPower * 1000 * millSeconds / mb.mass : 0;
  // The bead mill is a media mill: it does not need the disperser's stress to
  // work, so its own breakage runs on energy alone.
  const millGrind = passes > 0
    ? REF.beadMillFloor + (disperse.d - REF.beadMillFloor) * Math.exp(-REF.beadMillRate * fx.beadFactor * millEnergy)
    : null;
  const particleSize = passes > 0 ? millGrind : disperse.d;
  const fineness = hegman(particleSize);

  // --- losses --------------------------------------------------------------
  const evaporated = mb.mSolvent / 1000 * REF.evaporationRate * (dispSeconds / 3600)
    * Math.exp((tEnd - 25) / 18);                                             // kg
  const dustLost = mb.mPig / 1000 * REF.dustLoss;                             // kg

  // --- let-down ------------------------------------------------------------
  // The finished paint is judged at the let-down temperature, which is the
  // jacket temperature by the time the batch is thinned and circulated.
  const paintTemp = x.jacketTemp;
  const vehicleVolume = (f.vResinSolution + f.vSolventAdded + f.vAdditives) * batchVolume;
  const paintConcentration = vehicleVolume > 0 ? f.mBinderSolid * batchVolume / (vehicleVolume * 1000) : null;
  const muPaintVehicle = vehicleViscosity(paintConcentration, alpha, paintTemp);
  const paintRelative = relativeViscosity(f.vPigment);
  const thickenerFactor = Math.exp(REF.thickenerPotency * x.thickenerDose);

  // Flocculation stiffens the paint at low shear without adding anything to it.
  const flocculation = fx.flocculation * (1 + 0.6 * Math.max(0, particleSize - REF.disperserFloor) / 20);
  const muLowShear = paintRelative === null ? null
    : muPaintVehicle * paintRelative * thickenerFactor * Math.pow(flocculation, 0.7);
  const muStormer = muLowShear === null ? null
    : atShearRate(muLowShear, REF.stormerShearRate, REF.paintFlowIndex);
  const stormerCp = muStormer === null ? null : muStormer * 1000;
  const krebs = stormerCp === null ? null : krebsUnits(stormerCp);

  // Casson yield stress: the structure the thickener and the pigment network
  // hold at rest, which is what stops a wet film running down a wall.
  const yieldStress = REF.yieldStressCoefficient
    * Math.pow(f.vPigment / REF.phiMax, REF.yieldStressExponent) * thickenerFactor * flocculation;
  const sagLimit = f.density > 0 ? yieldStress / (f.density * REF.g) * 1e6 : null;   // µm wet

  // Orchard levelling: how long a brush mark takes to flow out.
  const levelTime = muLowShear === null ? null
    : 3 * muLowShear * Math.pow(REF.brushWavelength, 4)
      / (16 * Math.pow(Math.PI, 4) * REF.surfaceTension * Math.pow(x.wetFilmThickness * 1e-6, 3));

  // --- film and optics -----------------------------------------------------
  const dryFilm = x.wetFilmThickness * f.vs;                                  // µm
  // Above the critical pigment volume concentration the binder no longer fills
  // the space between the particles and the balance is air.
  const packedVolume = f.cpvc > 0 ? f.vPigment / f.cpvc : null;
  const filmVoid = (f.lambda > 1 && packedVolume !== null)
    ? clamp((packedVolume - f.vPigment - f.vBinder) / packedVolume, 0, 0.6) : 0;

  const crowding = 1 / (1 + REF.crowdingStrength * Math.max(0, f.tio2Concentration - REF.crowdingOnset));
  const dispersionQuality = Math.exp(-Math.max(0, particleSize - REF.disperserFloor) / 60) / Math.pow(fx.flocculation, 0.35);
  const scattering = REF.scatteringPerVolume * f.tio2Concentration * crowding * dispersionQuality
    + REF.voidScattering * filmVoid;
  const absorption = REF.absorptionWhite + REF.absorptionPerColourant * x.colourantDose;

  const overBlack = kubelkaMunk(absorption, scattering, dryFilm, 0);
  const overWhite = kubelkaMunk(absorption, scattering, dryFilm, REF.whiteBacking);
  const contrastRatio = (overBlack !== null && overWhite > 0) ? overBlack / overWhite * 100 : null;

  // --- gloss ---------------------------------------------------------------
  const pvcTerm = Math.exp(-REF.glossPvcStrength * Math.pow(Math.max(f.lambda, 0), REF.glossPvcExponent));
  const roughness = 1 / (1 + Math.pow(Math.max(0, particleSize - REF.glossRoughnessOnset) / REF.glossRoughnessScale, 2));
  const gloss = REF.glossMax * pvcTerm * roughness / Math.pow(fx.flocculation, 0.45);

  // --- cycle ---------------------------------------------------------------
  const pigmentAddMinutes = (f.mPigment * batchVolume / 1000) / REF.pigmentAddRate * 60;
  const chargeMinutes = REF.chargeTimeBase + pigmentAddMinutes;
  const millMinutes = millSeconds / 60;
  const fillMinutes = batchVolume / REF.fillingRate;
  const cycleMinutes = chargeMinutes + x.dispTime + millMinutes + REF.letdownTime + fillMinutes;
  const batchesPerShift = cycleMinutes > 0 ? REF.shiftHours * 60 / cycleMinutes : null;
  const outputPerHour = cycleMinutes > 0 ? batchVolume / (cycleMinutes / 60) : null;

  const shaftEnergy = d.power * dispSeconds / 3.6e6;                          // kWh
  const millEnergyKwh = x.beadMillPower * millSeconds / 3600;                 // kWh
  const energyPerLitre = batchVolume > 0 ? (shaftEnergy + millEnergyKwh) * 1000 / batchVolume : null;  // Wh/L

  // --- balances ------------------------------------------------------------
  // The charge is what the formulation says to weigh out; the product is what
  // is left after the losses. A batch balance is a statement of those two and
  // the difference between them, not a reconciliation of independent measures.
  const chargedMass = f.mPaint * batchVolume / 1000;                          // kg
  const productMass = chargedMass - evaporated - dustLost;
  const yieldVolume = f.density > 0 ? productMass * 1000 / f.density : null;  // L
  const batchYield = batchVolume > 0 && yieldVolume !== null ? yieldVolume / batchVolume : null;
  // The one genuine arithmetic check available: the component volumes of a
  // litre of paint must come to a litre, and the added solvent was found by
  // difference from everything else.
  const volumeCheck = (f.vPigment + f.vResinSolution + f.vSolventAdded + f.vAdditives) * 1000;
  const chargedVolume = volumeCheck / 1000 * batchVolume;

  const heatIn = d.power * dispSeconds;                                       // J
  const capacity = mb.mass * REF.cpMillBase * 1000;                           // J/K
  const heatStored = capacity * (tEnd - x.chargeTemp);
  // Integrated along the temperature profile rather than taken by difference,
  // so the closure below is a real check that the analytic solution satisfies
  // the balance it came from instead of an identity restated.
  const tau = d.ua > 0 ? capacity / d.ua : Infinity;
  const steadyTemp = d.ua > 0 ? x.jacketTemp + d.power / d.ua : null;
  const heatRemoved = d.ua > 0
    ? d.power * dispSeconds + capacity * (x.chargeTemp - steadyTemp) * (1 - Math.exp(-dispSeconds / tau))
    : 0;
  const energyClosure = heatIn > 0 ? Math.abs(heatIn - (heatStored + heatRemoved)) / heatIn : 0;

  // Installed power. A disperser is bought as a package, so the motor is sized
  // for the blade it carries — the power that blade draws at the top of its
  // working tip speed in a nominal mill base — rather than for the vessel it
  // stands in. Over-speeding past that is what trips it, which is the real
  // constraint an operator meets.
  const ratedSpeed = REF.ratedTipSpeed / (Math.PI * Math.max(x.bladeDiameter, 1e-6));
  const ratedPower = REF.powerNumber * REF.nominalMillBaseDensity
    * Math.pow(ratedSpeed, 3) * Math.pow(x.bladeDiameter, 5) / 1000;                    // kW
  const installedPower = Math.max(7.5, Math.ceil(ratedPower / 7.5) * 7.5);              // kW
  const motorLoad = installedPower > 0 ? d.power / 1000 / installedPower : null;

  return {
    f, mb, geometry, temperature, d, alpha,
    tEnd, tMean, dispSeconds, specificEnergy, disperse,
    passes, passSeconds, millSeconds, millEnergy, particleSize, fineness,
    evaporated, dustLost,
    paintTemp, muPaintVehicle, paintRelative, thickenerFactor, flocculation,
    muLowShear, muStormer, stormerCp, krebs, yieldStress, sagLimit, levelTime,
    dryFilm, filmVoid, crowding, dispersionQuality, scattering, absorption,
    overBlack, overWhite, contrastRatio, gloss, pvcTerm, roughness,
    chargeMinutes, pigmentAddMinutes, millMinutes, fillMinutes, cycleMinutes,
    batchesPerShift, outputPerHour, shaftEnergy, millEnergyKwh, energyPerLitre,
    productMass, chargedMass, yieldVolume, batchYield, volumeCheck, chargedVolume,
    heatIn, heatStored, heatRemoved, energyClosure, steadyTemp, tau,
    installedPower, ratedPower, ratedSpeed, motorLoad
  };
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------
export const inputSpec = {
  batchVolume: {
    label: 'Batch volume', unit: 'L', min: 200, max: 20000, step: 100, default: 4000,
    group: 'Batch', level: 'student',
    rules: [rules.required(), rules.positive('Batch volume'), rules.range(200, 20000, 'L', 'Outside the size range this teaching model was set up for.')]
  },
  pvc: {
    label: 'Pigment volume concentration', unit: U.pct, min: 5, max: 75, step: 0.5, default: 22,
    group: 'Formulation', level: 'student',
    rules: [rules.required(), rules.positive('PVC'), rules.range(5, 75, U.pct, 'Below 5 % there is barely a pigment; above 75 % there is barely a paint.')]
  },
  volumeSolids: {
    label: 'Volume solids', unit: U.pct, min: 20, max: 70, step: 0.5, default: 42,
    group: 'Formulation', level: 'student',
    rules: [rules.required(), rules.positive('Volume solids'), rules.range(20, 70, U.pct, 'Outside the band this model was fitted over.')]
  },
  tio2Share: {
    label: 'Titanium dioxide share of the pigment', unit: U.pct, min: 0, max: 100, step: 1, default: 78,
    group: 'Formulation', level: 'student',
    rules: [rules.required(), rules.nonNegative('Titanium dioxide share'), rules.range(0, 100, U.pct, 'A share of the pigment volume, so it cannot exceed 100 %.')]
  },
  thickenerDose: {
    label: 'Rheology modifier', unit: '% on paint weight', min: 0, max: 1.5, step: 0.05, default: 0.5,
    group: 'Formulation', level: 'engineer',
    rules: [rules.required(), rules.nonNegative('Rheology modifier'), rules.range(0, 1.5, '%', 'Above 1.5 % the paint is a gel and this model no longer describes it.')]
  },
  colourantDose: {
    label: 'Tinting colourant', unit: 'mL/L', min: 0, max: 120, step: 1, default: 0,
    group: 'Formulation', level: 'expert',
    rules: [rules.required(), rules.nonNegative('Colourant dose'), rules.range(0, 120, 'mL/L', 'Above 120 mL/L the colourant is a significant part of the formulation and has to be balanced out of it.')]
  },

  millBaseBinderShare: {
    label: 'Resin charged to the mill base', unit: U.pct, min: 5, max: 90, step: 1, default: 35,
    group: 'Mill base', level: 'student',
    rules: [rules.required(), rules.positive('Resin share'), rules.range(5, 90, U.pct, 'A share of the total resin, so it cannot exceed 100 %.')]
  },
  millBaseSolventShare: {
    label: 'Solvent charged to the mill base', unit: U.pct, min: 0, max: 95, step: 1, default: 12,
    group: 'Mill base', level: 'student',
    rules: [rules.required(), rules.nonNegative('Solvent share'), rules.range(0, 95, U.pct, 'A share of the added solvent, so it cannot exceed 100 %.')]
  },

  bladeDiameter: {
    label: 'Disperser blade diameter', unit: U.length, min: 0.15, max: 1.2, step: 0.05, default: 0.6,
    group: 'Dispersion', level: 'engineer',
    rules: [rules.required(), rules.positive('Blade diameter'), rules.range(0.15, 1.2, U.length, 'Outside the size range this teaching model was set up for.')]
  },
  dispSpeed: {
    label: 'Disperser speed', unit: 'rpm', min: 100, max: 1800, step: 10, default: 700,
    group: 'Dispersion', level: 'student',
    rules: [rules.required(), rules.positive('Disperser speed'), rules.range(100, 1800, 'rpm', 'Outside the band the power and shear correlations were fitted over.')]
  },
  dispTime: {
    label: 'Dispersion time', unit: U.timeMin, min: 2, max: 180, step: 1, default: 30,
    group: 'Dispersion', level: 'student',
    rules: [rules.required(), rules.positive('Dispersion time'), rules.range(2, 180, U.timeMin, 'Outside the band this model was set up for.')]
  },
  chargeTemp: {
    label: 'Charge temperature', unit: U.tempC, min: 5, max: 40, step: 1, default: 22,
    group: 'Dispersion', level: 'engineer',
    rules: [rules.required(), rules.range(5, 40, U.tempC, 'Outside the band the viscosity correlation was fitted over.')]
  },
  jacketTemp: {
    label: 'Jacket coolant temperature', unit: U.tempC, min: 2, max: 40, step: 1, default: 18,
    group: 'Dispersion', level: 'engineer',
    rules: [rules.required(), rules.range(2, 40, U.tempC, 'Below 2 °C the chilled water freezes; above 40 °C it is not cooling anything.')]
  },

  beadMillPasses: {
    label: 'Bead mill passes', unit: U.dimensionless, min: 0, max: 4, step: 1, default: 0,
    group: 'Bead mill', level: 'engineer',
    rules: [rules.required(), rules.nonNegative('Passes'), rules.range(0, 4, '', 'Beyond four passes the mill is heating the batch rather than grinding it.')]
  },
  beadMillPower: {
    label: 'Bead mill power draw', unit: U.powerKW, min: 5, max: 160, step: 5, default: 45,
    group: 'Bead mill', level: 'expert',
    rules: [rules.required(), rules.positive('Bead mill power'), rules.range(5, 160, U.powerKW, 'Outside the size range this teaching model was set up for.')]
  },
  beadMillFlow: {
    label: 'Bead mill throughput', unit: 'L/min', min: 5, max: 400, step: 5, default: 80,
    group: 'Bead mill', level: 'expert',
    rules: [rules.required(), rules.positive('Bead mill throughput'), rules.range(5, 400, 'L/min', 'Outside the size range this teaching model was set up for.')]
  },

  wetFilmThickness: {
    label: 'Applied wet film thickness', unit: 'µm', min: 20, max: 300, step: 5, default: 100,
    group: 'Application', level: 'student',
    rules: [rules.required(), rules.positive('Wet film thickness'), rules.range(20, 300, 'µm', 'Outside the band the film and levelling relations were fitted over.')]
  }
};

// ---------------------------------------------------------------------------
export const assumptions = [
  { text: 'A single batch is modelled from charge to fill. Nothing is at steady state, and the answers are end-of-step values rather than time-averaged ones.', kind: KIND.APPROX },
  { text: 'Volumes are taken as additive. Real formulations contract slightly when a polymer solution and a solvent are mixed.', kind: KIND.APPROX },
  { text: 'The pigment is one blend of titanium dioxide and an extender with one oil absorption and one particle size, rather than a distribution of each.', kind: KIND.APPROX },
  { text: 'The resin is supplied as a 60 % solids solution of fixed viscosity, so raising the volume solids of the paint always brings solvent with it.', kind: KIND.REF },
  { text: 'The let-down adds the remaining resin, solvent and additives without changing the state of dispersion, unless the let-down shock fault is active.', kind: KIND.APPROX },
  { text: 'Quality is judged on a drawn-down film of the stated wet thickness, not on a sprayed or brushed one.', kind: KIND.APPROX },
  { text: 'The batch is a lumped thermal capacity: one temperature throughout the vessel at any moment.', kind: KIND.APPROX },

  { text: 'The critical pigment volume concentration is calculated from the oil absorption of the pigment blend: CPVC = 1/(1 + OA·ρ/93.5), with 93.5 the density of linseed oil in the units the oil absorption is quoted in.', kind: KIND.CORR, source: 'Asbeck & Van Loo' },
  { text: 'Suspension viscosity uses the Krieger–Dougherty relation with an intrinsic viscosity of 2.5 and a maximum packing fraction of 0.62.', kind: KIND.CORR, source: 'Krieger & Dougherty' },
  { text: 'Vehicle viscosity follows µ = µ_solvent·exp(α·c^1.4) in the polymer concentration, with α fixed by the viscosity of the resin as supplied, and an Arrhenius temperature correction of 3000 K.', kind: KIND.CORR },
  { text: 'Both the mill base and the finished paint are shear thinning, with power-law indices of 0.75 and 0.80 respectively.', kind: KIND.APPROX },
  { text: 'Krebs units are converted from centipoise by a fit to the ASTM D562 conversion table over 50–110 KU. It is a fit to a table, not a law.', kind: KIND.CORR },
  { text: 'Disperser power is the sum of a fully turbulent term Np·ρ·N³·D⁵ with Np = 0.18 for a sawtooth disc and a creeping-flow term 110·µ·N²·D³, which covers the transition without a correlation for it.', kind: KIND.CORR },
  { text: 'The shear rate in the blade zone is taken as 200·u/D, which for a disc means it depends on rotational speed alone.', kind: KIND.APPROX },
  { text: 'Agglomerates break only where the hydrodynamic stress exceeds their cohesive strength, taken as 1150 Pa for rutile and 300 Pa for an extender and blended by volume; above that, fineness decays exponentially with the specific energy applied.', kind: KIND.APPROX },
  { text: 'A Hegman reading is converted from the largest particle a grind gauge still catches, over a 0–8 scale spanning 100 µm.', kind: KIND.CORR },
  { text: 'Opacity is the two-flux Kubelka–Munk solution for a film over black and over a 0.80 reflectance white, not an approximation of it.', kind: KIND.FIRST },
  { text: 'The scattering coefficient rises with titanium dioxide content and is reduced by crowding above a volume concentration of 0.14, and by anything left undispersed.', kind: KIND.APPROX },
  { text: 'Above the critical pigment volume concentration the binder no longer fills the space between the particles and the balance is air, which scatters in its own right. That is how a flat paint hides.', kind: KIND.FIRST },
  { text: 'Gloss falls with the ratio of PVC to CPVC as exp(−2.6·Λ³) and is reduced further by any grind coarser than 8 µm.', kind: KIND.APPROX },
  { text: 'Sag resistance is the wet film a Casson yield stress can hold on a vertical wall, τ_y/(ρg). The yield stress itself is taken as rising with the 1.6 power of the pigment packing ratio and with the rheology modifier.', kind: KIND.FIRST },
  { text: 'Levelling uses the Orchard equation for the decay of a sinusoidal surface disturbance, with a brush-mark wavelength of 2 mm.', kind: KIND.CORR, source: 'Orchard' },

  { text: 'The batch energy balance is solved rather than assumed: the shaft power depends on the viscosity, the viscosity on the temperature, and the temperature on the shaft power. The end temperature is found with the shared bisection solver.', kind: KIND.FIRST },
  { text: 'Solvent lost by evaporation rises exponentially with batch temperature, at 0.4 % of the mill-base solvent per hour at 25 °C.', kind: KIND.APPROX },
  { text: 'The vessel follows the usual rule of thumb of a tank three blade diameters across, which is what fixes the jacket area available for cooling.', kind: KIND.REF },
  { text: 'The motor is sized for the blade rather than for the vessel: the installed rating is the power that blade would draw at a 28 m/s tip speed in a nominal 1600 kg/m³ mill base, rounded up to the next 7.5 kW frame.', kind: KIND.REF }
];

export const equations = [
  {
    what: 'Pigment volume concentration and its critical value',
    equation: 'PVC = V_pigment / (V_pigment + V_binder)        CPVC = 1 / (1 + OA·ρ_p / 93.5)        Λ = PVC / CPVC',
    why: 'The CPVC is where there stops being enough binder to fill the space between the pigment particles. Almost every film property turns at that point, so the ratio of the two matters far more than either on its own.',
    inputs: ['Pigment volume concentration', 'Oil absorption', 'Pigment density'],
    units: 'all dimensionless',
    interpretation: 'Λ near 0.3 is a gloss paint, near 0.8 a satin, above 1 a flat. Formulating is largely a matter of deciding where on that scale you want to be.'
  },
  {
    what: 'Suspension viscosity',
    equation: 'η_r = (1 − φ/φ_m)^(−[η]·φ_m)        µ = µ_vehicle · η_r',
    why: 'It is what makes a mill base workable or not, and it diverges rather than rising smoothly, which is why there is a window rather than an optimum.',
    inputs: ['Pigment volume fraction in the mill base', 'Vehicle viscosity'],
    units: 'Pa·s',
    interpretation: 'At φ/φ_m of 0.5 the suspension is twice the vehicle; at 0.9 it is thirty times. The last few percent of loading cost more than all the ones before them.'
  },
  {
    what: 'Disperser power and tip speed',
    equation: 'u = π·D·N        P = Np·ρ·N³·D⁵ + K·µ·N²·D³',
    why: 'Tip speed is what the operator sets and what the equipment is rated on; power is what the batch actually receives and what the motor has to deliver.',
    inputs: ['Blade diameter', 'Disperser speed', 'Mill base density and viscosity'],
    units: 'u in m/s, P in W',
    interpretation: 'Power goes as the fifth power of blade diameter. Going up one blade size is not a small change to anything.'
  },
  {
    what: 'Dispersion: stress threshold and specific energy',
    equation: 'σ = µ(γ̇)·γ̇        d = d_∞ + (d_0 − d_∞)·exp(−k·E)        k ∝ max(0, σ/σ_c − 1)',
    why: 'Breaking an agglomerate needs a stress above its cohesive strength. Below that the blade turns and nothing happens, however long you leave it. Above it, how far the grind goes is set by energy per kilogram.',
    inputs: ['Mill base viscosity', 'Shear rate', 'Dispersion time', 'Power'],
    units: 'σ in Pa, E in J/kg, d in µm',
    interpretation: 'This is why a mill base that is too thin will not disperse at any speed: there is no viscosity to carry the stress.'
  },
  {
    what: 'Batch temperature',
    equation: 'm·c_p·dT/dt = P(T) − UA·(T − T_j)        T(t) = T_∞ + (T_0 − T_∞)·exp(−t/τ)',
    why: 'Every watt on the shaft ends up in the batch. Whether that matters depends on the jacket, and the two are coupled because the power itself depends on the viscosity.',
    inputs: ['Shaft power', 'Jacket area and coolant temperature', 'Dispersion time'],
    units: '°C',
    interpretation: 'A long dispersion in a poorly cooled vessel does not just waste energy; it drives off solvent and thickens the batch while you watch.'
  },
  {
    what: 'Opacity by Kubelka–Munk',
    equation: 'R = [1 − R_g(a − b·coth(bSX))] / [a − R_g + b·coth(bSX)]        a = 1 + K/S, b = √(a²−1)',
    why: 'Hiding is an optical property of the dry film, not an amount of white pigment. It is set by how much light the film scatters over its thickness.',
    inputs: ['Scattering coefficient', 'Absorption coefficient', 'Dry film thickness'],
    units: 'S and K in 1/µm, X in µm',
    interpretation: 'Doubling the titanium dioxide does not double the hiding, because crowded particles scatter less than spaced ones.'
  },
  {
    what: 'Sag and levelling',
    equation: 'h_sag = τ_y / (ρ·g)        τ_level = 3·µ·λ⁴ / (16·π⁴·σ·h³)',
    why: 'They pull in opposite directions. What stops a film running down a wall is the same structure that stops a brush mark flowing out.',
    inputs: ['Yield stress', 'Low-shear viscosity', 'Wet film thickness'],
    units: 'h in m, τ_level in s',
    interpretation: 'Levelling time goes as the inverse cube of film thickness. A thin coat of the same paint levels far more slowly than a thick one.'
  },
  {
    what: 'Volatile organic content',
    equation: 'VOC = mass of organic volatiles per litre of paint',
    why: 'It is a regulated number, and on a solvent-borne paint it is fixed by the formulation rather than by anything that happens in the plant.',
    inputs: ['Volume solids', 'Resin solids', 'Solvent density'],
    units: 'g/L',
    interpretation: 'The only way down is up: raise the volume solids, or use a resin that arrives with less solvent in it.'
  }
];

// ---------------------------------------------------------------------------
// Result assembly
// ---------------------------------------------------------------------------
const field = (label, value, unit, digits = 2, kind = KIND.CALC) => ({ label, value, unit, digits, kind });
const fmt = (v, d, unit) => (Number.isFinite(v) ? `${v.toFixed(d)}${unit ? ' ' + unit : ''}` : '—');

function buildResults(s, x, fx) {
  const on = s.mb && s.mb.mass > 0 && x.dispTime > 0;
  const only = v => (on && Number.isFinite(v) ? v : null);
  const pctOf = v => (on && Number.isFinite(v) ? v * 100 : null);

  const kpis = [
    { label: 'Fineness of grind', value: only(s.fineness), unit: 'Hegman', digits: 2 },
    { label: 'Gloss at 60°', value: only(s.gloss), unit: 'GU', digits: 1 },
    { label: 'Contrast ratio', value: only(s.contrastRatio), unit: U.pct, digits: 2 },
    { label: 'Stormer viscosity', value: only(s.krebs), unit: 'KU', digits: 1 },
    { label: 'Volatile organic content', value: only(s.f.voc), unit: 'g/L', digits: 0 },
    { label: 'Batch cycle time', value: only(s.cycleMinutes), unit: U.timeMin, digits: 0 }
  ];

  const results = {
    // formulation
    pvc: field('Pigment volume concentration', pctOf(s.f.pvc), U.pct, 1, KIND.USER),
    cpvc: field('Critical pigment volume concentration', pctOf(s.f.cpvc), U.pct, 1, KIND.CORR),
    lambda: field('Λ, PVC over CPVC', only(s.f.lambda), U.dimensionless, 3, KIND.CORR),
    oilAbsorption: field('Oil absorption of the pigment blend', only(s.f.oaBlend), 'g/100 g', 1, KIND.REF),
    pigmentDensity: field('Pigment blend density', only(s.f.rhoPigment), U.density, 0),
    tio2Concentration: field('Titanium dioxide in the dry film', pctOf(s.f.tio2Concentration), U.pct, 1),
    density: field('Paint density', only(s.f.density), 'g/L', 0),
    weightSolids: field('Weight solids', pctOf(s.f.weightSolids), U.pct, 1),
    voc: field('Volatile organic content', only(s.f.voc), 'g/L', 0),
    solventAdded: field('Added solvent per litre of paint', only(s.f.vSolventAdded * 1000), 'mL/L', 0),
    solventFromResin: field('Solvent arriving with the resin', only(s.f.vSolventInResin * 1000), 'mL/L', 0),

    // mill base
    millBaseVolume: field('Mill base volume', only(s.mb.volume), 'L', 0),
    millBaseMass: field('Mill base mass', only(s.mb.mass), 'kg', 0),
    millBasePhi: field('Pigment volume fraction in the mill base', only(s.mb.phi), U.dimensionless, 3),
    millBaseConcentration: field('Polymer in the mill base vehicle', only(s.mb.concentration * 1000), 'g/L', 0),
    vehicleViscosity: field('Mill base vehicle viscosity', only(s.d?.muVehicle), U.viscPa, 3, KIND.CORR),
    relativeViscosity: field('Relative viscosity of the mill base', only(s.d?.relative), U.dimensionless, 2, KIND.CORR),
    millBaseViscosity: field('Mill base viscosity at rest', only(s.d?.muLow), U.viscPa, 2, KIND.CORR),
    millBaseAtShear: field('Mill base viscosity in the blade zone', only(s.d?.muAtShear), U.viscPa, 3, KIND.CORR),

    // dispersion
    tipSpeed: field('Blade tip speed', only(s.d?.tipSpeed), U.velocity, 1, KIND.FIRST),
    bladeToTank: field('Blade to tank diameter ratio', only(s.geometry?.ratio), U.dimensionless, 2, KIND.REF),
    shearRate: field('Shear rate in the blade zone', only(s.d?.shearRate), '1/s', 0, KIND.APPROX),
    shearStress: field('Hydrodynamic stress on the agglomerates', only(s.d?.stress), 'Pa', 0, KIND.APPROX),
    cohesiveStrength: field('Cohesive strength of the pigment blend', only(s.disperse?.strength), 'Pa', 0, KIND.REF),
    stressRatio: field('Stress over cohesive strength', only(s.d?.stress / s.disperse?.strength), U.dimensionless, 2, KIND.APPROX),
    reynolds: field('Impeller Reynolds number', only(s.d?.reynolds), U.dimensionless, 0, KIND.FIRST),
    shaftPower: field('Disperser shaft power', only(s.d?.power / 1000), U.powerKW, 1, KIND.CORR),
    turbulentPower: field('Turbulent contribution to the power', only(s.d?.turbulent / 1000), U.powerKW, 1, KIND.CORR),
    laminarPower: field('Viscous contribution to the power', only(s.d?.laminar / 1000), U.powerKW, 2, KIND.CORR),
    installedPower: field('Installed motor rating', only(s.installedPower), U.powerKW, 1, KIND.CORR),
    ratedPower: field('Power the blade draws at its rated tip speed', only(s.ratedPower), U.powerKW, 1, KIND.CORR),
    motorLoad: field('Motor loading', pctOf(s.motorLoad), U.pct, 1),
    specificEnergy: field('Specific dispersion energy', only(s.specificEnergy / 1000), 'kJ/kg', 1, KIND.FIRST),

    // temperature
    batchTemp: field('Batch temperature at the end of dispersion', only(s.tEnd), U.tempC, 1, KIND.FIRST),
    jacketArea: field('Jacket heat transfer area', only(s.geometry?.jacketArea), U.area, 2),
    ua: field('Jacket UA', only(s.d?.ua), 'W/K', 0, KIND.CORR),
    solventEvaporated: field('Solvent lost by evaporation', only(s.evaporated), 'kg', 2, KIND.APPROX),

    // grind
    agglomerateSize: field('Largest agglomerate after dispersion', only(s.disperse?.d), 'µm', 2, KIND.APPROX),
    beadMillEnergy: field('Specific energy in the bead mill', only(s.millEnergy / 1000), 'kJ/kg', 1, KIND.FIRST),
    particleSize: field('Largest particle in the finished paint', only(s.particleSize), 'µm', 2, KIND.APPROX),
    fineness: field('Fineness of grind', only(s.fineness), 'Hegman', 2, KIND.CORR),

    // let-down and rheology
    paintVehicleViscosity: field('Let-down vehicle viscosity', only(s.muPaintVehicle), U.viscPa, 3, KIND.CORR),
    thickenerFactor: field('Rheology modifier multiplier', only(s.thickenerFactor), U.dimensionless, 2, KIND.APPROX),
    lowShearViscosity: field('Paint viscosity at rest', only(s.muLowShear), U.viscPa, 2, KIND.CORR),
    stormerViscosity: field('Paint viscosity at 200 1/s', only(s.stormerCp), U.viscCp, 0, KIND.CORR),
    krebs: field('Stormer viscosity', only(s.krebs), 'KU', 1, KIND.CORR),
    yieldStress: field('Casson yield stress', only(s.yieldStress), 'Pa', 2, KIND.APPROX),
    sagLimit: field('Wet film the paint can hold without sagging', only(s.sagLimit), 'µm', 0, KIND.FIRST),
    levelTime: field('Brush-mark levelling time', only(s.levelTime), U.time, 1, KIND.CORR),

    // film and optics
    wetFilm: field('Applied wet film thickness', only(x.wetFilmThickness), 'µm', 0, KIND.USER),
    dryFilm: field('Dry film thickness', only(s.dryFilm), 'µm', 1, KIND.FIRST),
    filmVoid: field('Air voids in the dry film', pctOf(s.filmVoid), U.pct, 1, KIND.FIRST),
    crowding: field('Crowding factor on the scattering', only(s.crowding), U.dimensionless, 3, KIND.APPROX),
    dispersionQuality: field('Scattering retained after dispersion', pctOf(s.dispersionQuality), U.pct, 1, KIND.APPROX),
    scattering: field('Scattering coefficient', only(s.scattering), '1/µm', 4, KIND.APPROX),
    absorption: field('Absorption coefficient', only(s.absorption), '1/µm', 5, KIND.APPROX),
    reflectanceBlack: field('Reflectance over black', pctOf(s.overBlack), U.pct, 2, KIND.FIRST),
    reflectanceWhite: field('Reflectance over white', pctOf(s.overWhite), U.pct, 2, KIND.FIRST),
    contrastRatio: field('Contrast ratio', only(s.contrastRatio), U.pct, 2, KIND.FIRST),
    gloss: field('Gloss at 60°', only(s.gloss), 'GU', 1, KIND.APPROX),

    // plant
    chargeTime: field('Charging time', only(s.chargeMinutes), U.timeMin, 1),
    millTime: field('Bead mill time', only(s.millMinutes), U.timeMin, 1),
    fillTime: field('Filtering and filling time', only(s.fillMinutes), U.timeMin, 1),
    cycleTime: field('Batch cycle time', only(s.cycleMinutes), U.timeMin, 1),
    batchesPerShift: field('Batches per eight-hour shift', only(s.batchesPerShift), U.dimensionless, 2),
    outputPerHour: field('Average output', only(s.outputPerHour), 'L/h', 0),
    energyPerLitre: field('Dispersion energy per litre', only(s.energyPerLitre), 'Wh/L', 1)
  };

  const massBalance = {
    pigmentCharged: field('Pigment charged', only(s.f.mPigment * x.batchVolume / 1000), 'kg', 1),
    resinCharged: field('Resin solution charged', only(s.f.mResinSolution * x.batchVolume / 1000), 'kg', 1),
    solventCharged: field('Solvent charged', only(s.f.mSolventAdded * x.batchVolume / 1000), 'kg', 1),
    additivesCharged: field('Additives charged', only((s.f.mThickener + s.f.mColourant) * x.batchVolume / 1000), 'kg', 2),
    totalCharged: field('Total charged', only(s.chargedMass), 'kg', 1),
    productOut: field('Paint produced', only(s.productMass), 'kg', 1),
    evaporated: field('Solvent lost as vapour', only(s.evaporated), 'kg', 2),
    dustLost: field('Pigment lost to the dust collector', only(s.dustLost), 'kg', 2),
    volumeCheck: field('Component volumes per litre of paint', only(s.volumeCheck), 'mL/L', 4, KIND.FIRST),
    volumeCharged: field('Volume charged', only(s.chargedVolume), 'L', 1),
    volumeTarget: field('Batch volume target', only(x.batchVolume), 'L', 1, KIND.USER),
    yieldVolume: field('Paint recovered', only(s.yieldVolume), 'L', 1),
    batchYield: field('Batch yield', pctOf(s.batchYield), U.pct, 3)
  };

  const energyBalance = {
    shaftWork: field('Shaft work into the batch', only(s.heatIn / 3.6e6), 'kWh', 2, KIND.FIRST),
    millWork: field('Bead mill work', only(s.millEnergyKwh), 'kWh', 2, KIND.FIRST),
    stored: field('Heat stored in the batch', only(s.heatStored / 3.6e6), 'kWh', 2, KIND.FIRST),
    removed: field('Heat removed by the jacket', only(s.heatRemoved / 3.6e6), 'kWh', 2, KIND.FIRST),
    steadyTemp: field('Temperature the batch would settle at', only(s.steadyTemp), U.tempC, 1, KIND.FIRST),
    timeConstant: field('Thermal time constant of the batch', only(s.tau / 60), U.timeMin, 1, KIND.FIRST),
    closure: field('Energy balance closure error', pctOf(s.energyClosure), U.pct, 6),
    tempRise: field('Temperature rise during dispersion', only(s.tEnd - x.chargeTemp), 'K', 1, KIND.FIRST),
    specificEnergy: field('Specific energy on the mill base', only(s.specificEnergy / 1000), 'kJ/kg', 1)
  };

  const quality = {
    fineness: field('Fineness of grind', only(s.fineness), 'Hegman', 2, KIND.CORR),
    particleSize: field('Largest particle', only(s.particleSize), 'µm', 2, KIND.APPROX),
    gloss: field('Gloss at 60°', only(s.gloss), 'GU', 1, KIND.APPROX),
    contrastRatio: field('Contrast ratio', only(s.contrastRatio), U.pct, 2, KIND.FIRST),
    krebs: field('Stormer viscosity', only(s.krebs), 'KU', 1, KIND.CORR),
    sagLimit: field('Sag resistance', only(s.sagLimit), 'µm wet', 0, KIND.FIRST),
    levelTime: field('Levelling time', only(s.levelTime), U.time, 1, KIND.CORR),
    voc: field('Volatile organic content', only(s.f.voc), 'g/L', 0),
    weightSolids: field('Weight solids', pctOf(s.f.weightSolids), U.pct, 1),
    lambda: field('Λ, PVC over CPVC', only(s.f.lambda), U.dimensionless, 3, KIND.CORR)
  };

  const charts = on ? [
    {
      type: 'bar', title: 'Batch cycle', unit: 'min',
      bars: [
        { label: 'Charge', value: s.chargeMinutes },
        { label: 'Disperse', value: x.dispTime },
        { label: 'Mill', value: s.millMinutes },
        { label: 'Let down', value: REF.letdownTime },
        { label: 'Fill', value: s.fillMinutes }
      ].filter(b => Number.isFinite(b.value))
    },
    {
      type: 'line', title: 'Fineness against dispersion energy', xLabel: 'kJ/kg', yLabel: 'Hegman',
      series: [{
        points: Array.from({ length: 26 }, (_, i) => {
          const e = i / 25 * Math.max(s.specificEnergy * 1.6, 1000);
          const g = grind(s.d?.stress, e, fx, REF.disperserFloor, REF.agglomerateSize * fx.agglomerateFactor, REF.dispersionRate, s.f.cohesive);
          return [e / 1000, hegman(g.d)];
        })
      }]
    },
    {
      type: 'line', title: 'Gloss against Λ', xLabel: 'PVC / CPVC', yLabel: 'GU',
      series: [{
        points: Array.from({ length: 31 }, (_, i) => {
          const lam = i / 30 * 1.5;
          return [lam, REF.glossMax * Math.exp(-REF.glossPvcStrength * Math.pow(lam, REF.glossPvcExponent)) * s.roughness];
        })
      }]
    }
  ] : [];

  return { kpis, results, massBalance, energyBalance, quality, charts };
}

// ---------------------------------------------------------------------------
function diagnose(s, x, fx, notes) {
  const out = notes.map(text => ({ level: 'warning', text }));
  const n = v => Number.isFinite(v);

  if (!s.disperse?.dispersing) {
    out.push({
      level: 'error',
      text: `The hydrodynamic stress in the blade zone is ${n(s.d?.stress) ? s.d.stress.toFixed(0) : '—'} Pa against a cohesive strength of ${s.disperse.strength.toFixed(0)} Pa. Nothing is being dispersed: the blade is turning the batch over without breaking a single agglomerate, and it will still be at the fineness it started at in an hour. Either thicken the mill base so it can carry stress, or turn faster.`
    });
  } else if (s.d.stress / s.disperse.strength < 1.25) {
    out.push({ level: 'warning', text: `The stress is only ${(s.d.stress / s.disperse.strength).toFixed(2)} times the cohesive strength, so dispersion is very slow. Most of the dispersion time is being spent for very little grind.` });
  }

  if (n(s.d?.muLow)) {
    if (s.d.muLow < 0.3) out.push({ level: 'warning', text: `The mill base is ${s.d.muLow.toFixed(2)} Pa·s at rest, which is thin. A thin mill base cannot transmit shear to the agglomerates: the blade cuts a hole in it and spins. Charging less solvent to the mill base is usually the first thing to try.` });
    if (s.d.muLow > 15) out.push({ level: 'warning', text: `The mill base is ${s.d.muLow.toFixed(1)} Pa·s at rest, which is very heavy. A disperser needs to establish a flowing doughnut of material around the blade, and above about 15 Pa·s it cannot.` });
  }
  if (n(s.geometry?.ratio) && (s.geometry.ratio < 0.2 || s.geometry.ratio > 0.5)) {
    out.push({ level: 'warning', text: `The blade is ${(s.geometry.ratio * 100).toFixed(0)} % of the tank diameter. Outside roughly a fifth to a half, the flow pattern the correlations assume does not form.` });
  }
  if (n(s.motorLoad) && s.motorLoad > 1) {
    out.push({ level: 'error', text: `The shaft is asking for ${(s.d.power / 1000).toFixed(1)} kW against an installed ${s.installedPower.toFixed(1)} kW. The motor trips rather than turning at this speed in this mill base.` });
  } else if (n(s.motorLoad) && s.motorLoad > 0.9) {
    out.push({ level: 'warning', text: `The motor is at ${(s.motorLoad * 100).toFixed(0)} % of its rating. There is nothing left for a thicker batch or a cold start.` });
  }

  if (n(s.tEnd)) {
    if (s.tEnd > REF.flashPoint - 10) out.push({ level: 'error', text: `The batch reaches ${s.tEnd.toFixed(1)} °C against a solvent flash point of ${REF.flashPoint} °C. This is a flammable atmosphere over an open vessel with a spark source in it, and it is the reason dispersers are cooled at all.` });
    else if (s.tEnd > 45) out.push({ level: 'warning', text: `The batch reaches ${s.tEnd.toFixed(1)} °C. Above about 45 °C solvent leaves faster than it can be replaced, the batch thickens as it goes, and some resins begin to skin.` });
  }

  if (n(s.f?.lambda)) {
    if (s.f.lambda > 1) out.push({ level: 'warning', text: `Λ is ${s.f.lambda.toFixed(2)}, above the critical pigment volume concentration. There is not enough binder to fill the space between the particles, so the dry film contains ${(s.filmVoid * 100).toFixed(1)} % air. Hiding goes up, gloss and durability go down: that is a flat paint, whether or not it was meant to be one.` });
    else if (s.f.lambda > 0.9) out.push({ level: 'warning', text: `Λ is ${s.f.lambda.toFixed(2)}, close enough to the critical pigment volume concentration that small changes in pigment or binder will move the film properties a long way.` });
  }
  if (n(s.fineness) && s.fineness < 6) {
    out.push({ level: 'warning', text: `The grind is Hegman ${s.fineness.toFixed(1)}. Below 6 the largest particles stand proud of the film and take the gloss with them.` });
  }
  if (n(s.krebs)) {
    if (s.krebs < 60) out.push({ level: 'warning', text: `At ${s.krebs.toFixed(0)} KU the paint is thin. It will sag on a vertical surface and give poor film build.` });
    if (s.krebs > 110) out.push({ level: 'warning', text: `At ${s.krebs.toFixed(0)} KU the paint is too heavy to brush or spray without thinning.` });
  }
  if (n(s.sagLimit) && n(x.wetFilmThickness) && s.sagLimit < x.wetFilmThickness) {
    out.push({ level: 'warning', text: `The yield stress holds ${s.sagLimit.toFixed(0)} µm of wet film and ${x.wetFilmThickness.toFixed(0)} µm is being applied, so it sags. More rheology modifier, or a thinner coat.` });
  }
  if (n(s.levelTime) && s.levelTime > 300) {
    out.push({ level: 'warning', text: `Brush marks take ${(s.levelTime / 60).toFixed(1)} minutes to flow out, which is longer than the film stays open. The marks will still be there when it sets.` });
  }
  if (n(s.contrastRatio) && s.contrastRatio < 92) {
    out.push({ level: 'warning', text: `The contrast ratio is ${s.contrastRatio.toFixed(1)} % at ${s.dryFilm.toFixed(0)} µm dry. Below about 92 % the substrate shows through and a second coat is needed.` });
  }
  if (fx.flocculation > 1) {
    out.push({ level: 'warning', text: 'The pigment is flocculated. The grind gauge may still read well, because the flocs are soft and the blade of the gauge shears them flat — but the gloss, the opacity and the low-shear viscosity all say otherwise.' });
  }
  if (!n(s.contrastRatio)) {
    out.push({ level: 'info', text: 'There is no scattering pigment in this formulation, so it has no hiding power and no contrast ratio exists for it. What has been made is a clear varnish, which is a perfectly good product and a poor paint.' });
  }
  if (!out.some(m => m.level === 'error') && n(s.fineness) && s.fineness >= 7 && n(s.gloss) && s.gloss >= 80 && n(s.contrastRatio)) {
    out.push({ level: 'info', text: `Hegman ${s.fineness.toFixed(1)} at ${(s.specificEnergy / 1000).toFixed(0)} kJ/kg with ${s.gloss.toFixed(0)} GU gloss and a contrast ratio of ${s.contrastRatio.toFixed(1)} %. This is a batch that would pass.` });
  }
  return out;
}

// ---------------------------------------------------------------------------
function equipmentFrom(s, x, fx) {
  const off = !(s.mb?.mass > 0);
  const run = (alarm = false) => ({ state: off ? 'stopped' : alarm ? 'warning' : 'running', alarm });
  const eq = {};
  const n = v => Number.isFinite(v);

  eq[TAGS.resinTank] = {
    ...run(false), level: off ? 0 : 0.72,
    values: {
      'Resin charged': fmt(s.f.mResinSolution * x.batchVolume / 1000, 0, 'kg'),
      'To mill base': fmt(x.millBaseBinderShare, 0, U.pct),
      Solids: fmt(REF.resinSolids * 100, 0, U.pct)
    }
  };
  eq[TAGS.solventTank] = {
    ...run(false), level: off ? 0 : 0.6,
    values: {
      'Solvent charged': fmt(s.f.mSolventAdded * x.batchVolume / 1000, 0, 'kg'),
      'To mill base': fmt(x.millBaseSolventShare, 0, U.pct),
      'Flash point': fmt(REF.flashPoint, 0, U.tempC)
    }
  };
  eq[TAGS.additiveSkid] = {
    ...run(false), level: off ? 0 : 0.45,
    values: {
      'Rheology modifier': fmt(x.thickenerDose, 2, U.pct),
      Colourant: fmt(x.colourantDose, 0, 'mL/L'),
      Multiplier: fmt(s.thickenerFactor, 1, '×')
    }
  };
  eq[TAGS.bagDump] = {
    ...run(false), load: off ? 0 : clamp(s.pigmentAddMinutes / 30, 0, 1),
    values: {
      'Pigment charged': fmt(s.f.mPigment * x.batchVolume / 1000, 0, 'kg'),
      'Titanium dioxide': fmt(x.tio2Share, 0, U.pct),
      'Charging time': fmt(s.pigmentAddMinutes, 1, U.timeMin)
    }
  };
  eq[TAGS.dustCollector] = {
    ...run(false), load: off ? 0 : 0.3,
    values: { 'Dust collected': fmt(s.dustLost, 2, 'kg'), 'Of pigment charged': fmt(REF.dustLoss * 100, 2, U.pct) }
  };
  eq[TAGS.disperser] = {
    ...run(!s.disperse?.dispersing || (n(s.motorLoad) && s.motorLoad > 0.9) || (n(s.tEnd) && s.tEnd > 45)),
    load: off ? 0 : clamp(s.motorLoad ?? 0, 0, 1.2),
    duty: off ? 0 : clamp((s.d?.power ?? 0) / 1000 / 120, 0, 1),
    level: off ? 0 : clamp(s.geometry ? s.geometry.fillHeight / (s.geometry.tankDiameter * 0.8) : 0, 0, 1),
    speed: off ? 0 : x.dispSpeed,
    values: {
      'Tip speed': fmt(s.d?.tipSpeed, 1, U.velocity),
      'Shaft power': fmt((s.d?.power ?? NaN) / 1000, 1, U.powerKW),
      'Specific energy': fmt((s.specificEnergy ?? NaN) / 1000, 1, 'kJ/kg'),
      'Batch temperature': fmt(s.tEnd, 1, U.tempC),
      Fineness: fmt(s.disperse?.d === undefined ? NaN : hegman(s.disperse.d), 2, 'Hegman')
    }
  };
  eq[TAGS.chiller] = {
    ...run(fx.coolingFactor < 1),
    duty: off ? 0 : clamp((s.heatRemoved ?? 0) / Math.max(s.heatIn ?? 1, 1), 0, 1),
    values: {
      'Coolant temperature': fmt(x.jacketTemp, 0, U.tempC),
      'Jacket UA': fmt(s.d?.ua, 0, 'W/K'),
      'Heat removed': fmt((s.heatRemoved ?? NaN) / 3.6e6, 2, 'kWh')
    }
  };
  eq[TAGS.beadMill] = {
    state: off || s.passes === 0 ? 'stopped' : fx.beadFactor < 1 ? 'warning' : 'running',
    alarm: fx.beadFactor < 1 && s.passes > 0,
    load: off || s.passes === 0 ? 0 : clamp(x.beadMillPower / 160, 0, 1),
    values: {
      Passes: fmt(s.passes, 0, ''),
      'Specific energy': fmt(s.passes > 0 ? s.millEnergy / 1000 : NaN, 1, 'kJ/kg'),
      'Time per pass': fmt(s.passes > 0 ? s.passSeconds / 60 : NaN, 1, U.timeMin)
    }
  };
  eq[TAGS.letdownTank] = {
    ...run(n(s.krebs) && (s.krebs < 60 || s.krebs > 110)),
    level: off ? 0 : 0.8,
    values: {
      'Batch volume': fmt(x.batchVolume, 0, 'L'),
      Viscosity: fmt(s.krebs, 1, 'KU'),
      'Yield stress': fmt(s.yieldStress, 2, 'Pa')
    }
  };
  eq[TAGS.transferPump] = {
    ...run(false), load: off ? 0 : clamp((s.muStormer ?? 0) / 2, 0, 1),
    values: { 'Paint viscosity': fmt(s.stormerCp, 0, U.viscCp), Throughput: fmt(REF.fillingRate, 0, 'L/min') }
  };
  eq[TAGS.filter] = {
    ...run(n(s.particleSize) && s.particleSize > 25),
    load: off ? 0 : clamp((s.particleSize ?? 0) / 30, 0, 1),
    values: { 'Largest particle': fmt(s.particleSize, 2, 'µm'), Fineness: fmt(s.fineness, 2, 'Hegman') }
  };
  eq[TAGS.fillingLine] = {
    ...run(false), load: off ? 0 : clamp(s.fillMinutes / 30, 0, 1),
    values: {
      'Paint filled': fmt(x.batchVolume, 0, 'L'),
      'Filling time': fmt(s.fillMinutes, 1, U.timeMin),
      Density: fmt(s.f.density / 1000, 3, 'kg/L')
    }
  };
  eq[TAGS.qualityLab] = {
    ...run(n(s.fineness) && s.fineness < 6),
    values: {
      Fineness: fmt(s.fineness, 2, 'Hegman'),
      Gloss: fmt(s.gloss, 1, 'GU'),
      'Contrast ratio': fmt(s.contrastRatio, 1, U.pct),
      Viscosity: fmt(s.krebs, 1, 'KU')
    }
  };
  eq[TAGS.mcc] = {
    ...run(false),
    load: off ? 0 : clamp(((s.d?.power ?? 0) / 1000 + (s.passes > 0 ? x.beadMillPower : 0)) / 200, 0, 1),
    values: {
      'Disperser power': fmt((s.d?.power ?? NaN) / 1000, 1, U.powerKW),
      'Bead mill power': fmt(s.passes > 0 ? x.beadMillPower : 0, 1, U.powerKW),
      'Energy per litre': fmt(s.energyPerLitre, 1, 'Wh/L')
    }
  };
  return eq;
}

// ---------------------------------------------------------------------------
function streamsFrom(s, x) {
  // A batch plant does not run every line at once. Stream rates are the batch
  // quantity averaged over the cycle, which is what the plot actually moves in
  // a shift, and the labels say so.
  const hours = (s.cycleMinutes ?? 0) / 60;
  const rate = kg => (hours > 0 && Number.isFinite(kg) ? kg / hours : 0);
  const velocity = (id, m3PerHour) => {
    const d = REF.bore[id];
    if (!d || !(m3PerHour > 0)) return 0;
    return (m3PerHour / 3600) / (Math.PI * d * d / 4);
  };
  const mk = (id, kgPerBatch, phase, label, m3PerHour) => {
    const flow = rate(kgPerBatch);
    return {
      id, flow: flow > 0 ? flow : 0, phase,
      label: flow > 0 ? label : '—',
      velocity: velocity(id, m3PerHour)
    };
  };
  const t = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');
  const V = x.batchVolume;
  const f = s.f;

  const resinMill = s.mb.mResin / 1000, solventMill = s.mb.mSolvent / 1000, pigment = s.mb.mPig / 1000;
  const resinLet = f.mResinSolution * V / 1000 - resinMill;
  const solventLet = f.mSolventAdded * V / 1000 - solventMill;
  const additives = (f.mThickener + f.mColourant) * V / 1000;
  const millBaseMass = s.mb.mass;
  const product = s.productMass;

  return [
    mk(STREAMS.resinToMill, resinMill, 'liquid', `${t(resinMill, 0)} kg · ${t(x.millBaseBinderShare, 0)} % of the resin`, rate(resinMill) / 970),
    mk(STREAMS.solventToMill, solventMill, 'liquid', `${t(solventMill, 0)} kg · ${t(x.millBaseSolventShare, 0)} % of the solvent`, rate(solventMill) / REF.rhoSolvent),
    mk(STREAMS.pigmentFeed, pigment, 'solid', `${t(pigment, 0)} kg · ${t(x.tio2Share, 0)} % TiO₂`, rate(pigment) / 1200),
    mk(STREAMS.dustToCollector, s.dustLost, 'air', `${t(s.dustLost, 2)} kg dust`, rate(s.dustLost) / 900),
    mk(STREAMS.millBaseToMill, s.passes > 0 ? millBaseMass * s.passes : 0, 'slurry', `${t(s.passes, 0)} pass${s.passes === 1 ? '' : 'es'} · ${t(x.beadMillFlow, 0)} L/min`, rate(millBaseMass * s.passes) / 1715),
    mk(STREAMS.milledBase, s.passes > 0 ? millBaseMass : 0, 'slurry', `${t(millBaseMass, 0)} kg · Hegman ${t(s.fineness, 1)}`, rate(millBaseMass) / 1715),
    mk(STREAMS.millBaseDirect, s.passes > 0 ? 0 : millBaseMass, 'slurry', `${t(millBaseMass, 0)} kg · Hegman ${t(s.fineness, 1)}`, rate(millBaseMass) / 1715),
    mk(STREAMS.resinLetdown, resinLet, 'liquid', `${t(resinLet, 0)} kg resin`, rate(resinLet) / 970),
    mk(STREAMS.solventLetdown, solventLet, 'liquid', `${t(solventLet, 0)} kg solvent`, rate(solventLet) / REF.rhoSolvent),
    mk(STREAMS.additives, additives, 'liquid', `${t(additives, 1)} kg additives`, rate(additives) / 1000),
    mk(STREAMS.finishedPaint, product, 'liquid', `${t(product, 0)} kg · ${t(s.krebs, 0)} KU`, rate(product) / f.density),
    mk(STREAMS.pumpedPaint, product, 'liquid', `${t(V, 0)} L · ${t(f.density / 1000, 3)} kg/L`, rate(product) / f.density),
    mk(STREAMS.filteredPaint, product, 'liquid', `Hegman ${t(s.fineness, 1)} · ${t(s.gloss, 0)} GU`, rate(product) / f.density),
    mk(STREAMS.packedProduct, product, 'solid', `${t(V, 0)} L packed · ${t(s.cycleMinutes, 0)} min cycle`, rate(product) / f.density),
    mk(STREAMS.coolingWater, (s.heatRemoved ?? 0) > 0 ? (s.heatRemoved / 1000) / (4.186 * 5) : 0, 'liquid', `${t((s.heatRemoved ?? NaN) / 3.6e6, 2)} kWh removed`, 3),
    mk(STREAMS.solventVapour, s.evaporated, 'gas', `${t(s.evaporated, 2)} kg vapour · ${t(s.tEnd, 1)} °C`, rate(s.evaporated) / 3.5)
  ];
}

// ---------------------------------------------------------------------------
function buildSteps(s, x, fx) {
  const t = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—');
  return [
    {
      title: 'Volume basis of the formulation',
      equation: 'V_pigment = PVC · VS      V_binder = (1 − PVC) · VS      V_volatile = 1 − VS',
      substitution: `V_pigment = ${t(s.f.pvc, 3)} × ${t(s.f.vs, 3)} = ${t(s.f.vPigment, 4)} L per litre of paint`,
      result: `${t(s.f.vPigment * 1000, 1)} mL pigment, ${t(s.f.vBinder * 1000, 1)} mL binder, ${t(s.f.vVolatile * 1000, 1)} mL volatile per litre`,
      note: 'Everything downstream is worked per litre of finished paint and scaled to the batch at the end.'
    },
    {
      title: 'Critical pigment volume concentration',
      equation: 'CPVC = 1 / (1 + OA · ρ_p / 93.5)',
      substitution: `CPVC = 1 / (1 + ${t(s.f.oaBlend, 1)} × ${t(s.f.rhoPigment / 1000, 3)} / 93.5)`,
      result: `CPVC = ${t(s.f.cpvc, 3)}, so Λ = ${t(s.f.pvc, 3)} / ${t(s.f.cpvc, 3)} = ${t(s.f.lambda, 3)}`,
      note: 'Λ below about 0.5 is gloss territory; above 1 there is not enough binder to fill the voids and the film contains air.'
    },
    {
      title: 'Mill base and its viscosity',
      equation: 'φ = V_pigment / V_millbase      η_r = (1 − φ/φ_m)^(−[η]·φ_m)',
      substitution: `φ = ${t(s.mb.vPig, 1)} / ${t(s.mb.volume, 1)} = ${t(s.mb.phi, 3)}; η_r = ${t(s.d?.relative, 2)}`,
      result: `µ_mill base = ${t(s.d?.muVehicle, 3)} × ${t(s.d?.relative, 2)} = ${t(s.d?.muLow, 2)} Pa·s at rest`,
      note: 'The vehicle viscosity is anchored on the resin as supplied and corrected to the batch temperature.'
    },
    {
      title: 'Tip speed and shaft power',
      equation: 'u = π·D·N      P = Np·ρ·N³·D⁵ + K·µ·N²·D³',
      substitution: `u = π × ${t(x.bladeDiameter, 2)} × ${t(x.dispSpeed / 60, 2)} = ${t(s.d?.tipSpeed, 1)} m/s`,
      result: `P = ${t((s.d?.turbulent ?? NaN) / 1000, 1)} kW turbulent + ${t((s.d?.laminar ?? NaN) / 1000, 2)} kW viscous = ${t((s.d?.power ?? NaN) / 1000, 1)} kW`,
      note: 'Twenty to twenty-five metres a second is the usual target. Power goes as the fifth power of blade diameter.'
    },
    {
      title: 'Batch temperature, solved',
      equation: 'm·c_p·dT/dt = P(T) − UA·(T − T_j)',
      substitution: `UA = ${t(s.geometry?.jacketArea, 2)} m² × ${REF.jacketU} W/m²·K = ${t(s.d?.ua, 0)} W/K`,
      result: `T rises from ${t(x.chargeTemp, 1)} °C to ${t(s.tEnd, 1)} °C over ${t(x.dispTime, 0)} minutes`,
      note: 'Solved rather than assumed, because the power depends on the viscosity and the viscosity depends on this temperature.'
    },
    {
      title: 'Does it disperse at all?',
      equation: 'σ = µ(γ̇)·γ̇        dispersion needs σ > σ_c',
      substitution: `γ̇ = ${t(s.d?.shearRate, 0)} 1/s, µ at that rate = ${t(s.d?.muAtShear, 3)} Pa·s, σ = ${t(s.d?.stress, 0)} Pa`,
      result: `σ/σ_c = ${t((s.d?.stress ?? NaN) / (s.disperse?.strength ?? NaN), 2)} — ${s.disperse?.dispersing ? 'above the threshold, so agglomerates break' : 'below the threshold, so nothing breaks'}`,
      note: 'This is the question a thin mill base fails. No amount of time fixes it.'
    },
    {
      title: 'Fineness from specific energy',
      equation: 'E = P·t / m        d = d_∞ + (d_0 − d_∞)·exp(−k·E)',
      substitution: `E = ${t((s.d?.power ?? NaN) / 1000, 1)} kW × ${t(x.dispTime, 0)} min / ${t(s.mb.mass, 0)} kg = ${t((s.specificEnergy ?? NaN) / 1000, 1)} kJ/kg`,
      result: `d = ${t(s.particleSize, 2)} µm, which reads Hegman ${t(s.fineness, 2)}`,
      note: s.passes > 0 ? `The bead mill added ${t(s.millEnergy / 1000, 1)} kJ/kg over ${s.passes} pass${s.passes === 1 ? '' : 'es'}.` : 'No bead mill passes: this is what the disperser alone reached.'
    },
    {
      title: 'Opacity of the dry film',
      equation: 'R = [1 − R_g(a − b·coth(bSX))] / [a − R_g + b·coth(bSX)]',
      substitution: `S = ${t(s.scattering, 4)} 1/µm over a ${t(s.dryFilm, 1)} µm dry film, so SX = ${t((s.scattering ?? NaN) * (s.dryFilm ?? NaN), 2)}`,
      result: `Reflectance ${t((s.overBlack ?? NaN) * 100, 1)} % over black and ${t((s.overWhite ?? NaN) * 100, 1)} % over white, a contrast ratio of ${t(s.contrastRatio, 2)} %`,
      note: 'Hiding is a property of the film, not an amount of white pigment: crowded particles scatter less than spaced ones.'
    },
    {
      title: 'Gloss',
      equation: 'G = G_max · exp(−2.6·Λ³) · roughness(d)',
      substitution: `G = ${REF.glossMax} × exp(−2.6 × ${t(s.f.lambda, 3)}³) × ${t(s.roughness, 3)}`,
      result: `${t(s.gloss, 1)} gloss units at 60°`,
      note: 'Two independent ways to lose gloss: too little binder for the pigment, and particles standing proud of the film.'
    }
  ];
}

// ---------------------------------------------------------------------------
// Contract implementation
// ---------------------------------------------------------------------------
function validate(inputs) {
  const base = validateSpec(inputSpec, inputs);
  const errors = { ...base.errors };
  // The two mill-base shares are separately valid and jointly impossible if the
  // charge would leave nothing for the let-down.
  if (inputs.millBaseBinderShare > 90) {
    errors.millBaseBinderShare = 'Resin charged to the mill base: nothing would be left for the let-down.';
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

function getInitialState(inputs = {}) {
  const blank = { ...inputs, dispTime: 0, batchVolume: inputs.batchVolume ?? inputSpec.batchVolume.default };
  const fx = faultEffects([]);
  const s = solveBatch(blank, fx);
  const built = s.infeasible || s.unconverged
    ? { kpis: [], results: {}, massBalance: {}, energyBalance: {}, quality: {} }
    : buildResults(s, blank, fx);
  const nulls = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) =>
    [k, { ...v, value: v.kind === KIND.REF ? v.value : null }]));
  return {
    status: Status.READY, converged: false, iterations: null, residual: null,
    reason: 'Not calculated — make up the formulation and run the batch.',
    kpis: (built.kpis || []).map(k => ({ ...k, value: null })),
    results: nulls(built.results || {}), massBalance: nulls(built.massBalance || {}),
    energyBalance: nulls(built.energyBalance || {}), quality: nulls(built.quality || {}),
    charts: [], messages: [], diagnostics: [], streams: [], equipment: {}, steps: []
  };
}

function run(inputs, { scenario = 'base', faults = [] } = {}) {
  const fx = faultEffects(faults);
  const { eff, notes } = effectiveInputs(inputs, fx);
  const s = solveBatch(eff, fx);

  if (s.infeasible) {
    return {
      ...getInitialState(inputs), status: Status.ERROR, converged: false,
      reason: 'No formulation exists at these settings',
      messages: [],
      diagnostics: [...notes.map(text => ({ level: 'warning', text })), { level: 'error', text: s.infeasible }]
    };
  }
  if (s.unconverged || !s.temperature?.converged) {
    return {
      ...getInitialState(inputs), status: Status.ERROR, converged: false,
      iterations: s.temperature?.iterations ?? null, residual: s.temperature?.residual ?? null,
      reason: 'Batch energy balance did not converge',
      messages: [],
      diagnostics: [...notes.map(text => ({ level: 'warning', text })), {
        level: 'error',
        text: `The batch energy balance did not converge: the shaft power and the temperature it produces did not settle, with a residual of ${s.temperature?.residual === null || s.temperature?.residual === undefined ? 'no bracketed root' : s.temperature.residual.toExponential(2)} after ${s.temperature?.iterations ?? 0} iterations. No results are reported, because an unconverged balance is not a balance.`
      }]
    };
  }

  const built = buildResults(s, eff, fx);
  const diagnostics = diagnose(s, eff, fx, notes);
  const hasIssue = diagnostics.some(d => d.level === 'warning' || d.level === 'error');
  const hasError = diagnostics.some(d => d.level === 'error');

  return {
    status: hasError ? Status.ERROR : hasIssue ? Status.WARNING : Status.COMPLETE,
    converged: true,
    iterations: s.temperature.iterations,
    residual: s.temperature.residual,
    reason: scenario, ...built,
    messages: [], diagnostics,
    streams: streamsFrom(s, eff), equipment: equipmentFrom(s, eff, fx),
    steps: buildSteps(s, eff, fx), state: s
  };
}

export default {
  id: 'paint',
  modelVersion: '1.0.0',
  inputSpec, assumptions, equations,
  TAGS, STREAMS, FAULT_IDS, REF,
  validate,
  getInitialState,
  run,
  getDiagnostics: result => result?.diagnostics ?? [],
  getEquipmentState: result => result?.equipment ?? {},
  getStreams: result => result?.streams ?? [],
  getSteps: result => result?.steps ?? [],
  Status
};
