/**
 * 01 — WATER TREATMENT PLANT — process model.
 *
 * Conventional surface-water treatment: coagulation, flocculation, sedimentation,
 * rapid sand filtration, free-chlorine disinfection, with a washwater recovery
 * recycle that is closed by the shared fixed-point solver.
 *
 * Rules that apply here (see CLAUDE.md):
 *  - every returned number is computed in this file, never in the UI;
 *  - anything not calculated stays null so the UI prints an em dash;
 *  - `converged` is only true when the solver actually met tolerance;
 *  - every correlation and reference value is declared in `assumptions` with its KIND.
 *
 * This is a teaching model. It reproduces the shape of the real process and the
 * trade-offs between the units; it is not a validated design tool.
 */
import { KIND, Status } from '../../simulation/contract.js';
import { rules, validate as validateSpec } from '../../shared/validation.js';
import { U } from '../../shared/units.js';
import { fixedPoint, trace } from '../../simulation/solver.js';

// ---------------------------------------------------------------------------
// Equipment and stream identity. These tags are the shared identity between the
// engine, plant.js (userData.tag) and flowsheet.js (node.tag / edge.id).
// ---------------------------------------------------------------------------
export const TAGS = Object.freeze({
  intakePump: 'P-101', coagDosing: 'CH-101', rapidMix: 'MX-101', floc: 'FL-101',
  clarifier: 'CL-101', sludge: 'SL-101', filters: 'F-101', washRecovery: 'WR-101',
  backwashTank: 'BW-101', backwashPump: 'P-102', blower: 'B-101',
  chlorineDosing: 'CH-102', contactTank: 'CT-101', clearwell: 'CW-101',
  highLiftPump: 'P-103', mcc: 'MCC-101'
});
export const STREAMS = Object.freeze({
  raw: 'S-01', coagulant: 'S-02', mixed: 'S-03', flocculated: 'S-04', settled: 'S-05',
  sludge: 'S-06', filtrate: 'S-07', backwashSupply: 'S-08', backwashWaste: 'S-09',
  recovered: 'S-10', chlorine: 'S-11', disinfected: 'S-12', product: 'S-13', airScour: 'S-14'
});
export const FAULT_IDS = Object.freeze([
  'coagulant-underdose', 'turbidity-spike', 'blocked-filter',
  'pump-failure', 'short-circuiting', 'chlorine-dosing-failure'
]);

// ---------------------------------------------------------------------------
// Reference data — teaching values, not a specific real plant. All KIND.REF.
// ---------------------------------------------------------------------------
const REF = Object.freeze({
  g: 9.81,
  // Alum, Al2(SO4)3·14H2O
  alumMW: 594.4, caco3MW: 100.09, alOH3MW: 78.00, co2MW: 44.01,
  minResidualAlkalinity: 10,      // mg/L as CaCO3 to hold pH in the coagulation band
  // Filter media (rapid sand, single medium)
  mediaDepth: 0.75, mediaSize: 6.0e-4, mediaPorosity: 0.45, mediaSphericity: 0.90,
  kozeny: 150,                    // Blake–Kozeny laminar coefficient
  terminalHeadloss: 2.4,          // m, backwash trigger
  specificHeadloss: 1.05,         // m per (kg solids/m2) deposited
  lambdaClean: 5.0,               // 1/m Iwasaki filter coefficient at the reference rate
  refFiltrationRate: 10,          // m/h, rate at which lambdaClean applies
  backwashRate: 37, backwashTime: 10,   // m/h for min
  airScourRate: 55, airScourTime: 3,    // m3/(m2·h) for min
  washwaterCapture: 0.90,         // fraction of backwash solids settled out in WR-101
  washwaterYield: 0.95,           // fraction of backwash water returned as supernatant
  // Sedimentation
  clarifierCells: 4,              // equivalent CSTR cells, well-baffled rectangular basin
  flocSettlingVelocity: 3.5,      // m/h for ideal-quality alum floc at 20 °C
  sludgeSolids: 10.0,             // kg/m3, ~1 % w/w clarifier underflow
  // Turbidity to suspended solids
  tssPerNtu: 1.3,                 // mg/L per NTU
  // Coagulation optimum
  doseCoeff: 6.0, doseExp: 0.5, doseFloor: 10,
  // Disinfection
  baffleFactor: 0.70,             // t10/T for a baffled contact tank
  ctGiardia3log: 112,             // mg·min/L at pH 7.0, 10 °C, 1 mg/L free chlorine
  ctVirus4log: 6.0,               // mg·min/L at pH 6–9, 10 °C
  giardiaTarget: 3.0, virusTarget: 4.0,
  ctTableMaxGiardia: 3.0, ctTableMaxVirus: 4.0,
  turbidityLimit: 0.30,           // NTU, filter-credit and compliance threshold
  minDistributionResidual: 0.20,  // mg/L free chlorine leaving the clearwell
  // Solution strengths for the chemical streams
  alumSolution: 0.48, alumSolutionDensity: 1330,
  hypoStrength: 0.12, hypoDensity: 1200,
  // Hydraulic machines
  intakeHead: 12, intakeEff: 0.75,
  backwashHead: 8, backwashEff: 0.75,
  highLiftHead: 45, highLiftEff: 0.78,
  blowerPressure: 35000, blowerEff: 0.60,
  // Nominal pipe bores used only to turn a flow into a tracer velocity
  bore: { 'S-01': 0.60, 'S-02': 0.05, 'S-03': 0.60, 'S-04': 0.70, 'S-05': 0.60,
    'S-06': 0.15, 'S-07': 0.60, 'S-08': 0.50, 'S-09': 0.50, 'S-10': 0.20,
    'S-11': 0.05, 'S-12': 0.55, 'S-13': 0.55, 'S-14': 0.25 }
});
// Derived alum stoichiometry, per mg/L of alum dosed.
const ALUM = Object.freeze({
  alkPerMg: (3 * REF.caco3MW) / REF.alumMW,   // mg/L CaCO3 consumed
  sludgePerMg: (2 * REF.alOH3MW) / REF.alumMW, // mg/L Al(OH)3 formed
  co2PerMg: (6 * REF.co2MW) / REF.alumMW       // mg/L CO2 released
});

// ---------------------------------------------------------------------------
// Water properties
// ---------------------------------------------------------------------------
/** Dynamic viscosity of water, Pa·s. Andrade form, valid roughly 0–100 °C. */
export function viscosity(tempC) {
  return 2.414e-5 * Math.pow(10, 247.8 / (tempC + 273.15 - 140));
}
/** Density of water, kg/m3. Standard polynomial, valid roughly 0–40 °C. */
export function density(tempC) {
  const t = tempC;
  return 1000 * (1 - ((t + 288.9414) / (508929.2 * (t + 68.12963))) * Math.pow(t - 3.9863, 2));
}
/** Alkalinity as mg/L CaCO₃ to mol/L of bicarbonate. The equivalent weight is MW/2. */
const alkalinityToMolar = alk => alk / (REF.caco3MW * 500);
/** First dissociation constant of carbonic acid, as pK1. Linear fit, 0–35 °C. */
const pK1 = tempC => 6.58 - 0.0090 * tempC;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const gaussian = (x, centre, width) => Math.exp(-Math.pow((x - centre) / width, 2));
/** Log-space bell with a flat plateau between lo and hi. */
function plateau(x, lo, hi, widthLo, widthHi) {
  if (x <= 0) return 0;
  if (x < lo) return Math.exp(-Math.pow(Math.log(x / lo) / widthLo, 2));
  if (x > hi) return Math.exp(-Math.pow(Math.log(x / hi) / widthHi, 2));
  return 1;
}

// ---------------------------------------------------------------------------
// Input specification
// ---------------------------------------------------------------------------
/** Cross-field rule: the alum demand must leave usable alkalinity behind. */
const alkalinityFeasible = () => (v, inputs) => {
  const alk = inputs?.alkalinity;
  if (!Number.isFinite(v) || !Number.isFinite(alk)) return null;
  const consumed = v * ALUM.alkPerMg;
  const left = alk - consumed;
  if (left >= REF.minResidualAlkalinity) return null;
  return `${v.toFixed(0)} mg/L of alum consumes ${consumed.toFixed(1)} mg/L of alkalinity as CaCO₃ and leaves `
    + `${left.toFixed(1)} mg/L, below the ${REF.minResidualAlkalinity} mg/L needed to hold the pH inside the `
    + `coagulation band. The carbonate buffer would be exhausted and the pH would collapse. `
    + `Reduce the dose or add alkalinity as lime or soda ash.`;
};

