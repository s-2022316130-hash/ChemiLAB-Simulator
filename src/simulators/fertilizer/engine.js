/**
 * 03 — AMMONIA–UREA FERTILIZER PLANT — process model.
 *
 * Two coupled recycle loops in series. Synthesis gas is compressed into an
 * ammonia loop where nitrogen and hydrogen react over a promoted iron catalyst,
 * the ammonia is condensed out, the unconverted gas is recycled, and inerts are
 * bled off as purge. The liquid ammonia then meets carbon dioxide in a urea
 * reactor, where the unconverted carbamate is stripped and recycled, and the
 * urea solution is concentrated to a melt and prilled.
 *
 * Rules that apply here (see CLAUDE.md):
 *  - every returned number is computed in this file, never in the UI;
 *  - anything not calculated stays null so the UI prints an em dash;
 *  - `converged` is only true when the solver actually met tolerance;
 *  - every correlation and reference value is declared in `assumptions`.
 *
 * Both loops are the same lesson in different clothing: per-pass conversion is
 * poor and it does not matter, because recycle carries the overall conversion.
 * What limits each loop is what has to be bled out of it — inerts on the
 * ammonia side, water on the urea side.
 *
 * This is a teaching model, not a validated design tool.
 */
import { KIND, Status } from '../../simulation/contract.js';
import { rules, validate as validateSpec } from '../../shared/validation.js';
import { U } from '../../shared/units.js';
import { fixedPoint, bisect } from '../../simulation/solver.js';

// ---------------------------------------------------------------------------
// Shared identity between engine, plant.js and flowsheet.js.
// ---------------------------------------------------------------------------
export const TAGS = Object.freeze({
  makeupComp: 'K-301', recycleComp: 'K-302', converter: 'R-301',
  wasteHeatBoiler: 'E-301', chiller: 'E-302', separator: 'V-301',
  purgeRecovery: 'V-302', ammoniaStorage: 'T-301',
  co2Comp: 'K-303', ureaReactor: 'R-302', stripper: 'C-301',
  carbamateCondenser: 'V-303', evaporator: 'E-303',
  prillTower: 'T-302', productBin: 'V-304', mcc: 'MCC-301'
});
export const STREAMS = Object.freeze({
  makeupSyngas: 'S-01', compressedSyngas: 'S-02', converterFeed: 'S-03',
  converterEffluent: 'S-04', cooledEffluent: 'S-05', chilledEffluent: 'S-06',
  recycleGas: 'S-07', purgeGas: 'S-08', recoveredHydrogen: 'S-09',
  liquidAmmonia: 'S-10', ammoniaToUrea: 'S-11',
  co2Feed: 'S-12', compressedCo2: 'S-13', reactorEffluent: 'S-14',
  carbamateRecycle: 'S-15', ureaSolution: 'S-16', ureaMelt: 'S-17',
  prilledProduct: 'S-18'
});
export const FAULT_IDS = Object.freeze([
  'compressor-trip', 'low-loop-pressure', 'catalyst-deactivation',
  'recycle-failure', 'inert-buildup', 'high-reactor-water'
]);

// ---------------------------------------------------------------------------
// Reference data — teaching values, not a specific plant. All KIND.REF.
// ---------------------------------------------------------------------------
const REF = Object.freeze({
  R: 8.314,                       // J/mol·K
  // Molar masses, kg/kmol
  mmNH3: 17.03, mmN2: 28.01, mmH2: 2.016, mmCO2: 44.01, mmUrea: 60.06,
  mmWater: 18.02, mmBiuret: 103.08,
  // Ammonia synthesis
  heatOfReaction: 92.4,           // kJ per mol of N2 reacted, exothermic
  refSpaceVelocity: 12000,        // 1/h, the rate the approach correlation is fitted at
  approachMax: 0.88,              // closest to equilibrium a real converter gets
  // Separator: some inert and hydrogen dissolves in the liquid ammonia
  dissolvedGasFraction: 0,
  // Purge recovery
  purgeH2Recovery: 0.90, purgeHeatingValue: 10.8,  // MJ per Nm3 of purge fuel gas
  // Urea synthesis
  ureaEqCoeff: 0.78, ureaNcCoeff: 1.05, ureaWaterPenalty: 0.35,
  ureaOptimumTemp: 188, ureaTempWidth: 38,
  ureaApproachTime: 28,           // min, the time constant of the approach to equilibrium
  biuretBase: 0.18,               // wt % at the reference melt concentration
  // Finishing
  prillDensity: 1330, prillLatentHeat: 224, prillDiameter: 1.8e-3,
  prillHtc: 150, prillTerminal: 7.0, meltTemp: 138,
  gravity: 9.81,
  // Product specification
  ureaSpecMin: 46.0,              // wt % nitrogen, the number on the bag
  biuretLimit: 1.0, moistureLimit: 0.5,
  // Energy
  compressorEfficiency: 0.78, refrigerationCOP: 2.6,
  steamCredit: 2.1,               // MJ per kg of steam raised
  // Nominal bores, used only to turn a flow into a tracer velocity
  bore: {
    'S-01': 0.35, 'S-02': 0.30, 'S-03': 0.40, 'S-04': 0.40, 'S-05': 0.40,
    'S-06': 0.40, 'S-07': 0.38, 'S-08': 0.15, 'S-09': 0.12, 'S-10': 0.18,
    'S-11': 0.18, 'S-12': 0.35, 'S-13': 0.25, 'S-14': 0.25, 'S-15': 0.22,
    'S-16': 0.25, 'S-17': 0.20, 'S-18': 0.45
  }
});

// ---------------------------------------------------------------------------
// Thermodynamics
// ---------------------------------------------------------------------------
/**
 * Equilibrium constant for ammonia synthesis, Kp in atm^-1.
 * Gillespie and Beattie, as quoted in the standard texts.
 */
