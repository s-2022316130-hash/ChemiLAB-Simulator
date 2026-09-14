/**
 * 05 — NATURAL GAS PROCESSING PLANT — process model.
 *
 * The whole train from wellhead to pipeline: inlet separation, amine
 * sweetening, glycol dehydration, cryogenic natural gas liquids recovery
 * behind a turboexpander, and recompression to sales pressure.
 *
 * Rules that apply here (see CLAUDE.md):
 *  - every returned number is computed in this file, never in the UI;
 *  - anything not calculated stays null so the UI prints an em dash;
 *  - `converged` is only true when the solver actually met its tolerance;
 *  - every correlation and reference value is declared in `assumptions`.
 *
 * Three ideas run through the plant and tie the sections together.
 *
 * The first is that a gas plant is a sequence of specifications, not a sequence
 * of units. Nothing here is optimised for its own sake: the amine unit exists
 * because the pipeline will not take more than four parts per million of
 * hydrogen sulphide, the glycol unit because water freezes into hydrates, the
 * cold section because ethane is worth more as liquid than as fuel — and only
 * sometimes.
 *
 * The second is that three of the four separation steps are the same
 * calculation. Kremser's absorption factor governs the amine contactor, the
 * glycol contactor and the demethaniser, and once that is seen the plant stops
 * being four unrelated towers.
 *
 * The third is that the cold comes from a pressure drop the plant then has to
 * pay back. Every bar the expander takes out has to be put back by the residue
 * compressor, and the whole economics of liquids recovery sits in that trade.
 *
 * This is a teaching model, not a validated design tool.
 */
import { KIND, Status } from '../../simulation/contract.js';
import { rules, validate as validateSpec } from '../../shared/validation.js';
import { U } from '../../shared/units.js';
import { bisect } from '../../simulation/solver.js';

// ---------------------------------------------------------------------------
// Shared identity between engine, plant.js (userData.tag) and flowsheet.js.
// ---------------------------------------------------------------------------
export const TAGS = Object.freeze({
  inletSeparator: 'V-501', amineContactor: 'T-501', amineRegenerator: 'T-502',
  leanRichExchanger: 'E-501', aminePump: 'P-501',
  glycolContactor: 'T-503', glycolRegenerator: 'T-504',
  coldBox: 'E-502', coldSeparator: 'V-502', expander: 'EX-501',
  demethaniser: 'T-505', residueCompressor: 'K-501',
  stabiliser: 'T-506', nglStorage: 'TK-501', flare: 'FL-501', mcc: 'MCC-501'
});
export const STREAMS = Object.freeze({
  wellheadFeed: 'S-01', separatedGas: 'S-02', condensate: 'S-03', producedWater: 'S-04',
  sweetGas: 'S-05', richAmine: 'S-06', leanAmine: 'S-07', acidGas: 'S-08',
  dryGas: 'S-09', richGlycol: 'S-10', leanGlycol: 'S-11', regenVapour: 'S-12',
  chilledGas: 'S-13', expanderOutlet: 'S-14', coldLiquid: 'S-15',
  residueGas: 'S-16', nglProduct: 'S-17', salesGas: 'S-18'
});
export const FAULT_IDS = Object.freeze([
  'amine-foaming', 'lean-amine-hot', 'glycol-contaminated',
  'expander-trip', 'fouled-cold-box', 'high-feed-co2'
]);

// ---------------------------------------------------------------------------
// Component properties. Critical constants and acentric factors for the Wilson
// K-value correlation; ideal-gas heat capacities and gross heating values for
// the energy and specification calculations. All KIND.REF.
// ---------------------------------------------------------------------------
const COMP = Object.freeze({
  //        Tc(K)   Pc(bar)   omega    MW     cp(kJ/kmol·K)  HHV(MJ/Sm³)
  N2: { tc: 126.2, pc: 34.0, w: 0.0377, mw: 28.01, cp: 29.1, hhv: 0 },
  CO2: { tc: 304.2, pc: 73.8, w: 0.2236, mw: 44.01, cp: 37.1, hhv: 0 },
  H2S: { tc: 373.5, pc: 89.6, w: 0.0942, mw: 34.08, cp: 34.2, hhv: 25.35 },
  C1: { tc: 190.6, pc: 46.0, w: 0.0115, mw: 16.04, cp: 35.7, hhv: 39.84 },
  C2: { tc: 305.3, pc: 48.7, w: 0.0995, mw: 30.07, cp: 52.6, hhv: 69.79 },
  C3: { tc: 369.8, pc: 42.5, w: 0.1523, mw: 44.10, cp: 73.6, hhv: 99.22 },
  iC4: { tc: 408.1, pc: 36.5, w: 0.1770, mw: 58.12, cp: 96.8, hhv: 128.42 },
  nC4: { tc: 425.1, pc: 38.0, w: 0.2002, mw: 58.12, cp: 98.5, hhv: 128.70 },
  C5: { tc: 490.0, pc: 32.5, w: 0.2800, mw: 82.00, cp: 130.0, hhv: 161.00 },
  H2O: { tc: 647.1, pc: 220.6, w: 0.3449, mw: 18.02, cp: 33.6, hhv: 0 }
});
const KEYS = Object.keys(COMP);
/** Components that end up in a natural gas liquid product. */
const NGL_KEYS = ['C2', 'C3', 'iC4', 'nC4', 'C5'];

const REF = Object.freeze({
  R: 8.314,                         // kJ/kmol·K
  stdMolarVolume: 23.645,           // Sm³/kmol at 15 °C and 101.325 kPa
  kmolPerMMSCFD: 49.81,             // 1e6 scf/day at 60 °F and 14.696 psia
  lbPerMMscfPerMoleFraction: 47472, // mass of water per million standard cubic feet
  // --- feed ----------------------------------------------------------------
  nitrogen: 0.008,                  // mole fraction, taken as fixed for the field
  c3Split: { C3: 0.45, iC4: 0.12, nC4: 0.18, C5: 0.25 },
  // --- inlet separation ----------------------------------------------------
  separatorEfficiency: 0.985,       // of the liquid the flash says is there
  // --- amine ---------------------------------------------------------------
  amineMW: 119.16,                  // methyldiethanolamine
  amineSolutionDensity: 1030,       // kg/m³ at 45 wt %
  amineCp: 3.6,                     // kJ/kg·K
  h2sSlope: 0.0012,                 // effective equilibrium slope, H2S over MDEA
  co2Slope: 0.25,                   // the same for CO2, much larger — MDEA is slow for it
  h2sStageEfficiency: 0.75,
  co2StageEfficiency: 0.30,         // the kinetic selectivity MDEA is chosen for
  h2sLeanSlope: 2.5e-4,             // treated gas floor per unit of lean loading
  co2LeanSlope: 0.35,
  richLoadingLimit: 0.45,           // mol acid gas per mol amine, corrosion limit
  h2sHeatOfReaction: 45,            // kJ/mol
  co2HeatOfReaction: 55,            // kJ/mol
  strippingSteam: 120,              // kg steam per m³ of solution circulated
  steamLatentHeat: 2100,            // kJ/kg at reboiler conditions
  amineApproach: 5,                 // K, lean amine above the gas it meets
  // --- glycol --------------------------------------------------------------
  tegMW: 150.17,
  tegDensity: 1110,                 // kg/m³
  tegMargules: -0.705,              // one-parameter activity model, water in TEG
  tegReboilerTemp: 204,             // °C, the limit before TEG degrades
  tegRegenDuty: 1050,               // kJ per kg of solution circulated
  // --- cold section --------------------------------------------------------
  coldBoxApproach: 5,               // K at the cold end
  expanderMechanical: 0.97,
  demethaniserPressureDrop: 0.5,    // bar below the expander discharge
  // --- compression ---------------------------------------------------------
  compressorEfficiency: 0.78,
  compressibility: 0.90,
  // --- specifications the pipeline is written on ---------------------------
  specH2S: 4,                       // ppmv
  specCO2: 2,                       // mol %
  specWater: 7,                     // lb per MMscf
  specWobbeLow: 47.2, specWobbeHigh: 54.0,   // MJ/Sm³, the common European band
  specNglH2S: 100,                  // ppmv in the liquid product
  // Nominal line bores, used only to turn a flow into a tracer velocity.
  bore: {
    'S-01': 0.60, 'S-02': 0.55, 'S-03': 0.15, 'S-04': 0.08,
    'S-05': 0.55, 'S-06': 0.25, 'S-07': 0.25, 'S-08': 0.20,
    'S-09': 0.55, 'S-10': 0.06, 'S-11': 0.06, 'S-12': 0.10,
    'S-13': 0.55, 'S-14': 0.60, 'S-15': 0.20,
    'S-16': 0.60, 'S-17': 0.20, 'S-18': 0.50
  }
});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
const scale = (o, f) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v * f]));

// ---------------------------------------------------------------------------
// Thermodynamics
// ---------------------------------------------------------------------------
/**
 * Wilson's correlation for the vapour–liquid equilibrium ratio. It is a
 * two-constant estimate built from the critical properties and the acentric
 * factor, with no interaction parameters and no composition dependence — good
 * enough to teach a flash, and not a substitute for an equation of state.
 */
export function wilsonK(key, tempK, pressureBar) {
  const c = COMP[key];
  return (c.pc / pressureBar) * Math.exp(5.37 * (1 + c.w) * (1 - c.tc / tempK));
}

/**
 * Rachford–Rice. The vapour fraction of a flash is the root of
 *   Σ zᵢ(Kᵢ − 1) / (1 + β(Kᵢ − 1)) = 0
 * and the reason it is written this way rather than as a component balance is
 * that this form is monotonic in β, so a bracketed search cannot fail to find
 * the root if one exists between the bounds.
 */
export function rachfordRice(z, K) {
  const keys = Object.keys(z).filter(k => z[k] > 0);
  const f = beta => keys.reduce((s, k) => s + z[k] * (K[k] - 1) / (1 + beta * (K[k] - 1)), 0);
  const f0 = f(0), f1 = f(1);
  // Outside the two-phase region there is no root to find, and saying so is
  // more useful than returning a number from the middle of the bracket.
  if (f0 <= 0) return { beta: 0, phase: 'liquid', converged: true, iterations: 0, residual: Math.abs(f0) };
  if (f1 >= 0) return { beta: 1, phase: 'vapour', converged: true, iterations: 0, residual: Math.abs(f1) };
  const s = bisect(f, 0, 1, { tol: 1e-12, maxIter: 200, xtol: 1e-14 });
  if (s.x === null) return { beta: null, phase: 'none', converged: false, iterations: s.iterations, residual: null };
  return { beta: s.x, phase: 'two', converged: s.converged, iterations: s.iterations, residual: s.residual };
}

/** Split a feed into vapour and liquid at the given conditions. */
export function flash(feed, tempK, pressureBar) {
  const total = sum(feed);
  if (!(total > 0)) return { vapour: scale(feed, 0), liquid: scale(feed, 0), beta: 1, solve: { converged: true, iterations: 0, residual: 0 } };
  const z = scale(feed, 1 / total);
  const K = Object.fromEntries(KEYS.map(k => [k, wilsonK(k, tempK, pressureBar)]));
  const solve = rachfordRice(z, K);
  if (solve.beta === null) return { vapour: null, liquid: null, beta: null, K, solve };
  const b = solve.beta;
  const vapour = {}, liquid = {};
  for (const k of KEYS) {
    const denom = 1 + b * (K[k] - 1);
    const x = z[k] / denom;
    liquid[k] = x * (1 - b) * total;
    vapour[k] = x * K[k] * b * total;
  }
  return { vapour, liquid, beta: b, K, solve };
}

/** Saturation vapour pressure of water in kPa. Buck, over liquid and over ice. */
export function pSatWater(tempC) {
  return tempC >= 0
    ? 0.61121 * Math.exp((18.678 - tempC / 234.5) * (tempC / (257.14 + tempC)))
    : 0.61115 * Math.exp((23.036 - tempC / 333.7) * (tempC / (279.82 + tempC)));
}
/**
 * The temperature at which a gas holding this much water would start to drop
 * it. Inverted through Bukacek rather than through the ideal partial pressure,
 * because that is the correlation the water content itself came from.
 */
export function dewPointFromWaterContent(contentLb, pressureBar) {
  if (!(contentLb > 0)) return null;
  const s = bisect(t => bukacek(t, pressureBar) - contentLb, -80, 90, { tol: 1e-7, maxIter: 200 });
  return s.converged ? s.x : null;
}

/**
 * Bukacek's correlation for the water a natural gas holds at saturation, in
 * pounds per million standard cubic feet. The first term is the ideal
 * saturation the partial pressure would give; the second is the empirical
 * correction for non-ideality that makes it usable at pipeline pressures.
 */