export const inputSpec = {
  feedFlow: {
    label: 'Raw water flow', unit: U.volFlow, min: 50, max: 5000, step: 10, default: 1000,
    group: 'Raw water', level: 'student',
    rules: [rules.required(), rules.positive('Flow'), rules.range(50, 5000, U.volFlow, 'Outside the size range this teaching model was set up for.')]
  },
  turbidityIn: {
    label: 'Raw water turbidity', unit: U.turbidity, min: 1, max: 500, step: 1, default: 25,
    group: 'Raw water', level: 'student',
    rules: [rules.required(), rules.positive('Turbidity'), rules.range(1, 500, U.turbidity, 'Above 500 NTU a conventional plant needs presedimentation, which this model does not include.')]
  },
  temperature: {
    label: 'Raw water temperature', unit: U.tempC, min: 0.5, max: 35, step: 0.5, default: 20,
    group: 'Raw water', level: 'student',
    rules: [rules.required(), rules.range(0.5, 35, U.tempC, 'The viscosity and disinfection correlations are fitted over this band only.')]
  },
  alkalinity: {
    label: 'Alkalinity as CaCO₃', unit: U.conc, min: 5, max: 400, step: 5, default: 120,
    group: 'Raw water', level: 'engineer',
    rules: [rules.required(), rules.nonNegative('Alkalinity'), rules.range(5, 400, U.conc, 'Outside this band the single-buffer carbonate model is not representative.')]
  },
  pHIn: {
    label: 'Raw water pH', unit: U.ph, min: 5.5, max: 9, step: 0.1, default: 7.6,
    group: 'Raw water', level: 'engineer',
    rules: [rules.required(), rules.range(5.5, 9.0, U.ph, 'The carbonate speciation used here assumes bicarbonate is the dominant species.')]
  },
  coagulantDose: {
    label: 'Alum dose', unit: U.conc, min: 0, max: 120, step: 1, default: 30,
    group: 'Coagulation', level: 'student',
    rules: [rules.required(), rules.nonNegative('Dose'), rules.max(120, U.conc, 'Beyond this the model leaves the sweep-floc regime it was fitted in.'), alkalinityFeasible()]
  },
  rapidMixG: {
    label: 'Rapid-mix velocity gradient G', unit: '1/s', min: 100, max: 1500, step: 10, default: 800,
    group: 'Coagulation', level: 'expert',
    rules: [rules.required(), rules.positive('Velocity gradient'), rules.range(100, 1500, '1/s', 'Outside the range over which the dispersion correlation was fitted.')]
  },
  rapidMixTime: {
    label: 'Rapid-mix detention time', unit: U.time, min: 5, max: 180, step: 1, default: 30,
    group: 'Coagulation', level: 'expert',
    rules: [rules.required(), rules.positive('Detention time'), rules.range(5, 180, U.time, 'Outside the range over which the dispersion correlation was fitted.')]
  },
  flocG: {
    label: 'Flocculation velocity gradient G', unit: '1/s', min: 5, max: 120, step: 1, default: 45,
    group: 'Flocculation', level: 'engineer',
    rules: [rules.required(), rules.positive('Velocity gradient'), rules.range(5, 120, '1/s', 'Below 5 the basin does not flocculate; above 120 the model cannot represent the shear regime.')]
  },
  flocTime: {
    label: 'Flocculation time', unit: U.timeMin, min: 5, max: 60, step: 1, default: 25,
    group: 'Flocculation', level: 'engineer',
    rules: [rules.required(), rules.positive('Flocculation time'), rules.range(5, 60, U.timeMin, 'Outside the range over which the floc-growth correlation was fitted.')]
  },
  basinVolume: {
    label: 'Sedimentation basin volume', unit: U.volume, min: 100, max: 20000, step: 50, default: 3000,
    group: 'Sedimentation', level: 'engineer',
    rules: [rules.required(), rules.positive('Basin volume'), rules.range(100, 20000, U.volume, 'Outside the size range this teaching model was set up for.')]
  },
  overflowRate: {
    label: 'Surface overflow rate', unit: 'm/h', min: 0.4, max: 4.0, step: 0.1, default: 1.5,
    group: 'Sedimentation', level: 'engineer',
    rules: [rules.required(), rules.positive('Overflow rate'), rules.range(0.4, 4.0, 'm/h', 'The removal correlation was fitted between 0.4 and 4.0 m/h; outside it the result would be an extrapolation, not a prediction.')]
  },
  filtrationRate: {
    label: 'Filtration rate', unit: 'm/h', min: 2, max: 25, step: 0.5, default: 10,
    group: 'Filtration', level: 'engineer',
    rules: [rules.required(), rules.positive('Filtration rate'), rules.range(2, 25, 'm/h', 'Outside the band over which the Iwasaki filter coefficient was fitted.')]
  },
  chlorineDose: {
    label: 'Free chlorine dose', unit: U.conc, min: 0, max: 10, step: 0.1, default: 2.0,
    group: 'Disinfection', level: 'student',
    rules: [rules.required(), rules.nonNegative('Chlorine dose'), rules.max(10, U.conc, 'Above 10 mg/L the disinfection by-product behaviour is outside this model.')]
  },
  contactTime: {
    label: 'Contact tank detention time', unit: U.timeMin, min: 1, max: 240, step: 1, default: 45,
    group: 'Disinfection', level: 'engineer',
    rules: [rules.required(), rules.positive('Contact time'), rules.range(1, 240, U.timeMin, 'Outside the range this model represents.')]
  }
};

// ---------------------------------------------------------------------------
// Assumptions — every entry carries its provenance.
// ---------------------------------------------------------------------------
export const assumptions = [
  { text: 'Steady-state operation. No basin holds inventory and nothing accumulates, so every balance closes instantaneously.', kind: KIND.APPROX },
  { text: 'Backwashing is represented as a time-averaged continuous flow rather than a periodic event, so one steady balance can cover a whole filter run.', kind: KIND.APPROX },
  { text: 'Suspended solids are taken as 1.3 mg/L per NTU throughout the plant. The real ratio depends on particle size and is site-specific.', kind: KIND.APPROX },
  { text: 'Floc quality is a single dimensionless index built from dose adequacy, pH, temperature and the Camp number, rather than a particle-size distribution.', kind: KIND.APPROX },
  { text: 'Natural organic matter is tracked only as a chlorine demand correlated with raw turbidity; there is no TOC or DBP model.', kind: KIND.APPROX },

  { text: 'Water viscosity uses the Andrade correlation µ = 2.414e-5 · 10^(247.8/(T−140)) with T in K, valid 0–100 °C.', kind: KIND.CORR },
  { text: 'Optimum alum dose is correlated against raw turbidity as 6.0 · NTU^0.5 with a 10 mg/L floor for sweep floc. A real plant sets this by jar test.', kind: KIND.CORR },
  { text: 'Sedimentation uses the Hazen tanks-in-series form R = 1 − (1 + vs/(n·vo))^(−n), with n equivalent completely-mixed cells.', kind: KIND.CORR },
  { text: 'Filtration uses the Iwasaki first-order depth model C/C₀ = exp(−λL), with λ scaled by floc quality and by filtration rate.', kind: KIND.CORR },
  { text: 'Clean-bed headloss uses the Blake–Kozeny laminar form with a coefficient of 150.', kind: KIND.CORR },
  { text: 'Headloss build-up is linear in the mass of solids deposited per unit filter area, at 1.05 m per kg/m².', kind: KIND.CORR },
  { text: 'Required CT is a regression on the USEPA Surface Water Treatment Rule tables: CT = 112 · (pH/7)^2.7 · 2^(−(T−10)/10) · C^0.15 for 3-log Giardia.', kind: KIND.CORR, source: 'fitted to USEPA SWTR CT tables' },
  { text: 'pK₁ for carbonic acid is taken as 6.58 − 0.0090·T(°C), a linear fit across 0–35 °C.', kind: KIND.CORR },

  { text: 'Velocity gradient is G = √(P/(µV)) and the power dissipated in a basin is P = G²µV, as defined by Camp and Stein.', kind: KIND.FIRST },
  { text: 'Alum stoichiometry is Al₂(SO₄)₃·14H₂O + 3Ca(HCO₃)₂ → 2Al(OH)₃ + 3CaSO₄ + 6CO₂ + 14H₂O, giving 0.505 mg/L alkalinity consumed, 0.263 mg/L Al(OH)₃ formed and 0.444 mg/L CO₂ released per mg/L of alum.', kind: KIND.FIRST },
  { text: 'Coagulation pH is solved from the bicarbonate buffer, pH = pK₁ + log₁₀([HCO₃⁻]/[H₂CO₃*]), with the CO₂ released by the alum reaction added to the carbonic acid.', kind: KIND.FIRST },
  { text: 'Pump shaft power is ρgQH/η and blower power is QΔp/η.', kind: KIND.FIRST },

  { text: 'Filter media: 0.60 mm effective size, 0.75 m deep, porosity 0.45, sphericity 0.90; terminal headloss 2.4 m.', kind: KIND.REF },
  { text: 'Backwash at 37 m/h for 10 minutes with 3 minutes of air scour at 55 m³/(m²·h).', kind: KIND.REF },
  { text: 'Spent backwash water goes to a recovery basin that settles out 90 % of the solids and returns 95 % of the water to the plant inlet.', kind: KIND.REF },
  { text: 'The sedimentation basin behaves as 4 equivalent completely-mixed cells and the chlorine contact tank has a baffling factor t₁₀/T of 0.70.', kind: KIND.REF },
  { text: 'Clarifier underflow leaves at 1 % w/w solids.', kind: KIND.REF },
  { text: 'Inactivation credit from CT is capped at 3-log Giardia and 4-log virus, the end of the published tables. Anything beyond that is an extrapolation and is not claimed.', kind: KIND.REF, source: 'USEPA Surface Water Treatment Rule' },
  { text: 'Conventional treatment earns 2.5-log Giardia and 2.0-log virus removal credit while filtered turbidity stays at or below 0.30 NTU; the credit is reduced above that.', kind: KIND.REF, source: 'USEPA Surface Water Treatment Rule' },
  { text: 'Pump duties: intake 12 m at 75 %, backwash 8 m at 75 %, high lift 45 m at 78 %. Air scour blower 35 kPa at 60 %.', kind: KIND.REF },
  { text: 'Coagulant is delivered as 48 % w/w liquid alum at 1330 kg/m³ and chlorine as 12 % sodium hypochlorite at 1200 kg/m³.', kind: KIND.REF },
  { text: 'Stream velocities are computed from the calculated flow and a nominal pipe bore held as a reference value; they drive the tracer speed only.', kind: KIND.REF }
];