export function ammoniaKp(tempC) {
  const T = tempC + 273.15;
  const log10Kp = -2.691122 * Math.log10(T) - 5.519265e-5 * T
    + 1.848863e-7 * T * T + 2001.6 / T + 2.6899;
  return Math.pow(10, log10Kp);
}
/** Vapour pressure of ammonia, bar. Antoine, valid roughly -80 to 60 C. */
export function ammoniaPsat(tempC) {
  const mmHg = Math.pow(10, 7.36050 - 926.132 / (tempC + 240.17));
  return mmHg * 1.01325 / 760;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const gaussian = (x, c, w) => Math.exp(-Math.pow((x - c) / w, 2));

/**
 * Equilibrium extent of the ammonia reaction, per mole of gas entering.
 * N2 + 3H2 <-> 2NH3, solved from Kp = p_NH3 / (p_N2^0.5 * p_H2^1.5).
 * Bracketed between no reaction and complete consumption of the limiting
 * reactant, so the sign change is guaranteed and bisection always finds it.
 */
export function equilibriumExtent(y, pressureBar, tempC) {
  const Kp = ammoniaKp(tempC);
  const Patm = pressureBar / 1.01325;
  const maxExtent = Math.min(y.N2, y.H2 / 3) * 0.999999;
  if (!(maxExtent > 0)) return { extent: 0, Kp, converged: true, iterations: 0, residual: 0 };

  const residual = xi => {
    const n = { N2: y.N2 - xi, H2: y.H2 - 3 * xi, NH3: y.NH3 + 2 * xi, inert: y.inert };
    const total = 1 - 2 * xi;
    if (total <= 0 || n.N2 <= 0 || n.H2 <= 0) return -1e6;
    const p = k => (n[k] / total) * Patm;
    return p('NH3') - Kp * Math.sqrt(p('N2')) * Math.pow(p('H2'), 1.5);
  };
  const s = bisect(residual, 0, maxExtent, { tol: 1e-10, maxIter: 200 });
  return { extent: s.x ?? 0, Kp, converged: s.converged, iterations: s.iterations, residual: s.residual };
}

// ---------------------------------------------------------------------------
// Input specification
// ---------------------------------------------------------------------------
/** Cross-field rule: a urea reactor needs ammonia in excess, never carbon dioxide. */
const ncAboveStoichiometric = () => v => v < 2
  ? `The reaction needs two moles of ammonia for every mole of carbon dioxide, so an N/C ratio of ${v} cannot convert the carbon dioxide fed. Below 2 the reactor is ammonia starved whatever else is done to it.`
  : null;

export const inputSpec = {
  syngasRate: {
    label: 'Makeup syngas rate', unit: U.molFlow, min: 200, max: 20000, step: 50, default: 4000,
    group: 'Synthesis gas', level: 'student',
    rules: [rules.required(), rules.positive('Syngas rate'), rules.range(200, 20000, U.molFlow, 'Outside the size range this teaching model was set up for.')]
  },
  h2n2Ratio: {
    label: 'H₂:N₂ ratio in makeup', unit: 'mol/mol', min: 1.5, max: 4.5, step: 0.05, default: 3.0,
    group: 'Synthesis gas', level: 'student',
    rules: [rules.required(), rules.positive('H₂:N₂ ratio'), rules.range(1.5, 4.5, 'mol/mol', 'The stoichiometric ratio is 3.0; outside this band one reactant is in such excess that the loop cannot be balanced.')]
  },
  inertsFraction: {
    label: 'Inerts in makeup gas', unit: U.pct, min: 0.05, max: 6, step: 0.05, default: 1.2,
    group: 'Synthesis gas', level: 'engineer',
    rules: [rules.required(), rules.positive('Inerts'), rules.range(0.05, 6, U.pct, 'Methane and argon carried through from the reforming section; outside this band the purge balance is not representative.')]
  },
  loopPressure: {
    label: 'Synthesis loop pressure', unit: U.pressBar, min: 80, max: 350, step: 5, default: 180,
    group: 'Ammonia loop', level: 'student',
    rules: [rules.required(), rules.positive('Pressure'), rules.range(80, 350, U.pressBar, 'Below 80 bar the equilibrium yield is too low to run a loop; above 350 bar the model leaves the band its correlations were fitted in.')]
  },
  converterTemp: {
    label: 'Converter bed temperature', unit: U.tempC, min: 330, max: 560, step: 5, default: 450,
    group: 'Ammonia loop', level: 'student',
    rules: [rules.required(), rules.range(330, 560, U.tempC, 'Below 330 °C the iron catalyst is not active; above 560 °C it sinters and is destroyed.')]
  },
  catalystActivity: {
    label: 'Catalyst activity', unit: U.pct, min: 10, max: 100, step: 1, default: 100,
    group: 'Ammonia loop', level: 'engineer',
    rules: [rules.required(), rules.positive('Catalyst activity'), rules.range(10, 100, U.pct, 'Relative to a fresh charge; below 10 % the converter is not worth operating.')]
  },
  purgeFraction: {
    label: 'Purge rate', unit: U.pct, min: 0.1, max: 20, step: 0.1, default: 2.5,
    group: 'Ammonia loop', level: 'engineer',
    rules: [rules.required(), rules.positive('Purge rate'), rules.range(0.1, 20, U.pct, 'As a percentage of the gas leaving the separator. Outside this band the inert balance is not representative.')]
  },
  separatorTemp: {
    label: 'Ammonia separator temperature', unit: U.tempC, min: -30, max: 40, step: 1, default: -5,
    group: 'Ammonia loop', level: 'engineer',
    rules: [rules.required(), rules.range(-30, 40, U.tempC, 'The Antoine correlation for ammonia is fitted over this band.')]
  },
  ncRatio: {
    label: 'N/C ratio, NH₃ to CO₂', unit: 'mol/mol', min: 2.0, max: 6.0, step: 0.1, default: 4.0,
    group: 'Urea synthesis', level: 'student',
    rules: [rules.required(), rules.positive('N/C ratio'), ncAboveStoichiometric(), rules.max(6.0, 'mol/mol', 'Above 6 the excess ammonia costs more to recover than the extra conversion is worth.')]
  },
  ureaReactorTemp: {
    label: 'Urea reactor temperature', unit: U.tempC, min: 150, max: 215, step: 1, default: 188,
    group: 'Urea synthesis', level: 'student',
    rules: [rules.required(), rules.range(150, 215, U.tempC, 'Below 150 °C the carbamate does not dehydrate; above 215 °C corrosion and biuret formation make the reactor unworkable.')]
  },
  ureaPressure: {
    label: 'Urea reactor pressure', unit: U.pressBar, min: 110, max: 230, step: 5, default: 150,
    group: 'Urea synthesis', level: 'engineer',
    rules: [rules.required(), rules.positive('Pressure'), rules.range(110, 230, U.pressBar, 'The reactor must sit above the carbamate decomposition pressure at its temperature, and below what the liner will take.')]
  },
  carbamateRecovery: {
    label: 'Carbamate recovery', unit: U.pct, min: 50, max: 99.5, step: 0.5, default: 96,
    group: 'Urea synthesis', level: 'engineer',
    rules: [rules.required(), rules.positive('Carbamate recovery'), rules.range(50, 99.5, U.pct, 'The fraction of unconverted carbamate returned to the reactor; 100 % is unreachable because the recycle carries water back with it.')]
  },
  ureaResidence: {
    label: 'Reactor residence time', unit: U.timeMin, min: 10, max: 120, step: 5, default: 45,
    group: 'Urea synthesis', level: 'engineer',
    rules: [rules.required(), rules.positive('Residence time'), rules.range(10, 120, U.timeMin, 'Outside the band the approach-to-equilibrium correlation was fitted over.')]
  },
  meltConcentration: {
    label: 'Melt concentration to prilling', unit: 'wt %', min: 97, max: 99.9, step: 0.1, default: 99.7,
    group: 'Finishing', level: 'student',
    rules: [rules.required(), rules.positive('Melt concentration'), rules.range(97, 99.9, 'wt %', 'Below 97 % the melt will not prill; above 99.9 % the evaporation duty and the biuret it causes are not worth the gain.')]
  },
  prillAirTemp: {
    label: 'Prilling air temperature', unit: U.tempC, min: 0, max: 45, step: 1, default: 25,
    group: 'Finishing', level: 'engineer',
    rules: [rules.required(), rules.range(0, 45, U.tempC, 'Ambient air drawn up the tower; outside this band the solidification correlation is not representative.')]
  },
  prillTowerHeight: {
    label: 'Prilling tower free-fall height', unit: U.length, min: 20, max: 100, step: 1, default: 55,
    group: 'Finishing', level: 'engineer',
    rules: [rules.required(), rules.positive('Tower height'), rules.range(20, 100, U.length, 'Outside the size range this teaching model was set up for.')]
  }
};

// ---------------------------------------------------------------------------
// Assumptions
// ---------------------------------------------------------------------------
export const assumptions = [
  { text: 'Steady-state operation throughout. Both recycle loops are closed by the shared solver rather than assumed.', kind: KIND.APPROX },
  { text: 'The synthesis gas is treated as hydrogen, nitrogen, ammonia and a single lumped inert. Methane and argon are not tracked separately.', kind: KIND.APPROX },
  { text: 'The converter is treated as one equilibrium stage with an approach factor, rather than as the three or four catalyst beds with interbed quench that a real converter has.', kind: KIND.APPROX },
  { text: 'Hydrogen, nitrogen and inerts dissolved in the liquid ammonia leaving the separator are neglected, so inerts leave the loop only with the purge.', kind: KIND.APPROX },
  { text: 'Gas-phase non-ideality is ignored. At 180 bar the fugacity coefficients are genuinely not one, so the equilibrium ammonia content here is optimistic by a few per cent.', kind: KIND.APPROX },
  { text: 'The urea reactor is treated as an equilibrium conversion with an approach that depends on residence time, rather than through the carbamate formation and dehydration steps separately.', kind: KIND.APPROX },
  { text: 'Biuret is formed in the evaporation section and is correlated against melt concentration and residence rather than modelled kinetically.', kind: KIND.APPROX },
  { text: 'The reforming section that makes the synthesis gas and the carbon dioxide is outside the model. Both arrive as feeds.', kind: KIND.APPROX },

  { text: 'The ammonia equilibrium constant uses the Gillespie and Beattie correlation, Kp in atm⁻¹.', kind: KIND.CORR, source: 'Gillespie & Beattie' },
  { text: 'Ammonia vapour pressure uses the Antoine equation, valid roughly −80 to 60 °C.', kind: KIND.CORR },
  { text: 'The approach to equilibrium in the converter is the product of catalyst activity, a space-velocity term and a temperature window, capped at 0.88.', kind: KIND.CORR },
  { text: 'Urea equilibrium conversion is correlated against the N/C ratio, the water to carbon dioxide ratio and temperature, peaking near 188 °C.', kind: KIND.CORR },
  { text: 'Prill solidification time uses a lumped heat balance on a falling droplet with a Ranz–Marshall style heat transfer coefficient of 150 W/m²·K.', kind: KIND.CORR },

  { text: 'The overall conversion of a recycle loop is X_pass / (1 − (1 − X_pass)·recovery). It is the same relation on both loops, and it is why per-pass conversion matters far less than recovery does.', kind: KIND.FIRST },
  { text: 'The inert balance closes on the purge: inerts entering with the makeup gas must leave with the purge, which is what sets the inert level the loop settles at.', kind: KIND.FIRST },
  { text: 'Ammonia separation is a saturation calculation: the gas leaving the separator carries ammonia at its vapour pressure for the separator temperature, and the rest condenses.', kind: KIND.FIRST },
  { text: 'Compressor shaft power is the isothermal work of compression divided by the efficiency.', kind: KIND.FIRST },

  { text: 'Catalyst: promoted iron, reference space velocity 12 000 h⁻¹, maximum approach to equilibrium 0.88.', kind: KIND.REF },
  { text: 'Heat of reaction 92.4 kJ per mole of nitrogen reacted, recovered as steam at a credit of 2.1 MJ per kg.', kind: KIND.REF },
  { text: 'Compressor efficiency 78 %; refrigeration coefficient of performance 2.6.', kind: KIND.REF },
  { text: 'Purge gas recovery returns 90 % of its hydrogen; the remainder is burned as fuel at 10.8 MJ/Nm³.', kind: KIND.REF },
  { text: 'Prills: 1.8 mm diameter, density 1330 kg/m³, latent heat of fusion 224 kJ/kg, melt at 138 °C, terminal velocity 7.0 m/s.', kind: KIND.REF },
  { text: 'Product specification: 46.0 wt % nitrogen minimum, biuret below 1.0 wt %, moisture below 0.5 wt %.', kind: KIND.REF },
  { text: 'Stream velocities come from the calculated flow and a nominal bore held as a reference value; they set the tracer speed only.', kind: KIND.REF }
];

// ---------------------------------------------------------------------------
// Equation documentation
// ---------------------------------------------------------------------------
export const equations = [
  {
    what: 'Ammonia synthesis equilibrium',
    equation: 'N₂ + 3H₂ ⇌ 2NH₃        Kp = p_NH₃ / ( p_N₂^0.5 · p_H₂^1.5 )',
    why: 'The reaction is exothermic and loses moles, so equilibrium favours low temperature and high pressure — while the rate wants the opposite. Every decision in the loop is that compromise.',
    inputs: ['Partial pressures', 'Temperature'],
    units: 'Kp in atm⁻¹',
    interpretation: 'Raising the converter temperature raises the rate and lowers the attainable yield at the same time. There is an optimum, and the model will find it if you sweep for it.'
  },
  {
    what: 'Approach to equilibrium',
    equation: 'X_pass = η · X_eq        η = activity · (SV_ref/SV)^0.25 · window(T)',
    why: 'A real converter never reaches equilibrium. How close it gets is what the catalyst charge is actually buying.',
    inputs: ['Catalyst activity', 'Space velocity', 'Bed temperature'],
    units: 'dimensionless',
    interpretation: 'Catalyst ageing shows here first: the equilibrium is unchanged, but the gap to it widens.'
  },
  {
    what: 'Recycle and overall conversion',
    equation: 'X_overall = X_pass / ( 1 − (1 − X_pass) · recovery )',
    why: 'It is the single most important relation in the plant, and it applies unchanged to both loops.',
    inputs: ['Per-pass conversion', 'Recovery of unconverted material'],
    units: 'dimensionless',
    interpretation: 'A 15 % per-pass conversion with 97 % recovery gives 85 % overall. Recovery matters far more than per-pass conversion does, which is why both loops are built around separation rather than around the reactor.'
  },
  {
    what: 'Inert balance on the purge',
    equation: 'F_makeup · y_inert,makeup = F_purge · y_inert,loop',
    why: 'Inerts enter with the makeup gas and leave only with the purge, so the purge rate alone sets the inert level the loop settles at.',
    inputs: ['Makeup rate and inert content', 'Purge rate'],
    units: 'kmol/h',
    interpretation: 'Halving the purge doubles the inert level in the loop, which lowers the reactant partial pressures and costs conversion. Purging less to save hydrogen is a trade, not a saving.'
  },
  {
    what: 'Ammonia separation',
    equation: 'y_NH₃,vapour = p_sat,NH₃(T_sep) / P_loop',
    why: 'Refrigerating the separator is what pulls ammonia out of the loop. How cold it needs to be depends on the loop pressure.',
    inputs: ['Separator temperature', 'Loop pressure'],
    units: 'mole fraction',
    interpretation: 'At 180 bar and −5 °C the gas still carries about 2 % ammonia back round the loop. Colder recovers more and costs refrigeration.'
  },
  {
    what: 'Urea synthesis',
    equation: '2NH₃ + CO₂ → NH₂COONH₄ → NH₂CONH₂ + H₂O',
    why: 'Two steps in one vessel: carbamate forms quickly and exothermically, then dehydrates slowly and endothermically. The second step is the one that limits the reactor.',
    inputs: ['N/C ratio', 'Water to carbon dioxide ratio', 'Temperature', 'Residence time'],
    units: 'fraction of carbon dioxide converted',
    interpretation: 'Water is the product of the second step and also its inhibitor, which is why the recycle carrying water back is the real constraint on the urea loop.'
  },
  {
    what: 'Prill solidification',
    equation: 't = ρ·λ_f·d / ( 6·h·(T_melt − T_air) )        H_required ≈ u_t · t',
    why: 'A prill must be solid before it lands, or it flattens and cakes. The tower height is set by that, not by anything chemical.',
    inputs: ['Prill diameter and density', 'Latent heat of fusion', 'Air temperature'],
    units: 'seconds and metres',
    interpretation: 'A hot day lengthens the solidification time and can turn an adequate tower into a short one, which is why prill quality is seasonal.'
  },
  {
    what: 'Product nitrogen content',
    equation: 'N wt % = 46.65 · (urea purity) − contributions from biuret and moisture',
    why: 'It is the number on the bag and what the product is sold on.',
    inputs: ['Urea purity', 'Biuret', 'Moisture'],
    units: 'wt %',
    interpretation: 'Pure urea is 46.65 % nitrogen, so a 46.0 % specification leaves very little room for biuret and water together.'
  }
];

// ---------------------------------------------------------------------------
// Fault model
// ---------------------------------------------------------------------------
function faultEffects(faults = []) {
  const f = new Set(faults);
  return {
    active: [...f],
    recycleCompTripped: f.has('compressor-trip'),
    pressureFactor: f.has('low-loop-pressure') ? 0.6 : 1,
    activityFactor: f.has('catalyst-deactivation') ? 0.35 : 1,
    carbamateFactor: f.has('recycle-failure') ? 0.72 : 1,
    purgeFactor: f.has('inert-buildup') ? 0.18 : 1,
    extraWater: f.has('high-reactor-water') ? 0.45 : 0
  };
}
function effectiveInputs(inputs, fx) {
  const notes = [];
  const clampTo = (v, key, what) => {
    const spec = inputSpec[key];
    if (v >= spec.min) return v;
    notes.push(`${what} fell to ${v.toFixed(1)} ${spec.unit} and has been held at the ${spec.min} ${spec.unit} limit of this model.`);
    return spec.min;
  };
  return {
    eff: {
      ...inputs,
      loopPressure: clampTo(inputs.loopPressure * fx.pressureFactor, 'loopPressure', 'Loop pressure'),
      catalystActivity: clampTo(inputs.catalystActivity * fx.activityFactor, 'catalystActivity', 'Catalyst activity'),
      carbamateRecovery: clampTo(inputs.carbamateRecovery * fx.carbamateFactor, 'carbamateRecovery', 'Carbamate recovery'),
      purgeFraction: clampTo(inputs.purgeFraction * fx.purgeFactor, 'purgeFraction', 'Purge rate')
    },
    notes
  };
}

// ---------------------------------------------------------------------------
// Ammonia loop
// ---------------------------------------------------------------------------
/**
 * One pass round the loop at a given recycle state. Returns the new recycle
 * state, so the caller can drive it to a fixed point.
 */
function ammoniaPass(x, recycle, fx) {
  const mu = x.syngasRate;                       // kmol/h of makeup
  const yInertMu = x.inertsFraction / 100;
  const active = 1 - yInertMu;
  const yN2Mu = active / (1 + x.h2n2Ratio);
  const yH2Mu = active - yN2Mu;

  // --- mix makeup with recycle --------------------------------------------
  const rec = Math.max(recycle.flow, 0);
  const feed = mu + rec;
  const mix = k => feed > 0 ? (mu * ({ H2: yH2Mu, N2: yN2Mu, NH3: 0, inert: yInertMu })[k]
    + rec * recycle.y[k]) / feed : 0;
  const yIn = { H2: mix('H2'), N2: mix('N2'), NH3: mix('NH3'), inert: mix('inert') };

  // --- converter -----------------------------------------------------------
  // Space velocity rises with throughput for a fixed catalyst volume, and the
  // approach to equilibrium falls as the gas spends less time on the catalyst.
  const spaceVelocity = REF.refSpaceVelocity * (feed / 4000);
  const svTerm = Math.pow(REF.refSpaceVelocity / Math.max(spaceVelocity, 1), 0.25);
  const tempWindow = gaussian(x.converterTemp, 455, 95);
  const approach = clamp((x.catalystActivity / 100) * svTerm * tempWindow, 0, REF.approachMax);

  const eq = equilibriumExtent(yIn, x.loopPressure, x.converterTemp);
  const extent = eq.extent * approach;           // per mole of converter feed
  const nOut = {
    H2: yIn.H2 - 3 * extent, N2: yIn.N2 - extent,
    NH3: yIn.NH3 + 2 * extent, inert: yIn.inert
  };
  const totalOut = 1 - 2 * extent;
  const outFlow = feed * totalOut;
  const yOut = Object.fromEntries(Object.entries(nOut).map(([k, v]) => [k, v / totalOut]));

  // --- separator: the gas leaves saturated in ammonia ----------------------
  const pSat = ammoniaPsat(x.separatorTemp);
  const yNH3Vap = clamp(pSat / x.loopPressure, 0, yOut.NH3);
  // Everything above saturation condenses out as liquid ammonia.
  const nOutFlow = { };
  for (const k of ['H2', 'N2', 'NH3', 'inert']) nOutFlow[k] = outFlow * yOut[k];
  // Solve the vapour flow that leaves the remaining NH3 exactly at saturation.
  const nonNH3 = nOutFlow.H2 + nOutFlow.N2 + nOutFlow.inert;
  const vapFlow = yNH3Vap < 1 ? nonNH3 / (1 - yNH3Vap) : outFlow;
  const nVap = {
    H2: nOutFlow.H2, N2: nOutFlow.N2, inert: nOutFlow.inert,
    NH3: vapFlow * yNH3Vap
  };
  const liquidNH3 = Math.max(nOutFlow.NH3 - nVap.NH3, 0);
  // A little hydrogen and inert leaves dissolved in the liquid ammonia.
  const dissolved = REF.dissolvedGasFraction * liquidNH3;

  // --- purge and recycle ---------------------------------------------------
  const purge = fx.recycleCompTripped ? vapFlow : vapFlow * (x.purgeFraction / 100);
  const recycleFlow = fx.recycleCompTripped ? 0 : Math.max(vapFlow - purge, 0);
  const yVap = Object.fromEntries(Object.entries(nVap).map(([k, v]) => [k, vapFlow > 0 ? v / vapFlow : 0]));

  return {
    mu, yH2Mu, yN2Mu, yInertMu, feed, yIn, spaceVelocity, approach, tempWindow, svTerm,
    eq, extent, outFlow, yOut, pSat, yNH3Vap, vapFlow, nVap, yVap,
    liquidNH3, dissolved, purge, recycleFlow,
    next: { flow: recycleFlow, y: yVap }
  };
}

// ---------------------------------------------------------------------------
// Urea section
// ---------------------------------------------------------------------------
function ureaSection(x, ammoniaToUrea, fx) {
  // Carbon dioxide is fed to hit the N/C ratio the operator asked for.
  const co2Feed = ammoniaToUrea / Math.max(x.ncRatio, 1e-9);      // kmol/h

  // Water returning with the carbamate recycle is what actually limits the loop.
  const recovery = clamp(x.carbamateRecovery / 100, 0, 0.995);
  const waterToCarbon = clamp(0.35 * recovery + fx.extraWater, 0, 2.2);

  const ncTerm = 1 - Math.exp(-REF.ureaNcCoeff * Math.max(x.ncRatio - 2, 0));
  const waterTerm = Math.max(1 - REF.ureaWaterPenalty * waterToCarbon, 0.05);
  const tempTerm = gaussian(x.ureaReactorTemp, REF.ureaOptimumTemp, REF.ureaTempWidth);
  const xEquilibrium = clamp(REF.ureaEqCoeff * ncTerm * waterTerm * tempTerm, 0, 0.95);

  // Approach to equilibrium rises with residence time towards one.
  const approach = 1 - Math.exp(-x.ureaResidence / REF.ureaApproachTime);
  const xPass = clamp(xEquilibrium * approach, 0, 0.95);

  // The recycle relation, identical in form to the ammonia loop.
  const xOverall = clamp(xPass / (1 - (1 - xPass) * recovery), 0, 0.999);

  const ureaMade = co2Feed * xOverall;                            // kmol/h
  const co2Lost = co2Feed * (1 - xOverall);
  const ammoniaConsumed = ureaMade * 2;
  const ammoniaLost = Math.max(ammoniaToUrea - ammoniaConsumed, 0) * (1 - recovery);
  const waterMade = ureaMade;                                     // one mole per mole of urea
  const carbamateRecycled = co2Feed * (1 - xPass) * recovery;

  // --- evaporation and finishing -------------------------------------------
  const ureaMass = ureaMade * REF.mmUrea;                         // kg/h
  const waterMass = waterMade * REF.mmWater;
  const solutionConcentration = ureaMass / Math.max(ureaMass + waterMass, 1e-9) * 100;
  const waterInMelt = ureaMass * (100 - x.meltConcentration) / Math.max(x.meltConcentration, 1e-9);
  const waterEvaporated = Math.max(waterMass - waterInMelt, 0);

  // Biuret forms where urea is hot and concentrated, which is the evaporator.
  const biuret = clamp(
    REF.biuretBase * Math.pow(Math.max(x.meltConcentration - 96, .1) / 3.7, 1.6)
    * Math.pow(Math.max(x.ureaResidence, 1) / 45, 0.35)
    * (1 + 0.045 * Math.max(x.ureaReactorTemp - REF.ureaOptimumTemp, 0)),
    0, 12
  );

  // --- prilling --------------------------------------------------------------
  const driving = REF.meltTemp - x.prillAirTemp;
  const solidifyTime = driving > 0
    ? (REF.prillDensity * REF.prillLatentHeat * 1000 * REF.prillDiameter)
      / (6 * REF.prillHtc * driving)
    : null;
  // The prill accelerates to terminal velocity quickly, so the height needed is
  // close to the terminal velocity times the time it takes to freeze.
  const accelTime = REF.prillTerminal / REF.gravity;
  const heightRequired = solidifyTime === null ? null
    : REF.prillTerminal * Math.max(solidifyTime - accelTime / 2, 0);
  const towerMargin = heightRequired === null ? null : x.prillTowerHeight - heightRequired;
  const prillsSolid = heightRequired !== null && x.prillTowerHeight >= heightRequired;

  // Moisture left in the prill: the melt water, plus anything the tower failed
  // to drive off because the prill landed before it had finished.
  const meltMoisture = 100 - x.meltConcentration;
  const moisture = clamp(prillsSolid ? meltMoisture * 0.55 : meltMoisture * 1.5, 0, 6);

  const productMass = ureaMass / (1 - (biuret + moisture) / 100);
  const ureaPurity = ureaMass / Math.max(productMass, 1e-9) * 100;
  // Pure urea carries 46.65 wt % nitrogen; biuret carries 40.8 %, water none.
  const nitrogen = ureaPurity * 0.4665 + biuret * 0.408;

  return {
    co2Feed, recovery, waterToCarbon, ncTerm, waterTerm, tempTerm,
    xEquilibrium, approach, xPass, xOverall,
    ureaMade, co2Lost, ammoniaConsumed, ammoniaLost, waterMade, carbamateRecycled,
    ureaMass, waterMass, solutionConcentration, waterInMelt, waterEvaporated,
    biuret, solidifyTime, heightRequired, towerMargin, prillsSolid,
    moisture, productMass, ureaPurity, nitrogen
  };
}

// ---------------------------------------------------------------------------
// Energy
// ---------------------------------------------------------------------------
function energy(x, a, u) {
  // Isothermal compression work, the honest lower bound on a real machine.
  const work = (kmolPerH, pIn, pOut) => {
    if (!(kmolPerH > 0) || !(pOut > pIn)) return 0;
    const molPerS = kmolPerH * 1000 / 3600;
    return molPerS * REF.R * 313.15 * Math.log(pOut / pIn) / REF.compressorEfficiency / 1000; // kW
  };
  const makeupComp = work(a.mu, 25, x.loopPressure);
  const recycleComp = work(a.recycleFlow, x.loopPressure * 0.95, x.loopPressure);
  const co2Comp = work(u.co2Feed, 1.5, x.ureaPressure);

  // Refrigeration to hold the separator, against the heat the condensing
  // ammonia gives up plus the sensible cooling of the loop gas.
  const condenseDuty = a.liquidNH3 * 1000 / 3600 * 23.35;         // kW, latent heat of NH3
  const refrigeration = condenseDuty / REF.refrigerationCOP;

  // Synthesis heat recovered as steam.
  const heatReleased = a.extent * a.feed * 1000 / 3600 * REF.heatOfReaction;   // kW
  const steamRaised = heatReleased * 3.6 / (REF.steamCredit * 1000) * 1000;    // kg/h

  // Evaporation duty and the prilling air fan.
  const evaporationDuty = u.waterEvaporated / 3600 * 2260;        // kW, latent heat of water
  const prillFan = u.productMass > 0 ? 0.0009 * u.productMass : 0;

  const purgeFuel = a.purge * (a.yVap.H2 + a.yVap.inert) * 22.414 * REF.purgeHeatingValue / 3.6; // kW
  const recoveredH2 = a.purge * a.yVap.H2 * REF.purgeH2Recovery;

  const totalShaft = makeupComp + recycleComp + co2Comp + refrigeration + prillFan;
  const specificEnergy = u.productMass > 0 ? totalShaft / (u.productMass / 1000) : null; // kWh per tonne

  return {
    makeupComp, recycleComp, co2Comp, refrigeration, condenseDuty,
    heatReleased, steamRaised, evaporationDuty, prillFan,
    purgeFuel, recoveredH2, totalShaft, specificEnergy
  };
}

// ---------------------------------------------------------------------------
// Result assembly
// ---------------------------------------------------------------------------
const field = (label, value, unit, digits = 2, kind = KIND.CALC) => ({ label, value, unit, digits, kind });

function buildResults(s, x, fx) {
  const { a, u, e } = s;
  const running = a.feed > 0 && a.liquidNH3 > 0;
  const only = v => (running && Number.isFinite(v) ? v : null);
  const pct = v => (running && Number.isFinite(v) ? v * 100 : null);

  const kpis = [
    { label: 'Urea production', value: only(u.productMass / 1000), unit: 't/h', digits: 2 },
    { label: 'Ammonia produced', value: only(a.liquidNH3 * REF.mmNH3 / 1000), unit: 't/h', digits: 2 },
    { label: 'Nitrogen in product', value: only(u.nitrogen), unit: 'wt %', digits: 2 },
    { label: 'Overall CO₂ conversion', value: pct(u.xOverall), unit: U.pct, digits: 1 },
    { label: 'Per-pass N₂ conversion', value: pct(a.extent / Math.max(a.yIn.N2, 1e-9)), unit: U.pct, digits: 1 },
    { label: 'Specific energy', value: only(e.specificEnergy), unit: 'kWh/t', digits: 0 }
  ];

  const results = {
    makeupFlow: field('Makeup gas to the loop', only(a.mu), U.molFlow, 0, KIND.USER),
    loopFlow: field('Gas to the converter', only(a.feed), U.molFlow, 0),
    recycleRatio: field('Recycle to makeup ratio', only(a.recycleFlow / Math.max(a.mu, 1e-9)), U.dimensionless, 2),
    inertLoop: field('Inerts in the loop gas', pct(a.yIn.inert), U.pct, 2, KIND.FIRST),
    spaceVelocity: field('Space velocity', only(a.spaceVelocity), '1/h', 0),
    equilibriumK: field('Equilibrium constant Kp', only(a.eq.Kp), '1/atm', 5, KIND.CORR),
    equilibriumNH3: field('Equilibrium ammonia at converter outlet', pct(a.eq.extent * 2 / (1 - 2 * a.eq.extent)), U.pct, 2, KIND.FIRST),
    approach: field('Approach to equilibrium', pct(a.approach), U.pct, 1, KIND.CORR),
    converterNH3: field('Ammonia at converter outlet', pct(a.yOut.NH3), U.pct, 2, KIND.FIRST),
    perPassN2: field('Per-pass nitrogen conversion', pct(a.extent / Math.max(a.yIn.N2, 1e-9)), U.pct, 1, KIND.FIRST),
    separatorPsat: field('Ammonia vapour pressure at the separator', only(a.pSat), U.pressBar, 3, KIND.CORR),
    recycleNH3: field('Ammonia left in the recycle gas', pct(a.yNH3Vap), U.pct, 2, KIND.FIRST),
    liquidAmmonia: field('Liquid ammonia produced', only(a.liquidNH3), U.molFlow, 1),
    ammoniaMass: field('Ammonia produced', only(a.liquidNH3 * REF.mmNH3 / 1000), 't/h', 3),
    purgeFlow: field('Purge gas', only(a.purge), U.molFlow, 1),
    purgeH2: field('Hydrogen lost in the purge', only(a.purge * a.yVap.H2), U.molFlow, 1),
    recoveredH2: field('Hydrogen recovered from the purge', only(e.recoveredH2), U.molFlow, 1, KIND.REF),

    co2Feed: field('Carbon dioxide to the urea reactor', only(u.co2Feed), U.molFlow, 1),
    waterToCarbon: field('Water to carbon dioxide ratio in the reactor', only(u.waterToCarbon), 'mol/mol', 3, KIND.CORR),
    ureaEquilibrium: field('Equilibrium CO₂ conversion', pct(u.xEquilibrium), U.pct, 1, KIND.CORR),
    ureaApproach: field('Approach from residence time', pct(u.approach), U.pct, 1, KIND.CORR),
    ureaPerPass: field('Per-pass CO₂ conversion', pct(u.xPass), U.pct, 1, KIND.CORR),
    ureaOverall: field('Overall CO₂ conversion with recycle', pct(u.xOverall), U.pct, 1, KIND.FIRST),
    carbamateRecycled: field('Carbamate recycled to the reactor', only(u.carbamateRecycled), U.molFlow, 1),
    ureaRate: field('Urea produced', only(u.ureaMade), U.molFlow, 1),
    solutionConcentration: field('Urea solution from the reactor', only(u.solutionConcentration), 'wt %', 1),
    waterEvaporated: field('Water evaporated', only(u.waterEvaporated), 'kg/h', 0),

    solidifyTime: field('Prill solidification time', only(u.solidifyTime), U.time, 2, KIND.CORR),
    heightRequired: field('Free-fall height required', only(u.heightRequired), U.length, 1, KIND.CORR),
    towerMargin: field('Tower height margin', only(u.towerMargin), U.length, 1),
    biuret: field('Biuret in product', only(u.biuret), 'wt %', 3, KIND.CORR),
    moisture: field('Moisture in product', only(u.moisture), 'wt %', 3, KIND.CORR),
    ureaPurity: field('Urea purity', only(u.ureaPurity), 'wt %', 2),
    nitrogen: field('Nitrogen content', only(u.nitrogen), 'wt %', 2, KIND.FIRST),
    productRate: field('Prilled product', only(u.productMass / 1000), 't/h', 3),
    specificEnergy: field('Specific energy per tonne of product', only(e.specificEnergy), 'kWh/t', 0)
  };

  const massBalance = {
    syngasIn: field('Makeup syngas in', only(a.mu), U.molFlow, 0),
    n2In: field('Nitrogen in', only(a.mu * a.yN2Mu), U.molFlow, 1),
    h2In: field('Hydrogen in', only(a.mu * a.yH2Mu), U.molFlow, 1),
    inertIn: field('Inerts in', only(a.mu * a.yInertMu), U.molFlow, 2),
    inertOut: field('Inerts out with the purge', only(a.purge * a.yVap.inert), U.molFlow, 2),
    inertClosure: field('Inert balance closure error', only(s.inertClosure * 100), U.pct, 4),
    ammoniaOut: field('Ammonia to the urea plant', only(a.liquidNH3), U.molFlow, 1),
    co2In: field('Carbon dioxide in', only(u.co2Feed), U.molFlow, 1),
    ureaOut: field('Urea out', only(u.ureaMade), U.molFlow, 1),
    co2Vented: field('Carbon dioxide not converted', only(u.co2Lost), U.molFlow, 2),
    carbonClosure: field('Carbon balance closure error', only(s.carbonClosure * 100), U.pct, 4),
    nitrogenIn: field('Nitrogen atoms in as ammonia', only(a.liquidNH3), 'kmol N/h', 1),
    nitrogenOut: field('Nitrogen atoms out in product and losses', only(s.nitrogenOut), 'kmol N/h', 1),
    nitrogenClosure: field('Nitrogen balance closure error', only(s.nitrogenClosure * 100), U.pct, 4),
    productOut: field('Prilled product out', only(u.productMass), 'kg/h', 0)
  };

  const energyBalance = {
    makeupComp: field('Makeup compressor K-301', only(e.makeupComp), U.powerKW, 1, KIND.FIRST),
    recycleComp: field('Recycle compressor K-302', only(e.recycleComp), U.powerKW, 1, KIND.FIRST),
    co2Comp: field('Carbon dioxide compressor K-303', only(e.co2Comp), U.powerKW, 1, KIND.FIRST),
    refrigeration: field('Ammonia refrigeration', only(e.refrigeration), U.powerKW, 1, KIND.FIRST),
    prillFan: field('Prilling air fan', only(e.prillFan), U.powerKW, 1, KIND.APPROX),
    totalShaft: field('Total shaft and refrigeration power', only(e.totalShaft), U.powerKW, 1),
    heatReleased: field('Synthesis heat released', only(e.heatReleased), U.powerKW, 0, KIND.FIRST),
    steamRaised: field('Steam raised from synthesis heat', only(e.steamRaised), 'kg/h', 0, KIND.REF),
    evaporationDuty: field('Evaporation duty', only(e.evaporationDuty), U.powerKW, 1, KIND.FIRST),
    purgeFuel: field('Purge gas as fuel', only(e.purgeFuel), U.powerKW, 1, KIND.REF),
    specific: field('Specific energy per tonne of product', only(e.specificEnergy), 'kWh/t', 0)
  };

  const quality = {
    nitrogen: field('Nitrogen content', only(u.nitrogen), 'wt %', 2, KIND.FIRST),
    nitrogenSpec: field('Nitrogen specification', REF.ureaSpecMin, 'wt %', 1, KIND.REF),
    biuret: field('Biuret', only(u.biuret), 'wt %', 3, KIND.CORR),
    biuretLimit: field('Biuret limit', REF.biuretLimit, 'wt %', 1, KIND.REF),
    moisture: field('Moisture', only(u.moisture), 'wt %', 3, KIND.CORR),
    moistureLimit: field('Moisture limit', REF.moistureLimit, 'wt %', 1, KIND.REF),
    ureaPurity: field('Urea purity', only(u.ureaPurity), 'wt %', 2),
    prillsSolid: field('Free-fall height margin', only(u.towerMargin), U.length, 1)
  };

  const charts = running ? [
    {
      type: 'line', xLabel: 'Converter temperature, °C', yLabel: 'Ammonia at outlet, %',
      series: [{
        points: Array.from({ length: 21 }, (_, i) => {
          const T = 340 + i * 10;
          const eq = equilibriumExtent(a.yIn, x.loopPressure, T);
          return [T, eq.extent * 2 / (1 - 2 * eq.extent) * 100];
        })
      }, {
        points: Array.from({ length: 21 }, (_, i) => {
          const T = 340 + i * 10;
          const eq = equilibriumExtent(a.yIn, x.loopPressure, T);
          const ap = clamp((x.catalystActivity / 100) * a.svTerm * gaussian(T, 455, 95), 0, REF.approachMax);
          const xi = eq.extent * ap;
          return [T, xi * 2 / (1 - 2 * xi) * 100];
        }), color: 'var(--ok)'
      }]
    },
    {
      type: 'line', xLabel: 'Purge rate, %', yLabel: 'Inerts in loop, %',
      series: [{
        points: Array.from({ length: 20 }, (_, i) => {
          const pf = 0.4 + i * 0.6;
          return [pf, a.mu * a.yInertMu / Math.max(a.vapFlow * pf / 100, 1e-9) * 100];
        })
      }]
    },
    {
      type: 'bar', unit: U.pct,
      bars: [
        { label: 'Per pass', value: Math.max(u.xPass * 100, 0) },
        { label: 'Overall', value: Math.max(u.xOverall * 100, 0) },
        { label: 'Recovery', value: Math.max(u.recovery * 100, 0) }
      ]
    }
  ] : [];

  return { kpis, results, massBalance, energyBalance, quality, charts };
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------
function diagnose(s, x, fx, notes) {
  const { a, u, e } = s;
  const m = [];
  const push = (level, text) => m.push({ level, text });
  const n = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');
  const pc = (v, d = 1) => (Number.isFinite(v) ? (v * 100).toFixed(d) : '—');
  notes.forEach(t => push('warning', t));

  if (fx.recycleCompTripped) {
    push('error', `The recycle compressor ${TAGS.recycleComp} has tripped. Nothing returns to the converter, so the loop is running once-through on makeup gas alone and almost all the hydrogen and nitrogen fed is leaving unreacted.`);
  }

  // Loop composition
  if (a.yIn.inert > 0.18) {
    push('error', `Inerts have built up to ${pc(a.yIn.inert)} % of the loop gas. They carry no reaction but occupy partial pressure, so the hydrogen and nitrogen pressures driving the equilibrium have fallen with them. Raise the purge.`);
  } else if (a.yIn.inert > 0.12) {
    push('warning', `Inerts are at ${pc(a.yIn.inert)} % of the loop gas against a normal 8 to 12 %. Every point of inert is a point of partial pressure the reaction does not get.`);
  }
  const ratio = a.yIn.N2 > 0 ? a.yIn.H2 / a.yIn.N2 : 0;
  if (Math.abs(ratio - 3) > 0.45) {
    push('warning', `The hydrogen to nitrogen ratio in the loop has settled at ${n(ratio, 2)} against the stoichiometric 3.0. Whichever reactant is in excess accumulates, because only the stoichiometric proportion can react away.`);
  }

  // Converter
  if (a.approach < 0.45) {
    push('warning', `The converter is reaching only ${pc(a.approach)} % of equilibrium. Equilibrium itself is unchanged; what has widened is the gap to it, which points at the catalyst or at the space velocity rather than at the thermodynamics.`);
  }
  if (x.converterTemp > 520) {
    push('warning', `Bed temperature of ${n(x.converterTemp, 0)} °C is above the 520 °C at which the iron catalyst begins to sinter. The rate is high and the attainable yield is falling at the same time.`);
  } else if (x.converterTemp < 380) {
    push('warning', `Bed temperature of ${n(x.converterTemp, 0)} °C is near the bottom of the active range. Equilibrium is favourable here but the rate is not, so the converter cannot get close to it.`);
  }
  if (a.yOut.NH3 < 0.08) {
    push('warning', `Only ${pc(a.yOut.NH3)} % ammonia at the converter outlet against a normal 15 to 18 %. The separator has less driving force and the loop has to recycle more gas for the same production.`);
  }

  // Separator
  if (a.yNH3Vap > 0.04) {
    push('warning', `The recycle gas still carries ${pc(a.yNH3Vap)} % ammonia. At ${n(x.separatorTemp, 0)} °C and ${n(x.loopPressure, 0)} bar the vapour pressure of ammonia is ${n(a.pSat, 2)} bar, and that is what sets the floor. Colder recovers more, at the cost of refrigeration.`);
  }

  // Urea
  if (u.xOverall < 0.9) {
    push(u.xOverall < 0.75 ? 'error' : 'warning',
      `Overall carbon dioxide conversion is ${pc(u.xOverall)} %. Per pass it is ${pc(u.xPass)} %, so the shortfall is in the recovery rather than in the reactor: at ${pc(u.recovery)} % recovery the recycle relation cannot carry it higher.`);
  }
  if (u.waterToCarbon > 0.55) {
    push('warning', `The reactor is seeing a water to carbon dioxide ratio of ${n(u.waterToCarbon, 2)}. Water is the product of the dehydration step and also its inhibitor, so recycle carrying water back is what limits this loop.`);
  }
  if (x.ncRatio < 3.0) {
    push('warning', `An N/C ratio of ${n(x.ncRatio, 1)} leaves little ammonia excess to drive the carbamate forward. Conversion falls steeply below about 3.`);
  } else if (x.ncRatio > 5.0) {
    push('info', `An N/C ratio of ${n(x.ncRatio, 1)} buys very little extra conversion, and every mole of excess ammonia has to be stripped back out and recompressed.`);
  }

  // Product quality
  if (u.nitrogen < REF.ureaSpecMin) {
    push('error', `Product is ${n(u.nitrogen, 2)} wt % nitrogen against the ${REF.ureaSpecMin} wt % on the bag. Pure urea is only 46.65 %, so biuret at ${n(u.biuret, 2)} % and moisture at ${n(u.moisture, 2)} % together have used up the whole margin.`);
  }
  if (u.biuret > REF.biuretLimit) {
    push('error', `Biuret is ${n(u.biuret, 2)} wt % against a ${REF.biuretLimit} wt % limit. It forms where urea sits hot and concentrated, so look at the evaporator before the reactor.`);
  }
  if (u.moisture > REF.moistureLimit) {
    push('warning', `Product moisture is ${n(u.moisture, 2)} wt % against a ${REF.moistureLimit} wt % limit. Wet prills cake in the bag and lose their crushing strength.`);
  }
  if (u.towerMargin !== null && u.towerMargin < 0) {
    push('error', `The prills need ${n(u.heightRequired, 1)} m of free fall to freeze and the tower gives them ${n(x.prillTowerHeight, 1)} m. They are landing soft, which flattens them and is why the moisture figure has gone with it.`);
  } else if (u.towerMargin !== null && u.towerMargin < 6) {
    push('warning', `Only ${n(u.towerMargin, 1)} m of free-fall margin. On a warmer day the solidification time lengthens and this tower becomes a short one.`);
  }

  // Balances
  if (s.inertClosure > 1e-3) push('warning', `The inert balance closes to ${(s.inertClosure * 100).toFixed(3)} %.`);
  if (s.carbonClosure > 1e-3) push('warning', `The carbon balance closes to ${(s.carbonClosure * 100).toFixed(3)} %.`);
  if (s.nitrogenClosure > 1e-3) push('warning', `The nitrogen balance closes to ${(s.nitrogenClosure * 100).toFixed(3)} %.`);

  if (!m.some(i => i.level === 'error' || i.level === 'warning')) {
    push('info', `Both loops closed: ${n(a.liquidNH3 * REF.mmNH3 / 1000, 2)} t/h of ammonia at ${pc(a.yIn.inert)} % loop inerts, ${n(u.productMass / 1000, 2)} t/h of prilled urea at ${n(u.nitrogen, 2)} wt % nitrogen and ${n(u.biuret, 2)} wt % biuret.`);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Calculation trace
// ---------------------------------------------------------------------------
function buildSteps(s, x, fx) {
  const { a, u, e } = s;
  if (!(a.feed > 0)) return [];
  const f = (v, d = 2) => (Number.isFinite(v) ? Number(v).toFixed(d) : '—');
  const pc = (v, d = 1) => (Number.isFinite(v) ? (v * 100).toFixed(d) : '—');
  return [
    {
      title: '1. Makeup gas and the loop it joins',
      equation: 'y_N₂ = (1 − y_inert)/(1 + H₂:N₂)        F_converter = F_makeup + F_recycle',
      substitution: `${f(a.mu, 0)} kmol/h makeup at ${f(x.h2n2Ratio, 2)} H₂:N₂ and ${f(x.inertsFraction, 2)} % inerts, joined by ${f(a.recycleFlow, 0)} kmol/h of recycle`,
      result: `${f(a.feed, 0)} kmol/h to the converter, ${pc(a.yIn.inert)} % inert`,
      note: 'The recycle is many times the makeup, which is why the loop composition rather than the makeup composition is what the converter sees.'
    },
    {
      title: '2. Equilibrium at the bed conditions',
      equation: 'Kp = p_NH₃ / (p_N₂^0.5 · p_H₂^1.5)',
      substitution: `Kp = ${f(a.eq.Kp, 5)} atm⁻¹ at ${f(x.converterTemp, 0)} °C and ${f(x.loopPressure, 0)} bar`,
      result: `Equilibrium would give ${pc(a.eq.extent * 2 / (1 - 2 * a.eq.extent))} % ammonia at the outlet`,
      note: 'Exothermic and mole-reducing: raising the temperature lowers this number, raising the pressure lifts it.'
    },
    {
      title: '3. How close the converter gets',
      equation: 'η = activity · (SV_ref/SV)^0.25 · window(T)        X_pass = η · X_eq',
      substitution: `activity ${f(x.catalystActivity, 0)} %, space velocity ${f(a.spaceVelocity, 0)} 1/h, temperature window ${f(a.tempWindow, 3)}`,
      result: `Approach ${pc(a.approach)} %, giving ${pc(a.yOut.NH3)} % ammonia at the outlet`,
      note: 'Catalyst ageing shows up here rather than in the equilibrium: the target does not move, the gap to it widens.'
    },
    {
      title: '4. Separation and the inert balance',
      equation: 'y_NH₃,vapour = p_sat(T_sep)/P        F_makeup·y_inert = F_purge·y_inert,loop',
      substitution: `p_sat = ${f(a.pSat, 3)} bar at ${f(x.separatorTemp, 0)} °C, so the gas leaves at ${pc(a.yNH3Vap)} % ammonia`,
      result: `${f(a.liquidNH3, 1)} kmol/h of liquid ammonia, ${f(a.purge, 1)} kmol/h purged at ${pc(a.yVap.inert)} % inert`,
      note: 'Purging less would save hydrogen and raise the inert level, which costs partial pressure and therefore conversion. It is a trade, not a saving.'
    },
    {
      title: '5. Urea reactor',
      equation: 'X_eq = 0.78 · (1 − e^(−1.05(N/C − 2))) · (1 − 0.35·H₂O/C) · window(T)',
      substitution: `N/C ${f(x.ncRatio, 2)}, H₂O/C ${f(u.waterToCarbon, 3)}, ${f(x.ureaReactorTemp, 0)} °C → X_eq ${pc(u.xEquilibrium)} %`,
      result: `Per-pass conversion ${pc(u.xPass)} % after a ${pc(u.approach)} % approach from ${f(x.ureaResidence, 0)} min residence`,
      note: 'Water is both the product of the dehydration step and its inhibitor, which is what makes the recycle the limiting part of this loop.'
    },
    {
      title: '6. The recycle relation, twice',
      equation: 'X_overall = X_pass / ( 1 − (1 − X_pass)·recovery )',
      substitution: `${pc(u.xPass)} % per pass at ${pc(u.recovery)} % carbamate recovery`,
      result: `${pc(u.xOverall)} % overall carbon dioxide conversion, ${f(u.ureaMade, 1)} kmol/h of urea`,
      note: 'The same relation governs the ammonia loop. In both cases recovery matters far more than what the reactor manages on one pass.'
    },
    {
      title: '7. Evaporation, biuret and prilling',
      equation: 't = ρ·λ_f·d / (6·h·ΔT)        H_required ≈ u_t · t',
      substitution: `melt at ${f(x.meltConcentration, 1)} wt %, ΔT = ${f(REF.meltTemp - x.prillAirTemp, 0)} K → ${f(u.solidifyTime, 2)} s to freeze`,
      result: `${f(u.heightRequired, 1)} m of free fall needed against ${f(x.prillTowerHeight, 0)} m available`,
      note: `Biuret ${f(u.biuret, 3)} wt %, moisture ${f(u.moisture, 3)} wt %.`
    },
    {
      title: '8. Product and energy',
      equation: 'N wt % = purity · 0.4665 + biuret · 0.408        SEC = shaft power / production',
      substitution: `${f(u.ureaPurity, 2)} wt % urea, ${f(u.biuret, 3)} wt % biuret, ${f(u.moisture, 3)} wt % water`,
      result: `${f(u.productMass / 1000, 2)} t/h at ${f(u.nitrogen, 2)} wt % nitrogen, ${f(e.specificEnergy, 0)} kWh per tonne`,
      note: `Balances close to ${(s.inertClosure * 100).toFixed(4)} % on inerts, ${(s.carbonClosure * 100).toFixed(4)} % on carbon and ${(s.nitrogenClosure * 100).toFixed(4)} % on nitrogen.`
    }
  ];
}

// ---------------------------------------------------------------------------
// Equipment state and streams
// ---------------------------------------------------------------------------
const fmt = (v, d, unit) => (Number.isFinite(v) ? `${v.toFixed(d)} ${unit}` : '—');

function equipmentFrom(s, x, fx) {
  const { a, u, e } = s;
  const off = !(a.feed > 0 && a.liquidNH3 > 0);
  const run = (alarm = false) => ({ state: off ? 'stopped' : alarm ? 'warning' : 'running', alarm });
  const eq = {};

  eq[TAGS.makeupComp] = {
    ...run(false), load: off ? 0 : clamp(a.mu / inputSpec.syngasRate.max, 0, 1),
    values: { 'Makeup gas': fmt(a.mu, 0, U.molFlow), 'Discharge': fmt(x.loopPressure, 0, U.pressBar), Power: fmt(e.makeupComp, 0, U.powerKW) }
  };
  eq[TAGS.recycleComp] = {
    state: fx.recycleCompTripped ? 'tripped' : off ? 'stopped' : 'running', alarm: fx.recycleCompTripped,
    load: off ? 0 : clamp(a.recycleFlow / 60000, 0, 1),
    values: { Recycle: fmt(a.recycleFlow, 0, U.molFlow), 'Recycle ratio': fmt(a.recycleFlow / Math.max(a.mu, 1e-9), 2, U.dimensionless), Power: fmt(e.recycleComp, 0, U.powerKW) }
  };
  eq[TAGS.converter] = {
    ...run(a.approach < 0.45 || x.converterTemp > 520),
    load: off ? 0 : clamp(a.approach, 0, 1), duty: off ? 0 : clamp(e.heatReleased / 40000, 0, 1),
    values: {
      Temperature: fmt(x.converterTemp, 0, U.tempC), Pressure: fmt(x.loopPressure, 0, U.pressBar),
      'Outlet NH₃': fmt(a.yOut.NH3 * 100, 2, U.pct), Approach: fmt(a.approach * 100, 1, U.pct),
      Activity: fmt(x.catalystActivity, 0, U.pct)
    }
  };
  eq[TAGS.wasteHeatBoiler] = {
    ...run(false), duty: off ? 0 : clamp(e.heatReleased / 40000, 0, 1),
    values: { 'Heat recovered': fmt(e.heatReleased, 0, U.powerKW), 'Steam raised': fmt(e.steamRaised, 0, 'kg/h') }
  };
  eq[TAGS.chiller] = {
    ...run(false), duty: off ? 0 : clamp(e.refrigeration / 8000, 0, 1),
    values: { Temperature: fmt(x.separatorTemp, 0, U.tempC), Duty: fmt(e.condenseDuty, 0, U.powerKW), 'Refrigeration power': fmt(e.refrigeration, 0, U.powerKW) }
  };
  eq[TAGS.separator] = {
    ...run(a.yNH3Vap > 0.04), level: off ? 0 : 0.6,
    values: { 'NH₃ vapour pressure': fmt(a.pSat, 3, U.pressBar), 'NH₃ in recycle': fmt(a.yNH3Vap * 100, 2, U.pct), 'Liquid ammonia': fmt(a.liquidNH3, 1, U.molFlow) }
  };
  eq[TAGS.purgeRecovery] = {
    ...run(a.yIn.inert > 0.12),
    values: { Purge: fmt(a.purge, 1, U.molFlow), 'Loop inerts': fmt(a.yIn.inert * 100, 2, U.pct), 'H₂ recovered': fmt(e.recoveredH2, 1, U.molFlow) }
  };
  eq[TAGS.ammoniaStorage] = {
    ...run(false), level: off ? 0 : 0.55,
    values: { 'Ammonia in': fmt(a.liquidNH3 * REF.mmNH3 / 1000, 2, 't/h'), 'To urea': fmt(u.ammoniaConsumed * REF.mmNH3 / 1000, 2, 't/h') }
  };
  eq[TAGS.co2Comp] = {
    ...run(false), load: off ? 0 : clamp(u.co2Feed / 6000, 0, 1),
    values: { 'CO₂ feed': fmt(u.co2Feed, 1, U.molFlow), Discharge: fmt(x.ureaPressure, 0, U.pressBar), Power: fmt(e.co2Comp, 0, U.powerKW) }
  };
  eq[TAGS.ureaReactor] = {
    ...run(u.xOverall < 0.9 || u.waterToCarbon > 0.55),
    load: off ? 0 : clamp(u.xPass / 0.7, 0, 1), level: off ? 0 : 0.8,
    values: {
      Temperature: fmt(x.ureaReactorTemp, 0, U.tempC), Pressure: fmt(x.ureaPressure, 0, U.pressBar),
      'N/C ratio': fmt(x.ncRatio, 2, 'mol/mol'), 'Per-pass': fmt(u.xPass * 100, 1, U.pct),
      Overall: fmt(u.xOverall * 100, 1, U.pct)
    }
  };
  eq[TAGS.stripper] = {
    ...run(false), load: off ? 0 : clamp(u.carbamateRecycled / 3000, 0, 1),
    values: { 'Carbamate stripped': fmt(u.carbamateRecycled, 1, U.molFlow), Recovery: fmt(u.recovery * 100, 1, U.pct) }
  };
  eq[TAGS.carbamateCondenser] = {
    ...run(u.recovery < 0.9), duty: off ? 0 : 0.7,
    values: { 'Carbamate returned': fmt(u.carbamateRecycled, 1, U.molFlow), 'Water to reactor': fmt(u.waterToCarbon, 3, 'mol/mol') }
  };
  eq[TAGS.evaporator] = {
    ...run(u.biuret > REF.biuretLimit), duty: off ? 0 : clamp(e.evaporationDuty / 4000, 0, 1),
    values: { 'Melt concentration': fmt(x.meltConcentration, 1, 'wt %'), 'Water evaporated': fmt(u.waterEvaporated, 0, 'kg/h'), Biuret: fmt(u.biuret, 3, 'wt %') }
  };
  eq[TAGS.prillTower] = {
    ...run(u.towerMargin !== null && u.towerMargin < 6),
    load: off ? 0 : clamp(u.heightRequired / Math.max(x.prillTowerHeight, 1), 0, 1),
    values: {
      'Height available': fmt(x.prillTowerHeight, 0, U.length), 'Height required': fmt(u.heightRequired, 1, U.length),
      'Solidification': fmt(u.solidifyTime, 2, U.time), 'Air temperature': fmt(x.prillAirTemp, 0, U.tempC)
    }
  };
  eq[TAGS.productBin] = {
    ...run(u.nitrogen < REF.ureaSpecMin || u.biuret > REF.biuretLimit), level: off ? 0 : 0.5,
    values: { Production: fmt(u.productMass / 1000, 2, 't/h'), Nitrogen: fmt(u.nitrogen, 2, 'wt %'), Biuret: fmt(u.biuret, 3, 'wt %'), Moisture: fmt(u.moisture, 3, 'wt %') }
  };
  eq[TAGS.mcc] = {
    ...run(false), load: off ? 0 : clamp(e.totalShaft / 40000, 0, 1),
    values: { 'Total power': fmt(e.totalShaft, 0, U.powerKW), 'Specific energy': fmt(e.specificEnergy, 0, 'kWh/t') }
  };
  return eq;
}

function streamsFrom(s, x) {
  const { a, u, e } = s;
  const velocity = (id, kmolPerH, pressureBar = 1) => {
    const d = REF.bore[id];
    if (!d || !(kmolPerH > 0)) return 0;
    // Actual volumetric flow at the line pressure, from the ideal gas law.
    const m3s = kmolPerH * 1000 / 3600 * REF.R * 400 / (pressureBar * 1e5);
    return m3s / (Math.PI * d * d / 4);
  };
  const liquidVel = (id, kgPerH, density = 900) => {
    const d = REF.bore[id];
    if (!d || !(kgPerH > 0)) return 0;
    return (kgPerH / density / 3600) / (Math.PI * d * d / 4);
  };
  const mk = (id, flow, phase, label, vel) => ({
    id, flow: Number.isFinite(flow) && flow > 0 ? flow : 0, phase,
    label: Number.isFinite(flow) && flow > 0 ? label : '—',
    velocity: Number.isFinite(vel) ? vel : 0
  });
  const t = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(v < 1 && v > 0 ? 3 : d) : '—');
  const P = x.loopPressure;

  return [
    mk(STREAMS.makeupSyngas, a.mu, 'gas', `${t(a.mu, 0)} kmol/h · ${t(x.h2n2Ratio, 2)} H₂:N₂`, velocity(STREAMS.makeupSyngas, a.mu, 25)),
    mk(STREAMS.compressedSyngas, a.mu, 'gas', `${t(a.mu, 0)} kmol/h · ${t(P, 0)} bar`, velocity(STREAMS.compressedSyngas, a.mu, P)),
    mk(STREAMS.converterFeed, a.feed, 'gas', `${t(a.feed, 0)} kmol/h · ${t(a.yIn.inert * 100)} % inert`, velocity(STREAMS.converterFeed, a.feed, P)),
    mk(STREAMS.converterEffluent, a.outFlow, 'gas', `${t(a.yOut.NH3 * 100)} % NH₃ · ${t(x.converterTemp, 0)} °C`, velocity(STREAMS.converterEffluent, a.outFlow, P)),
    mk(STREAMS.cooledEffluent, a.outFlow, 'gas', `${t(a.outFlow, 0)} kmol/h cooled`, velocity(STREAMS.cooledEffluent, a.outFlow, P)),
    mk(STREAMS.chilledEffluent, a.outFlow, 'gas', `${t(x.separatorTemp, 0)} °C to the separator`, velocity(STREAMS.chilledEffluent, a.outFlow, P)),
    mk(STREAMS.recycleGas, a.recycleFlow, 'gas', `${t(a.recycleFlow, 0)} kmol/h recycled`, velocity(STREAMS.recycleGas, a.recycleFlow, P)),
    mk(STREAMS.purgeGas, a.purge, 'gas', `${t(a.purge, 1)} kmol/h · ${t(a.yVap.inert * 100)} % inert`, velocity(STREAMS.purgeGas, a.purge, P)),
    mk(STREAMS.recoveredHydrogen, e.recoveredH2, 'gas', `${t(e.recoveredH2, 1)} kmol/h H₂ recovered`, velocity(STREAMS.recoveredHydrogen, e.recoveredH2, 25)),
    mk(STREAMS.liquidAmmonia, a.liquidNH3, 'liquid', `${t(a.liquidNH3 * REF.mmNH3 / 1000, 2)} t/h NH₃`, liquidVel(STREAMS.liquidAmmonia, a.liquidNH3 * REF.mmNH3, 610)),
    mk(STREAMS.ammoniaToUrea, u.ammoniaConsumed, 'liquid', `${t(u.ammoniaConsumed, 1)} kmol/h to urea`, liquidVel(STREAMS.ammoniaToUrea, u.ammoniaConsumed * REF.mmNH3, 610)),
    mk(STREAMS.co2Feed, u.co2Feed, 'gas', `${t(u.co2Feed, 1)} kmol/h CO₂`, velocity(STREAMS.co2Feed, u.co2Feed, 1.5)),
    mk(STREAMS.compressedCo2, u.co2Feed, 'gas', `${t(u.co2Feed, 1)} kmol/h · ${t(x.ureaPressure, 0)} bar`, velocity(STREAMS.compressedCo2, u.co2Feed, x.ureaPressure)),
    mk(STREAMS.reactorEffluent, u.ureaMade, 'liquid', `${t(u.solutionConcentration)} wt % urea solution`, liquidVel(STREAMS.reactorEffluent, u.ureaMass + u.waterMass, 1200)),
    mk(STREAMS.carbamateRecycle, u.carbamateRecycled, 'slurry', `${t(u.carbamateRecycled, 1)} kmol/h carbamate`, liquidVel(STREAMS.carbamateRecycle, u.carbamateRecycled * 78, 1100)),
    mk(STREAMS.ureaSolution, u.ureaMade, 'liquid', `${t(u.ureaMass, 0)} kg/h urea`, liquidVel(STREAMS.ureaSolution, u.ureaMass + u.waterMass, 1200)),
    mk(STREAMS.ureaMelt, u.ureaMass, 'liquid', `${t(x.meltConcentration, 1)} wt % melt`, liquidVel(STREAMS.ureaMelt, u.ureaMass, 1250)),
    mk(STREAMS.prilledProduct, u.productMass, 'solid', `${t(u.productMass / 1000, 2)} t/h · ${t(u.nitrogen, 2)} % N`, liquidVel(STREAMS.prilledProduct, u.productMass, 750))
  ];
}

// ---------------------------------------------------------------------------
// Contract implementation
// ---------------------------------------------------------------------------
function validate(inputs) {
  return validateSpec(inputSpec, inputs);
}

function assemble(x, fx, loop) {
  const a = ammoniaPass(x, loop, fx);
  const ammoniaToUrea = a.liquidNH3 * (1 - REF.dissolvedGasFraction);
  const u = ureaSection(x, ammoniaToUrea, fx);
  const e = energy(x, a, u);

  // --- balance closures ------------------------------------------------------
  const inertIn = a.mu * a.yInertMu;
  const inertOut = a.purge * a.yVap.inert;
  const inertClosure = inertIn > 0 ? Math.abs(inertIn - inertOut) / inertIn : 0;

  const carbonIn = u.co2Feed;
  const carbonOut = u.ureaMade + u.co2Lost;
  const carbonClosure = carbonIn > 0 ? Math.abs(carbonIn - carbonOut) / carbonIn : 0;

  // Nitrogen atoms: two per mole of urea, one per mole of unreacted ammonia.
  const nitrogenIn = ammoniaToUrea;
  const nitrogenOut = u.ureaMade * 2 + (ammoniaToUrea - u.ammoniaConsumed);
  const nitrogenClosure = nitrogenIn > 0 ? Math.abs(nitrogenIn - nitrogenOut) / nitrogenIn : 0;

  return {
    a, u, e, ammoniaToUrea,
    inertIn, inertOut, inertClosure,
    carbonIn, carbonOut, carbonClosure,
    nitrogenIn, nitrogenOut, nitrogenClosure
  };
}

function getInitialState(inputs = {}) {
  const blank = { ...inputs, syngasRate: 0 };
  const fx = faultEffects([]);
  const s = assemble(blank, fx, { flow: 0, y: { H2: 0, N2: 0, NH3: 0, inert: 0 } });
  const built = buildResults(s, blank, fx);
  const nulls = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) =>
    [k, { ...v, value: v.kind === KIND.REF ? v.value : null }]));
  return {
    status: Status.READY, converged: false, iterations: null, residual: null,
    reason: 'Not calculated — set the operating conditions and run the simulation.',
    kpis: built.kpis.map(k => ({ ...k, value: null })),
    results: nulls(built.results), massBalance: nulls(built.massBalance),
    energyBalance: nulls(built.energyBalance), quality: nulls(built.quality),
    charts: [], messages: [], diagnostics: [], streams: [], equipment: {}, steps: []
  };
}