export function bukacek(tempC, pressureBar) {
  const tF = tempC * 9 / 5 + 32;
  const pPsia = pressureBar * 14.5038;
  const pwPsia = pSatWater(tempC) * 0.145038;
  const A = REF.lbPerMMscfPerMoleFraction * pwPsia / pPsia;
  const B = Math.pow(10, -3083.87 / (tF + 459.67) + 6.69449);
  return A + B;
}

/**
 * Kremser's absorption factor. The fraction of the available driving force a
 * column of N theoretical stages actually uses, given an absorption factor A.
 * It is the same equation for an absorber and a stripper — only the definition
 * of A changes — which is why three very different towers in this plant are one
 * calculation.
 */
export function kremser(A, N) {
  if (!(N > 0)) return 0;
  if (Math.abs(A - 1) < 1e-9) return N / (N + 1);
  const aN = Math.pow(A, N + 1);
  if (!Number.isFinite(aN)) return 1;
  return (aN - A) / (aN - 1);
}

// ---------------------------------------------------------------------------
// Faults. The engine owns propagation; scenarios.js only declares the ids.
// ---------------------------------------------------------------------------
function faultEffects(faults = []) {
  const on = id => faults.includes(id);
  return {
    contactorEfficiency: on('amine-foaming') ? 0.35 : 1,
    contactorBypass: on('amine-foaming') ? 0.02 : 0,
    amineCarryover: on('amine-foaming'),
    leanAmineRise: on('lean-amine-hot') ? 22 : 0,
    tegPurityDrop: on('glycol-contaminated') ? 1.8 : 0,
    expanderTripped: on('expander-trip'),
    coldBoxRise: on('fouled-cold-box') ? 22 : 0,
    co2Surge: on('high-feed-co2') ? 2.6 : 1,
    active: [...faults]
  };
}

/** Faults that move an operating input do so here, visibly, once. */
function effectiveInputs(inputs, fx) {
  const eff = { ...inputs };
  const notes = [];
  if (fx.co2Surge !== 1) {
    eff.co2Content = Math.min(inputs.co2Content * fx.co2Surge, 25);
    notes.push(`The field is producing ${eff.co2Content.toFixed(1)} mol % carbon dioxide against the ${inputs.co2Content.toFixed(1)} mol % the plant was designed around.`);
  }
  if (fx.tegPurityDrop) {
    eff.tegPurity = Math.max(inputs.tegPurity - fx.tegPurityDrop, 95);
    notes.push(`The lean glycol is coming back at ${eff.tegPurity.toFixed(2)} wt % instead of ${inputs.tegPurity.toFixed(2)} wt %.`);
  }
  if (fx.coldBoxRise) {
    eff.coldBoxOutlet = Math.min(inputs.coldBoxOutlet + fx.coldBoxRise, 20);
    notes.push(`The gas leaves the cold box at ${eff.coldBoxOutlet.toFixed(1)} °C rather than the ${inputs.coldBoxOutlet.toFixed(1)} °C it is set to.`);
  }
  return { eff, notes };
}

// ---------------------------------------------------------------------------
// The plant
// ---------------------------------------------------------------------------
/** Wellhead composition, saturated with water at the conditions it arrives at. */
function feedComposition(x) {
  const dry = {};
  for (const k of KEYS) dry[k] = 0;
  dry.N2 = REF.nitrogen;
  dry.CO2 = x.co2Content / 100;
  dry.H2S = x.h2sContent / 1e6;
  dry.C2 = x.c2Content / 100;
  for (const [k, share] of Object.entries(REF.c3Split)) dry[k] = share * x.c3plusContent / 100;
  const rest = 1 - (dry.N2 + dry.CO2 + dry.H2S + dry.C2 + x.c3plusContent / 100);
  dry.C1 = rest;
  if (!(rest > 0.2)) return { composition: null, methane: rest };

  // Water at saturation for the inlet conditions, added to the dry gas.
  const waterLb = bukacek(x.feedTemp, x.feedPressure);
  const yWater = waterLb / REF.lbPerMMscfPerMoleFraction;
  const wet = scale(dry, 1 - yWater);
  wet.H2O = yWater;
  return { composition: wet, methane: rest, waterLb, yWater };
}

/** Molar flows in kmol/h from the gas rate the field is producing. */
const molarFlows = (z, mmscfd) => scale(z, mmscfd * REF.kmolPerMMSCFD);

const molarMass = f => { const t = sum(f); return t > 0 ? KEYS.reduce((s, k) => s + f[k] * COMP[k].mw, 0) / t : 0; };
const heatCapacity = f => { const t = sum(f); return t > 0 ? KEYS.reduce((s, k) => s + f[k] * COMP[k].cp, 0) / t : 0; };
/** Gross heating value of a gas in MJ per standard cubic metre. */
const heatingValue = f => { const t = sum(f); return t > 0 ? KEYS.reduce((s, k) => s + f[k] * COMP[k].hhv, 0) / t : 0; };
/** Relative density against air, and the Wobbe index that follows from it. */
const relativeDensity = f => molarMass(f) / 28.964;
const wobbe = f => { const d = relativeDensity(f); return d > 0 ? heatingValue(f) / Math.sqrt(d) : null; };