// ---------------------------------------------------------------------------
// Equation documentation
// ---------------------------------------------------------------------------
export const equations = [
  {
    what: 'Velocity gradient (Camp–Stein)',
    equation: 'G = √( P / (µ · V) )      P = G² · µ · V',
    why: 'G sets how often particles collide. Too little and floc never forms; too much and it is torn apart again.',
    inputs: ['Mixing power P', 'Dynamic viscosity µ', 'Basin volume V'],
    units: 'G in 1/s, P in W, µ in Pa·s, V in m³',
    interpretation: 'Rapid mix runs at 600–1000 1/s to disperse the coagulant in seconds. Flocculation runs at 20–70 1/s so the floc can grow.'
  },
  {
    what: 'Camp number',
    equation: 'Gt = G · t',
    why: 'The dimensionless product of gradient and time is the collision opportunity the basin offers.',
    inputs: ['Velocity gradient G', 'Detention time t'],
    units: 'dimensionless',
    interpretation: 'Flocculation is designed for Gt between 2×10⁴ and 1.2×10⁵. The same Gt can be reached by gentle mixing for a long time or hard mixing briefly, but only the gentle route keeps the floc intact.'
  },
  {
    what: 'Detention time and surface overflow rate',
    equation: 'τ = V / Q        vo = Q / A        A = Q / vo',
    why: 'Detention time is how long the water stays; overflow rate is the upward velocity a particle must beat to be captured.',
    inputs: ['Basin volume V', 'Plant flow Q', 'Surface area A'],
    units: 'τ in h, vo in m/h, A in m²',
    interpretation: 'A particle settling slower than the overflow rate leaves with the clarified water no matter how deep the basin is.'
  },
  {
    what: 'Alum reaction with alkalinity',
    equation: 'Al₂(SO₄)₃·14H₂O + 3Ca(HCO₃)₂ → 2Al(OH)₃↓ + 3CaSO₄ + 6CO₂ + 14H₂O',
    why: 'Alum is an acid. It consumes alkalinity, releases CO₂, and depresses the pH into or out of the coagulation band.',
    inputs: ['Alum dose', 'Raw alkalinity'],
    units: 'mg/L as CaCO₃ consumed per mg/L of alum',
    interpretation: '1 mg/L of alum consumes 0.505 mg/L of alkalinity, forms 0.263 mg/L of aluminium hydroxide sludge and releases 0.444 mg/L of CO₂.'
  },
  {
    what: 'Coagulation pH from the carbonate buffer',
    equation: 'pH = pK₁ + log₁₀( [HCO₃⁻] / [H₂CO₃*] )',
    why: 'Aluminium hydroxide is least soluble between about pH 6.0 and 7.8. Outside that band the coagulant stays dissolved and does nothing.',
    inputs: ['Residual alkalinity', 'CO₂ released', 'Temperature'],
    units: 'pH units',
    interpretation: 'A soft, low-alkalinity water swings a long way for a small dose; a hard water barely moves.'
  },
  {
    what: 'Sedimentation removal (Hazen, tanks in series)',
    equation: 'R = 1 − ( 1 + vs / (n · vo) )^(−n)',
    why: 'A real basin is not plug flow. Short-circuiting and mixing mean some floc always escapes, so removal never reaches 100 %.',
    inputs: ['Floc settling velocity vs', 'Overflow rate vo', 'Equivalent cells n'],
    units: 'dimensionless fraction',
    interpretation: 'Doubling the overflow rate halves vs/vo and costs far more removal than the arithmetic suggests. Short-circuiting reduces n and does the same damage at an unchanged overflow rate.'
  },
  {
    what: 'Depth filtration (Iwasaki)',
    equation: 'C / C₀ = exp( −λ · L )        λ = λ₀ · FQ^0.8 · (v_ref / v)^0.5',
    why: 'Filtration is a first-order capture process down the bed, not a sieve. Well-conditioned floc is captured; unconditioned colloids pass straight through.',
    inputs: ['Settled turbidity', 'Filter coefficient λ', 'Bed depth L', 'Filtration rate v'],
    units: 'λ in 1/m, L in m',
    interpretation: 'A filter cannot repair bad coagulation. If the floc index falls, λ falls with it and the turbidity goes through the bed.'
  },
  {
    what: 'Clean-bed headloss (Blake–Kozeny)',
    equation: 'h/L = 150 · µ · (1−ε)² · v / ( ρ · g · ε³ · (φ·d)² )',
    why: 'Headloss sets how much of the available driving head the filter uses before it must be washed.',
    inputs: ['Viscosity µ', 'Porosity ε', 'Filtration rate v', 'Grain size d', 'Sphericity φ'],
    units: 'm of water per m of bed',
    interpretation: 'Headloss is proportional to viscosity, so a filter in winter starts dirtier than the same filter in summer.'
  },
  {
    what: 'Filter run length',
    equation: 't_run = ( h_terminal − h_clean ) / ( σ · C_captured · v )',
    why: 'The run ends when the headloss reaches the terminal value or the turbidity breaks through, whichever comes first.',
    inputs: ['Terminal headloss', 'Clean-bed headloss', 'Captured solids', 'Filtration rate'],
    units: 'h',
    interpretation: 'Every kilogram the clarifier fails to remove is a kilogram the filter must hold, and it shortens the run in direct proportion.'
  },
  {
    what: 'Disinfection CT',
    equation: 'CT = C · t₁₀        t₁₀ = τ · (t₁₀/T)        CT_req = 112 · (pH/7)^2.7 · 2^(−(T−10)/10) · C^0.15',
    why: 'Inactivation depends on the product of residual concentration and the contact time actually achieved by the first 10 % of the water, not the nominal detention time.',
    inputs: ['Free chlorine residual C', 'Detention time τ', 'Baffling factor', 'pH', 'Temperature'],
    units: 'mg·min/L',
    interpretation: 'Cold water and high pH both raise the CT needed. A poorly baffled tank can lose two-thirds of its nominal contact time.'
  },
  {
    what: 'Solids and water balance',
    equation: 'Solids: Q·TSS_raw + Q·0.263·dose = sludge + backwash solids + product solids\nWater:  Q_raw = Q_product + Q_sludge + 0.05·Q_backwash',
    why: 'The plant produces sludge and consumes some of its own product to wash the filters. Both come off the recovery.',
    inputs: ['Raw flow and solids', 'Alum dose', 'Clarifier and filter capture'],
    units: 'kg/h and m³/h',
    interpretation: 'Recovery in a conventional plant is usually 95–99 %. The losses are the clarifier underflow and the fraction of backwash water not recovered.'
  }
];

// ---------------------------------------------------------------------------
// Fault model. The engine decides how a fault propagates; scenarios.js only
// declares the metadata and the symptoms to look for.
// ---------------------------------------------------------------------------
function faultEffects(faults = []) {
  const f = new Set(faults);
  return {
    active: [...f],
    intakeTripped: f.has('pump-failure'),
    doseFactor: f.has('coagulant-underdose') ? 0.35 : 1,
    turbidityFactor: f.has('turbidity-spike') ? 4 : 1,
    chlorineFactor: f.has('chlorine-dosing-failure') ? 0 : 1,
    clarifierCells: f.has('short-circuiting') ? 1.3 : REF.clarifierCells,
    baffleFactor: f.has('short-circuiting') ? 0.30 : REF.baffleFactor,
    cleanHeadlossFactor: f.has('blocked-filter') ? 3.5 : 1,
    lambdaFactor: f.has('blocked-filter') ? 0.60 : 1
  };
}
/** Apply the faults to the user's inputs and report any clipping honestly. */
function effectiveInputs(inputs, fx) {
  const notes = [];
  let turbidityIn = inputs.turbidityIn * fx.turbidityFactor;
  const cap = inputSpec.turbidityIn.max;
  if (turbidityIn > cap) {
    notes.push(`The raw water turbidity excursion reached ${turbidityIn.toFixed(0)} NTU and has been held at the ${cap} NTU limit of this model. Above that a conventional plant needs presedimentation, which is not modelled here.`);
    turbidityIn = cap;
  }
  return {
    eff: {
      ...inputs,
      turbidityIn,
      feedFlow: fx.intakeTripped ? 0 : inputs.feedFlow,
      coagulantDose: inputs.coagulantDose * fx.doseFactor,
      chlorineDose: inputs.chlorineDose * fx.chlorineFactor
    },
    notes
  };
}