function run(inputs, { scenario = 'base', faults = [] } = {}) {
  const fx = faultEffects(faults);
  const { eff, notes } = effectiveInputs(inputs, fx);

  // The synthesis loop is a genuine recycle: the composition entering the
  // converter depends on what comes back from the separator, which depends on
  // what the converter did to it. Closed with the shared fixed-point solver on
  // the recycle flow and its composition.
  const start = { flow: eff.syngasRate * 4, H2: 0.6, N2: 0.2, NH3: 0.03, inert: 0.08 };
  const solve = fixedPoint(
    start,
    v => {
      const p = ammoniaPass(eff, { flow: v.flow, y: { H2: v.H2, N2: v.N2, NH3: v.NH3, inert: v.inert } }, fx);
      return { flow: p.next.flow, H2: p.next.y.H2, N2: p.next.y.N2, NH3: p.next.y.NH3, inert: p.next.y.inert };
    },
    { tol: 1e-9, maxIter: 12000, relax: 1 }
  );

  const loop = { flow: solve.x.flow, y: { H2: solve.x.H2, N2: solve.x.N2, NH3: solve.x.NH3, inert: solve.x.inert } };
  const s = assemble(eff, fx, loop);

  if (!solve.converged) {
    return {
      ...getInitialState(inputs), status: Status.ERROR, converged: false,
      iterations: solve.iterations, residual: solve.residual,
      reason: 'Synthesis loop recycle did not converge',
      messages: [],
      diagnostics: [...notes.map(text => ({ level: 'warning', text })), {
        level: 'error',
        text: `The synthesis loop recycle did not converge: the residual stalled at ${solve.residual.toExponential(2)} after ${solve.iterations} iterations. No results are reported, because a loop that has not closed is not a loop.`
      }]
    };
  }

  // A converged loop can still describe a plant that cannot be operated.
  const infeasible = [];
  if (!(s.a.liquidNH3 > 0)) {
    infeasible.push(`The loop produces no liquid ammonia at ${eff.loopPressure.toFixed(0)} bar and ${eff.converterTemp.toFixed(0)} °C. Either the converter is making less ammonia than the separator can condense at ${eff.separatorTemp.toFixed(0)} °C, or the reaction is not running at all, so there is no plant state to report.`);
  } else if (!(s.a.yIn.H2 > 0) || !(s.a.yIn.N2 > 0)) {
    infeasible.push(`One of the reactants has been consumed out of the loop entirely at an H₂:N₂ ratio of ${eff.h2n2Ratio.toFixed(2)}. Only the stoichiometric proportion can react, so whatever is in excess accumulates until the loop is all of one gas and there is no operable state.`);
  }
  if (infeasible.length) {
    return {
      ...getInitialState(inputs), status: Status.ERROR,
      converged: solve.converged, iterations: solve.iterations, residual: solve.residual,
      reason: 'No physically operable state at these conditions',
      messages: [],
      diagnostics: [...notes.map(text => ({ level: 'warning', text })),
        ...infeasible.map(text => ({ level: 'error', text }))]
    };
  }

  const built = buildResults(s, eff, fx);
  const diagnostics = diagnose(s, eff, fx, notes);
  const hasIssue = diagnostics.some(d => d.level === 'warning' || d.level === 'error');

  return {
    status: hasIssue ? Status.WARNING : Status.COMPLETE,
    converged: solve.converged, iterations: solve.iterations, residual: solve.residual,
    reason: scenario, ...built,
    messages: [], diagnostics,
    streams: streamsFrom(s, eff), equipment: equipmentFrom(s, eff, fx),
    steps: buildSteps(s, eff, fx), state: s
  };
}

export default {
  id: 'fertilizer',
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