function solvePlant(x, fx) {
  const feed = feedComposition(x);
  if (!feed.composition) {
    return { infeasible: `The heavier components and the acid gases add up to more than the stream can hold: methane comes out at ${(feed.methane * 100).toFixed(1)} mol %. A gas with less than about 20 % methane is not a natural gas, and none of the correlations here apply to it.` };
  }
  const z = feed.composition;
  const wellhead = molarFlows(z, x.gasRate);
  const feedTotal = sum(wellhead);

  // --- V-501 inlet separation ---------------------------------------------
  // A three-phase separator: the flash decides what is liquid at the arrival
  // conditions, and the water that drops out is taken with the condensate.
  const inlet = flash(wellhead, x.feedTemp + 273.15, x.feedPressure);
  if (!inlet.solve.converged || inlet.vapour === null) {
    return { infeasible: null, unconverged: true, solve: inlet.solve, stage: 'inlet separator flash' };
  }
  const carry = 1 - REF.separatorEfficiency;
  const separatedGas = {}, condensate = {};
  for (const k of KEYS) {
    separatedGas[k] = inlet.vapour[k] + inlet.liquid[k] * carry;
    condensate[k] = inlet.liquid[k] * (1 - carry);
  }
  const producedWater = condensate.H2O;
  const condensateHC = sum(condensate) - producedWater;

  // --- T-501 amine contactor ----------------------------------------------
  const gasToAmine = sum(separatedGas);
  const amineMass = x.amineCirculation * REF.amineSolutionDensity;              // kg/h
  const amineMoles = amineMass * (x.amineConcentration / 100) / REF.amineMW;    // kmol/h
  const leanTemp = x.feedTemp + REF.amineApproach + fx.leanAmineRise;

  const yH2Sin = separatedGas.H2S / gasToAmine;
  const yCO2in = separatedGas.CO2 / gasToAmine;
  // The treated gas can never be cleaner than equilibrium with the lean amine,
  // and that floor rises with both the lean loading and the lean temperature.
  const tempFactor = Math.exp((leanTemp - 40) / 18);
  const yH2Sstar = REF.h2sLeanSlope * x.leanLoading * tempFactor;
  const yCO2star = REF.co2LeanSlope * x.leanLoading * tempFactor;

  const trays = x.contactorTrays * fx.contactorEfficiency;
  const aH2S = amineMoles / (REF.h2sSlope * Math.max(gasToAmine, 1e-9));
  const aCO2 = amineMoles / (REF.co2Slope * Math.max(gasToAmine, 1e-9));
  const phiH2S = kremser(aH2S, trays * REF.h2sStageEfficiency);
  const phiCO2 = kremser(aCO2, trays * REF.co2StageEfficiency);
  // A foaming contactor lets a fraction of the gas past the trays untreated,
  // which is what actually shows up on an analyser.
  const bypass = fx.contactorBypass;
  const yH2Sout = Math.max((1 - bypass) * (yH2Sin - phiH2S * (yH2Sin - yH2Sstar)) + bypass * yH2Sin, 0);
  const yCO2out = Math.max((1 - bypass) * (yCO2in - phiCO2 * (yCO2in - yCO2star)) + bypass * yCO2in, 0);

  const h2sAbsorbed = Math.max(separatedGas.H2S - yH2Sout * gasToAmine, 0);
  const co2Absorbed = Math.max(separatedGas.CO2 - yCO2out * gasToAmine, 0);
  const acidAbsorbed = h2sAbsorbed + co2Absorbed;
  const richLoading = amineMoles > 0 ? x.leanLoading + acidAbsorbed / amineMoles : null;

  const sweetGas = { ...separatedGas };
  sweetGas.H2S = separatedGas.H2S - h2sAbsorbed;
  sweetGas.CO2 = separatedGas.CO2 - co2Absorbed;
  // A contactor washes the gas, so it leaves saturated at the contactor
  // temperature rather than at the temperature it arrived at.
  const amineOutWaterLb = bukacek(leanTemp, x.feedPressure);
  const waterBefore = sweetGas.H2O;
  sweetGas.H2O = (amineOutWaterLb / REF.lbPerMMscfPerMoleFraction) * (sum(sweetGas) - sweetGas.H2O);
  // An aqueous amine leaves the gas saturated at the contactor temperature, so
  // it puts water in as well as taking acid gas out. That water comes from the
  // solution and it has to appear on the input side of the balance.
  const waterFromAmine = sweetGas.H2O - waterBefore;

  // --- T-502 regeneration --------------------------------------------------
  const reactionDuty = (h2sAbsorbed * REF.h2sHeatOfReaction + co2Absorbed * REF.co2HeatOfReaction) * 1000; // kJ/h
  const sensibleDuty = amineMass * REF.amineCp * x.exchangerApproach;            // kJ/h
  const strippingDuty = x.amineCirculation * REF.strippingSteam * REF.steamLatentHeat;
  const reboilerDuty = reactionDuty + sensibleDuty + strippingDuty;              // kJ/h
  const specificReboiler = x.amineCirculation > 0 ? reboilerDuty / 3600 / x.amineCirculation : null;  // kW per m³/h
  const acidGas = { ...scale(sweetGas, 0) };
  acidGas.H2S = h2sAbsorbed; acidGas.CO2 = co2Absorbed;

  // --- T-503 glycol contactor ----------------------------------------------
  const gasToGlycol = sum(sweetGas);
  const dehyPressure = x.feedPressure - 1.0;
  const waterInLb = bukacek(x.dehyTemp, dehyPressure);
  const yWaterIn = waterInLb / REF.lbPerMMscfPerMoleFraction;
  const waterInRate = yWaterIn * gasToGlycol * COMP.H2O.mw;                      // kg/h
  // There is a cooler between the two contactors, and what it knocks out is a
  // stream in its own right rather than water that quietly disappears.
  const coolerWater = sweetGas.H2O - yWaterIn * gasToGlycol;                     // kmol/h

  // Lean glycol: mole fraction of water in it, and the activity coefficient
  // that makes triethylene glycol hold on to that water rather than releasing it.
  const wTeg = x.tegPurity / 100;
  const xWaterLean = ((1 - wTeg) / COMP.H2O.mw) / ((1 - wTeg) / COMP.H2O.mw + wTeg / REF.tegMW);
  const gammaWater = Math.exp(REF.tegMargules * Math.pow(1 - xWaterLean, 2));
  const mWater = gammaWater * pSatWater(x.dehyTemp) / (dehyPressure * 100);
  const tegVolume = x.tegCirculation * waterInRate / 1000;                       // m³/h
  const tegMoles = tegVolume * REF.tegDensity / REF.tegMW;                       // kmol/h
  const aWater = tegMoles / (mWater * Math.max(gasToGlycol, 1e-9));
  const phiWater = kremser(aWater, x.dehyTrays);
  const yWaterStar = mWater * xWaterLean;
  const yWaterOut = Math.max(yWaterIn - phiWater * (yWaterIn - yWaterStar), 0);
  const waterOutLb = yWaterOut * REF.lbPerMMscfPerMoleFraction;
  const waterRemoved = (yWaterIn - yWaterOut) * gasToGlycol * COMP.H2O.mw;       // kg/h
  // Inverted through the same correlation the content came from, rather than
  // through the ideal partial pressure, so the two cannot disagree.
  const dewPointIn = dewPointFromWaterContent(waterInLb, dehyPressure);
  const dewPointOut = dewPointFromWaterContent(waterOutLb, dehyPressure);
  const dewPointDepression = (dewPointIn !== null && dewPointOut !== null) ? dewPointIn - dewPointOut : null;
  const glycolDuty = tegVolume * REF.tegDensity * REF.tegRegenDuty;              // kJ/h

  const dryGas = { ...sweetGas };
  dryGas.H2O = yWaterOut * gasToGlycol;

  // --- E-502 and EX-501: the cold section ----------------------------------
  const gasToCold = sum(dryGas);
  const cpCold = heatCapacity(dryGas);
  const tColdBoxK = x.coldBoxOutlet + 273.15;
  const coldBoxDuty = gasToCold * cpCold * (x.dehyTemp - x.coldBoxOutlet);       // kJ/h

  const kRatio = cpCold / (cpCold - REF.R);
  const pressureRatio = x.expanderPressure / dehyPressure;
  const isentropicOut = tColdBoxK * Math.pow(pressureRatio, (kRatio - 1) / kRatio);
  // A turboexpander takes work out of the gas, so the cooling is very nearly
  // isentropic. A Joule–Thomson valve takes none, so the expansion is at
  // constant enthalpy and cools far less — that difference is the whole reason
  // the machine is worth its capital.
  const jtCoefficient = 0.45;                                                    // K/bar, REF for lean sweet gas
  const expanderOutK = fx.expanderTripped
    ? tColdBoxK - jtCoefficient * (dehyPressure - x.expanderPressure)
    : tColdBoxK - (x.expanderEfficiency / 100) * (tColdBoxK - isentropicOut);
  const expanderOutC = expanderOutK - 273.15;
  const expanderPower = fx.expanderTripped ? 0
    : gasToCold / 3600 * cpCold * (tColdBoxK - expanderOutK) * REF.expanderMechanical;  // kW

  // How cold the residue can make the feed, which is what the cold box is
  // limited by rather than by its area.
  const achievableColdBox = expanderOutC + REF.coldBoxApproach;

  const expanded = flash(dryGas, expanderOutK, x.expanderPressure);
  if (!expanded.solve.converged || expanded.vapour === null) {
    return { infeasible: null, unconverged: true, solve: expanded.solve, stage: 'expander outlet flash' };
  }
  const coldVapour = expanded.vapour, coldLiquid = expanded.liquid;
  const liquidToColumn = sum(coldLiquid);

  // --- T-505 demethaniser --------------------------------------------------
  // The column strips methane back out of the liquid. Kremser again, with the
  // stripping factor S = K·V/L in place of the absorption factor.
  const columnPressure = x.expanderPressure - REF.demethaniserPressureDrop;
  const bubblePoint = liquidToColumn > 0 ? solveBubblePoint(coldLiquid, columnPressure) : null;
  if (liquidToColumn > 0 && bubblePoint === null) {
    return { infeasible: `No bubble point exists for the demethaniser bottoms at ${columnPressure.toFixed(1)} bar within the range this model covers. The column cannot be operated at this pressure with this liquid.` };
  }
  const bottomK = bubblePoint === null ? expanderOutK : bubblePoint;
  const stripVapour = liquidToColumn * x.reboilRatio;
  const nglProduct = {}, strippedVapour = {};
  for (const k of KEYS) {
    if (!(coldLiquid[k] > 0)) { nglProduct[k] = 0; strippedVapour[k] = 0; continue; }
    const kv = wilsonK(k, bottomK, columnPressure);
    const S = liquidToColumn > 0 ? kv * stripVapour / liquidToColumn : 0;
    // The Kremser stripping form: what a stripper removes is what an absorber
    // of the same number of stages would absorb, with the factors inverted.
    const removed = kremser(S, x.demethaniserStages);
    strippedVapour[k] = coldLiquid[k] * removed;
    nglProduct[k] = coldLiquid[k] - strippedVapour[k];
  }
  const residueGas = {};
  for (const k of KEYS) residueGas[k] = coldVapour[k] + strippedVapour[k];

  const nglTotal = sum(nglProduct);
  const residueTotal = sum(residueGas);
  const c1InNgl = nglTotal > 0 ? nglProduct.C1 / nglTotal : 0;
  const c1ToC2 = nglProduct.C2 > 0 ? nglProduct.C1 / nglProduct.C2 : null;
  const recovery = Object.fromEntries(NGL_KEYS.map(k =>
    [k, wellhead[k] > 0 ? nglProduct[k] / wellhead[k] : null]));
  const nglMass = NGL_KEYS.reduce((s, k) => s + nglProduct[k] * COMP[k].mw, 0)
    + nglProduct.C1 * COMP.C1.mw;                                                // kg/h
  const nglVolume = nglMass / 560;                                               // m³/h at a nominal 560 kg/m³

  // Reboiler duty on the demethaniser: the vapour it has to raise.
  const demethaniserDuty = stripVapour * heatCapacity(coldLiquid) * 40;          // kJ/h, against a 40 K rise

  // --- K-501 residue compression -------------------------------------------
  const residueCp = heatCapacity(residueGas);
  const kResidue = residueCp / (residueCp - REF.R);
  const suctionTemp = x.dehyTemp - REF.coldBoxApproach + 273.15;
  const compressionRatio = x.pipelinePressure / columnPressure;
  const compressorPower = residueTotal / 3600 * REF.compressibility * REF.R * suctionTemp
    / (REF.compressorEfficiency) * (kResidue / (kResidue - 1))
    * (Math.pow(compressionRatio, (kResidue - 1) / kResidue) - 1);                // kW
  const netPower = compressorPower - expanderPower;
  const dischargeTemp = suctionTemp * Math.pow(compressionRatio, (kResidue - 1) / kResidue) - 273.15;

  const salesGas = { ...residueGas };
  const salesTotal = sum(salesGas);

  // --- specifications -------------------------------------------------------
  const salesH2S = salesTotal > 0 ? salesGas.H2S / salesTotal * 1e6 : null;       // ppmv
  // Hydrogen sulphide is far more soluble than methane at demethaniser
  // temperatures, so most of what got past the amine ends up in the liquid.
  const nglH2S = nglTotal > 0 ? nglProduct.H2S / nglTotal * 1e6 : null;           // ppmv
  const salesCO2 = salesTotal > 0 ? salesGas.CO2 / salesTotal * 100 : null;       // mol %
  const salesWaterLb = salesTotal > 0 ? salesGas.H2O / salesTotal * REF.lbPerMMscfPerMoleFraction : null;
  const salesHHV = heatingValue(salesGas);
  const salesWobbe = wobbe(salesGas);
  const salesGPM = liquidsContent(salesGas);
  const feedGPM = liquidsContent(wellhead);
  const salesRate = salesTotal / REF.kmolPerMMSCFD;                               // MMSCFD
  const hydrocarbonDew = hydrocarbonDewPoint(salesGas, x.pipelinePressure);

  // The water specification is written on what the dehydration unit delivers.
  // Anything the cold section takes out afterwards is condensate, not drying,
  // and in a real plant it would have frozen the exchanger before it got there.
  const specs = {
    h2s: salesH2S === null ? null : salesH2S <= REF.specH2S,
    co2: salesCO2 === null ? null : salesCO2 <= REF.specCO2,
    water: waterOutLb === null ? null : waterOutLb <= REF.specWater,
    wobbe: salesWobbe === null ? null : (salesWobbe >= REF.specWobbeLow && salesWobbe <= REF.specWobbeHigh),
    nglH2S: nglH2S === null ? null : nglH2S <= REF.specNglH2S
  };
  // Hydrates. A glycol unit dries to a dew point; a cold box runs below it.
  // The model does not simulate ice forming — it says when it would.
  const freezeMargin = dewPointOut === null ? null : x.coldBoxOutlet - dewPointOut;
  const specsMet = Object.values(specs).filter(v => v === true).length;
  const specsTotal = Object.values(specs).filter(v => v !== null).length;

  // --- balances -------------------------------------------------------------
  const inTotal = feedTotal + waterFromAmine;
  const outTotal = salesTotal + nglTotal + sum(condensate) + sum(acidGas)
    + (waterRemoved / COMP.H2O.mw) + coolerWater;
  const molarClosure = inTotal > 0 ? Math.abs(inTotal - outTotal) / inTotal : 0;
  const carbonIn = KEYS.reduce((s, k) => s + wellhead[k] * carbonNumber(k), 0);
  const carbonOut = KEYS.reduce((s, k) => s + (salesGas[k] + nglProduct[k] + condensate[k] + acidGas[k]) * carbonNumber(k), 0);
  const carbonClosure = carbonIn > 0 ? Math.abs(carbonIn - carbonOut) / carbonIn : 0;

  const totalThermal = (reboilerDuty + glycolDuty + demethaniserDuty) / 3600 / 1000;  // MW
  const totalShaft = netPower / 1000;                                                 // MW
  const energyPerMMSCFD = salesRate > 0 ? (totalThermal + totalShaft) * 1000 / salesRate : null;   // kW per MMSCFD

  return {
    feed, z, wellhead, feedTotal,
    inlet, separatedGas, condensate, condensateHC, producedWater,
    gasToAmine, amineMass, amineMoles, leanTemp, yH2Sin, yCO2in, yH2Sstar, yCO2star,
    trays, aH2S, aCO2, phiH2S, phiCO2, yH2Sout, yCO2out,
    h2sAbsorbed, co2Absorbed, acidAbsorbed, richLoading, sweetGas, acidGas,
    reactionDuty, sensibleDuty, strippingDuty, reboilerDuty, specificReboiler, waterFromAmine, amineOutWaterLb,
    gasToGlycol, dehyPressure, waterInLb, yWaterIn, waterInRate,
    coolerWater, xWaterLean, gammaWater, mWater, tegVolume, tegMoles, aWater, phiWater,
    yWaterOut, waterOutLb, waterRemoved, dewPointIn, dewPointOut, dewPointDepression,
    glycolDuty, dryGas,
    gasToCold, cpCold, coldBoxDuty, kRatio, isentropicOut, expanderOutK, expanderOutC,
    expanderPower, achievableColdBox, expanded, coldVapour, coldLiquid, liquidToColumn,
    columnPressure, bottomK, stripVapour, nglProduct, strippedVapour, residueGas,
    nglTotal, residueTotal, c1InNgl, c1ToC2, recovery, nglMass, nglVolume, demethaniserDuty,
    residueCp, kResidue, compressorPower, netPower, dischargeTemp, compressionRatio,
    salesGas, salesTotal, salesRate, salesH2S, salesCO2, salesWaterLb,
    salesHHV, salesWobbe, salesGPM, feedGPM, hydrocarbonDew, nglH2S, freezeMargin, specs, specsMet, specsTotal,
    inTotal, outTotal, molarClosure, carbonIn, carbonOut, carbonClosure,
    totalThermal, totalShaft, energyPerMMSCFD
  };
}

const carbonNumber = k => ({ C1: 1, C2: 2, C3: 3, iC4: 4, nC4: 4, C5: 5.6, CO2: 1 })[k] || 0;

/**
 * Liquefiable content in US gallons per thousand standard cubic feet, the
 * number a gas plant's revenue is written in.
 */
function liquidsContent(f) {
  const t = sum(f);
  if (!(t > 0)) return 0;
  // Gallons of liquid per thousand standard cubic feet of the pure component.
  const gal = { C2: 17.79, C3: 27.48, iC4: 33.30, nC4: 32.03, C5: 37.14 };
  return NGL_KEYS.reduce((s, k) => s + (f[k] / t) * gal[k], 0);
}

/** Bubble point of a liquid at a given pressure: the temperature where Σ Kᵢxᵢ = 1. */
function solveBubblePoint(liquid, pressureBar) {
  const total = sum(liquid);
  if (!(total > 0)) return null;
  const xs = scale(liquid, 1 / total);
  const f = t => KEYS.reduce((s, k) => s + xs[k] * wilsonK(k, t, pressureBar), 0) - 1;
  const s = bisect(f, 120, 520, { tol: 1e-9, maxIter: 200 });
  return s.converged ? s.x : null;
}

/**
 * Hydrocarbon dew point: the temperature at which the first drop of liquid
 * appears in the sales gas at pipeline pressure. It is the specification that
 * stops liquid forming in a pipeline as the gas cools underground.
 */