// ---------------------------------------------------------------------------
// Core process calculation. One pass at a given recycle state.
// ---------------------------------------------------------------------------
function solvePlant(x, recycle, fx) {
  const mu = viscosity(x.temperature);
  const rho = density(x.temperature);

  // --- blend the raw water with the recovered washwater -------------------
  const qRaw = x.feedFlow;
  const qReturn = recycle.qReturn;
  const qIn = qRaw + qReturn;
  const tssRaw = REF.tssPerNtu * x.turbidityIn;
  const tssIn = qIn > 0 ? (qRaw * tssRaw + qReturn * recycle.tssReturn) / qIn : 0;
  const turbidityPlant = tssIn / REF.tssPerNtu;
  const qs = qIn / 3600;                       // m3/s through the plant

  // --- rapid mix -----------------------------------------------------------
  const vRapidMix = qs * x.rapidMixTime;
  const pRapidMix = Math.pow(x.rapidMixG, 2) * mu * vRapidMix;   // W
  const gtRapidMix = x.rapidMixG * x.rapidMixTime;

  // --- coagulation chemistry ----------------------------------------------
  const dose = x.coagulantDose;
  const alkConsumed = dose * ALUM.alkPerMg;
  const alkResidual = x.alkalinity - alkConsumed;
  const co2Released = dose * ALUM.co2PerMg;
  const alSludge = dose * ALUM.sludgePerMg;

  const pk = pK1(x.temperature);
  const hco3Initial = alkalinityToMolar(x.alkalinity);              // mol/L of HCO3-
  const h2co3Initial = hco3Initial / Math.pow(10, x.pHIn - pk);
  const hco3Final = alkalinityToMolar(Math.max(alkResidual, 0));
  const h2co3Final = h2co3Initial + co2Released / (REF.co2MW * 1000);
  const pHCoag = hco3Final > 0 && h2co3Final > 0
    ? pk + Math.log10(hco3Final / h2co3Final)
    : null;

  // --- floc quality index --------------------------------------------------
  const doseRequired = Math.max(REF.doseFloor, REF.doseCoeff * Math.pow(x.turbidityIn, REF.doseExp));
  const doseRatio = doseRequired > 0 ? dose / doseRequired : 0;
  const etaDose = doseRatio < 1
    ? Math.exp(-1.8 * Math.pow(doseRatio - 1, 2))
    : doseRatio <= 1.4 ? 1 : Math.exp(-1.2 * Math.pow(doseRatio - 1.4, 2));
  const etaPH = pHCoag === null ? 0 : gaussian(pHCoag, 6.9, 1.3);
  const etaTemp = x.temperature < 20 ? clamp(1 - 0.010 * (20 - x.temperature), 0.6, 1) : 1;

  const flocTimeS = x.flocTime * 60;
  const gtFloc = x.flocG * flocTimeS;
  const fGt = plateau(gtFloc, 2e4, 1.2e5, 1.0, 0.8);
  const fShear = x.flocG <= 70 ? 1 : gaussian(x.flocG, 70, 45);
  const fMixG = x.rapidMixG >= 500 ? 1 : Math.exp(-Math.pow(Math.log(x.rapidMixG / 500) / 0.6, 2));
  const fMixT = x.rapidMixTime >= 10 ? 1 : x.rapidMixTime / 10;
  const flocQuality = clamp(etaDose * etaPH * etaTemp * fGt * fShear * fMixG * fMixT, 0.02, 1);

  const vFloc = qs * flocTimeS;
  const pFloc = Math.pow(x.flocG, 2) * mu * vFloc;

  // --- sedimentation --------------------------------------------------------
  const mu20 = viscosity(20);
  const settlingVelocity = REF.flocSettlingVelocity * flocQuality * (mu20 / mu);   // m/h
  const clarifierArea = qIn > 0 ? qIn / x.overflowRate : 0;
  const clarifierDetention = qIn > 0 ? x.basinVolume / qIn : null;                  // h
  const clarifierDepth = clarifierArea > 0 ? x.basinVolume / clarifierArea : null;  // m
  const n = fx.clarifierCells;
  const removal = clamp(1 - Math.pow(1 + settlingVelocity / (n * x.overflowRate), -n), 0, 0.999);
  const turbiditySettled = turbidityPlant * (1 - removal);

  // --- solids into the clarifier -------------------------------------------
  const tssToClarifier = tssIn + alSludge;                       // mg/L
  const solidsToClarifier = tssToClarifier * qIn / 1000;         // kg/h
  const solidsCaptured = solidsToClarifier * removal;
  const solidsCarryover = solidsToClarifier - solidsCaptured;
  const qSludge = solidsCaptured / REF.sludgeSolids;             // m3/h
  const qSettled = qIn - qSludge;

  // --- filtration ------------------------------------------------------------
  const filterArea = qSettled > 0 ? qSettled / x.filtrationRate : 0;
  const vFilter = x.filtrationRate / 3600;                        // m/s
  const lambda = REF.lambdaClean * Math.pow(flocQuality, 0.8)
    * Math.pow(REF.refFiltrationRate / x.filtrationRate, 0.5) * fx.lambdaFactor;
  const passFraction = Math.exp(-lambda * REF.mediaDepth);
  const turbidityFiltered = turbiditySettled * passFraction;

  const eps = REF.mediaPorosity, phid = REF.mediaSphericity * REF.mediaSize;
  const headlossClean = REF.kozeny * mu * Math.pow(1 - eps, 2) * vFilter * REF.mediaDepth
    / (rho * REF.g * Math.pow(eps, 3) * Math.pow(phid, 2)) * fx.cleanHeadlossFactor;
  const headlossAvailable = REF.terminalHeadloss - headlossClean;
  const filterOperable = headlossAvailable > 0;

  // solids retained in the bed, kg per m2 per hour
  const captureRate = (turbiditySettled - turbidityFiltered) * REF.tssPerNtu * x.filtrationRate / 1000;
  // Null run length means one of two different things, so they are kept apart:
  // an inoperable filter is caught by the feasibility check below, whereas a filter
  // depositing nothing measurable simply is not headloss limited.
  const runLength = filterOperable && captureRate > 0
    ? headlossAvailable / (REF.specificHeadloss * captureRate)
    : null;

  const backwashPerArea = REF.backwashRate * REF.backwashTime / 60;    // m3 per m2 per wash
  const qBackwash = runLength && filterArea > 0 ? backwashPerArea * filterArea / runLength : 0;
  const airPerArea = REF.airScourRate * REF.airScourTime / 60;
  const qAirScour = runLength && filterArea > 0 ? airPerArea * filterArea / runLength : 0;

  const solidsToFilter = solidsCarryover;
  const solidsThroughFilter = solidsToFilter * passFraction;
  const solidsBackwashed = solidsToFilter - solidsThroughFilter;
  const tssBackwash = qBackwash > 0 ? solidsBackwashed * 1000 / qBackwash : 0;      // mg/L

  // --- washwater recovery ----------------------------------------------------
  const qReturnNext = qBackwash * REF.washwaterYield;
  const solidsToWashSludge = qReturnNext > 0 ? solidsBackwashed * REF.washwaterCapture : solidsBackwashed;
  const solidsReturned = solidsBackwashed - solidsToWashSludge;
  const tssReturnNext = qReturnNext > 0 ? solidsReturned * 1000 / qReturnNext : 0;

  // --- product water ----------------------------------------------------------
  const qProduct = qSettled - qBackwash;
  const recovery = qRaw > 0 ? qProduct / qRaw : null;

  // --- disinfection ------------------------------------------------------------
  const nomRemoval = 0.40 + 0.35 * flocQuality;
  const chlorineDemand = 0.5 + 0.10 * x.turbidityIn * (1 - nomRemoval);
  const chlorineResidual = x.chlorineDose - chlorineDemand;
  const pHFinal = pHCoag;
  const t10 = x.contactTime * fx.baffleFactor;
  const ctAchieved = chlorineResidual > 0 ? chlorineResidual * t10 : 0;
  const ctRequiredGiardia = chlorineResidual > 0 && pHFinal !== null
    ? REF.ctGiardia3log * Math.pow(pHFinal / 7, 2.7)
      * Math.pow(2, -(x.temperature - 10) / 10) * Math.pow(chlorineResidual, 0.15)
    : null;
  const ctRequiredVirus = REF.ctVirus4log * Math.pow(2, -(x.temperature - 10) / 10);

  // Filtration credit is conditional on the filtered turbidity actually achieved.
  const giardiaCredit = turbidityFiltered <= REF.turbidityLimit ? 2.5
    : turbidityFiltered <= 1.0 ? 2.0 : 0;
  const virusCredit = turbidityFiltered <= REF.turbidityLimit ? 2.0
    : turbidityFiltered <= 1.0 ? 1.0 : 0;
  // The CT tables are linear in log inactivation but stop at 3-log Giardia and
  // 4-log virus. Extrapolating past the end of the table would invent credit.
  const giardiaFromCT = ctRequiredGiardia ? Math.min(3 * ctAchieved / ctRequiredGiardia, REF.ctTableMaxGiardia) : 0;
  const virusFromCT = ctRequiredVirus ? Math.min(4 * ctAchieved / ctRequiredVirus, REF.ctTableMaxVirus) : 0;
  const giardiaTotal = giardiaCredit + giardiaFromCT;
  const virusTotal = virusCredit + virusFromCT;

  // --- chemical consumption -------------------------------------------------
  const alumRate = dose * qIn / 1000;                                  // kg/h
  const chlorineRate = x.chlorineDose * qProduct / 1000;               // kg/h
  const qAlumSolution = alumRate / (REF.alumSolution * REF.alumSolutionDensity);
  const qHypoSolution = chlorineRate / (REF.hypoStrength * REF.hypoDensity);

  // --- energy ----------------------------------------------------------------
  const pumpPower = (q, head, eff) => q > 0 ? rho * REF.g * (q / 3600) * head / eff / 1000 : 0;  // kW
  const pIntake = pumpPower(qRaw, REF.intakeHead, REF.intakeEff);
  const pBackwash = pumpPower(qBackwash, REF.backwashHead, REF.backwashEff);
  const pHighLift = pumpPower(qProduct, REF.highLiftHead, REF.highLiftEff);
  const pBlower = qAirScour > 0 ? (qAirScour / 3600) * REF.blowerPressure / REF.blowerEff / 1000 : 0;
  const pTotal = pIntake + pBackwash + pHighLift + pRapidMix / 1000 + pFloc / 1000 + pBlower;
  const specificEnergy = qProduct > 0 ? pTotal / qProduct : null;       // kWh/m3

  // --- mass balance closure ---------------------------------------------------
  const solidsInRaw = tssRaw * qRaw / 1000;
  const solidsChemical = alSludge * qIn / 1000;
  const solidsProduct = solidsThroughFilter;
  const solidsIn = solidsInRaw + solidsChemical;
  const solidsOut = solidsCaptured + solidsToWashSludge + solidsProduct;
  const solidsClosure = solidsIn > 0 ? Math.abs(solidsIn - solidsOut) / solidsIn : 0;
  const waterIn = qRaw;
  const waterOut = qProduct + qSludge + qBackwash * (1 - REF.washwaterYield);
  const waterClosure = waterIn > 0 ? Math.abs(waterIn - waterOut) / waterIn : 0;

  // --- is this operating point physically possible at all? -------------------
  const infeasible = [];
  if (qIn > 0) {
    if (qSludge >= qIn) {
      infeasible.push(`The clarifier would have to withdraw ${qSludge.toFixed(1)} m³/h of underflow at ${(REF.sludgeSolids / 10).toFixed(1)} % w/w from a plant flow of ${qIn.toFixed(1)} m³/h. The solids loading is greater than the basin can remove as sludge, so there is no operating point to report.`);
    } else if (!filterOperable) {
      infeasible.push(`Clean-bed headloss is ${headlossClean.toFixed(2)} m against a terminal headloss of ${REF.terminalHeadloss} m, so the filter is at its backwash trigger before any water has passed through it. There is no operable filter run at ${x.filtrationRate.toFixed(1)} m/h and ${x.temperature.toFixed(1)} °C, and therefore no plant state to report. Lower the filtration rate or restore the media.`);
    } else if (qProduct <= 0) {
      infeasible.push(`A ${runLength === null ? '—' : runLength.toFixed(1)} h filter run at ${x.filtrationRate.toFixed(1)} m/h needs ${qBackwash.toFixed(1)} m³/h of backwash water against a filtered flow of ${qSettled.toFixed(1)} m³/h. The filters would consume everything the plant makes, so the works cannot sustain an output.`);
    }
  }

  return {
    infeasible, filterOperable,
    mu, rho, qRaw, qReturn, qIn, qs, tssRaw, tssIn, turbidityPlant,
    vRapidMix, pRapidMix, gtRapidMix,
    dose, doseRequired, doseRatio, alkConsumed, alkResidual, co2Released, alSludge, pHCoag,
    etaDose, etaPH, etaTemp, fGt, fShear, fMixG, fMixT, flocQuality,
    vFloc, pFloc, gtFloc, flocTimeS,
    settlingVelocity, clarifierArea, clarifierDetention, clarifierDepth, n, removal,
    turbiditySettled, tssToClarifier, solidsToClarifier, solidsCaptured, solidsCarryover,
    qSludge, qSettled,
    filterArea, lambda, passFraction, turbidityFiltered, headlossClean, headlossAvailable,
    captureRate, runLength, qBackwash, qAirScour, backwashPerArea,
    solidsToFilter, solidsThroughFilter, solidsBackwashed, tssBackwash,
    qReturnNext, tssReturnNext, solidsToWashSludge, solidsReturned,
    qProduct, recovery,
    chlorineDemand, chlorineResidual, pHFinal, t10, ctAchieved,
    ctRequiredGiardia, ctRequiredVirus, giardiaCredit, virusCredit,
    giardiaFromCT, virusFromCT, giardiaTotal, virusTotal,
    alumRate, chlorineRate, qAlumSolution, qHypoSolution,
    pIntake, pBackwash, pHighLift, pBlower, pTotal, specificEnergy,
    solidsInRaw, solidsChemical, solidsProduct, solidsIn, solidsOut, solidsClosure,
    waterIn, waterOut, waterClosure
  };
}

// ---------------------------------------------------------------------------
// Result assembly
// ---------------------------------------------------------------------------
const field = (label, value, unit, digits = 2, kind = KIND.CALC) => ({ label, value, unit, digits, kind });

/**
 * A balance entry: a reading, plus where it sits in the balance it belongs to.
 *
 * Two balances live in one object here — solids and water — and until now
 * nothing said which rows belonged to which, or which way round they pointed.
 * `family` groups them, `side` orients them, `phase` names the stream the
 * quantity travels in so it can carry that stream's colour.
 *
 * `share` is worked out here and not on the results rail. A row as a fraction
 * of the charge is a process quantity like any other, and the rule that the
 * interface never derives one has no exception for arithmetic that looks easy.
 */
const bal = (f, side, family, phase, basis) => ({
  ...f, side, family, phase,
  share: Number.isFinite(f.value) && Number.isFinite(basis) && basis > 0 ? f.value / basis : null
});