function hydrocarbonDewPoint(gas, pressureBar) {
  const total = sum(gas);
  if (!(total > 0)) return null;
  const ys = scale(gas, 1 / total);
  const f = t => KEYS.reduce((s, k) => s + (COMP[k].hhv > 0 || k === 'CO2' || k === 'N2' ? ys[k] / wilsonK(k, t, pressureBar) : 0), 0) - 1;
  const s = bisect(f, 150, 340, { tol: 1e-8, maxIter: 200 });
  return s.converged ? s.x - 273.15 : null;
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------
export const inputSpec = {
  gasRate: {
    label: 'Wellhead gas rate', unit: 'MMSCFD', min: 20, max: 600, step: 5, default: 150,
    group: 'Feed', level: 'student',
    rules: [rules.required(), rules.positive('Gas rate'), rules.range(20, 600, 'MMSCFD', 'Outside the size range this teaching model was set up for.')]
  },
  feedPressure: {
    label: 'Inlet pressure', unit: U.pressBar, min: 30, max: 95, step: 1, default: 62,
    group: 'Feed', level: 'student',
    rules: [rules.required(), rules.positive('Inlet pressure'), rules.range(30, 95, U.pressBar, 'Below 30 bar there is nothing to expand; above 95 bar the correlations here are outside their fitted range.')]
  },
  feedTemp: {
    label: 'Inlet temperature', unit: U.tempC, min: 10, max: 60, step: 1, default: 35,
    group: 'Feed', level: 'student',
    rules: [rules.required(), rules.range(10, 60, U.tempC, 'Outside the band the water-content correlation was fitted over.')]
  },
  h2sContent: {
    label: 'Hydrogen sulphide in the feed', unit: 'ppmv', min: 0, max: 20000, step: 50, default: 1200,
    group: 'Feed', level: 'student',
    rules: [rules.required(), rules.nonNegative('Hydrogen sulphide'), rules.range(0, 20000, 'ppmv', 'Above 2 % this is a sour gas that needs a different amine and a sulphur plant.')]
  },
  co2Content: {
    label: 'Carbon dioxide in the feed', unit: 'mol %', min: 0.1, max: 15, step: 0.1, default: 3.0,
    group: 'Feed', level: 'student',
    rules: [rules.required(), rules.positive('Carbon dioxide'), rules.range(0.1, 15, 'mol %', 'Outside the band this model was set up for.')]
  },
  c2Content: {
    label: 'Ethane in the feed', unit: 'mol %', min: 1, max: 16, step: 0.1, default: 8.5,
    group: 'Feed', level: 'engineer',
    rules: [rules.required(), rules.positive('Ethane'), rules.range(1, 16, 'mol %', 'Outside the band this model was set up for.')]
  },
  c3plusContent: {
    label: 'Propane and heavier in the feed', unit: 'mol %', min: 0.5, max: 14, step: 0.1, default: 5.5,
    group: 'Feed', level: 'engineer',
    rules: [rules.required(), rules.positive('Propane and heavier'), rules.range(0.5, 14, 'mol %', 'Outside the band this model was set up for.')]
  },

  amineCirculation: {
    label: 'Amine circulation', unit: U.volFlow, min: 20, max: 900, step: 10, default: 320,
    group: 'Sweetening', level: 'student',
    rules: [rules.required(), rules.positive('Amine circulation'), rules.range(20, 900, U.volFlow, 'Outside the size range this teaching model was set up for.')]
  },
  amineConcentration: {
    label: 'Amine strength', unit: 'wt %', min: 25, max: 55, step: 1, default: 45,
    group: 'Sweetening', level: 'engineer',
    rules: [rules.required(), rules.positive('Amine strength'), rules.range(25, 55, 'wt %', 'Above 55 wt % methyldiethanolamine the solution is too corrosive to run in carbon steel.')]
  },
  leanLoading: {
    label: 'Lean amine loading', unit: 'mol/mol', min: 0.002, max: 0.06, step: 0.002, default: 0.008,
    group: 'Sweetening', level: 'student',
    rules: [rules.required(), rules.positive('Lean loading'), rules.range(0.002, 0.06, 'mol/mol', 'Below 0.002 the stripper would need more steam than any reboiler could deliver.')]
  },
  contactorTrays: {
    label: 'Contactor theoretical trays', unit: U.dimensionless, min: 6, max: 30, step: 1, default: 20,
    group: 'Sweetening', level: 'engineer',
    rules: [rules.required(), rules.positive('Trays'), rules.range(6, 30, '', 'Outside the range this model was set up for.')]
  },
  exchangerApproach: {
    label: 'Lean/rich exchanger approach', unit: 'K', min: 5, max: 35, step: 1, default: 12,
    group: 'Sweetening', level: 'expert',
    rules: [rules.required(), rules.positive('Approach'), rules.range(5, 35, 'K', 'Below 5 K the exchanger is uneconomically large; above 35 K almost none of the heat is being recovered.')]
  },

  dehyTemp: {
    label: 'Glycol contactor temperature', unit: U.tempC, min: 15, max: 55, step: 1, default: 38,
    group: 'Dehydration', level: 'student',
    rules: [rules.required(), rules.range(15, 55, U.tempC, 'Outside the band the glycol equilibrium was fitted over.')]
  },
  tegPurity: {
    label: 'Lean glycol purity', unit: 'wt %', min: 96, max: 99.9, step: 0.1, default: 99.2,
    group: 'Dehydration', level: 'student',
    rules: [rules.required(), rules.positive('Glycol purity'), rules.range(96, 99.9, 'wt %', 'Above 99.9 wt % needs vacuum or stripping gas beyond what this model covers.')]
  },
  tegCirculation: {
    label: 'Glycol circulation', unit: 'L per kg water', min: 8, max: 70, step: 1, default: 25,
    group: 'Dehydration', level: 'engineer',
    rules: [rules.required(), rules.positive('Glycol circulation'), rules.range(8, 70, 'L/kg', 'Below 8 L/kg the contactor cannot wet its trays; above 70 the reboiler is being run for nothing.')]
  },
  dehyTrays: {
    label: 'Glycol contactor theoretical trays', unit: U.dimensionless, min: 1, max: 4, step: 0.5, default: 2.5,
    group: 'Dehydration', level: 'expert',
    rules: [rules.required(), rules.positive('Trays'), rules.range(1, 4, '', 'A glycol contactor rarely achieves more than four theoretical stages however many trays it has.')]
  },

  coldBoxOutlet: {
    label: 'Cold box outlet temperature', unit: U.tempC, min: -50, max: 15, step: 1, default: -14,
    group: 'Liquids recovery', level: 'student',
    rules: [rules.required(), rules.range(-50, 15, U.tempC, 'Below −50 °C the gas/gas exchanger cannot get there without external refrigeration.')]
  },
  expanderPressure: {
    label: 'Expander discharge pressure', unit: U.pressBar, min: 12, max: 45, step: 1, default: 22,
    group: 'Liquids recovery', level: 'student',
    rules: [rules.required(), rules.positive('Expander discharge pressure'), rules.range(12, 45, U.pressBar, 'Outside this band the expander is either doing nothing or taking the column below its own pressure limit.')]
  },
  expanderEfficiency: {
    label: 'Expander isentropic efficiency', unit: U.pct, min: 55, max: 90, step: 1, default: 82,
    group: 'Liquids recovery', level: 'engineer',
    rules: [rules.required(), rules.positive('Expander efficiency'), rules.range(55, 90, U.pct, 'A turboexpander in good order runs between 78 and 88 %; outside that band something is wrong with it.')]
  },
  demethaniserStages: {
    label: 'Demethaniser theoretical stages', unit: U.dimensionless, min: 3, max: 20, step: 1, default: 10,
    group: 'Liquids recovery', level: 'engineer',
    rules: [rules.required(), rules.positive('Stages'), rules.range(3, 20, '', 'Outside the range this model was set up for.')]
  },
  reboilRatio: {
    label: 'Demethaniser boil-up ratio', unit: 'mol/mol', min: 0.1, max: 2.5, step: 0.05, default: 0.7,
    group: 'Liquids recovery', level: 'expert',
    rules: [rules.required(), rules.positive('Boil-up ratio'), rules.range(0.1, 2.5, 'mol/mol', 'Above 2.5 the column is boiling more than it is feeding, which is not an operating point.')]
  },

  pipelinePressure: {
    label: 'Sales pipeline pressure', unit: U.pressBar, min: 35, max: 95, step: 1, default: 70,
    group: 'Sales gas', level: 'student',
    rules: [rules.required(), rules.positive('Pipeline pressure'), rules.range(35, 95, U.pressBar, 'Outside the band this model was set up for.')]
  }
};

// ---------------------------------------------------------------------------
export const assumptions = [
  { text: 'Steady-state operation throughout. Nothing accumulates anywhere, and the whole train is solved in one pass from the wellhead to the pipeline.', kind: KIND.APPROX },
  { text: 'The feed is a nine-component mixture with the heavier fractions lumped into a single C5+ pseudo-component. A real gas analysis runs to C10 or beyond.', kind: KIND.APPROX },
  { text: 'Nitrogen is taken as a fixed 0.8 mol % of the field, and the propane-and-heavier cut is split between propane, the butanes and C5+ in fixed proportions.', kind: KIND.REF },
  { text: 'The gas arrives water saturated at the inlet conditions, which is what a gas straight from a reservoir is.', kind: KIND.APPROX },

  { text: 'Vapour–liquid equilibrium uses the Wilson K-value correlation, built from the critical properties and the acentric factor with no binary interaction parameters and no composition dependence. It is good enough to teach a flash and is not a substitute for an equation of state.', kind: KIND.CORR, source: 'Wilson' },
  { text: 'Every flash is the Rachford–Rice equation solved by bisection. That form is monotonic in the vapour fraction, so a bracketed search cannot fail to find the root if one exists, and the engine reports no phase split rather than guessing when one does not.', kind: KIND.FIRST },
  { text: 'The water a gas holds at saturation uses the Bukacek correlation: an ideal partial-pressure term plus an empirical correction that makes it usable at pipeline pressure.', kind: KIND.CORR, source: 'Bukacek' },
  { text: 'Saturation vapour pressure of water uses the Buck equation, over liquid above 0 °C and over ice below it.', kind: KIND.CORR },

  { text: 'All three separation columns are modelled with the Kremser relation. The amine contactor and the glycol contactor are absorbers, the demethaniser is a stripper, and the only thing that changes between them is whether the factor is L/mV or mV/L.', kind: KIND.CORR, source: 'Kremser' },
  { text: 'The amine is methyldiethanolamine, and its selectivity for hydrogen sulphide over carbon dioxide is represented by a much larger equilibrium slope for carbon dioxide together with a lower stage efficiency for it. That is a stand-in for a kinetic limitation, not a model of one.', kind: KIND.APPROX },
  { text: 'The treated gas can never be cleaner than equilibrium with the lean amine, and that floor rises with both the lean loading and the lean amine temperature.', kind: KIND.FIRST },
  { text: 'The amine reboiler duty is the sum of three terms: the heat of reaction released when the acid gas is driven off, the sensible heat the lean/rich exchanger failed to recover, and the stripping steam, taken as 120 kg per cubic metre of solution circulated.', kind: KIND.CORR },
  { text: 'Water in triethylene glycol is described by a one-parameter Margules activity model fitted to the published equilibrium chart, which is what lets a 99 wt % glycol dry a gas far below what an ideal solution would allow.', kind: KIND.CORR },
  { text: 'The glycol reboiler duty is taken as 1050 kJ per kilogram of solution circulated, which covers the water vaporised, the sensible heat and the reflux.', kind: KIND.REF },

  { text: 'The turboexpander is treated as isentropic with an efficiency on the temperature drop. A tripped expander is replaced by a Joule–Thomson valve at constant enthalpy with a Joule–Thomson coefficient of 0.45 K per bar.', kind: KIND.CORR },
  { text: 'Heat capacities are ideal-gas values at around 300 K and are not corrected for temperature or pressure. In the cold section that is the largest approximation in this model.', kind: KIND.APPROX },
  { text: 'The demethaniser is a Kremser stripper operating at the bubble point of the liquid fed to it, with the boil-up ratio setting the vapour available for stripping. A real column is solved stage by stage with a full enthalpy balance.', kind: KIND.APPROX },
  { text: 'Residue compression uses the polytropic work relation with a compressibility of 0.90 and an isentropic efficiency of 78 %.', kind: KIND.CORR },
  { text: 'Sales specifications are 4 ppmv hydrogen sulphide, 2 mol % carbon dioxide, 7 lb of water per million standard cubic feet after dehydration, a Wobbe index between 47.2 and 54.0 MJ/Sm³, and 100 ppmv of hydrogen sulphide in the liquid product.', kind: KIND.REF },
  { text: 'Gross heating values and the gallon-per-thousand factors are standard values at 15 °C and 101.325 kPa.', kind: KIND.REF }
];

export const equations = [
  {
    what: 'Rachford–Rice',
    equation: 'Σ zᵢ(Kᵢ − 1) / (1 + β(Kᵢ − 1)) = 0',
    why: 'It is the flash, and it is written this way rather than as a component balance because this form is monotonic in β — which means a bracketed search cannot miss the root.',
    inputs: ['Feed composition', 'K-values at the flash conditions'],
    units: 'β is the vapour fraction, dimensionless',
    interpretation: 'If the function is still positive at β = 1 the stream is all vapour, and if it is already negative at β = 0 it is all liquid. Neither is a failure; both are answers.'
  },
  {
    what: 'Wilson K-values',
    equation: 'Kᵢ = (Pc,ᵢ / P) · exp[5.37(1 + ωᵢ)(1 − Tc,ᵢ / T)]',
    why: 'It gives a K-value from nothing but the critical properties and the acentric factor, which is what makes a flash calculable without an equation of state.',
    inputs: ['Critical temperature and pressure', 'Acentric factor', 'Flash conditions'],
    units: 'dimensionless',
    interpretation: 'It knows nothing about the other components present, so it is least reliable exactly where the mixture is least ideal — near the critical region and at high acid gas content.'
  },
  {
    what: 'Kremser',
    equation: 'φ = (A^(N+1) − A) / (A^(N+1) − 1)        A = L / (m·V)',
    why: 'It says what fraction of the available driving force a column of N stages actually uses, and it is the same relation for an absorber and a stripper.',
    inputs: ['Liquid and vapour rates', 'Equilibrium slope', 'Number of theoretical stages'],
    units: 'dimensionless',
    interpretation: 'Above an absorption factor of about 2 more stages buy very little; below 1 no number of stages will finish the job. That is why circulation matters more than height.'
  },
  {
    what: 'Water content of a natural gas',
    equation: 'W = 47484 · p_w / P + B        log₁₀B = −3083.87/(T + 459.67) + 6.69449',
    why: 'It is how much water there is to remove, and the specification the dehydration unit exists to meet.',
    inputs: ['Temperature', 'Pressure'],
    units: 'lb per MMscf',
    interpretation: 'Water content falls roughly with pressure, so a gas compressed before drying carries less water into the contactor — which is sometimes a cheaper way to dry it.'
  },
  {
    what: 'Glycol equilibrium',
    equation: 'y*_w = γ_w · x_w · p_sat(T) / P        ln γ_w = A(1 − x_w)²',
    why: 'It sets the dew point a glycol unit can reach, and it is why lean glycol purity matters more than circulation.',
    inputs: ['Lean glycol purity', 'Contactor temperature and pressure'],
    units: 'mole fraction',
    interpretation: 'The activity coefficient is well below one, which is the whole point: glycol holds water far more tightly than an ideal solution would, and that is what a dehydrator sells.'
  },
  {
    what: 'Turboexpander',
    equation: 'T₂ₛ = T₁ (P₂/P₁)^((k−1)/k)        ΔT = η(T₁ − T₂ₛ)        W = ṅ·cp·ΔT',
    why: 'The cold comes from the work taken out. A valve across the same pressure drop takes no work out and produces a fraction of the cooling.',
    inputs: ['Inlet temperature', 'Pressure ratio', 'Isentropic efficiency'],
    units: 'K and kW',
    interpretation: 'The power recovered is real and drives the residue compressor, but it never covers it — the plant always pays a net cost for the pressure it threw away.'
  },
  {
    what: 'Compression work',
    equation: 'W = (ṅ Z R T₁ / η) · k/(k−1) · [(P₂/P₁)^((k−1)/k) − 1]',
    why: 'It is what the liquids cost. Everything the expander took out of the pressure has to be put back before the gas can go into the pipeline.',
    inputs: ['Residue flow', 'Suction temperature', 'Compression ratio'],
    units: 'kW',
    interpretation: 'Dropping the expander discharge pressure recovers more liquid and costs more compression, and the price of ethane is what decides which way that goes.'
  },
  {
    what: 'Wobbe index',
    equation: 'W = HHV / √(relative density)',
    why: 'Two gases with the same Wobbe index deliver the same heat through the same burner orifice at the same pressure, which is why it rather than heating value is the interchangeability specification.',
    inputs: ['Gross heating value', 'Relative density'],
    units: 'MJ/Sm³',
    interpretation: 'Stripping ethane out lowers the heating value and the density together, so the Wobbe index moves far less than either — which is what makes deep liquids recovery possible at all.'
  }
];

// ---------------------------------------------------------------------------
// Result assembly
// ---------------------------------------------------------------------------
const field = (label, value, unit, digits = 2, kind = KIND.CALC) => ({ label, value, unit, digits, kind });
const fmt = (v, d, unit) => (Number.isFinite(v) ? `${v.toFixed(d)}${unit ? ' ' + unit : ''}` : '—');

function buildResults(s, x, fx) {
  const on = s.feedTotal > 0;
  const only = v => (on && Number.isFinite(v) ? v : null);
  const pctOf = v => (on && Number.isFinite(v) ? v * 100 : null);

  const kpis = [
    { label: 'Sales gas rate', value: only(s.salesRate), unit: 'MMSCFD', digits: 1 },
    { label: 'Hydrogen sulphide in sales gas', value: only(s.salesH2S), unit: 'ppmv', digits: 2 },
    { label: 'Water after dehydration', value: only(s.waterOutLb), unit: 'lb/MMscf', digits: 2 },
    { label: 'Ethane recovery', value: pctOf(s.recovery.C2), unit: U.pct, digits: 1 },
    { label: 'Natural gas liquids', value: only(s.nglVolume), unit: U.volFlow, digits: 1 },
    { label: 'Specifications met', value: only(s.specsMet), unit: `of ${s.specsTotal}`, digits: 0 }
  ];

  const results = {
    // feed
    methane: field('Methane in the feed', pctOf(s.z.C1), 'mol %', 2, KIND.FIRST),
    feedWater: field('Water in the feed at saturation', only(s.feed.waterLb), 'lb/MMscf', 1, KIND.CORR),
    feedMolar: field('Wellhead molar flow', only(s.feedTotal), U.molFlow, 0),
    feedGPM: field('Liquefiable content of the feed', only(s.feedGPM), 'gal/Mscf', 3, KIND.REF),
    // inlet separation
    inletBeta: field('Vapour fraction at the inlet separator', only(s.inlet.beta), U.dimensionless, 4, KIND.FIRST),
    condensate: field('Condensate dropped out', only(s.condensateHC), U.molFlow, 2),
    producedWater: field('Free water dropped out', only(s.producedWater * COMP.H2O.mw), 'kg/h', 1),
    // sweetening
    h2sIn: field('Hydrogen sulphide to the contactor', only(s.yH2Sin * 1e6), 'ppmv', 0, KIND.FIRST),
    co2In: field('Carbon dioxide to the contactor', pctOf(s.yCO2in), 'mol %', 2, KIND.FIRST),
    leanTemp: field('Lean amine temperature', only(s.leanTemp), U.tempC, 1),
    amineMoles: field('Amine circulated', only(s.amineMoles), U.molFlow, 0),
    absorptionH2S: field('Absorption factor, hydrogen sulphide', only(s.aH2S), U.dimensionless, 1, KIND.CORR),
    absorptionCO2: field('Absorption factor, carbon dioxide', only(s.aCO2), U.dimensionless, 2, KIND.CORR),
    kremserH2S: field('Driving force used, hydrogen sulphide', pctOf(s.phiH2S), U.pct, 3, KIND.CORR),
    kremserCO2: field('Driving force used, carbon dioxide', pctOf(s.phiCO2), U.pct, 1, KIND.CORR),
    h2sFloor: field('Treated gas floor set by the lean amine', only(s.yH2Sstar * 1e6), 'ppmv', 2, KIND.FIRST),
    h2sOut: field('Hydrogen sulphide leaving the contactor', only(s.yH2Sout * 1e6), 'ppmv', 2, KIND.CORR),
    co2Out: field('Carbon dioxide leaving the contactor', pctOf(s.yCO2out), 'mol %', 3, KIND.CORR),
    co2Slip: field('Carbon dioxide slipped', pctOf(s.yCO2in > 0 ? s.yCO2out / s.yCO2in : null), U.pct, 1, KIND.CORR),
    acidAbsorbed: field('Acid gas absorbed', only(s.acidAbsorbed), U.molFlow, 1),
    richLoading: field('Rich amine loading', only(s.richLoading), 'mol/mol', 4, KIND.FIRST),
    loadingLimit: field('Corrosion limit on rich loading', REF.richLoadingLimit, 'mol/mol', 2, KIND.REF),
    reactionDuty: field('Heat of reaction in the reboiler', only(s.reactionDuty / 3.6e6), U.powerMW, 2, KIND.FIRST),
    sensibleDuty: field('Sensible heat the exchanger did not recover', only(s.sensibleDuty / 3.6e6), U.powerMW, 2, KIND.FIRST),
    strippingDuty: field('Stripping steam duty', only(s.strippingDuty / 3.6e6), U.powerMW, 2, KIND.CORR),
    reboilerDuty: field('Amine reboiler duty', only(s.reboilerDuty / 3.6e6), U.powerMW, 2),
    specificReboiler: field('Reboiler duty per unit circulated', only(s.specificReboiler), 'kW per m³/h', 1),
    // dehydration
    waterIn: field('Water into the glycol contactor', only(s.waterInLb), 'lb/MMscf', 1, KIND.CORR),
    waterInRate: field('Water arriving', only(s.waterInRate), 'kg/h', 1, KIND.FIRST),
    glycolActivity: field('Water activity coefficient in the lean glycol', only(s.gammaWater), U.dimensionless, 3, KIND.CORR),
    glycolSlope: field('Equilibrium slope for water', only(s.mWater), U.dimensionless, 6, KIND.FIRST),
    tegVolume: field('Glycol circulated', only(s.tegVolume), U.volFlow, 2),
    absorptionWater: field('Absorption factor, water', only(s.aWater), U.dimensionless, 2, KIND.CORR),
    kremserWater: field('Driving force used, water', pctOf(s.phiWater), U.pct, 2, KIND.CORR),
    waterOut: field('Water leaving the contactor', only(s.waterOutLb), 'lb/MMscf', 2, KIND.CORR),
    waterRemoved: field('Water removed', only(s.waterRemoved), 'kg/h', 1),
    dewPointIn: field('Water dew point in', only(s.dewPointIn), U.tempC, 1, KIND.FIRST),
    dewPointOut: field('Water dew point out', only(s.dewPointOut), U.tempC, 1, KIND.FIRST),
    dewPointDepression: field('Dew point depression', only(s.dewPointDepression), 'K', 1, KIND.FIRST),
    glycolDuty: field('Glycol reboiler duty', only(s.glycolDuty / 3.6e6), U.powerMW, 3, KIND.REF),
    // cold section
    coldBoxDuty: field('Cold box duty', only(s.coldBoxDuty / 3.6e6), U.powerMW, 2, KIND.FIRST),
    achievableColdBox: field('Coldest the residue can make the feed', only(s.achievableColdBox), U.tempC, 1, KIND.FIRST),
    heatCapacityRatio: field('Heat capacity ratio of the feed gas', only(s.kRatio), U.dimensionless, 3, KIND.FIRST),
    isentropicOut: field('Isentropic expander outlet temperature', only(s.isentropicOut - 273.15), U.tempC, 1, KIND.FIRST),
    expanderOut: field('Expander outlet temperature', only(s.expanderOutC), U.tempC, 1, KIND.CORR),
    expanderPower: field('Power recovered by the expander', only(s.expanderPower), U.powerKW, 0, KIND.FIRST),
    coldBeta: field('Vapour fraction at the expander outlet', only(s.expanded.beta), U.dimensionless, 4, KIND.FIRST),
    coldLiquid: field('Liquid to the demethaniser', only(s.liquidToColumn), U.molFlow, 1, KIND.FIRST),
    columnPressure: field('Demethaniser pressure', only(s.columnPressure), U.pressBar, 1),
    bottomTemp: field('Demethaniser bottom temperature', only(s.bottomK - 273.15), U.tempC, 1, KIND.FIRST),
    stripVapour: field('Vapour raised for stripping', only(s.stripVapour), U.molFlow, 1),
    methaneInNgl: field('Methane left in the product', pctOf(s.c1InNgl), 'mol %', 3, KIND.CORR),
    c1ToC2: field('Methane to ethane ratio in the product', only(s.c1ToC2), 'mol/mol', 4, KIND.CORR),
    // recoveries
    recoveryC2: field('Ethane recovery', pctOf(s.recovery.C2), U.pct, 1, KIND.CORR),
    recoveryC3: field('Propane recovery', pctOf(s.recovery.C3), U.pct, 1, KIND.CORR),
    recoveryC4: field('Butane recovery', pctOf(s.recovery.nC4), U.pct, 1, KIND.CORR),
    recoveryC5: field('C5 and heavier recovery', pctOf(s.recovery.C5), U.pct, 1, KIND.CORR),
    nglRate: field('Natural gas liquids produced', only(s.nglVolume), U.volFlow, 2),
    nglMass: field('Natural gas liquids by mass', only(s.nglMass), U.massFlow, 0),
    // compression and sales
    compressorPower: field('Residue compressor power', only(s.compressorPower), U.powerKW, 0, KIND.CORR),
    netPower: field('Net shaft power', only(s.netPower), U.powerKW, 0, KIND.FIRST),
    dischargeTemp: field('Compressor discharge temperature', only(s.dischargeTemp), U.tempC, 1, KIND.CORR),
    compressionRatio: field('Compression ratio', only(s.compressionRatio), U.dimensionless, 2),
    salesRate: field('Sales gas rate', only(s.salesRate), 'MMSCFD', 1),
    salesH2S: field('Hydrogen sulphide in sales gas', only(s.salesH2S), 'ppmv', 2, KIND.CORR),
    salesCO2: field('Carbon dioxide in sales gas', only(s.salesCO2), 'mol %', 3, KIND.CORR),
    salesWater: field('Water in sales gas', only(s.salesWaterLb), 'lb/MMscf', 2, KIND.CORR),
    salesHHV: field('Gross heating value', only(s.salesHHV), 'MJ/Sm³', 2, KIND.REF),
    salesWobbe: field('Wobbe index', only(s.salesWobbe), 'MJ/Sm³', 2, KIND.FIRST),
    salesGPM: field('Liquefiable content left in the sales gas', only(s.salesGPM), 'gal/Mscf', 3, KIND.REF),
    nglH2S: field('Hydrogen sulphide in the liquid product', only(s.nglH2S), 'ppmv', 1, KIND.CORR),
    freezeMargin: field('Margin between the cold box and the water dew point', only(s.freezeMargin), 'K', 1, KIND.FIRST),
    hydrocarbonDew: field('Hydrocarbon dew point at pipeline pressure', only(s.hydrocarbonDew), U.tempC, 1, KIND.FIRST),
    energyIntensity: field('Energy per unit of sales gas', only(s.energyPerMMSCFD), 'kW per MMSCFD', 0)
  };

  const massBalance = {
    feedTotal: field('Wellhead in', only(s.feedTotal), U.molFlow, 1),
    totalIn: field('Total in', only(s.inTotal), U.molFlow, 1),
    salesOut: field('Sales gas out', only(s.salesTotal), U.molFlow, 1),
    nglOut: field('Natural gas liquids out', only(s.nglTotal), U.molFlow, 2),
    condensateOut: field('Condensate and free water out', only(sum(s.condensate)), U.molFlow, 2),
    acidGasOut: field('Acid gas out', only(sum(s.acidGas)), U.molFlow, 2),
    waterFromAmine: field('Water picked up in the amine contactor', only(s.waterFromAmine), U.molFlow, 3, KIND.FIRST),
    coolerWater: field('Water knocked out before dehydration', only(s.coolerWater), U.molFlow, 3, KIND.FIRST),
    glycolWaterOut: field('Water to the glycol regenerator', only(s.waterRemoved / COMP.H2O.mw), U.molFlow, 3),
    totalOut: field('Total out', only(s.outTotal), U.molFlow, 1),
    molarClosure: field('Molar balance closure error', pctOf(s.molarClosure), U.pct, 6),
    carbonIn: field('Carbon in', only(s.carbonIn), U.molFlow, 1, KIND.FIRST),
    carbonOut: field('Carbon out', only(s.carbonOut), U.molFlow, 1, KIND.FIRST),
    carbonClosure: field('Carbon balance closure error', pctOf(s.carbonClosure), U.pct, 6)
  };

  const energyBalance = {
    amineReboiler: field('Amine reboiler', only(s.reboilerDuty / 3.6e6), U.powerMW, 2),
    glycolReboiler: field('Glycol reboiler', only(s.glycolDuty / 3.6e6), U.powerMW, 3),
    demethaniserReboiler: field('Demethaniser reboiler', only(s.demethaniserDuty / 3.6e6), U.powerMW, 2),
    thermalTotal: field('Total thermal duty', only(s.totalThermal), U.powerMW, 2),
    expanderRecovered: field('Recovered by the expander', only(s.expanderPower / 1000), U.powerMW, 2, KIND.FIRST),
    compressorDemand: field('Residue compressor demand', only(s.compressorPower / 1000), U.powerMW, 2, KIND.CORR),
    netShaft: field('Net shaft power', only(s.netPower / 1000), U.powerMW, 2, KIND.FIRST),
    coldBoxDuty: field('Cold box exchanged', only(s.coldBoxDuty / 3.6e6), U.powerMW, 2, KIND.FIRST),
    energyIntensity: field('Energy per unit of sales gas', only(s.energyPerMMSCFD), 'kW per MMSCFD', 0)
  };

  const spec = (label, value, unit, digits, pass, limit) => ({
    label: pass === null ? label : `${label} — ${pass ? 'on specification' : 'off specification'}`,
    value, unit, digits, kind: KIND.CORR, limit
  });
  const quality = {
    h2s: spec('Hydrogen sulphide', only(s.salesH2S), 'ppmv', 2, s.specs.h2s),
    co2: spec('Carbon dioxide', only(s.salesCO2), 'mol %', 3, s.specs.co2),
    water: spec('Water after dehydration', only(s.waterOutLb), 'lb/MMscf', 2, s.specs.water),
    nglH2S: spec('Hydrogen sulphide in the liquid product', only(s.nglH2S), 'ppmv', 1, s.specs.nglH2S),
    wobbe: spec('Wobbe index', only(s.salesWobbe), 'MJ/Sm³', 2, s.specs.wobbe),
    hhv: field('Gross heating value', only(s.salesHHV), 'MJ/Sm³', 2, KIND.REF),
    hydrocarbonDew: field('Hydrocarbon dew point', only(s.hydrocarbonDew), U.tempC, 1, KIND.FIRST),
    gpmLeft: field('Liquefiable content left in the gas', only(s.salesGPM), 'gal/Mscf', 3, KIND.REF),
    recoveryC2: field('Ethane recovery', pctOf(s.recovery.C2), U.pct, 1, KIND.CORR),
    recoveryC3: field('Propane recovery', pctOf(s.recovery.C3), U.pct, 1, KIND.CORR),
    specsMet: field('Specifications met', only(s.specsMet), `of ${s.specsTotal}`, 0)
  };

  const charts = on ? [
    {
      type: 'bar', title: 'Where the energy goes', unit: 'MW',
      bars: [
        { label: 'Amine', value: s.reboilerDuty / 3.6e6 },
        { label: 'Glycol', value: s.glycolDuty / 3.6e6 },
        { label: 'Demeth', value: s.demethaniserDuty / 3.6e6 },
        { label: 'Compress', value: s.compressorPower / 1000 },
        { label: 'Expander', value: -s.expanderPower / 1000 }
      ].filter(b => Number.isFinite(b.value))
    },
    {
      type: 'line', title: 'Ethane recovery against expander outlet temperature',
      xLabel: '°C', yLabel: '%',
      series: [{
        points: Array.from({ length: 24 }, (_, i) => {
          const t = -110 + i * 4;
          const f = flash(s.dryGas, t + 273.15, x.expanderPressure);
          const rec = f.liquid && s.wellhead.C2 > 0 ? f.liquid.C2 / s.wellhead.C2 * 100 : null;
          return [t, rec];
        }).filter(p => p[1] !== null)
      }]
    },
    {
      type: 'line', title: 'Water content of the gas against pressure',
      xLabel: 'bar', yLabel: 'lb/MMscf',
      series: [{
        points: Array.from({ length: 20 }, (_, i) => {
          const p = 20 + i * 4;
          return [p, bukacek(x.dehyTemp, p)];
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

  if (n(s.salesH2S) && s.salesH2S > REF.specH2S) {
    out.push({
      level: 'warning',
      text: `The sales gas carries ${s.salesH2S.toFixed(2)} ppmv of hydrogen sulphide against a 4 ppmv specification. This gas cannot go into the pipeline. The floor the lean amine sets is ${(s.yH2Sstar * 1e6).toFixed(2)} ppmv, so no amount of circulation or contactor height will get below that — the stripper has to work harder.`
    });
  }
  if (n(s.salesCO2) && s.salesCO2 > REF.specCO2) {
    out.push({ level: 'warning', text: `Carbon dioxide leaves at ${s.salesCO2.toFixed(2)} mol % against a 2 % specification. Methyldiethanolamine is chosen for slipping carbon dioxide rather than removing it, so this is the amine behaving as intended and the formulation being wrong for this feed.` });
  }
  if (n(s.waterOutLb) && s.waterOutLb > REF.specWater) {
    out.push({ level: 'warning', text: `The dehydration unit is delivering ${s.waterOutLb.toFixed(2)} lb of water per MMscf against a 7 lb specification, a dew point of ${s.dewPointOut === null ? '—' : s.dewPointOut.toFixed(1)} °C. At pipeline pressure that gas will form hydrates before it reaches the first compressor station.` });
  }
  if (n(s.freezeMargin) && s.freezeMargin < 0) {
    out.push({ level: 'warning', text: `The gas enters the cold box at ${x.coldBoxOutlet.toFixed(0)} °C with a water dew point of ${s.dewPointOut.toFixed(1)} °C — ${(-s.freezeMargin).toFixed(0)} K of it below the dew point. Ice and hydrates would form in the exchanger and block it. Glycol cannot dry a gas far enough for a deep cryogenic plant, which is why those plants use a molecular sieve; this model flags that rather than simulating the blockage.` });
  }
  if (n(s.nglH2S) && s.nglH2S > REF.specNglH2S) {
    out.push({ level: 'warning', text: `The liquid product carries ${s.nglH2S.toFixed(0)} ppmv of hydrogen sulphide against a 100 ppmv specification. Hydrogen sulphide is far more soluble than methane at demethaniser temperatures, so almost everything the amine let past ends up here — which is why the liquid product, not the sales gas, is usually what the amine unit is really sized for.` });
  }
  if (n(s.richLoading)) {
    if (s.richLoading > REF.richLoadingLimit) {
      out.push({ level: 'warning', text: `The rich amine is loaded to ${s.richLoading.toFixed(3)} mol per mol against a corrosion limit of ${REF.richLoadingLimit}. Above that the rich line and the exchanger corrode fast enough to be a leak rather than a maintenance item. Circulate more.` });
    } else if (s.richLoading < 0.12 && s.acidAbsorbed > 0) {
      out.push({ level: 'warning', text: `The rich amine comes back at only ${s.richLoading.toFixed(3)} mol per mol. The unit is circulating far more solution than the acid gas load needs, and the reboiler is paying for all of it at ${(s.reboilerDuty / 3.6e6).toFixed(1)} MW.` });
    }
  }
  if (n(s.aCO2) && s.aCO2 > 3 && s.yCO2in > 0.005) {
    out.push({ level: 'info', text: `The absorption factor for carbon dioxide is ${s.aCO2.toFixed(2)}, which is high enough that the amine is taking out carbon dioxide it was chosen to slip. Selectivity is bought by circulating less, not more.` });
  }
  if (fx.amineCarryover) {
    out.push({ level: 'warning', text: 'The contactor is foaming, so the trays are not making contact. Everything about the circulation and the loading reads normal and the treated gas does not.' });
  }
  if (n(s.dewPointDepression) && s.dewPointDepression < 25) {
    out.push({ level: 'warning', text: `The glycol unit is only depressing the dew point by ${s.dewPointDepression.toFixed(1)} K. Lean glycol purity sets the floor a contactor can reach, and circulation only decides how close it gets — check the regenerator before adding circulation.` });
  }
  if (n(s.aWater) && s.aWater < 1.5) {
    out.push({ level: 'warning', text: `The absorption factor for water is ${s.aWater.toFixed(2)}. Below about one and a half, no number of trays finishes the job: the glycol leaves the contactor in equilibrium with the wet gas rather than the dry.` });
  }
  if (n(s.achievableColdBox) && x.coldBoxOutlet < s.achievableColdBox - 0.5) {
    out.push({ level: 'warning', text: `The cold box is set to ${x.coldBoxOutlet.toFixed(0)} °C but the residue gas returns at ${(s.expanderOutC).toFixed(1)} °C, so with a ${REF.coldBoxApproach} K approach the exchanger can only reach ${s.achievableColdBox.toFixed(1)} °C on its own. The difference has to come from a propane chiller, which this plant does not have.` });
  }
  if (fx.expanderTripped) {
    out.push({ level: 'warning', text: `The expander is tripped and the Joule–Thomson valve is passing the gas instead. The same pressure is being thrown away, no power is being recovered, and the outlet is ${s.expanderOutC.toFixed(1)} °C rather than the ${(s.isentropicOut - 273.15).toFixed(1)} °C an isentropic expansion would have given.` });
  }
  if (n(s.c1ToC2) && s.c1ToC2 > 0.02) {
    out.push({ level: 'warning', text: `The product carries ${(s.c1InNgl * 100).toFixed(2)} mol % methane, a methane to ethane ratio of ${s.c1ToC2.toFixed(3)}. Specification liquids run below 0.02, and methane in a liquid product is vapour pressure that the storage tank has to hold.` });
  }
  if (n(s.recovery.C2) && s.recovery.C2 < 0.35) {
    out.push({ level: 'info', text: `Ethane recovery is ${(s.recovery.C2 * 100).toFixed(1)} %. That is ethane rejection rather than recovery, and it is the right answer whenever ethane is worth more as heating value in the pipeline than as a liquid — which is most of the time in a weak market.` });
  }
  if (n(s.salesWobbe) && !s.specs.wobbe) {
    out.push({ level: 'warning', text: `The Wobbe index is ${s.salesWobbe.toFixed(2)} MJ/Sm³, outside the ${REF.specWobbeLow}–${REF.specWobbeHigh} band the pipeline is written on. A burner set for this network would not run correctly on this gas.` });
  }
  if (n(s.hydrocarbonDew) && s.hydrocarbonDew > 0) {
    out.push({ level: 'warning', text: `The hydrocarbon dew point is ${s.hydrocarbonDew.toFixed(1)} °C at pipeline pressure. Liquid will drop out in the line on any cold night, and a pipeline is not designed to handle it.` });
  }
  if (n(s.netPower) && s.netPower < 0) {
    out.push({ level: 'info', text: 'The expander is recovering more power than the residue compressor needs, which means the plant is not putting the pressure back. Check the pipeline pressure against the expander discharge.' });
  }
  if (!out.some(m => m.level === 'error') && s.specsMet === s.specsTotal) {
    out.push({ level: 'info', text: `All ${s.specsTotal} pipeline specifications met, ${(s.recovery.C2 * 100).toFixed(0)} % ethane recovery and ${s.nglVolume.toFixed(1)} m³/h of liquids, for ${(s.netPower / 1000).toFixed(1)} MW of net shaft power and ${s.totalThermal.toFixed(1)} MW of heat. This is a plant that would run.` });
  }
  return out;
}

// ---------------------------------------------------------------------------
function equipmentFrom(s, x, fx) {
  const off = !(s.feedTotal > 0);
  const run = (alarm = false) => ({ state: off ? 'stopped' : alarm ? 'warning' : 'running', alarm });
  const eq = {};
  const n = v => Number.isFinite(v);

  eq[TAGS.inletSeparator] = {
    ...run(false), level: off ? 0 : clamp(0.35 + (1 - (s.inlet.beta ?? 1)) * 3, 0.2, 0.85),
    values: {
      'Gas in': fmt(x.gasRate, 0, 'MMSCFD'),
      'Vapour fraction': fmt(s.inlet.beta, 4, ''),
      Condensate: fmt(s.condensateHC, 2, U.molFlow),
      'Free water': fmt(s.producedWater * COMP.H2O.mw, 1, 'kg/h')
    }
  };
  eq[TAGS.amineContactor] = {
    ...run(n(s.salesH2S) && s.salesH2S > REF.specH2S),
    load: off ? 0 : clamp(s.aCO2 / 4, 0, 1),
    values: {
      'H₂S in': fmt(s.yH2Sin * 1e6, 0, 'ppmv'),
      'H₂S out': fmt(s.yH2Sout * 1e6, 2, 'ppmv'),
      'CO₂ slipped': fmt(s.yCO2in > 0 ? s.yCO2out / s.yCO2in * 100 : NaN, 0, U.pct),
      'Trays working': fmt(s.trays, 1, '')
    }
  };
  eq[TAGS.amineRegenerator] = {
    ...run(n(s.richLoading) && s.richLoading > REF.richLoadingLimit),
    duty: off ? 0 : clamp(s.reboilerDuty / 3.6e6 / 60, 0, 1),
    values: {
      'Lean loading': fmt(x.leanLoading, 4, 'mol/mol'),
      'Rich loading': fmt(s.richLoading, 4, 'mol/mol'),
      'Reboiler duty': fmt(s.reboilerDuty / 3.6e6, 2, U.powerMW),
      'Acid gas': fmt(s.acidAbsorbed, 1, U.molFlow)
    }
  };
  eq[TAGS.leanRichExchanger] = {
    ...run(x.exchangerApproach > 25),
    duty: off ? 0 : clamp(1 - x.exchangerApproach / 35, 0, 1),
    values: { Approach: fmt(x.exchangerApproach, 0, 'K'), 'Heat not recovered': fmt(s.sensibleDuty / 3.6e6, 2, U.powerMW) }
  };
  eq[TAGS.aminePump] = {
    ...run(false), load: off ? 0 : clamp(x.amineCirculation / 900, 0, 1),
    values: { Circulation: fmt(x.amineCirculation, 0, U.volFlow), Strength: fmt(x.amineConcentration, 0, 'wt %') }
  };
  eq[TAGS.glycolContactor] = {
    ...run(n(s.salesWaterLb) && s.salesWaterLb > REF.specWater),
    load: off ? 0 : clamp(s.aWater / 10, 0, 1),
    values: {
      'Water in': fmt(s.waterInLb, 1, 'lb/MMscf'),
      'Water out': fmt(s.waterOutLb, 2, 'lb/MMscf'),
      'Dew point': fmt(s.dewPointOut, 1, U.tempC),
      'Absorption factor': fmt(s.aWater, 2, '')
    }
  };
  eq[TAGS.glycolRegenerator] = {
    ...run(x.tegPurity < 98),
    duty: off ? 0 : clamp(s.glycolDuty / 3.6e6 / 3, 0, 1),
    values: {
      'Lean purity': fmt(x.tegPurity, 2, 'wt %'),
      'Reboiler temperature': fmt(REF.tegReboilerTemp, 0, U.tempC),
      'Water boiled off': fmt(s.waterRemoved, 1, 'kg/h')
    }
  };
  eq[TAGS.coldBox] = {
    ...run(fx.coldBoxRise > 0),
    duty: off ? 0 : clamp(s.coldBoxDuty / 3.6e6 / 20, 0, 1),
    values: {
      'Outlet temperature': fmt(x.coldBoxOutlet, 1, U.tempC),
      Duty: fmt(s.coldBoxDuty / 3.6e6, 2, U.powerMW),
      'Coldest achievable': fmt(s.achievableColdBox, 1, U.tempC)
    }
  };
  eq[TAGS.expander] = {
    state: off ? 'stopped' : fx.expanderTripped ? 'tripped' : 'running',
    alarm: fx.expanderTripped,
    speed: off || fx.expanderTripped ? 0 : 9000,
    load: off ? 0 : clamp(s.expanderPower / 6000, 0, 1),
    values: {
      'Outlet temperature': fmt(s.expanderOutC, 1, U.tempC),
      'Power recovered': fmt(s.expanderPower, 0, U.powerKW),
      Efficiency: fmt(fx.expanderTripped ? NaN : x.expanderEfficiency, 0, U.pct)
    }
  };
  eq[TAGS.coldSeparator] = {
    ...run(false), level: off ? 0 : clamp(1 - (s.expanded.beta ?? 1), 0.05, 0.9),
    values: {
      'Vapour fraction': fmt(s.expanded.beta, 4, ''),
      'Liquid out': fmt(s.liquidToColumn, 1, U.molFlow),
      Temperature: fmt(s.expanderOutC, 1, U.tempC)
    }
  };
  eq[TAGS.demethaniser] = {
    ...run(n(s.c1ToC2) && s.c1ToC2 > 0.02),
    load: off ? 0 : clamp(s.liquidToColumn / 800, 0, 1),
    duty: off ? 0 : clamp(s.demethaniserDuty / 3.6e6 / 12, 0, 1),
    values: {
      'Bottom temperature': fmt(s.bottomK - 273.15, 1, U.tempC),
      'Ethane recovery': fmt(s.recovery.C2 * 100, 1, U.pct),
      'Methane in product': fmt(s.c1InNgl * 100, 2, 'mol %'),
      Stages: fmt(x.demethaniserStages, 0, '')
    }
  };
  eq[TAGS.residueCompressor] = {
    ...run(n(s.dischargeTemp) && s.dischargeTemp > 150),
    load: off ? 0 : clamp(s.compressorPower / 15000, 0, 1),
    speed: off ? 0 : 6500,
    values: {
      Power: fmt(s.compressorPower, 0, U.powerKW),
      'Compression ratio': fmt(s.compressionRatio, 2, ''),
      'Discharge temperature': fmt(s.dischargeTemp, 1, U.tempC)
    }
  };
  eq[TAGS.stabiliser] = {
    ...run(false), level: off ? 0 : 0.55,
    values: { 'Condensate in': fmt(s.condensateHC, 2, U.molFlow), 'Free water': fmt(s.producedWater * COMP.H2O.mw, 1, 'kg/h') }
  };
  eq[TAGS.nglStorage] = {
    ...run(false), level: off ? 0 : clamp(s.nglVolume / 60, 0.1, 0.9),
    values: {
      Production: fmt(s.nglVolume, 2, U.volFlow),
      'By mass': fmt(s.nglMass, 0, U.massFlow),
      'Methane content': fmt(s.c1InNgl * 100, 2, 'mol %')
    }
  };
  eq[TAGS.flare] = {
    state: off ? 'stopped' : 'running', alarm: false,
    duty: off ? 0 : clamp(sum(s.acidGas) / 400, 0.05, 1),
    values: { 'Acid gas': fmt(sum(s.acidGas), 1, U.molFlow), 'H₂S': fmt(s.h2sAbsorbed, 2, U.molFlow) }
  };
  eq[TAGS.mcc] = {
    ...run(false),
    load: off ? 0 : clamp(s.compressorPower / 20000, 0, 1),
    values: {
      'Compressor power': fmt(s.compressorPower, 0, U.powerKW),
      'Expander recovery': fmt(s.expanderPower, 0, U.powerKW),
      'Net shaft': fmt(s.netPower, 0, U.powerKW)
    }
  };
  return eq;
}

// ---------------------------------------------------------------------------
function streamsFrom(s, x) {
  const velocity = (id, m3PerHour) => {
    const d = REF.bore[id];
    if (!d || !(m3PerHour > 0)) return 0;
    return (m3PerHour / 3600) / (Math.PI * d * d / 4);
  };
  const gasVolume = (kmolPerHour, bar, tempC) =>
    bar > 0 ? kmolPerHour * REF.R * (tempC + 273.15) / (bar * 100) : 0;   // m³/h
  const mk = (id, flow, phase, label, m3PerHour) => ({
    id, flow: Number.isFinite(flow) && flow > 0 ? flow : 0, phase,
    label: Number.isFinite(flow) && flow > 0 ? label : '—',
    velocity: velocity(id, m3PerHour)
  });
  const t = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');
  const P = x.feedPressure;

  const gasIn = s.feedTotal, sep = sum(s.separatedGas), sweet = sum(s.sweetGas), dry = sum(s.dryGas);
  const acid = sum(s.acidGas), cond = sum(s.condensate) - s.producedWater;

  return [
    mk(STREAMS.wellheadFeed, gasIn, 'gas', `${t(x.gasRate, 0)} MMSCFD · ${t(P, 0)} bar · ${t(x.feedTemp, 0)} °C`, gasVolume(gasIn, P, x.feedTemp)),
    mk(STREAMS.separatedGas, sep, 'gas', `${t(sep, 0)} kmol/h · ${t(s.yH2Sin * 1e6, 0)} ppmv H₂S`, gasVolume(sep, P, x.feedTemp)),
    mk(STREAMS.condensate, cond, 'liquid', `${t(cond, 2)} kmol/h condensate`, cond * 0.12),
    mk(STREAMS.producedWater, s.producedWater, 'liquid', `${t(s.producedWater * COMP.H2O.mw, 1)} kg/h water`, s.producedWater * 0.018),
    mk(STREAMS.sweetGas, sweet, 'gas', `${t(s.yH2Sout * 1e6, 2)} ppmv H₂S · ${t(s.yCO2out * 100, 2)} % CO₂`, gasVolume(sweet, P - 0.5, s.leanTemp)),
    mk(STREAMS.richAmine, s.amineMass / 1030, 'liquid', `${t(x.amineCirculation, 0)} m³/h · ${t(s.richLoading, 3)} mol/mol`, x.amineCirculation),
    mk(STREAMS.leanAmine, s.amineMass / 1030, 'liquid', `${t(x.amineCirculation, 0)} m³/h · ${t(x.leanLoading, 4)} mol/mol`, x.amineCirculation),
    mk(STREAMS.acidGas, acid, 'gas', `${t(acid, 1)} kmol/h to the flare`, gasVolume(acid, 1.5, 50)),
    mk(STREAMS.dryGas, dry, 'gas', `${t(s.waterOutLb, 2)} lb/MMscf · dew point ${t(s.dewPointOut, 0)} °C`, gasVolume(dry, s.dehyPressure, x.dehyTemp)),
    mk(STREAMS.richGlycol, s.tegVolume, 'liquid', `${t(s.tegVolume, 2)} m³/h rich glycol`, s.tegVolume),
    mk(STREAMS.leanGlycol, s.tegVolume, 'liquid', `${t(x.tegPurity, 2)} wt % lean`, s.tegVolume),
    mk(STREAMS.regenVapour, s.waterRemoved / COMP.H2O.mw, 'steam', `${t(s.waterRemoved, 1)} kg/h water off`, gasVolume(s.waterRemoved / COMP.H2O.mw, 1.1, 120)),
    mk(STREAMS.chilledGas, dry, 'gas', `${t(x.coldBoxOutlet, 1)} °C · ${t(s.coldBoxDuty / 3.6e6, 1)} MW removed`, gasVolume(dry, s.dehyPressure, x.coldBoxOutlet)),
    mk(STREAMS.expanderOutlet, dry, 'gas', `${t(s.expanderOutC, 1)} °C · ${t(x.expanderPressure, 0)} bar`, gasVolume(dry, x.expanderPressure, s.expanderOutC)),
    mk(STREAMS.coldLiquid, s.liquidToColumn, 'liquid', `${t(s.liquidToColumn, 1)} kmol/h to the column`, s.liquidToColumn * 0.06),
    mk(STREAMS.residueGas, s.residueTotal, 'gas', `${t(s.residueTotal, 0)} kmol/h · ${t(s.columnPressure, 0)} bar`, gasVolume(s.residueTotal, s.columnPressure, s.expanderOutC)),
    mk(STREAMS.nglProduct, s.nglTotal, 'liquid', `${t(s.nglVolume, 2)} m³/h · ${t(s.recovery.C2 * 100, 0)} % C₂ recovery`, s.nglVolume),
    mk(STREAMS.salesGas, s.salesTotal, 'gas', `${t(s.salesRate, 1)} MMSCFD · ${t(s.salesWobbe, 1)} MJ/Sm³ Wobbe`, gasVolume(s.salesTotal, x.pipelinePressure, 40))
  ];
}

// ---------------------------------------------------------------------------
function buildSteps(s, x, fx) {
  const t = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—');
  return [
    {
      title: 'Water the feed is carrying',
      equation: 'W = 47484 · p_w / P + B',
      substitution: `at ${t(x.feedTemp, 0)} °C and ${t(x.feedPressure, 0)} bar`,
      result: `${t(s.feed.waterLb, 1)} lb per MMscf, which is ${t(s.feed.yWater * 1e6, 0)} ppmv`,
      note: 'Saturated, because that is what a gas straight from a reservoir is. Everything the dehydration unit has to do starts here.'
    },
    {
      title: 'Inlet separation',
      equation: 'Σ zᵢ(Kᵢ − 1) / (1 + β(Kᵢ − 1)) = 0',
      substitution: `flash at ${t(x.feedTemp, 0)} °C and ${t(x.feedPressure, 0)} bar`,
      result: `β = ${t(s.inlet.beta, 4)}, so ${t(s.condensateHC, 2)} kmol/h of condensate and ${t(s.producedWater * COMP.H2O.mw, 1)} kg/h of free water drop out`,
      note: 'Solved by bisection on a function that is monotonic in β, so the root cannot be missed if there is one.'
    },
    {
      title: 'Amine contactor — the absorption factors',
      equation: 'A = L / (m·V)        φ = (A^(N+1) − A)/(A^(N+1) − 1)',
      substitution: `A(H₂S) = ${t(s.aH2S, 1)}, A(CO₂) = ${t(s.aCO2, 2)} with ${t(s.trays, 1)} working trays`,
      result: `φ(H₂S) = ${t(s.phiH2S * 100, 3)} %, φ(CO₂) = ${t(s.phiCO2 * 100, 1)} %`,
      note: 'The gap between those two numbers is the selectivity the amine was chosen for.'
    },
    {
      title: 'What the lean amine allows',
      equation: 'y_out = y_in − φ·(y_in − y*)        y* = slope · lean loading · exp((T − 40)/18)',
      substitution: `y* = ${t(s.yH2Sstar * 1e6, 2)} ppmv at a lean loading of ${t(x.leanLoading, 4)} and ${t(s.leanTemp, 1)} °C`,
      result: `${t(s.yH2Sout * 1e6, 2)} ppmv hydrogen sulphide and ${t(s.yCO2out * 100, 3)} mol % carbon dioxide leave the contactor`,
      note: 'The treated gas cannot be cleaner than equilibrium with the lean amine, however tall the tower is.'
    },
    {
      title: 'Glycol contactor',
      equation: 'm = γ_w · p_sat(T) / P        A = L_TEG / (m·V)',
      substitution: `γ_w = ${t(s.gammaWater, 3)} at ${t(x.tegPurity, 2)} wt % lean, so m = ${s.mWater === null ? '—' : s.mWater.toExponential(3)} and A = ${t(s.aWater, 2)}`,
      result: `water falls from ${t(s.waterInLb, 1)} to ${t(s.waterOutLb, 2)} lb per MMscf, a dew point of ${t(s.dewPointOut, 1)} °C`,
      note: `That is a depression of ${t(s.dewPointDepression, 1)} K. Lean purity sets the floor; circulation only decides how close the column gets to it.`
    },
    {
      title: 'Turboexpander',
      equation: 'T₂ₛ = T₁(P₂/P₁)^((k−1)/k)        ΔT = η(T₁ − T₂ₛ)',
      substitution: `k = ${t(s.kRatio, 3)}, ${t(x.coldBoxOutlet, 1)} °C into ${t(x.expanderPressure, 0)} bar`,
      result: fx.expanderTripped
        ? `tripped — the valve gives ${t(s.expanderOutC, 1)} °C instead of the ${t(s.isentropicOut - 273.15, 1)} °C an isentropic expansion would have reached`
        : `${t(s.expanderOutC, 1)} °C, recovering ${t(s.expanderPower, 0)} kW`,
      note: 'The cold and the power are the same thing seen twice: the gas cools because work was taken out of it.'
    },
    {
      title: 'Cold separation and the demethaniser',
      equation: 'S = K·V/L        removed = (S^(N+1) − S)/(S^(N+1) − 1)',
      substitution: `β = ${t(s.expanded.beta, 4)} at the expander outlet, leaving ${t(s.liquidToColumn, 1)} kmol/h to the column at ${t(s.bottomK - 273.15, 1)} °C in the reboiler`,
      result: `${t(s.recovery.C2 * 100, 1)} % of the ethane and ${t(s.recovery.C3 * 100, 1)} % of the propane end up in the product`,
      note: 'Kremser again, with the factor inverted. A stripper is an absorber run the other way round.'
    },
    {
      title: 'Putting the pressure back',
      equation: 'W = (ṅ Z R T₁ / η)·k/(k−1)·[(P₂/P₁)^((k−1)/k) − 1]',
      substitution: `${t(s.residueTotal, 0)} kmol/h from ${t(s.columnPressure, 1)} to ${t(x.pipelinePressure, 0)} bar`,
      result: `${t(s.compressorPower, 0)} kW of compression against ${t(s.expanderPower, 0)} kW recovered, so ${t(s.netPower, 0)} kW net`,
      note: 'The expander never pays for the compressor. The difference is what the liquids cost in energy.'
    },
    {
      title: 'Does it meet the pipeline specification?',
      equation: 'H₂S ≤ 4 ppmv · CO₂ ≤ 2 mol % · water ≤ 7 lb/MMscf · Wobbe 47.2–51.4 MJ/Sm³',
      substitution: `${t(s.salesH2S, 2)} ppmv, ${t(s.salesCO2, 3)} mol %, ${t(s.salesWaterLb, 2)} lb/MMscf, ${t(s.salesWobbe, 2)} MJ/Sm³`,
      result: `${s.specsMet} of ${s.specsTotal} specifications met`,
      note: 'Every unit upstream exists to make one of these four numbers, and the plant is judged on all of them at once.'
    }
  ];
}

// ---------------------------------------------------------------------------
// Contract implementation
// ---------------------------------------------------------------------------
function validate(inputs) {
  const base = validateSpec(inputSpec, inputs);
  const errors = { ...base.errors };
  if (inputs.expanderPressure !== undefined && inputs.feedPressure !== undefined
    && inputs.expanderPressure >= inputs.feedPressure - 2) {
    errors.expanderPressure = 'Expander discharge pressure: must be at least 2 bar below the inlet pressure, or there is nothing to expand across.';
  }
  if (inputs.pipelinePressure !== undefined && inputs.expanderPressure !== undefined
    && inputs.pipelinePressure <= inputs.expanderPressure) {
    errors.pipelinePressure = 'Sales pipeline pressure: must be above the expander discharge, or the residue compressor has nothing to do and the plant is running backwards.';
  }
  const heavies = (inputs.c2Content ?? 0) + (inputs.c3plusContent ?? 0) + (inputs.co2Content ?? 0);
  if (heavies > 70) errors.c3plusContent = 'Propane and heavier: the feed adds up to more than a natural gas can be.';
  return { ok: Object.keys(errors).length === 0, errors };
}

function getInitialState(inputs = {}) {
  const blank = { ...inputs, gasRate: inputSpec.gasRate.default };
  const fx = faultEffects([]);
  const s = solvePlant(blank, fx);
  const built = (s.infeasible || s.unconverged)
    ? { kpis: [], results: {}, massBalance: {}, energyBalance: {}, quality: {} }
    : buildResults(s, blank, fx);
  const nulls = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) =>
    [k, { ...v, value: v.kind === KIND.REF ? v.value : null }]));
  return {
    status: Status.READY, converged: false, iterations: null, residual: null,
    reason: 'Not calculated — set the feed and the operating conditions and run the plant.',
    kpis: (built.kpis || []).map(k => ({ ...k, value: null })),
    results: nulls(built.results || {}), massBalance: nulls(built.massBalance || {}),
    energyBalance: nulls(built.energyBalance || {}), quality: nulls(built.quality || {}),
    charts: [], messages: [], diagnostics: [], streams: [], equipment: {}, steps: []
  };
}

function run(inputs, { scenario = 'base', faults = [] } = {}) {
  const fx = faultEffects(faults);
  const { eff, notes } = effectiveInputs(inputs, fx);
  const s = solvePlant(eff, fx);

  if (s.infeasible) {
    return {
      ...getInitialState(inputs), status: Status.ERROR, converged: false,
      reason: 'No operable state at these conditions',
      messages: [],
      diagnostics: [...notes.map(text => ({ level: 'warning', text })), { level: 'error', text: s.infeasible }]
    };
  }
  if (s.unconverged) {
    return {
      ...getInitialState(inputs), status: Status.ERROR, converged: false,
      iterations: s.solve?.iterations ?? null, residual: s.solve?.residual ?? null,
      reason: `The ${s.stage} did not converge`,
      messages: [],
      diagnostics: [...notes.map(text => ({ level: 'warning', text })), {
        level: 'error',
        text: `The ${s.stage} did not converge: Rachford–Rice stalled at a residual of ${s.solve?.residual === null || s.solve?.residual === undefined ? 'no bracketed root' : s.solve.residual.toExponential(2)} after ${s.solve?.iterations ?? 0} iterations. No results are reported, because an unconverged flash is not a phase split.`
      }]
    };
  }

  const built = buildResults(s, eff, fx);
  const diagnostics = diagnose(s, eff, fx, notes);
  const hasError = diagnostics.some(d => d.level === 'error');
  const hasIssue = diagnostics.some(d => d.level === 'warning' || d.level === 'error');

  return {
    status: hasError ? Status.ERROR : hasIssue ? Status.WARNING : Status.COMPLETE,
    converged: true,
    iterations: (s.inlet.solve.iterations ?? 0) + (s.expanded.solve.iterations ?? 0),
    residual: Math.max(s.inlet.solve.residual ?? 0, s.expanded.solve.residual ?? 0),
    reason: scenario, ...built,
    messages: [], diagnostics,
    streams: streamsFrom(s, eff), equipment: equipmentFrom(s, eff, fx),
    steps: buildSteps(s, eff, fx), state: s
  };
}

export default {
  id: 'gas-processing',
  modelVersion: '1.0.0',
  inputSpec, assumptions, equations,
  TAGS, STREAMS, FAULT_IDS, REF, COMP,
  validate,
  getInitialState,
  run,
  getDiagnostics: result => result?.diagnostics ?? [],
  getEquipmentState: result => result?.equipment ?? {},
  getStreams: result => result?.streams ?? [],
  getSteps: result => result?.steps ?? [],
  Status
};