function buildResults(s, x, fx) {
  const running = s.qIn > 0;
  const only = v => (running && Number.isFinite(v) ? v : null);
  // Chlorine demand above the dose leaves no free residual at all. Reporting a
  // negative residual would be reporting a quantity that does not exist.
  const residual = s.chlorineResidual > 0 ? s.chlorineResidual : null;
  const deficit = s.chlorineResidual > 0 ? null : -s.chlorineResidual;

  const kpis = [
    { label: 'Finished water turbidity', value: only(s.turbidityFiltered), unit: U.turbidity, digits: 3 },
    { label: 'Giardia log inactivation and removal', value: only(s.giardiaTotal), unit: 'log', digits: 2 },
    { label: 'Free chlorine residual', value: only(residual), unit: U.conc, digits: 2 },
    { label: 'Water recovery', value: only(s.recovery === null ? NaN : s.recovery * 100), unit: U.pct, digits: 2 },
    { label: 'Filter run length', value: only(s.runLength), unit: 'h', digits: 1 },
    { label: 'Specific energy', value: only(s.specificEnergy), unit: 'kWh/m³', digits: 3 }
  ];

  const results = {
    plantFlow: field('Plant flow through the works', only(s.qIn), U.volFlow, 1),
    blendedTurbidity: field('Turbidity after washwater blending', only(s.turbidityPlant), U.turbidity, 2),
    rapidMixVolume: field('Rapid-mix basin volume', only(s.vRapidMix), U.volume, 2),
    rapidMixPower: field('Rapid-mix power', only(s.pRapidMix / 1000), U.powerKW, 2, KIND.FIRST),
    rapidMixGt: field('Rapid-mix Camp number Gt', only(s.gtRapidMix), U.dimensionless, 0, KIND.FIRST),
    doseRequired: field('Correlated optimum alum dose', only(s.doseRequired), U.conc, 1, KIND.CORR),
    doseRatio: field('Dose as a fraction of optimum', only(s.doseRatio), U.dimensionless, 2, KIND.CORR),
    alkalinityConsumed: field('Alkalinity consumed', only(s.alkConsumed), U.conc, 1, KIND.FIRST),
    alkalinityResidual: field('Residual alkalinity', only(s.alkResidual), U.conc, 1, KIND.FIRST),
    pHCoagulation: field('pH after coagulation', only(s.pHCoag), U.ph, 2, KIND.FIRST),
    flocVolume: field('Flocculation basin volume', only(s.vFloc), U.volume, 1),
    flocPower: field('Flocculation power', only(s.pFloc / 1000), U.powerKW, 3, KIND.FIRST),
    flocGt: field('Flocculation Camp number Gt', only(s.gtFloc), U.dimensionless, 0, KIND.FIRST),
    flocQuality: field('Floc quality index', only(s.flocQuality), U.dimensionless, 3, KIND.APPROX),
    settlingVelocity: field('Floc settling velocity', only(s.settlingVelocity), 'm/h', 2, KIND.CORR),
    clarifierArea: field('Clarifier surface area', only(s.clarifierArea), U.area, 1),
    clarifierDetention: field('Clarifier detention time', only(s.clarifierDetention), 'h', 2),
    clarifierDepth: field('Implied clarifier depth', only(s.clarifierDepth), U.length, 2),
    sedimentationRemoval: field('Sedimentation removal', only(s.removal * 100), U.pct, 1, KIND.CORR),
    turbiditySettled: field('Settled water turbidity', only(s.turbiditySettled), U.turbidity, 2, KIND.CORR),
    filterArea: field('Filter area', only(s.filterArea), U.area, 1),
    filterCoefficient: field('Filter coefficient λ', only(s.lambda), '1/m', 2, KIND.CORR),
    turbidityFiltered: field('Filtered water turbidity', only(s.turbidityFiltered), U.turbidity, 3, KIND.CORR),
    headlossClean: field('Clean-bed headloss', only(s.headlossClean), U.length, 3, KIND.CORR),
    headlossAvailable: field('Headloss available before backwash', only(s.headlossAvailable), U.length, 3),
    solidsLoading: field('Solids retained per filter area', only(s.captureRate), 'kg/m²·h', 4),
    runLength: field('Filter run length', only(s.runLength), 'h', 1, KIND.CORR),
    chlorineDemand: field('Chlorine demand', only(s.chlorineDemand), U.conc, 2, KIND.CORR),
    chlorineResidual: field('Free chlorine residual', only(residual), U.conc, 2, KIND.CALC),
    chlorineDeficit: field('Chlorine shortfall against demand', only(deficit), U.conc, 2, KIND.CALC),
    t10: field('Effective contact time t₁₀', only(s.t10), U.timeMin, 1, KIND.REF),
    ctAchieved: field('CT achieved', only(s.ctAchieved), 'mg·min/L', 1, KIND.CALC),
    ctRequiredGiardia: field('CT required for 3-log Giardia', only(s.ctRequiredGiardia), 'mg·min/L', 1, KIND.CORR),
    giardiaCredit: field('Giardia removal credit from filtration', only(s.giardiaCredit), 'log', 2, KIND.REF),
    giardiaFromCT: field('Giardia inactivation from CT', only(s.giardiaFromCT), 'log', 2, KIND.CORR),
    giardiaTotal: field('Total Giardia log reduction', only(s.giardiaTotal), 'log', 2),
    virusTotal: field('Total virus log reduction', only(s.virusTotal), 'log', 2),
    alumRate: field('Alum consumption', only(s.alumRate), 'kg/h', 2),
    chlorineRate: field('Chlorine consumption', only(s.chlorineRate), 'kg/h', 3),
    productFlow: field('Product water flow', only(s.qProduct), U.volFlow, 1),
    recovery: field('Water recovery', only(s.recovery === null ? NaN : s.recovery * 100), U.pct, 2)
  };

  // The two bases the rest of each balance is read against: everything the
  // plant takes in. A row's percentage is a percentage of one of these.
  const solidsBasis = only(s.solidsIn), waterBasis = only(s.qRaw);
  // Washwater that is not recovered leaves the site. The water balance has
  // always counted it — it is the third term in waterOut — but it had no row
  // of its own, so the rows on screen did not add up to the total above them
  // and the reader was left to work out which one was hiding the difference.
  const washwaterLost = only(s.qBackwash * (1 - REF.washwaterYield));

  const massBalance = {
    rawSolids: bal(field('Solids in raw water', only(s.solidsInRaw), 'kg/h'), 'in', 'solids', 'liquid', solidsBasis),
    chemicalSolids: bal(field('Aluminium hydroxide formed', only(s.solidsChemical), 'kg/h', 2, KIND.FIRST), 'in', 'solids', 'slurry', solidsBasis),
    totalSolidsIn: bal(field('Total solids in', only(s.solidsIn), 'kg/h'), 'total', 'solids', '', solidsBasis),
    clarifierSludge: bal(field('Solids to clarifier sludge', only(s.solidsCaptured), 'kg/h'), 'out', 'solids', 'slurry', solidsBasis),
    washwaterSludge: bal(field('Solids to washwater sludge', only(s.solidsToWashSludge), 'kg/h'), 'out', 'solids', 'slurry', solidsBasis),
    productSolids: bal(field('Solids leaving in product water', only(s.solidsProduct), 'kg/h', 3), 'out', 'solids', 'liquid', solidsBasis),
    totalSolidsOut: bal(field('Total solids out', only(s.solidsOut), 'kg/h'), 'total', 'solids', '', solidsBasis),
    solidsClosure: bal(field('Solids balance closure error', only(s.solidsClosure * 100), U.pct, 4), 'closure', 'solids', '', null),
    rawWater: bal(field('Raw water in', only(s.qRaw), U.volFlow, 1), 'in', 'water', 'liquid', waterBasis),
    productWater: bal(field('Product water out', only(s.qProduct), U.volFlow, 1), 'out', 'water', 'liquid', waterBasis),
    sludgeVolume: bal(field('Clarifier sludge volume', only(s.qSludge), U.volFlow, 3), 'out', 'water', 'slurry', waterBasis),
    washwaterLost: bal(field('Washwater not recovered', washwaterLost, U.volFlow, 3), 'out', 'water', 'slurry', waterBasis),
    backwashVolume: bal(field('Backwash water drawn, time averaged', only(s.qBackwash), U.volFlow, 2), 'context', 'water', 'liquid', waterBasis),
    recoveredVolume: bal(field('Recovered washwater returned', only(s.qReturn), U.volFlow, 2), 'context', 'water', 'liquid', waterBasis),
    waterClosure: bal(field('Water balance closure error', only(s.waterClosure * 100), U.pct, 4), 'closure', 'water', '', null)
  };

  const energyBalance = {
    intakePump: field('Intake pump P-101', only(s.pIntake), U.powerKW, 2, KIND.FIRST),
    rapidMixer: field('Rapid mixer MX-101', only(s.pRapidMix / 1000), U.powerKW, 2, KIND.FIRST),
    flocculator: field('Flocculators FL-101', only(s.pFloc / 1000), U.powerKW, 3, KIND.FIRST),
    backwashPump: field('Backwash pump P-102, time averaged', only(s.pBackwash), U.powerKW, 3, KIND.FIRST),
    blower: field('Air scour blower B-101, time averaged', only(s.pBlower), U.powerKW, 3, KIND.FIRST),
    highLiftPump: field('High-lift pump P-103', only(s.pHighLift), U.powerKW, 2, KIND.FIRST),
    total: field('Total shaft power', only(s.pTotal), U.powerKW, 2),
    specific: field('Specific energy per m³ produced', only(s.specificEnergy), 'kWh/m³', 3)
  };

  const quality = {
    turbidityRaw: field('Raw water turbidity', only(x.turbidityIn), U.turbidity, 1, KIND.USER),
    turbiditySettled: field('Settled water turbidity', only(s.turbiditySettled), U.turbidity, 2, KIND.CORR),
    turbidityFiltered: field('Filtered water turbidity', only(s.turbidityFiltered), U.turbidity, 3, KIND.CORR),
    turbidityLimit: field('Filtered turbidity limit', REF.turbidityLimit, U.turbidity, 2, KIND.REF),
    pHFinal: field('Finished water pH', only(s.pHFinal), U.ph, 2, KIND.FIRST),
    residual: field('Free chlorine leaving the clearwell', only(residual), U.conc, 2),
    giardia: field('Giardia log reduction achieved', only(s.giardiaTotal), 'log', 2),
    giardiaTarget: field('Giardia log reduction required', REF.giardiaTarget, 'log', 2, KIND.REF),
    virus: field('Virus log reduction achieved', only(s.virusTotal), 'log', 2),
    virusTarget: field('Virus log reduction required', REF.virusTarget, 'log', 2, KIND.REF)
  };

  const charts = running ? [
    {
      type: 'bar', title: 'Turbidity through the works', unit: U.turbidity,
      bars: [
        { label: 'Raw', value: s.turbidityPlant },
        { label: 'Settled', value: s.turbiditySettled },
        { label: 'Filtered', value: s.turbidityFiltered },
        { label: 'Limit', value: REF.turbidityLimit }
      ]
    },
    {
      type: 'line', title: 'Filter headloss over the run', xLabel: 'Run time, h', yLabel: 'Headloss, m',
      series: s.runLength ? [{
        points: Array.from({ length: 11 }, (_, i) => {
          const t = s.runLength * i / 10;
          return [t, s.headlossClean + REF.specificHeadloss * s.captureRate * t];
        })
      }] : []
    },
    {
      type: 'line', title: 'Settled-water removal against overflow rate', xLabel: 'Overflow rate, m/h', yLabel: 'Removal, %',
      series: [{
        points: Array.from({ length: 19 }, (_, i) => {
          const vo = 0.4 + i * 0.2;
          const r = 1 - Math.pow(1 + s.settlingVelocity / (s.n * vo), -s.n);
          return [vo, r * 100];
        })
      }]
    }
  ] : [];

  return { kpis, results, massBalance, energyBalance, quality, charts };
}

// ---------------------------------------------------------------------------
// Diagnostics — each message names the measurement and the engineering reason.
// ---------------------------------------------------------------------------
function diagnose(s, x, fx, notes) {
  const m = [];
  const push = (level, text) => m.push({ level, text });
  notes.forEach(t => push('warning', t));

  if (s.qIn <= 0) {
    push('error', `No flow through the works. ${TAGS.intakePump} is not delivering, so nothing downstream can be calculated and every process value is left blank rather than carried over from the last case.`);
    return m;
  }

  // Coagulation
  if (s.doseRatio < 0.7) {
    push('warning', `Alum dose is ${(s.doseRatio * 100).toFixed(0)} % of the ${s.doseRequired.toFixed(0)} mg/L the turbidity correlation calls for. The charge on the colloids is not neutralised, the floc index has fallen to ${s.flocQuality.toFixed(2)} and the carry-over shows up as settled turbidity.`);
  } else if (s.doseRatio > 1.8) {
    push('warning', `Alum dose is ${s.doseRatio.toFixed(1)} times the correlated optimum. Past about 1.4 times the particles restabilise, so the extra chemical buys worse settling, more sludge and a lower pH.`);
  }
  if (s.pHCoag !== null && (s.pHCoag < 6.0 || s.pHCoag > 7.8)) {
    push('warning', `Coagulation pH is ${s.pHCoag.toFixed(2)}, outside the 6.0–7.8 band where aluminium hydroxide is least soluble. Coagulant is staying in solution instead of forming floc.`);
  }
  if (s.alkResidual < 20) {
    push('warning', `Residual alkalinity is ${s.alkResidual.toFixed(1)} mg/L as CaCO₃. The buffer is nearly exhausted, so any further dose increase will move the pH sharply.`);
  }

  // Mixing
  if (s.gtFloc < 2e4) {
    push('warning', `Flocculation Camp number is ${s.gtFloc.toFixed(0)}, below the 2×10⁴ design minimum. There are too few collision opportunities for the floc to reach a settleable size.`);
  } else if (s.gtFloc > 1.2e5) {
    push('warning', `Flocculation Camp number is ${s.gtFloc.toExponential(2)}, above the 1.2×10⁵ design maximum. Floc already formed is being sheared apart again.`);
  }
  if (x.flocG > 70) {
    push('warning', `Flocculation gradient of ${x.flocG} 1/s exceeds the 70 1/s at which alum floc starts to break. Gentle mixing for longer will build a stronger floc than hard mixing.`);
  }
  if (x.rapidMixG < 500) {
    push('info', `Rapid-mix gradient of ${x.rapidMixG} 1/s is below the 500–1000 1/s normally used. The coagulant is not fully dispersed before hydrolysis completes.`);
  }
  if (s.gtRapidMix > 60000) {
    push('info', `Rapid mix is absorbing ${(s.pRapidMix / 1000).toFixed(1)} kW for a Gt of ${s.gtRapidMix.toFixed(0)}. Dispersion is complete long before this; the extra energy does no useful work.`);
  }

  // Sedimentation
  if (s.clarifierDepth !== null && (s.clarifierDepth < 2.5 || s.clarifierDepth > 6)) {
    push('warning', `Basin volume and overflow rate together imply a side water depth of ${s.clarifierDepth.toFixed(1)} m, outside the usual 2.5–6 m. The two inputs are not describing a buildable basin.`);
  }
  if (s.clarifierDetention !== null && s.clarifierDetention < 1.5) {
    push('warning', `Clarifier detention time is ${s.clarifierDetention.toFixed(2)} h, below the 1.5 h normally provided. Settled solids have little time to consolidate before withdrawal.`);
  }
  if (s.n < REF.clarifierCells) {
    push('info', `The basin is behaving as ${s.n.toFixed(1)} equivalent mixed cells instead of ${REF.clarifierCells}. Flow is reaching the launders without crossing the settling zone.`);
  }
  if (s.turbiditySettled > 5) {
    push('warning', `Settled water turbidity is ${s.turbiditySettled.toFixed(1)} NTU against the 1–5 NTU a clarifier should deliver. Everything the clarifier misses becomes filter load.`);
  }

  // Filtration
  if (s.turbidityFiltered > REF.turbidityLimit) {
    push('error', `Filtered water turbidity is ${s.turbidityFiltered.toFixed(3)} NTU, above the ${REF.turbidityLimit} NTU limit. The pathogen removal credit for conventional filtration falls to ${s.giardiaCredit.toFixed(1)} log, so the disinfection duty rises at the same time.`);
  }
  if (s.runLength !== null && s.runLength < 12) {
    push('warning', `Filter run length is ${s.runLength.toFixed(1)} h. Below about 12 h the plant spends a large share of its output on backwashing and recovery suffers.`);
  }
  if (x.filtrationRate > 15) {
    push('info', `Filtration rate of ${x.filtrationRate} m/h is above the 5–15 m/h band for single-medium sand. Capture falls with the square root of rate and headloss rises with it.`);
  }

  // Disinfection
  if (s.chlorineResidual <= 0) {
    push('error', `Chlorine demand of ${s.chlorineDemand.toFixed(2)} mg/L exceeds the ${x.chlorineDose.toFixed(2)} mg/L dosed. There is no free residual, so CT is zero and no inactivation credit can be claimed.`);
  } else if (s.chlorineResidual < REF.minDistributionResidual) {
    push('warning', `Free chlorine leaving the clearwell is ${s.chlorineResidual.toFixed(2)} mg/L, below the ${REF.minDistributionResidual} mg/L normally held to protect the distribution system.`);
  }
  if (s.giardiaTotal < REF.giardiaTarget) {
    push('error', `Total Giardia reduction is ${s.giardiaTotal.toFixed(2)} log against the ${REF.giardiaTarget} log required: ${s.giardiaCredit.toFixed(1)} log credited to filtration and ${s.giardiaFromCT.toFixed(2)} log from a CT of ${s.ctAchieved.toFixed(1)} mg·min/L. Raise the residual, lengthen the contact time or improve the filtrate.`);
  }
  if (s.virusTotal < REF.virusTarget) {
    push('warning', `Total virus reduction is ${s.virusTotal.toFixed(2)} log against the ${REF.virusTarget} log required.`);
  }
  if (s.t10 < x.contactTime * 0.5) {
    push('warning', `Only ${s.t10.toFixed(0)} min of the ${x.contactTime} min nominal detention time is counted as contact time. The tank is short-circuiting and most of the volume is not doing disinfection work.`);
  }

  // Balance integrity
  if (s.solidsClosure > 1e-3) {
    push('warning', `The solids balance closes to ${(s.solidsClosure * 100).toFixed(3)} %. Treat the sludge figures as indicative until it closes.`);
  }
  if (s.waterClosure > 1e-3) {
    push('warning', `The water balance closes to ${(s.waterClosure * 100).toFixed(3)} %.`);
  }
  if (s.recovery !== null && s.recovery < 0.95) {
    push('warning', `Water recovery is ${(s.recovery * 100).toFixed(1)} %, below the 95 % a conventional plant should achieve. The losses are ${s.qSludge.toFixed(2)} m³/h of clarifier sludge and ${(s.qBackwash * (1 - REF.washwaterYield)).toFixed(2)} m³/h of unrecovered washwater.`);
  }

  if (!m.some(i => i.level === 'error' || i.level === 'warning')) {
    push('info', `Base duty met: ${s.turbidityFiltered.toFixed(3)} NTU finished water, ${s.giardiaTotal.toFixed(2)} log Giardia reduction and ${(s.recovery * 100).toFixed(2)} % recovery.`);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Calculation trace: feed -> dose -> G·t -> settling -> filtration -> disinfection -> product
// ---------------------------------------------------------------------------
function buildSteps(s, x, fx) {
  if (s.qIn <= 0) return [];
  const f = (v, d = 2) => Number(v).toFixed(d);
  return [
    {
      title: '1. Feed and recycle blending',
      equation: 'Q_in = Q_raw + Q_return      TSS_in = (Q_raw·TSS_raw + Q_return·TSS_return) / Q_in',
      substitution: `Q_in = ${f(s.qRaw, 1)} + ${f(s.qReturn, 2)} m³/h ; TSS_raw = 1.3 × ${f(x.turbidityIn, 1)} = ${f(s.tssRaw, 1)} mg/L`,
      result: `Q_in = ${f(s.qIn, 1)} m³/h at ${f(s.turbidityPlant, 2)} NTU`,
      note: 'The recovered washwater is part of the plant load, so every downstream area is sized on the blended flow, not on the intake flow.'
    },
    {
      title: '2. Coagulant dose against alkalinity',
      equation: 'Alk_consumed = 0.505 · dose      CO₂ = 0.444 · dose      Al(OH)₃ = 0.263 · dose',
      substitution: `dose = ${f(s.dose, 1)} mg/L → ${f(s.alkConsumed, 1)} mg/L alkalinity consumed, ${f(s.co2Released, 1)} mg/L CO₂, ${f(s.alSludge, 2)} mg/L Al(OH)₃`,
      result: `Residual alkalinity ${f(s.alkResidual, 1)} mg/L as CaCO₃`,
      note: `The correlation calls for ${f(s.doseRequired, 1)} mg/L at this turbidity, so the dose ratio is ${f(s.doseRatio, 2)}.`
    },
    {
      title: '3. Coagulation pH from the carbonate buffer',
      equation: 'pH = pK₁ + log₁₀( [HCO₃⁻] / [H₂CO₃*] )',
      substitution: `pK₁ = 6.58 − 0.0090 × ${f(x.temperature, 1)} = ${f(pK1(x.temperature), 3)}`,
      result: s.pHCoag === null ? 'Not calculated — the buffer is exhausted' : `pH ${f(s.pHCoag, 2)} from a raw pH of ${f(x.pHIn, 2)}`,
      note: 'Aluminium hydroxide is least soluble between pH 6.0 and 7.8. The dose moves the pH and the pH decides whether the dose works.'
    },
    {
      title: '4. Rapid mix and flocculation, G and Gt',
      equation: 'V = Q · t      P = G² · µ · V      Gt = G · t',
      substitution: `Rapid mix: V = ${f(s.vRapidMix, 2)} m³, P = ${f(s.pRapidMix / 1000, 2)} kW, Gt = ${f(s.gtRapidMix, 0)}\nFlocculation: V = ${f(s.vFloc, 1)} m³, P = ${f(s.pFloc / 1000, 3)} kW, Gt = ${f(s.gtFloc, 0)}`,
      result: `Floc quality index ${f(s.flocQuality, 3)}`,
      note: `Built from dose ${f(s.etaDose, 2)}, pH ${f(s.etaPH, 2)}, temperature ${f(s.etaTemp, 2)}, Camp number ${f(s.fGt, 2)}, shear ${f(s.fShear, 2)} and rapid-mix dispersion ${f(s.fMixG * s.fMixT, 2)}.`
    },
    {
      title: '5. Sedimentation',
      equation: 'vs = 3.5 · FQ · (µ₂₀/µ)      A = Q/vo      R = 1 − (1 + vs/(n·vo))^(−n)',
      substitution: `vs = 3.5 × ${f(s.flocQuality, 3)} × ${f(viscosity(20) / s.mu, 3)} = ${f(s.settlingVelocity, 2)} m/h ; vo = ${f(x.overflowRate, 2)} m/h ; n = ${f(s.n, 1)}`,
      result: `Removal ${f(s.removal * 100, 1)} % → settled turbidity ${f(s.turbiditySettled, 2)} NTU over ${f(s.clarifierArea, 1)} m² with ${f(s.clarifierDetention, 2)} h detention`,
      note: `Sludge withdrawn: ${f(s.solidsCaptured, 2)} kg/h of solids at 1 % w/w, which is ${f(s.qSludge, 3)} m³/h.`
    },
    {
      title: '6. Filtration',
      equation: 'λ = λ₀ · FQ^0.8 · (v_ref/v)^0.5      C/C₀ = exp(−λ·L)',
      substitution: `λ = 5.0 × ${f(Math.pow(s.flocQuality, 0.8), 3)} × ${f(Math.sqrt(REF.refFiltrationRate / x.filtrationRate), 3)} = ${f(s.lambda, 2)} 1/m over L = ${REF.mediaDepth} m`,
      result: `${f(s.turbiditySettled, 2)} NTU → ${f(s.turbidityFiltered, 3)} NTU across ${f(s.filterArea, 1)} m² of filter`,
      note: 'The filter multiplies the quality it is given. It cannot compensate for coagulation that did not happen.'
    },
    {
      title: '7. Headloss and run length',
      equation: 'h_clean = 150·µ·(1−ε)²·v·L / (ρ·g·ε³·(φd)²)      t_run = (h_term − h_clean) / (σ · C_cap · v)',
      substitution: `h_clean = ${f(s.headlossClean, 3)} m, leaving ${f(s.headlossAvailable, 3)} m of the ${REF.terminalHeadloss} m terminal headloss ; solids captured ${f(s.captureRate, 4)} kg/m²·h`,
      result: s.runLength === null ? 'Run length not calculated — the filter has no usable headloss' : `Run length ${f(s.runLength, 1)} h, giving ${f(s.qBackwash, 2)} m³/h of backwash water time averaged`,
      note: 'Clean-bed headloss is proportional to viscosity, so the same filter starts dirtier in cold water.'
    },
    {
      title: '8. Disinfection and CT',
      equation: 'C = dose − demand      t₁₀ = τ · BF      CT = C · t₁₀      CT_req = 112·(pH/7)^2.7·2^(−(T−10)/10)·C^0.15',
      substitution: `C = ${f(x.chlorineDose, 2)} − ${f(s.chlorineDemand, 2)} = ${f(s.chlorineResidual, 2)} mg/L ; t₁₀ = ${f(x.contactTime, 0)} × ${f(fx.baffleFactor, 2)} = ${f(s.t10, 1)} min`,
      result: `CT ${f(s.ctAchieved, 1)} against ${s.ctRequiredGiardia === null ? '—' : f(s.ctRequiredGiardia, 1)} mg·min/L for 3-log Giardia`,
      note: `Filtration credit ${f(s.giardiaCredit, 1)} log plus ${f(s.giardiaFromCT, 2)} log from CT gives ${f(s.giardiaTotal, 2)} log against the ${REF.giardiaTarget} log required.`
    },
    {
      title: '9. Product water and balance closure',
      equation: 'Q_product = Q_in − Q_sludge − Q_backwash      Recovery = Q_product / Q_raw',
      substitution: `Q_product = ${f(s.qIn, 1)} − ${f(s.qSludge, 3)} − ${f(s.qBackwash, 2)} = ${f(s.qProduct, 1)} m³/h`,
      result: `Recovery ${f(s.recovery * 100, 2)} % ; solids balance closes to ${(s.solidsClosure * 100).toFixed(4)} %, water balance to ${(s.waterClosure * 100).toFixed(4)} %`,
      note: `Specific energy ${f(s.specificEnergy, 3)} kWh/m³ of product from ${f(s.pTotal, 1)} kW of shaft power.`
    }
  ];
}

// ---------------------------------------------------------------------------
// Equipment state and streams
// ---------------------------------------------------------------------------
const fmt = (v, d, unit) => (Number.isFinite(v) ? `${v.toFixed(d)} ${unit}` : '—');
/** A free residual only exists when the dose beat the demand. */
const residualOf = s => (s.chlorineResidual > 0 ? s.chlorineResidual : NaN);

function equipmentFrom(s, x, fx) {
  const off = s.qIn <= 0;
  const run = (alarm = false, state = 'running') => ({ state: off ? 'stopped' : alarm ? 'warning' : state, alarm });
  const eq = {};

  eq[TAGS.intakePump] = {
    ...run(fx.intakeTripped), duty: off ? 0 : 1,
    load: off ? 0 : s.qRaw / inputSpec.feedFlow.max,
    state: fx.intakeTripped ? 'tripped' : off ? 'stopped' : 'running',
    alarm: fx.intakeTripped,
    values: { Flow: fmt(s.qRaw, 1, U.volFlow), Head: fmt(REF.intakeHead, 1, U.length), 'Shaft power': fmt(s.pIntake, 2, U.powerKW) }
  };
  eq[TAGS.coagDosing] = {
    ...run(s.doseRatio < 0.7 || s.doseRatio > 1.8),
    values: { Dose: fmt(s.dose, 1, U.conc), 'Optimum dose': fmt(s.doseRequired, 1, U.conc), 'Dose ratio': fmt(s.doseRatio, 2, U.dimensionless), 'Alum rate': fmt(s.alumRate, 2, 'kg/h') }
  };
  eq[TAGS.rapidMix] = {
    ...run(x.rapidMixG < 500), load: off ? 0 : clamp(x.rapidMixG / 1000, 0, 1), level: off ? 0 : 1,
    values: { 'G': fmt(x.rapidMixG, 0, '1/s'), 'Detention': fmt(x.rapidMixTime, 0, U.time), 'Gt': fmt(s.gtRapidMix, 0, U.dimensionless), Power: fmt(s.pRapidMix / 1000, 2, U.powerKW) }
  };
  eq[TAGS.floc] = {
    ...run(s.gtFloc < 2e4 || s.gtFloc > 1.2e5 || x.flocG > 70), load: off ? 0 : clamp(x.flocG / 70, 0, 1), level: off ? 0 : 1,
    values: { 'G': fmt(x.flocG, 0, '1/s'), 'Time': fmt(x.flocTime, 0, U.timeMin), 'Gt': fmt(s.gtFloc, 0, U.dimensionless), 'Floc quality': fmt(s.flocQuality, 3, U.dimensionless), Power: fmt(s.pFloc / 1000, 3, U.powerKW) }
  };
  eq[TAGS.clarifier] = {
    ...run(s.turbiditySettled > 5), load: off ? 0 : clamp(x.overflowRate / 4, 0, 1),
    level: off ? 0 : clamp(s.clarifierDepth === null ? 0 : s.clarifierDepth / 6, 0, 1),
    values: { 'Overflow rate': fmt(x.overflowRate, 2, 'm/h'), 'Detention': fmt(s.clarifierDetention, 2, 'h'), 'Settling velocity': fmt(s.settlingVelocity, 2, 'm/h'), Removal: fmt(s.removal * 100, 1, U.pct), 'Settled turbidity': fmt(s.turbiditySettled, 2, U.turbidity) }
  };
  eq[TAGS.sludge] = {
    ...run(false), level: off ? 0 : 0.55, values: { 'Sludge flow': fmt(s.qSludge, 3, U.volFlow), 'Solids': fmt(s.solidsCaptured, 2, 'kg/h'), Concentration: fmt(REF.sludgeSolids / 10, 2, U.pct) }
  };
  eq[TAGS.filters] = {
    ...run(s.turbidityFiltered > REF.turbidityLimit || s.headlossAvailable <= 0),
    load: off ? 0 : clamp(x.filtrationRate / 15, 0, 1),
    level: off ? 0 : 0.85,
    values: { 'Filtration rate': fmt(x.filtrationRate, 1, 'm/h'), Area: fmt(s.filterArea, 1, U.area), 'Clean headloss': fmt(s.headlossClean, 3, U.length), 'Run length': fmt(s.runLength, 1, 'h'), 'Filtrate turbidity': fmt(s.turbidityFiltered, 3, U.turbidity) }
  };
  eq[TAGS.backwashTank] = {
    ...run(false), level: off ? 0 : 0.8,
    values: { 'Backwash rate': fmt(REF.backwashRate, 0, 'm/h'), Duration: fmt(REF.backwashTime, 0, U.timeMin), 'Volume per wash': fmt(s.backwashPerArea * s.filterArea, 1, U.volume) }
  };
  eq[TAGS.backwashPump] = {
    ...run(false), values: { 'Average flow': fmt(s.qBackwash, 2, U.volFlow), Head: fmt(REF.backwashHead, 1, U.length), 'Average power': fmt(s.pBackwash, 3, U.powerKW) }
  };
  eq[TAGS.blower] = {
    ...run(false), values: { 'Air rate': fmt(REF.airScourRate, 0, 'm³/m²·h'), Duration: fmt(REF.airScourTime, 0, U.timeMin), 'Average power': fmt(s.pBlower, 3, U.powerKW) }
  };
  eq[TAGS.washRecovery] = {
    ...run(false), level: off ? 0 : (s.qReturn > 0 ? 0.7 : 0.15), values: { 'Returned water': fmt(s.qReturn, 2, U.volFlow), 'Solids to sludge': fmt(s.solidsToWashSludge, 2, 'kg/h'), 'Return turbidity': fmt(s.tssReturnNext / REF.tssPerNtu, 1, U.turbidity) }
  };
  eq[TAGS.chlorineDosing] = {
    ...run(s.chlorineResidual <= 0),
    values: { Dose: fmt(x.chlorineDose, 2, U.conc), Demand: fmt(s.chlorineDemand, 2, U.conc), Residual: fmt(residualOf(s), 2, U.conc), 'Hypochlorite rate': fmt(s.qHypoSolution * 1000, 2, 'L/h') }
  };
  eq[TAGS.contactTank] = {
    ...run(s.giardiaTotal < REF.giardiaTarget), level: off ? 0 : 0.9,
    values: { 'Detention': fmt(x.contactTime, 0, U.timeMin), 't₁₀': fmt(s.t10, 1, U.timeMin), CT: fmt(s.ctAchieved, 1, 'mg·min/L'), 'CT required': fmt(s.ctRequiredGiardia, 1, 'mg·min/L') }
  };
  eq[TAGS.clearwell] = {
    ...run(!(s.chlorineResidual >= REF.minDistributionResidual)), level: off ? 0 : 0.75,
    values: { 'Product flow': fmt(s.qProduct, 1, U.volFlow), Residual: fmt(residualOf(s), 2, U.conc), Turbidity: fmt(s.turbidityFiltered, 3, U.turbidity) }
  };
  eq[TAGS.highLiftPump] = {
    ...run(false), duty: off ? 0 : 1, load: off ? 0 : clamp(s.qProduct / inputSpec.feedFlow.max, 0, 1),
    values: { Flow: fmt(s.qProduct, 1, U.volFlow), Head: fmt(REF.highLiftHead, 1, U.length), 'Shaft power': fmt(s.pHighLift, 2, U.powerKW) }
  };
  eq[TAGS.mcc] = {
    ...run(false), load: off ? 0 : clamp(s.pTotal / 400, 0, 1),
    values: { 'Total shaft power': fmt(s.pTotal, 1, U.powerKW), 'Specific energy': fmt(s.specificEnergy, 3, 'kWh/m³') }
  };

  // Numeric companions to the display strings above — the same readings, held
  // as numbers so they can be scaled and compared rather than only read. See
  // contract.js: the strings in `values` carry their units inside them and
  // parsing a number back out of one would be the interface deriving a process
  // value, which it may not do.
  //
  // This plant is isothermal, so there is no temperature worth shading by: one
  // raw-water temperature is an input and it applies everywhere. What does
  // change along the train is the thing the works exists to change — how much
  // is still in the water. That is the honest scalar here.
  const clarity = {
    [TAGS.intakePump]: x.turbidityIn,
    [TAGS.coagDosing]: s.turbidityPlant,
    [TAGS.rapidMix]: s.turbidityPlant,
    [TAGS.floc]: s.turbidityPlant,
    [TAGS.clarifier]: s.turbiditySettled,
    [TAGS.sludge]: NaN,
    [TAGS.filters]: s.turbidityFiltered,
    [TAGS.backwashTank]: s.turbidityFiltered,
    [TAGS.backwashPump]: s.turbidityFiltered,
    [TAGS.blower]: NaN,
    [TAGS.washRecovery]: s.tssReturnNext / REF.tssPerNtu,
    [TAGS.chlorineDosing]: s.turbidityFiltered,
    [TAGS.contactTank]: s.turbidityFiltered,
    [TAGS.clearwell]: s.turbidityFiltered,
    [TAGS.highLiftPump]: s.turbidityFiltered,
    [TAGS.mcc]: NaN
  };
  const only1 = v => (off || !Number.isFinite(v) ? null : v);
  for (const [tag, e] of Object.entries(eq)) {
    e.metrics = {
      turbidityNtu: only1(clarity[tag]),
      load: only1(e.load)
    };
  }
  return eq;
}

function streamsFrom(s) {
  const velocity = (id, q) => {
    const d = REF.bore[id];
    if (!d || !(q > 0)) return 0;
    return (q / 3600) / (Math.PI * d * d / 4);
  };
  const mk = (id, flow, phase, label) => ({
    id, flow: Number.isFinite(flow) && flow > 0 ? flow : 0, phase,
    label: Number.isFinite(flow) && flow > 0 ? label : '—',
    velocity: velocity(id, flow)
  });
  const t = v => (Number.isFinite(v) ? v.toFixed(v < 1 ? 3 : 1) : '—');
  return [
    mk(STREAMS.raw, s.qRaw, 'liquid', `${t(s.qRaw)} m³/h · ${t(s.turbidityPlant)} NTU`),
    mk(STREAMS.coagulant, s.qAlumSolution, 'liquid', `${t(s.alumRate)} kg/h alum`),
    mk(STREAMS.mixed, s.qIn, 'liquid', `${t(s.qIn)} m³/h · pH ${s.pHCoag === null ? '—' : s.pHCoag.toFixed(2)}`),
    mk(STREAMS.flocculated, s.qIn, 'slurry', `${t(s.qIn)} m³/h · FQ ${Number.isFinite(s.flocQuality) ? s.flocQuality.toFixed(2) : '—'}`),
    mk(STREAMS.settled, s.qSettled, 'liquid', `${t(s.qSettled)} m³/h · ${t(s.turbiditySettled)} NTU`),
    mk(STREAMS.sludge, s.qSludge, 'slurry', `${t(s.qSludge)} m³/h · ${t(s.solidsCaptured)} kg/h solids`),
    mk(STREAMS.filtrate, s.qSettled, 'liquid', `${t(s.qSettled)} m³/h · ${t(s.turbidityFiltered)} NTU`),
    mk(STREAMS.backwashSupply, s.qBackwash, 'liquid', `${t(s.qBackwash)} m³/h averaged`),
    mk(STREAMS.backwashWaste, s.qBackwash, 'slurry', `${t(s.qBackwash)} m³/h · ${t(s.tssBackwash)} mg/L`),
    mk(STREAMS.recovered, s.qReturn, 'liquid', `${t(s.qReturn)} m³/h returned`),
    mk(STREAMS.chlorine, s.qHypoSolution, 'liquid', `${t(s.chlorineRate)} kg/h Cl₂`),
    mk(STREAMS.disinfected, s.qProduct, 'liquid', `${t(s.qProduct)} m³/h · ${s.chlorineResidual > 0 ? t(s.chlorineResidual) + ' mg/L' : 'no residual'}`),
    mk(STREAMS.product, s.qProduct, 'liquid', `${t(s.qProduct)} m³/h · ${t(s.turbidityFiltered)} NTU`),
    mk(STREAMS.airScour, s.qAirScour, 'air', `${t(s.qAirScour)} m³/h averaged`)
  ];
}

// ---------------------------------------------------------------------------
// Contract implementation
// ---------------------------------------------------------------------------
function validate(inputs) {
  return validateSpec(inputSpec, inputs);
}

function getInitialState(inputs = {}) {
  const blank = solvePlant({ ...inputs, feedFlow: 0 }, { qReturn: 0, tssReturn: 0 }, faultEffects([]));
  const built = buildResults(blank, { ...inputs, turbidityIn: null }, faultEffects([]));
  return {
    status: Status.READY, converged: false, iterations: null, residual: null,
    reason: 'Not calculated — set the operating conditions and run the simulation.',
    kpis: built.kpis.map(k => ({ ...k, value: null })),
    results: Object.fromEntries(Object.entries(built.results).map(([k, v]) => [k, { ...v, value: null }])),
    massBalance: Object.fromEntries(Object.entries(built.massBalance).map(([k, v]) => [k, { ...v, value: null, share: null }])),
    energyBalance: Object.fromEntries(Object.entries(built.energyBalance).map(([k, v]) => [k, { ...v, value: null }])),
    quality: Object.fromEntries(Object.entries(built.quality).map(([k, v]) => [k, { ...v, value: v.kind === KIND.REF ? v.value : null }])),
    charts: [], messages: [], diagnostics: [], streams: [], equipment: {}, steps: [], convergence: []
  };
}

function run(inputs, { scenario = 'base', faults = [] } = {}) {
  const fx = faultEffects(faults);
  const { eff, notes } = effectiveInputs(inputs, fx);

  // Close the washwater recovery recycle. With no intake there is nothing to
  // recycle, so the loop is solved exactly in a single pass.
  const solve = eff.feedFlow > 0
    ? fixedPoint({ qReturn: 0, tssReturn: 0 },
      r => {
        const p = solvePlant(eff, r, fx);
        return { qReturn: p.qReturnNext, tssReturn: p.tssReturnNext };
      },
      { tol: 1e-7, maxIter: 80, relax: 0.8 })
    : { x: { qReturn: 0, tssReturn: 0 }, converged: true, iterations: 0, residual: 0, history: [] };

  // What the solver did on the way, not just where it ended up. Both returns
  // below carry it: a run that failed to converge is the one where seeing the
  // residual stall rather than fall is worth most.
  const convergence = [trace(
    'recycle',
    'Washwater recovery recycle',
    'Relative change in the recovered flow and its solids between one sweep of the plant and the next. The loop is closed when a sweep reproduces the return it was given.',
    1e-7, solve
  )].filter(Boolean);

  const s = solvePlant(eff, solve.x, fx);
  const built = buildResults(s, eff, fx);
  const diagnostics = solve.converged
    ? diagnose(s, eff, fx, notes)
    : [...notes.map(text => ({ level: 'warning', text })), {
      level: 'error',
      text: `The washwater recovery recycle did not converge: the residual stalled at ${solve.residual.toExponential(2)} after ${solve.iterations} iterations. No results are reported, because a recycle that has not closed would give a mass balance that does not balance.`
    }];

  if (!solve.converged) {
    return {
      ...getInitialState(inputs), status: Status.ERROR, converged: false,
      iterations: solve.iterations, residual: solve.residual, convergence,
      reason: 'Recycle loop did not converge', messages: [], diagnostics
    };
  }

  // A converged solve can still describe a plant that cannot physically be operated.
  // Publishing its flows would be publishing a process state that does not exist.
  if (s.infeasible.length) {
    return {
      ...getInitialState(inputs), status: Status.ERROR,
      converged: solve.converged, iterations: solve.iterations, residual: solve.residual, convergence,
      reason: 'No physically operable state at these conditions',
      messages: [],
      diagnostics: [...notes.map(text => ({ level: 'warning', text })),
        ...s.infeasible.map(text => ({ level: 'error', text }))]
    };
  }

  const hasWarn = diagnostics.some(d => d.level === 'warning' || d.level === 'error');
  const hasError = diagnostics.some(d => d.level === 'error');
  // A solve that converged but left the plant out of specification is a WARNING:
  // the numbers are real and must stay on screen for the student to diagnose.
  // ERROR is reserved for a run that produced no valid solution at all.
  const status = hasError || hasWarn ? Status.WARNING : Status.COMPLETE;

  return {
    status, converged: solve.converged, iterations: solve.iterations, residual: solve.residual,
    convergence, reason: scenario, ...built,
    messages: [], diagnostics,
    streams: streamsFrom(s), equipment: equipmentFrom(s, eff, fx),
    steps: buildSteps(s, eff, fx), state: s
  };
}

/**
 * How this plant may be shaded, declared by the only layer entitled to decide.
 *
 * The domains are fixed rather than taken from the run. A scale stretched to
 * fit whatever the current case happens to contain makes every plant look
 * equally loaded and equally dirty, and makes two runs impossible to compare by
 * eye — which is the one thing a colour mode is for.
 */
const colourModes = [
  {
    id: 'state', label: 'Running state', kind: 'state',
    what: 'Each unit in the colour of what it is doing — running, warning, tripped or stopped. This is what colour has meant here all along.'
  },
  {
    id: 'turbidity', label: 'Turbidity', kind: 'scale',
    metric: 'turbidityNtu', unit: U.turbidity, domain: [0.02, inputSpec.turbidityIn.max], scale: 'log', digits: 2,
    what: 'What is still in the water as it leaves each unit. A works takes this from tens of NTU to hundredths, so the ramp is logarithmic: on a linear one everything downstream of the clarifier would be the same colour and the plant would look as though it stopped working at the filters.'
  },
  {
    id: 'load', label: 'Loading', kind: 'scale',
    metric: 'load', unit: U.dimensionless, domain: [0, 1], scale: 'linear', digits: 2,
    what: 'How hard each unit is working against the duty it was sized for. 1.00 is the design point rather than a limit, and units with no meaningful loading are left unshaded instead of shaded zero.'
  }
];

export default {
  id: 'water-treatment',
  modelVersion: '1.0.0',
  inputSpec, assumptions, equations,
  TAGS, STREAMS, FAULT_IDS, REF, colourModes,
  validate,
  getInitialState,
  run,
  getDiagnostics: result => result?.diagnostics ?? [],
  getEquipmentState: result => result?.equipment ?? {},
  getStreams: result => result?.streams ?? [],
  getSteps: result => result?.steps ?? [],
  Status
};
