/**
 * 02 — INDUSTRIAL DRYER — process model.
 *
 * Direct-fired co-current rotary drum dryer with cyclone and bag filter on the
 * exhaust. Hot air is raised in a heater, passes through the drum with the
 * solids, and leaves carrying the evaporated moisture.
 *
 * Rules that apply here (see CLAUDE.md):
 *  - every returned number is computed in this file, never in the UI;
 *  - anything not calculated stays null so the UI prints an em dash;
 *  - `converged` is only true when the solver actually met tolerance;
 *  - every correlation and reference value is declared in `assumptions`.
 *
 * The dryer is limited by one of three things at any operating point, and which
 * one binds is the thing worth teaching: the heat the drum can transfer, the
 * time the drum gives the solids, or the moisture the air can still hold.
 *
 * This is a teaching model, not a validated design tool.
 */
import { KIND, Status } from '../../simulation/contract.js';
import { rules, validate as validateSpec } from '../../shared/validation.js';
import { U } from '../../shared/units.js';
import { bisect, trace } from '../../simulation/solver.js';

// ---------------------------------------------------------------------------
// Shared identity between engine, plant.js (userData.tag) and flowsheet.js.
// ---------------------------------------------------------------------------
export const TAGS = Object.freeze({
  feedHopper: 'FH-201', feedScrew: 'SC-201', supplyFan: 'FN-201', heater: 'H-201',
  drum: 'D-201', cyclone: 'CY-201', bagFilter: 'BF-201', exhaustFan: 'FN-202',
  stack: 'ST-201', productScrew: 'SC-202', cooler: 'CL-201', productBin: 'PB-201',
  mcc: 'MCC-201'
});
export const STREAMS = Object.freeze({
  wetFeed: 'S-01', feedToDrum: 'S-02', ambientAir: 'S-03', fanDischarge: 'S-04',
  fuel: 'S-05', hotAir: 'S-06', drumExhaust: 'S-07', cycloneFines: 'S-08',
  cycloneGas: 'S-09', filterFines: 'S-10', cleanExhaust: 'S-11', stackGas: 'S-12',
  driedProduct: 'S-13', productToCooler: 'S-14', coolProduct: 'S-15'
});
export const FAULT_IDS = Object.freeze([
  'low-air-flow', 'insufficient-heating', 'wet-feed-surge',
  'high-ambient-humidity', 'drum-speed-high', 'cyclone-fouling'
]);

// ---------------------------------------------------------------------------
// Reference data — teaching values, not a specific machine. All KIND.REF.
// ---------------------------------------------------------------------------
const REF = Object.freeze({
  g: 9.81, P: 101325,                 // Pa, atmospheric
  cpAir: 1.005, cpVap: 1.88, cpLiq: 4.186,  // kJ/kg·K
  lambda0: 2501,                      // kJ/kg, latent heat of water at 0 °C
  Rair: 287.05,
  // Solid properties
  solidCp: 1.05,                      // kJ/kg·K, generic granular solid, dry
  solidDensity: 1400,                 // kg/m3, particle
  bulkDensity: 720,                   // kg/m3
  equilibriumMoisture: 0.005,         // kg/kg dry solid
  // Drum
  uaCoeff: 237,                       // volumetric coefficient Ua = 237·G^0.67/D, W/m3·K
  heatLossFraction: 0.06,             // of the heat put into the air above ambient
  designHoldup: 0.12,                 // fraction of drum volume, for the loading check
  // Entrainment and gas cleaning
  attritionDust: 0.005,               // fraction of solids leaving as dust regardless of velocity
  entrainCoeff: 0.05, entrainExp: 1.5,
  cycloneEfficiency: 0.92,
  bagFilterEfficiency: 0.995,
  // Fans
  systemPressureDrop: 3500,           // Pa across the whole train
  fanEfficiency: 0.68,
  // Product cooler
  coolerApproach: 12,                 // K above ambient that the cooled product reaches
  coolerAirRatio: 0.9,                // kg cooling air per kg product
  // Limits used for judgement, not for clamping
  maxExhaustRH: 0.85,
  minProductTemp: 0,
  stackDustLimit: 50,                 // mg/m3
  // Nominal duct bores, used only to turn a flow into a tracer velocity
  bore: {
    'S-01': 0.35, 'S-02': 0.30, 'S-03': 0.70, 'S-04': 0.70, 'S-05': 0.08,
    'S-06': 0.70, 'S-07': 0.80, 'S-08': 0.20, 'S-09': 0.80, 'S-10': 0.15,
    'S-11': 0.80, 'S-12': 0.90, 'S-13': 0.30, 'S-14': 0.30, 'S-15': 0.30
  }
});

// ---------------------------------------------------------------------------
// Psychrometrics
// ---------------------------------------------------------------------------
/** Saturation vapour pressure of water, Pa. Buck equation, valid 0–100 °C. */
export function pSat(tempC) {
  return 611.21 * Math.exp((18.678 - tempC / 234.5) * (tempC / (257.14 + tempC)));
}
/** Humidity ratio from vapour pressure, kg water per kg dry air. */
const humidityFromPv = pv => 0.622 * pv / Math.max(REF.P - pv, 1);
/** Vapour pressure from humidity ratio, Pa. */
const pvFromHumidity = Y => REF.P * Y / (0.622 + Y);
/** Humid heat of moist air, kJ/kg dry air·K. */
const humidHeat = Y => REF.cpAir + REF.cpVap * Y;
/** Enthalpy of moist air, kJ per kg dry air, referred to 0 °C and liquid water. */
const airEnthalpy = (tempC, Y) => REF.cpAir * tempC + Y * (REF.lambda0 + REF.cpVap * tempC);
/** Latent heat of vaporisation of water, kJ/kg. */
const latentHeat = tempC => REF.lambda0 - 2.36 * tempC;
/** Relative humidity as a fraction. */
const relHumidity = (tempC, Y) => pvFromHumidity(Y) / pSat(tempC);

/**
 * Adiabatic saturation (wet-bulb) temperature, solved rather than approximated.
 * For the air–water system the Lewis number is close to one, so the wet-bulb and
 * adiabatic saturation temperatures coincide.
 */
export function wetBulb(tempC, Y) {
  const f = twb => {
    const Ysat = humidityFromPv(pSat(twb));
    return (Ysat - Y) * latentHeat(twb) - humidHeat(Y) * (tempC - twb);
  };
  const hi = Math.min(tempC, 99);
  const s = bisect(f, -15, hi, { tol: 1e-7, maxIter: 90 });
  return s.converged ? s.x : null;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---------------------------------------------------------------------------
// Input specification
// ---------------------------------------------------------------------------
/** Cross-field rule: you cannot ask a dryer to raise the moisture content. */
const targetBelowFeed = () => (v, inputs) => {
  const xin = inputs?.moistureIn;
  if (!Number.isFinite(v) || !Number.isFinite(xin)) return null;
  return v >= xin
    ? `The target of ${v} kg/kg is not below the feed moisture of ${xin} kg/kg. A dryer removes water; it cannot add it.`
    : null;
};
/** Cross-field rule: the critical moisture has to sit inside the drying range. */
const criticalInRange = () => (v, inputs) => {
  const xin = inputs?.moistureIn;
  if (!Number.isFinite(v) || !Number.isFinite(xin)) return null;
  if (v <= REF.equilibriumMoisture)
    return `The critical moisture must be above the equilibrium moisture of ${REF.equilibriumMoisture} kg/kg, or there is no falling-rate period to model.`;
  return v > xin
    ? `The critical moisture of ${v} kg/kg is above the feed moisture of ${xin} kg/kg, so the solids would enter already in the falling-rate period. Lower it, or accept that the whole drum runs at a falling rate.`
    : null;
};

export const inputSpec = {
  feedRate: {
    label: 'Wet feed rate', unit: U.massFlow, min: 100, max: 30000, step: 50, default: 3000,
    group: 'Feed', level: 'student',
    rules: [rules.required(), rules.positive('Feed rate'), rules.range(100, 30000, U.massFlow, 'Outside the size range this teaching model was set up for.')]
  },
  moistureIn: {
    label: 'Feed moisture, dry basis', unit: U.moisture, min: 0.02, max: 2.0, step: 0.01, default: 0.25,
    group: 'Feed', level: 'student',
    rules: [rules.required(), rules.positive('Feed moisture'), rules.range(0.02, 2.0, U.moisture, 'Above 2 kg/kg the feed handles as a slurry, which a rotary drum cannot convey.')]
  },
  moistureTarget: {
    label: 'Product moisture target, dry basis', unit: U.moisture, min: 0.001, max: 0.5, step: 0.005, default: 0.05,
    group: 'Feed', level: 'student',
    rules: [rules.required(), rules.positive('Target moisture'), rules.min(REF.equilibriumMoisture, U.moisture, 'No dryer can go below the equilibrium moisture the solid holds in contact with the drying air.'), targetBelowFeed()]
  },
  solidTempIn: {
    label: 'Feed temperature', unit: U.tempC, min: -5, max: 60, step: 1, default: 15,
    group: 'Feed', level: 'engineer',
    rules: [rules.required(), rules.range(-5, 60, U.tempC, 'Outside the band this model represents.')]
  },
  criticalMoisture: {
    label: 'Critical moisture content', unit: U.moisture, min: 0.01, max: 1.0, step: 0.01, default: 0.12,
    group: 'Feed', level: 'engineer',
    rules: [rules.required(), rules.positive('Critical moisture'), criticalInRange()]
  },
  particleSize: {
    label: 'Mean particle size', unit: 'µm', min: 50, max: 5000, step: 10, default: 800,
    group: 'Feed', level: 'expert',
    rules: [rules.required(), rules.positive('Particle size'), rules.range(50, 5000, 'µm', 'The residence-time and entrainment correlations were fitted over this band.')]
  },
  airFlow: {
    label: 'Drying air flow, dry basis', unit: U.massFlow, min: 300, max: 60000, step: 100, default: 3500,
    group: 'Drying air', level: 'student',
    rules: [rules.required(), rules.positive('Air flow'), rules.range(300, 60000, U.massFlow, 'Outside the size range this teaching model was set up for.')]
  },
  airTempIn: {
    label: 'Dryer inlet air temperature', unit: U.tempC, min: 60, max: 700, step: 5, default: 600,
    group: 'Drying air', level: 'student',
    rules: [rules.required(), rules.range(60, 700, U.tempC, 'Below 60 °C there is no useful driving force; above 700 °C the drum and the product are outside what this model covers.')]
  },
  ambientTemp: {
    label: 'Ambient temperature', unit: U.tempC, min: -10, max: 45, step: 1, default: 20,
    group: 'Drying air', level: 'engineer',
    rules: [rules.required(), rules.range(-10, 45, U.tempC, 'Outside the band the psychrometric correlations were fitted over.')]
  },
  ambientRH: {
    label: 'Ambient relative humidity', unit: U.pct, min: 5, max: 100, step: 1, default: 60,
    group: 'Drying air', level: 'engineer',
    rules: [rules.required(), rules.positive('Relative humidity'), rules.range(5, 100, U.pct, 'Relative humidity is a fraction of saturation and cannot exceed 100 %.')]
  },
  heaterEfficiency: {
    label: 'Heater thermal efficiency', unit: U.pct, min: 50, max: 98, step: 1, default: 88,
    group: 'Drying air', level: 'engineer',
    rules: [rules.required(), rules.positive('Heater efficiency'), rules.range(50, 98, U.pct, 'A direct-fired heater cannot reach 100 %; the flue losses are real.')]
  },
  drumLength: {
    label: 'Drum length', unit: U.length, min: 3, max: 40, step: 0.5, default: 16,
    group: 'Drum', level: 'engineer',
    rules: [rules.required(), rules.positive('Drum length'), rules.range(3, 40, U.length, 'Outside the size range this teaching model was set up for.')]
  },
  drumDiameter: {
    label: 'Drum diameter', unit: U.length, min: 0.5, max: 5, step: 0.1, default: 1.6,
    group: 'Drum', level: 'engineer',
    rules: [rules.required(), rules.positive('Drum diameter'), rules.range(0.5, 5, U.length, 'Outside the size range this teaching model was set up for.')]
  },
  drumSlope: {
    label: 'Drum slope', unit: 'm/m', min: 0.005, max: 0.08, step: 0.005, default: 0.02,
    group: 'Drum', level: 'expert',
    rules: [rules.required(), rules.positive('Drum slope'), rules.range(0.005, 0.08, 'm/m', 'The residence-time correlation was fitted between 0.005 and 0.08 m/m.')]
  },
  drumSpeed: {
    label: 'Drum rotational speed', unit: 'rpm', min: 0.5, max: 12, step: 0.1, default: 2.0,
    group: 'Drum', level: 'engineer',
    rules: [rules.required(), rules.positive('Drum speed'), rules.range(0.5, 12, 'rpm', 'Below 0.5 rpm the solids do not cascade off the flights; above 12 rpm they centrifuge against the shell.')]
  }
};

// ---------------------------------------------------------------------------
// Assumptions
// ---------------------------------------------------------------------------
export const assumptions = [
  { text: 'Steady-state operation. The drum holdup is constant and nothing accumulates.', kind: KIND.APPROX },
  { text: 'Co-current flow: the hot air and the solids travel the same way down the drum, so the wettest solids meet the hottest air.', kind: KIND.APPROX },
  { text: 'The solid is treated as one material with one critical moisture content and one equilibrium moisture, rather than a particle size distribution with a spread of drying behaviour.', kind: KIND.APPROX },
  { text: 'Drying follows a constant-rate period down to the critical moisture, then a falling-rate period in which the rate is proportional to the free moisture remaining.', kind: KIND.APPROX },
  { text: 'Solids sit at the wet-bulb temperature while free surface moisture remains, and warm towards the air temperature once past the critical moisture.', kind: KIND.APPROX },
  { text: 'Heat losses through the shell are taken as a fixed fraction of the heat carried into the drum above ambient, rather than modelled from the shell area and the lagging.', kind: KIND.APPROX },
  { text: 'The gas is treated as moist air throughout. Combustion products from a direct-fired heater are not tracked as a separate composition.', kind: KIND.APPROX },

  { text: 'Saturation vapour pressure uses the Buck equation, valid 0–100 °C.', kind: KIND.CORR },
  { text: 'Residence time uses the Friedman and Marshall correlation for rotary dryers: τ = 0.23L/(S·N^0.9·D) − 0.6·B·L·G/F, with B = 5·Dp^−0.5 and the minus sign for co-current flow.', kind: KIND.CORR, source: 'Friedman & Marshall, via Perry' },
  { text: 'The volumetric heat transfer coefficient is Ua = 237·G^0.67/D in W/m³·K, with G the gas mass velocity in kg/m²·s.', kind: KIND.CORR, source: 'Perry, converted to SI' },
  { text: 'Terminal velocity uses the Newton-regime drag relation with a drag coefficient of 0.44, which suits the particle sizes and gas velocities this model covers.', kind: KIND.CORR },
  { text: 'Dust carryover is an attrition floor plus a term rising with the ratio of gas velocity to particle terminal velocity.', kind: KIND.CORR },

  { text: 'The wet-bulb temperature is solved from the adiabatic saturation relation rather than read from a chart, using the shared bisection solver.', kind: KIND.FIRST },
  { text: 'The moisture balance and the enthalpy balance are solved together, referred to 0 °C with water as liquid.', kind: KIND.FIRST },
  { text: 'Humid heat is cs = 1.005 + 1.88·Y and moist air enthalpy is H = cs·T + Y·2501.', kind: KIND.FIRST },
  { text: 'Fan shaft power is the volumetric flow times the system pressure drop, divided by the fan efficiency.', kind: KIND.FIRST },

  { text: 'Solid properties: dry specific heat 1.05 kJ/kg·K, particle density 1400 kg/m³, bulk density 720 kg/m³, equilibrium moisture 0.005 kg/kg.', kind: KIND.REF },
  { text: 'Shell heat loss 6 % of the heat carried into the drum above ambient.', kind: KIND.REF },
  { text: 'Cyclone collection efficiency 92 %, bag filter 99.5 %, and an attrition dust floor of 0.5 % of the solids.', kind: KIND.REF },
  { text: 'System pressure drop 3.5 kPa at 68 % fan efficiency.', kind: KIND.REF },
  { text: 'The product cooler brings the solids to within 12 K of ambient.', kind: KIND.REF },
  { text: 'Design drum holdup is 12 % of the drum volume; the model reports the actual loading against it.', kind: KIND.REF },
  { text: 'Stream velocities come from the calculated flow and a nominal duct bore held as a reference value; they set the tracer speed only.', kind: KIND.REF }
];

// ---------------------------------------------------------------------------
// Equation documentation
// ---------------------------------------------------------------------------
export const equations = [
  {
    what: 'Moisture content, dry basis',
    equation: 'X = mass of water / mass of bone-dry solid        F_dry = F_wet / (1 + X)',
    why: 'Dry basis is used because the denominator does not change as the material dries, so a balance written on it stays linear.',
    inputs: ['Wet feed rate', 'Moisture content'],
    units: 'kg water per kg dry solid',
    interpretation: 'A wet-basis 20 % is a dry-basis 0.25 kg/kg. Mixing the two up is the most common error in a drying calculation.'
  },
  {
    what: 'Humidity ratio and relative humidity',
    equation: 'Y = 0.622 · p_v / (P − p_v)        RH = p_v / p_sat(T)',
    why: 'The humidity ratio is what the moisture balance is written on, because it does not change when the air is heated. Relative humidity is what tells you how much more water the air can still take.',
    inputs: ['Vapour pressure', 'Total pressure', 'Temperature'],
    units: 'Y in kg water per kg dry air',
    interpretation: 'Heating air raises its capacity without changing Y at all. That is the whole point of the heater.'
  },
  {
    what: 'Wet-bulb temperature',
    equation: '(Y_sat(T_wb) − Y) · λ(T_wb) = c_s · (T − T_wb)',
    why: 'It is the temperature a wet surface sits at while free moisture remains, so it sets both the product temperature and the driving force in the constant-rate period.',
    inputs: ['Air temperature', 'Humidity ratio'],
    units: '°C',
    interpretation: 'It is solved here, not read off a chart. Wetter air raises the wet bulb, which lowers the driving force and slows drying.'
  },
  {
    what: 'Residence time in a rotary drum',
    equation: 'τ = 0.23·L / (S · N^0.9 · D) − 0.6 · B · L · G/F        B = 5·Dp^(−0.5)',
    why: 'It converts the mechanical settings of the drum into the time the solids actually get, which is what the drying kinetics are competing against.',
    inputs: ['Length L', 'Slope S', 'Speed N', 'Diameter D', 'Gas and solids mass velocities', 'Particle size'],
    units: 'minutes',
    interpretation: 'The first term is the conveying action of slope and rotation. The second is the drag of the gas, which in co-current flow pushes solids through faster. Enough gas drag and the solids are blown through before they can dry.'
  },
  {
    what: 'Volumetric heat transfer in the drum',
    equation: 'Q = Ua · V · ΔT_lm        Ua = 237 · G^0.67 / D',
    why: 'A rotary dryer is sized on volume rather than on area, because the contact area between the cascading curtain of solids and the gas cannot be measured directly.',
    inputs: ['Gas mass velocity G', 'Drum diameter and volume', 'Log-mean temperature difference'],
    units: 'Ua in W/m³·K, Q in W',
    interpretation: 'More gas raises the coefficient but also raises the drag that shortens the residence time. The two pull against each other.'
  },
  {
    what: 'Drying kinetics over the residence time',
    equation: 'Constant rate:  X = X₀ − N_c·t\nFalling rate:   X = X_e + (X_c − X_e)·exp( −N_c·t / (X_c − X_e) )',
    why: 'Above the critical moisture the surface stays wet and the rate is flat. Below it the rate falls with the free moisture left, so the last few points of moisture cost far more time than the first.',
    inputs: ['Constant drying rate N_c', 'Critical and equilibrium moisture', 'Residence time'],
    units: 'kg water per kg dry solid',
    interpretation: 'This is why drying to 0.02 kg/kg can take longer than drying to 0.08 kg/kg did, on the same machine.'
  },
  {
    what: 'Moisture and enthalpy balance',
    equation: 'Y_out = Y_in + W / G\nG·H_in + F_s·(c_ps + X_in·c_pw)·T_s,in = G·H_out + F_s·(c_ps + X_out·c_pw)·T_s,out + Q_loss',
    why: 'The two balances are solved together because the air temperature that comes out of the enthalpy balance is what drives the heat transfer that sets the evaporation in the first place.',
    inputs: ['Air flow and humidity', 'Solids flow and moisture', 'Temperatures'],
    units: 'kg/h and kJ/h',
    interpretation: 'The loop is closed by the shared fixed-point solver, so the reported convergence is real.'
  },
  {
    what: 'Thermal performance',
    equation: 'η_thermal = W·λ / Q_heater        SEC = Q_heater / W        Utilisation = (T_in − T_out)/(T_in − T_amb)',
    why: 'Three different questions: how much of the fuel evaporated water, what each kilogram of water cost, and how much of the heat put into the air was actually taken out again.',
    inputs: ['Evaporation rate', 'Heater duty', 'Air temperatures'],
    units: 'kJ per kg water evaporated',
    interpretation: 'The theoretical floor is about 2400 kJ/kg. A rotary dryer running well sits between 3500 and 6000; a hot exhaust is usually what pushes it higher.'
  },
  {
    what: 'Entrainment and gas cleaning',
    equation: 'u_t = √( 4·g·d·(ρ_p − ρ_g) / (3·C_d·ρ_g) )        dust = attrition + k·(u_g/u_t)^1.5',
    why: 'Gas fast enough to lift the particles turns product into dust, and the dust has to be collected before the stack.',
    inputs: ['Particle size and density', 'Gas velocity and density'],
    units: 'm/s and kg/h',
    interpretation: 'Raising the air flow to dry faster also raises the carryover, and fine material goes first.'
  }
];

// ---------------------------------------------------------------------------
// Fault model. The engine decides how a fault propagates.
// ---------------------------------------------------------------------------
function faultEffects(faults = []) {
  const f = new Set(faults);
  return {
    active: [...f],
    airFlowFactor: f.has('low-air-flow') ? 0.45 : 1,
    airTempDrop: f.has('insufficient-heating') ? 0.55 : 1,
    feedFactor: f.has('wet-feed-surge') ? 1.5 : 1,
    moistureFactor: f.has('wet-feed-surge') ? 1.45 : 1,
    ambientRHOverride: f.has('high-ambient-humidity') ? 95 : null,
    drumSpeedFactor: f.has('drum-speed-high') ? 2.6 : 1,
    cycloneFactor: f.has('cyclone-fouling') ? 0.55 : 1,
    pressureDropFactor: f.has('cyclone-fouling') ? 1.8 : 1
  };
}
/** Apply the faults to the user's inputs and report any clipping honestly. */
function effectiveInputs(inputs, fx) {
  const notes = [];
  const cap = (v, key, what) => {
    const max = inputSpec[key].max;
    if (v <= max) return v;
    notes.push(`${what} reached ${v.toFixed(2)} ${inputSpec[key].unit} and has been held at the ${max} ${inputSpec[key].unit} limit of this model.`);
    return max;
  };
  return {
    eff: {
      ...inputs,
      feedRate: cap(inputs.feedRate * fx.feedFactor, 'feedRate', 'The feed surge'),
      moistureIn: cap(inputs.moistureIn * fx.moistureFactor, 'moistureIn', 'The feed moisture'),
      airFlow: inputs.airFlow * fx.airFlowFactor,
      airTempIn: Math.max(inputs.airTempIn * fx.airTempDrop, inputSpec.airTempIn.min),
      ambientRH: fx.ambientRHOverride ?? inputs.ambientRH,
      drumSpeed: cap(inputs.drumSpeed * fx.drumSpeedFactor, 'drumSpeed', 'The drum speed')
    },
    notes
  };
}

// ---------------------------------------------------------------------------
// Drying curve: how far the moisture falls in the time available.
// ---------------------------------------------------------------------------
function dryingCurve(xIn, xC, xE, nC, tau) {
  if (!(nC > 0) || !(tau > 0)) return xIn;
  if (xIn <= xC) {
    // Already past the critical moisture on entry: falling rate all the way.
    const free = Math.max(xIn - xE, 0);
    return xE + free * Math.exp(-nC * tau / Math.max(xC - xE, 1e-9));
  }
  const tConstant = (xIn - xC) / nC;
  if (tau <= tConstant) return xIn - nC * tau;
  const tFalling = tau - tConstant;
  return xE + (xC - xE) * Math.exp(-nC * tFalling / Math.max(xC - xE, 1e-9));
}
/** Time needed to reach a given moisture, for comparison against what the drum gives. */
function timeToReach(xIn, xTarget, xC, xE, nC) {
  if (!(nC > 0) || xTarget >= xIn) return 0;
  if (xTarget <= xE) return null;              // the equilibrium moisture is an asymptote
  let t = 0, x = xIn;
  if (x > xC) {
    const stop = Math.max(xTarget, xC);
    t += (x - stop) / nC;
    x = stop;
  }
  if (xTarget < x) t += ((xC - xE) / nC) * Math.log((x - xE) / (xTarget - xE));
  return t;
}

// ---------------------------------------------------------------------------
// Core process calculation
// ---------------------------------------------------------------------------
function solveDryer(x, guess, fx) {
  // --- feed ----------------------------------------------------------------
  const dryFeed = x.feedRate / (1 + x.moistureIn);        // kg dry solid/h
  const waterIn = dryFeed * x.moistureIn;
  const xE = REF.equilibriumMoisture;

  // --- air in --------------------------------------------------------------
  const pvAmbient = (x.ambientRH / 100) * pSat(x.ambientTemp);
  const yIn = humidityFromPv(pvAmbient);
  const G = x.airFlow;                                     // kg dry air/h
  const csIn = humidHeat(yIn);
  const hAmbient = airEnthalpy(x.ambientTemp, yIn);
  const hIn = airEnthalpy(x.airTempIn, yIn);
  const tWetBulb = wetBulb(x.airTempIn, yIn);
  const lambdaWb = tWetBulb === null ? null : latentHeat(tWetBulb);

  // --- drum geometry --------------------------------------------------------
  const area = Math.PI * Math.pow(x.drumDiameter, 2) / 4;
  const volume = area * x.drumLength;
  const gasMassVelocity = G / 3600 / area;                  // kg/m2·s
  const uaClean = REF.uaCoeff * Math.pow(gasMassVelocity, 0.67) / x.drumDiameter;   // W/m3·K

  // --- residence time (Friedman and Marshall) --------------------------------
  const B = 5 / Math.sqrt(x.particleSize);
  const conveying = 0.23 * x.drumLength / (x.drumSlope * Math.pow(x.drumSpeed, 0.9) * x.drumDiameter);
  const drag = 0.6 * B * (x.drumLength / 0.3048) * (G / Math.max(dryFeed, 1e-9));
  const tauMin = conveying - drag;                          // minutes
  const tau = tauMin / 60;                                  // hours
  const holdup = dryFeed * tau;                             // kg dry solid held in the drum
  const holdupVolume = holdup * (1 + (x.moistureIn + guess.xOut) / 2) / REF.bulkDensity;
  const loading = volume > 0 ? holdupVolume / volume : null;
  // A lightly loaded drum has a thin curtain of solids for the gas to pass through,
  // so it transfers less heat; an overloaded one rolls instead of cascading and also
  // transfers less. The coefficient peaks near the design holdup.
  const loadRatio = loading === null ? 0 : loading / REF.designHoldup;
  const loadFactor = loadRatio <= 1
    ? Math.pow(Math.max(loadRatio, 0), 0.5)
    : Math.max(1 - 0.55 * (loadRatio - 1), 0.35);
  const ua = uaClean * loadFactor;

  // --- heat loss -------------------------------------------------------------
  const heatIntoDrum = G * csIn * (x.airTempIn - x.ambientTemp);     // kJ/h above ambient
  const heatLoss = REF.heatLossFraction * heatIntoDrum;

  // --- the coupled part, iterated on the outlet moisture ----------------------
  const xOutGuess = clamp(guess.xOut, xE, x.moistureIn);
  const W = Math.max(dryFeed * (x.moistureIn - xOutGuess), 0);
  const yOut = yIn + W / Math.max(G, 1e-9);

  // Dryness fraction decides how far the solids have warmed off the wet bulb.
  const dryness = clamp((x.criticalMoisture - xOutGuess) / Math.max(x.criticalMoisture - xE, 1e-9), 0, 1);

  // Enthalpy balance, referred to 0 °C with water as liquid. Solved for the air
  // outlet temperature, with the solids outlet temperature taken from the dryness.
  const solveAirOut = tSolidOut => {
    const lhs = G * hIn
      + dryFeed * (REF.solidCp + x.moistureIn * REF.cpLiq) * x.solidTempIn
      - dryFeed * (REF.solidCp + xOutGuess * REF.cpLiq) * tSolidOut
      - heatLoss;
    const coef = G * (REF.cpAir + REF.cpVap * yOut);
    const constant = G * yOut * REF.lambda0;
    return (lhs - constant) / Math.max(coef, 1e-9);
  };
  // The two temperatures depend on each other, so they are iterated to consistency.
  // The loop ends on solveAirOut so the enthalpy balance closes by construction.
  const tFloor = tWetBulb ?? x.solidTempIn;
  const solidFrom = tAir => tFloor + dryness * Math.max(tAir - tFloor, 0) * 0.8;
  let tSolidOut = tFloor;
  let tAirOut = solveAirOut(tSolidOut);
  for (let i = 0; i < 60; i++) {
    const tsNext = solidFrom(tAirOut);
    const taNext = solveAirOut(tsNext);
    const settled = Math.abs(taNext - tAirOut) < 1e-11 && Math.abs(tsNext - tSolidOut) < 1e-11;
    tSolidOut = tsNext; tAirOut = taNext;
    if (settled) break;
  }

  // --- heat transferable in the drum ------------------------------------------
  const dt1 = x.airTempIn - x.solidTempIn;
  const dt2 = tAirOut - tSolidOut;
  const deltaTlm = (dt1 > 0 && dt2 > 0)
    ? (Math.abs(dt1 - dt2) < 1e-6 ? dt1 : (dt1 - dt2) / Math.log(dt1 / dt2))
    : null;
  const qRate = deltaTlm === null ? 0 : ua * volume * deltaTlm / 1000 * 3600;          // kJ/h
  const qThermodynamic = Math.max(G * humidHeat(yOut) * (x.airTempIn - tSolidOut), 0);  // kJ/h
  const qTransferred = Math.min(qRate, qThermodynamic);
  const solidsSensible = dryFeed * (REF.solidCp + xOutGuess * REF.cpLiq) * (tSolidOut - x.solidTempIn);
  const qEvaporation = Math.max(qTransferred - solidsSensible - heatLoss, 0);

  // --- kinetics ----------------------------------------------------------------
  // The constant drying rate is the heat available spread over the solids actually
  // held in the drum, not over the throughput.
  const nC = holdup > 0 && lambdaWb > 0 ? qEvaporation / (holdup * lambdaWb) : 0;  // kg water/(kg dry solid·h)
  let xOutKinetic = dryingCurve(x.moistureIn, x.criticalMoisture, xE, nC, tau);

  // --- can the air still hold it? -----------------------------------------------
  const ySatOut = humidityFromPv(pSat(Math.min(tAirOut, 99)));
  const yLimit = ySatOut * REF.maxExhaustRH;
  const wHumidityMax = Math.max(G * (yLimit - yIn), 0);
  const xOutHumidity = x.moistureIn - wHumidityMax / Math.max(dryFeed, 1e-9);
  const humidityLimited = xOutHumidity > xOutKinetic;
  const xOut = clamp(Math.max(xOutKinetic, xOutHumidity), xE, x.moistureIn);

  return {
    dryFeed, waterIn, xE, yIn, G, csIn, hAmbient, hIn, tWetBulb, lambdaWb,
    area, volume, gasMassVelocity, uaClean, loadFactor, loadRatio, ua,
    B, conveying, drag, tauMin, tau, holdup, holdupVolume, loading,
    heatIntoDrum, heatLoss,
    W, yOut, dryness, tAirOut, tSolidOut, deltaTlm, qRate, qThermodynamic, qTransferred, solidsSensible,
    qEvaporation, nC, xOutKinetic, ySatOut, yLimit, wHumidityMax, xOutHumidity,
    humidityLimited, xOut
  };
}

/** Everything that follows once the outlet moisture is settled. */
function finishDryer(x, s, fx) {
  const W = Math.max(s.dryFeed * (x.moistureIn - s.xOut), 0);
  const yOut = s.yIn + W / Math.max(s.G, 1e-9);
  const rhOut = relHumidity(Math.min(s.tAirOut, 99), yOut);

  // --- product and dust ------------------------------------------------------
  const productDry = s.dryFeed;
  const gasDensityOut = REF.P / (REF.Rair * (s.tAirOut + 273.15));
  const gasVolumeOut = (s.G * (1 + yOut)) / 3600 / gasDensityOut;        // m3/s
  const gasVelocity = s.area > 0 ? gasVolumeOut / s.area : 0;            // m/s
  const dp = x.particleSize * 1e-6;
  const terminalVelocity = Math.sqrt(
    4 * REF.g * dp * Math.max(REF.solidDensity - gasDensityOut, 1) / (3 * 0.44 * gasDensityOut)
  );
  const velocityRatio = terminalVelocity > 0 ? gasVelocity / terminalVelocity : 0;
  const dustFraction = clamp(
    REF.attritionDust + REF.entrainCoeff * Math.pow(velocityRatio, REF.entrainExp), 0, 0.6
  );
  const dustRate = productDry * dustFraction;                            // kg dry solid/h entrained
  const drumProduct = productDry - dustRate;

  const cycloneEff = clamp(REF.cycloneEfficiency * fx.cycloneFactor, 0, 0.999);
  const cycloneCatch = dustRate * cycloneEff;
  const toBagFilter = dustRate - cycloneCatch;
  const bagCatch = toBagFilter * REF.bagFilterEfficiency;
  const stackDust = toBagFilter - bagCatch;
  const stackDustConc = gasVolumeOut > 0 ? stackDust * 1e6 / (gasVolumeOut * 3600) : null;  // mg/m3

  const recoveredProduct = drumProduct + cycloneCatch + bagCatch;        // kg dry solid/h
  const productWet = recoveredProduct * (1 + s.xOut);
  const productYield = productDry > 0 ? recoveredProduct / productDry : null;

  // --- cooler -----------------------------------------------------------------
  const productTempCooled = x.ambientTemp + REF.coolerApproach;
  const coolerDuty = recoveredProduct * (REF.solidCp + s.xOut * REF.cpLiq)
    * Math.max(s.tSolidOut - productTempCooled, 0);                      // kJ/h
  const coolerAir = recoveredProduct * REF.coolerAirRatio;

  // --- energy ------------------------------------------------------------------
  const heaterDuty = s.G * s.csIn * (x.airTempIn - x.ambientTemp) / (x.heaterEfficiency / 100);  // kJ/h
  const heaterDutyKW = heaterDuty / 3600;
  const evaporationDuty = W * s.lambdaWb;                                // kJ/h
  const thermalEfficiency = heaterDuty > 0 ? evaporationDuty / heaterDuty : null;
  const specificEnergy = W > 0 ? heaterDuty / W : null;                  // kJ per kg water
  const utilisation = (x.airTempIn - x.ambientTemp) > 0
    ? (x.airTempIn - s.tAirOut) / (x.airTempIn - x.ambientTemp) : null;

  const pressureDrop = REF.systemPressureDrop * fx.pressureDropFactor;
  const ambientDensity = REF.P / (REF.Rair * (x.ambientTemp + 273.15));
  const supplyVolume = s.G * (1 + s.yIn) / 3600 / ambientDensity;        // m3/s
  const supplyFanPower = supplyVolume * pressureDrop * 0.35 / REF.fanEfficiency / 1000;   // kW
  const exhaustFanPower = gasVolumeOut * pressureDrop * 0.65 / REF.fanEfficiency / 1000;  // kW
  // Drum drive: torque against the cascading load, taken as a fraction of the lifted weight.
  const drumPower = s.holdup > 0
    ? (s.holdupVolume * REF.bulkDensity * REF.g * x.drumDiameter * 0.06 * (x.drumSpeed / 60) * 2 * Math.PI) / 1000
    : 0;
  const conveyorPower = 0.35 + 0.0004 * (x.feedRate + productWet);
  const totalPower = supplyFanPower + exhaustFanPower + drumPower + conveyorPower;
  const specificElectrical = productWet > 0 ? totalPower / productWet : null;   // kWh per kg product

  // --- balances -----------------------------------------------------------------
  const waterOutProduct = recoveredProduct * s.xOut;
  const waterOutDust = stackDust * s.xOut;
  const waterOutAir = s.G * yOut;
  const waterInAir = s.G * s.yIn;
  const waterIn = s.waterIn + waterInAir;
  const waterOut = waterOutProduct + waterOutDust + waterOutAir;
  const waterClosure = waterIn > 0 ? Math.abs(waterIn - waterOut) / waterIn : 0;

  const solidsIn = s.dryFeed;
  const solidsOut = recoveredProduct + stackDust;
  const solidsClosure = solidsIn > 0 ? Math.abs(solidsIn - solidsOut) / solidsIn : 0;

  const energyIn = s.G * s.hIn
    + s.dryFeed * (REF.solidCp + x.moistureIn * REF.cpLiq) * x.solidTempIn;
  const energyOut = s.G * airEnthalpy(s.tAirOut, yOut)
    + s.dryFeed * (REF.solidCp + s.xOut * REF.cpLiq) * s.tSolidOut + s.heatLoss;
  const energyClosure = energyIn > 0 ? Math.abs(energyIn - energyOut) / energyIn : 0;

  // --- what is actually limiting the dryer? ----------------------------------------
  const timeNeeded = timeToReach(x.moistureIn, x.moistureTarget, x.criticalMoisture, s.xE, s.nC);
  const targetMet = s.xOut <= x.moistureTarget + 1e-6;
  const limit = targetMet ? 'none'
    : s.humidityLimited ? 'humidity'
      : (timeNeeded !== null && timeNeeded > s.tau) ? 'time' : 'heat';

  return {
    ...s, W, yOut, rhOut,
    productDry, gasDensityOut, gasVolumeOut, gasVelocity, terminalVelocity, velocityRatio,
    dustFraction, dustRate, drumProduct, cycloneEff, cycloneCatch, toBagFilter, bagCatch,
    stackDust, stackDustConc, recoveredProduct, productWet, productYield,
    productTempCooled, coolerDuty, coolerAir,
    heaterDuty, heaterDutyKW, evaporationDuty, thermalEfficiency, specificEnergy, utilisation,
    pressureDrop, supplyVolume, supplyFanPower, exhaustFanPower, drumPower, conveyorPower,
    totalPower, specificElectrical,
    waterIn, waterOut, waterOutProduct, waterOutDust, waterOutAir, waterInAir, waterClosure,
    solidsIn, solidsOut, solidsClosure, energyIn, energyOut, energyClosure,
    timeNeeded, targetMet, limit
  };
}

// ---------------------------------------------------------------------------
// Result assembly
// ---------------------------------------------------------------------------
const field = (label, value, unit, digits = 2, kind = KIND.CALC) => ({ label, value, unit, digits, kind });

/**
 * A balance entry: a reading, plus where it sits in the balance it belongs to.
 * `family` groups the rows that sum together, `side` orients them, `phase` names
 * the stream the quantity rides in. `share` is worked out here and not on the
 * results rail — a row as a fraction of the charge is a process quantity like
 * any other. See contract.js.
 */
const bal = (f, side, family, phase, basis) => ({
  ...f, side, family, phase,
  share: Number.isFinite(f.value) && Number.isFinite(basis) && basis > 0 ? f.value / basis : null
});

function buildResults(s, x, fx) {
  const running = s.dryFeed > 0 && s.G > 0 && s.tau > 0;
  const only = v => (running && Number.isFinite(v) ? v : null);
  const pctOf = v => (running && Number.isFinite(v) ? v * 100 : null);

  const kpis = [
    { label: 'Product moisture achieved', value: only(s.xOut), unit: U.moisture, digits: 4 },
    { label: 'Water evaporated', value: only(s.W), unit: U.massFlow, digits: 1 },
    { label: 'Thermal efficiency', value: pctOf(s.thermalEfficiency), unit: U.pct, digits: 1 },
    { label: 'Specific energy', value: only(s.specificEnergy), unit: 'kJ/kg water', digits: 0 },
    { label: 'Residence time', value: only(s.tauMin), unit: U.timeMin, digits: 1 },
    { label: 'Product recovery', value: pctOf(s.productYield), unit: U.pct, digits: 2 }
  ];

  const results = {
    dryFeed: field('Bone-dry solids through the drum', only(s.dryFeed), U.massFlow, 1),
    waterInFeed: field('Water in the feed', only(s.waterIn - s.waterInAir), U.massFlow, 1),
    ambientHumidity: field('Ambient humidity ratio', only(s.yIn), U.humidity, 4, KIND.FIRST),
    wetBulb: field('Wet-bulb temperature at the drum inlet', only(s.tWetBulb), U.tempC, 1, KIND.FIRST),
    latentHeat: field('Latent heat at the wet bulb', only(s.lambdaWb), 'kJ/kg', 0, KIND.FIRST),
    drumVolume: field('Drum volume', only(s.volume), U.volume, 2),
    gasMassVelocity: field('Gas mass velocity', only(s.gasMassVelocity), 'kg/m²·s', 3),
    ua: field('Volumetric heat transfer coefficient', only(s.ua), 'W/m³·K', 1, KIND.CORR),
    conveyingTime: field('Conveying residence time', only(s.conveying), U.timeMin, 1, KIND.CORR),
    dragTime: field('Time lost to gas drag', only(s.drag), U.timeMin, 1, KIND.CORR),
    residenceTime: field('Residence time', only(s.tauMin), U.timeMin, 1, KIND.CORR),
    holdup: field('Solids held in the drum', only(s.holdup), 'kg', 1),
    loading: field('Drum loading', pctOf(s.loading), U.pct, 2),
    deltaTlm: field('Log-mean temperature difference', only(s.deltaTlm), 'K', 1, KIND.FIRST),
    qTransferred: field('Heat transferred in the drum', only(s.qTransferred / 3600), U.powerKW, 1, KIND.CORR),
    qEvaporation: field('Heat available for evaporation', only(s.qEvaporation / 3600), U.powerKW, 1),
    dryingRate: field('Constant-rate drying rate', only(s.nC), 'kg/kg·h', 4, KIND.CORR),
    timeNeeded: field('Drying time needed for the target', only(s.timeNeeded === null ? NaN : s.timeNeeded * 60), U.timeMin, 1, KIND.CORR),
    moistureOut: field('Product moisture achieved', only(s.xOut), U.moisture, 4, KIND.CORR),
    moistureTarget: field('Product moisture target', only(x.moistureTarget), U.moisture, 4, KIND.USER),
    airTempOut: field('Exhaust air temperature', only(s.tAirOut), U.tempC, 1, KIND.FIRST),
    solidTempOut: field('Product temperature leaving the drum', only(s.tSolidOut), U.tempC, 1, KIND.APPROX),
    humidityOut: field('Exhaust humidity ratio', only(s.yOut), U.humidity, 4, KIND.FIRST),
    rhOut: field('Exhaust relative humidity', pctOf(s.rhOut), U.pct, 1, KIND.FIRST),
    utilisation: field('Thermal utilisation of the air', pctOf(s.utilisation), U.pct, 1),
    gasVelocity: field('Superficial gas velocity in the drum', only(s.gasVelocity), U.velocity, 3),
    terminalVelocity: field('Particle terminal velocity', only(s.terminalVelocity), U.velocity, 2, KIND.CORR),
    dustFraction: field('Solids entrained as dust', pctOf(s.dustFraction), U.pct, 2, KIND.CORR),
    stackDust: field('Dust to stack', only(s.stackDust), U.massFlow, 4),
    stackDustConc: field('Stack dust concentration', only(s.stackDustConc), 'mg/m³', 1),
    productRate: field('Dried product rate', only(s.productWet), U.massFlow, 1),
    productTemp: field('Product temperature after cooling', only(s.productTempCooled), U.tempC, 1, KIND.REF),
    heaterDuty: field('Heater duty', only(s.heaterDutyKW), U.powerKW, 1, KIND.FIRST),
    specificEnergy: field('Specific energy per kg water', only(s.specificEnergy), 'kJ/kg water', 0),
    thermalEfficiency: field('Thermal efficiency', pctOf(s.thermalEfficiency), U.pct, 1)
  };

  // Everything each balance is read against. Water is charged from two places —
  // the feed and the ambient air — so its basis is the total, not the feed.
  const waterBasis = only(s.waterIn), solidsBasis = only(s.solidsIn);

  const massBalance = {
    wetFeed: bal(field('Wet feed in', only(s.dryFeed * (1 + x.moistureIn)), U.massFlow, 1), 'context', 'solids', 'solid', null),
    dryySolidsIn: bal(field('Bone-dry solids in', only(s.solidsIn), U.massFlow, 1), 'in', 'solids', 'solid', solidsBasis),
    productSolids: bal(field('Solids recovered as product', only(s.recoveredProduct), U.massFlow, 2), 'out', 'solids', 'solid', solidsBasis),
    stackLoss: bal(field('Solids lost to the stack', only(s.stackDust), U.massFlow, 4), 'out', 'solids', 'gas', solidsBasis),
    cycloneCatch: bal(field('— of which recovered by the cyclone', only(s.cycloneCatch), U.massFlow, 3), 'context', 'solids', 'solid', solidsBasis),
    bagCatch: bal(field('— of which recovered by the bag filter', only(s.bagCatch), U.massFlow, 4), 'context', 'solids', 'solid', solidsBasis),
    solidsClosure: bal(field('Solids balance closure error', pctOf(s.solidsClosure), U.pct, 4), 'closure', 'solids', '', null),
    waterInFeed: bal(field('Water in with the solids', only(s.waterIn - s.waterInAir), U.massFlow, 1), 'in', 'water', 'solid', waterBasis),
    waterInAir: bal(field('Water in with the ambient air', only(s.waterInAir), U.massFlow, 2), 'in', 'water', 'air', waterBasis),
    totalWaterIn: bal(field('Total water in', only(s.waterIn), U.massFlow, 1), 'total', 'water', '', waterBasis),
    waterToAir: bal(field('Water leaving in the exhaust', only(s.waterOutAir), U.massFlow, 1), 'out', 'water', 'gas', waterBasis),
    waterInProduct: bal(field('Water leaving with the product', only(s.waterOutProduct), U.massFlow, 2), 'out', 'water', 'solid', waterBasis),
    // The third term of waterOut. The balance has always counted it; it simply
    // had no row, so the rows on screen did not add up to the total above them.
    waterInDust: bal(field('Water leaving with the stack dust', only(s.waterOutDust), U.massFlow, 4), 'out', 'water', 'gas', waterBasis),
    totalWaterOut: bal(field('Total water out', only(s.waterOut), U.massFlow, 1), 'total', 'water', '', waterBasis),
    waterClosure: bal(field('Water balance closure error', pctOf(s.waterClosure), U.pct, 4), 'closure', 'water', '', null)
  };

  const energyBalance = {
    heaterDuty: field('Heater duty', only(s.heaterDutyKW), U.powerKW, 1, KIND.FIRST),
    heatIntoDrum: field('Heat carried into the drum above ambient', only(s.heatIntoDrum / 3600), U.powerKW, 1),
    heatTransferred: field('Heat transferred to the solids', only(s.qTransferred / 3600), U.powerKW, 1, KIND.CORR),
    evaporationDuty: field('Heat used to evaporate water', only(s.evaporationDuty / 3600), U.powerKW, 1),
    solidsSensible: field('Heat used to warm the solids', only(s.solidsSensible / 3600), U.powerKW, 2),
    shellLoss: field('Shell heat loss', only(s.heatLoss / 3600), U.powerKW, 2, KIND.REF),
    exhaustLoss: field('Heat leaving in the exhaust above ambient', only((s.G * (airEnthalpy(s.tAirOut, s.yOut) - s.hAmbient)) / 3600), U.powerKW, 1),
    coolerDuty: field('Product cooler duty', only(s.coolerDuty / 3600), U.powerKW, 2),
    supplyFan: field('Supply fan FN-201', only(s.supplyFanPower), U.powerKW, 2, KIND.FIRST),
    exhaustFan: field('Exhaust fan FN-202', only(s.exhaustFanPower), U.powerKW, 2, KIND.FIRST),
    drumDrive: field('Drum drive D-201', only(s.drumPower), U.powerKW, 2, KIND.APPROX),
    conveyors: field('Conveyors and feeders', only(s.conveyorPower), U.powerKW, 2, KIND.APPROX),
    totalElectrical: field('Total electrical power', only(s.totalPower), U.powerKW, 2),
    energyClosure: field('Enthalpy balance closure error', pctOf(s.energyClosure), U.pct, 4)
  };

  const quality = {
    moistureIn: field('Feed moisture', only(x.moistureIn), U.moisture, 3, KIND.USER),
    moistureOut: field('Product moisture achieved', only(s.xOut), U.moisture, 4, KIND.CORR),
    moistureTarget: field('Product moisture target', only(x.moistureTarget), U.moisture, 4, KIND.USER),
    moistureWetBasis: field('Product moisture, wet basis', pctOf(running ? s.xOut / (1 + s.xOut) : NaN), U.pct, 2, KIND.FIRST),
    productTemp: field('Product temperature leaving the drum', only(s.tSolidOut), U.tempC, 1, KIND.APPROX),
    exhaustRH: field('Exhaust relative humidity', pctOf(s.rhOut), U.pct, 1, KIND.FIRST),
    exhaustRHLimit: field('Exhaust relative humidity limit', REF.maxExhaustRH * 100, U.pct, 0, KIND.REF),
    stackDust: field('Stack dust concentration', only(s.stackDustConc), 'mg/m³', 1),
    stackDustLimit: field('Stack dust limit', REF.stackDustLimit, 'mg/m³', 0, KIND.REF)
  };

  const charts = running ? [
    {
      type: 'line', title: 'The drying curve through the drum', xLabel: 'Time in the drum, min', yLabel: 'Moisture, kg/kg',
      series: [{
        points: Array.from({ length: 26 }, (_, i) => {
          const t = s.tau * i / 25;
          return [t * 60, dryingCurve(x.moistureIn, x.criticalMoisture, s.xE, s.nC, t)];
        })
      }]
    },
    {
      type: 'bar', title: 'Where the heat goes', unit: U.powerKW,
      bars: [
        { label: 'Evaporation', value: Math.max(s.evaporationDuty / 3600, 0) },
        { label: 'Solids', value: Math.max(s.solidsSensible / 3600, 0) },
        { label: 'Shell', value: Math.max(s.heatLoss / 3600, 0) },
        { label: 'Exhaust', value: Math.max((s.G * (airEnthalpy(s.tAirOut, s.yOut) - s.hAmbient)) / 3600, 0) }
      ]
    },
    {
      type: 'line', title: 'Residence time against air flow', xLabel: 'Air flow, kg/h', yLabel: 'Residence time, min',
      series: [{
        points: Array.from({ length: 21 }, (_, i) => {
          const g = inputSpec.airFlow.min + (Math.min(s.G * 2.5, inputSpec.airFlow.max) - inputSpec.airFlow.min) * i / 20;
          const d = 0.6 * s.B * (x.drumLength / 0.3048) * (g / Math.max(s.dryFeed, 1e-9));
          return [g, s.conveying - d];
        })
      }]
    }
  ] : [];

  return { kpis, results, massBalance, energyBalance, quality, charts };
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------
function diagnose(s, x, fx, notes) {
  const m = [];
  const push = (level, text) => m.push({ level, text });
  // Nothing here may assume a field was calculated.
  const n = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');
  const pc = (v, d = 0) => (Number.isFinite(v) ? (v * 100).toFixed(d) : '—');
  notes.forEach(t => push('warning', t));

  // Product specification
  if (!s.targetMet) {
    const by = ((s.xOut - x.moistureTarget) / x.moistureTarget * 100);
    push('error', `Product leaves at ${n(s.xOut, 4)} kg/kg against a target of ${n(x.moistureTarget, 4)} kg/kg, ${n(by, 0)} % above specification. The binding constraint is ${
      s.limit === 'humidity' ? 'the exhaust air, which is close to saturation and cannot take up more moisture'
        : s.limit === 'time' ? `residence time: the solids need ${n(s.timeNeeded * 60, 1)} min to reach the target and the drum gives them ${n(s.tauMin, 1)} min`
          : 'heat: the drum cannot transfer enough energy at this air temperature and flow'}.`);
  } else if (s.xOut < x.moistureTarget * 0.5 && s.xOut > s.xE * 1.05) {
    push('info', `Product is over-dried to ${n(s.xOut, 4)} kg/kg against a target of ${n(x.moistureTarget, 4)} kg/kg. Every kilogram of water removed below the specification was paid for twice: once in fuel, and again in the product mass that was sold as water.`);
  }

  // Residence time
  if (s.tauMin <= 0) {
    push('error', `The gas drag term of ${s.drag.toFixed(1)} min exceeds the conveying time of ${s.conveying.toFixed(1)} min, so the correlation gives a negative residence time. At this gas-to-solids ratio the air blows the solids through the drum faster than the slope and rotation can convey them, and there is no operable state.`);
  } else if (s.tauMin < 3) {
    push('warning', `Residence time is only ${s.tauMin.toFixed(1)} min. Gas drag is taking ${s.drag.toFixed(1)} min off a conveying time of ${s.conveying.toFixed(1)} min, so the solids are being pushed through before the falling-rate period can finish.`);
  }
  if (s.loading !== null && s.loading > 0.18) {
    push('warning', `Drum loading is ${(s.loading * 100).toFixed(1)} % of the volume against a design figure of ${(REF.designHoldup * 100).toFixed(0)} %. An overloaded drum cascades poorly, so the curtain of solids the gas has to pass through thins out and the heat transfer falls.`);
  } else if (s.loading !== null && s.loading < 0.03) {
    push('info', `Drum loading is ${(s.loading * 100).toFixed(1)} % of the volume. The drum is running nearly empty, which wastes both the shell losses and the drive power on very little product.`);
  }

  // Air side
  if (s.rhOut >= 1.0) {
    push('error', `The exhaust would have to be at ${pc(s.rhOut)} % relative humidity, which is above saturation. The air physically cannot carry this much water at ${n(s.tAirOut, 0)} °C, so moisture would condense in the ductwork and the bag filter.`);
  } else if (s.rhOut > REF.maxExhaustRH) {
    push('warning', `Exhaust relative humidity is ${pc(s.rhOut)} %, above the ${(REF.maxExhaustRH * 100).toFixed(0)} % working limit. The driving force for drying has nearly gone, and condensation on the bag filter is a real risk on a cold day.`);
  } else if (s.rhOut < 0.10 && s.targetMet) {
    push('info', `Exhaust relative humidity is only ${pc(s.rhOut)} %. The air is leaving almost as dry as it arrived, so most of the heat put into it is going up the stack rather than into the product.`);
  }
  if (s.tAirOut < (s.tWetBulb ?? 0) + 5) {
    push('warning', `The exhaust is within 5 K of the wet-bulb temperature of ${(s.tWetBulb ?? 0).toFixed(1)} °C. The air has given up nearly all the heat it can, so adding more drum length would achieve almost nothing.`);
  }

  // Product temperature
  if (s.tSolidOut > 110) {
    push('warning', `Product leaves the drum at ${n(s.tSolidOut, 0)} °C. Once past the critical moisture there is no evaporative cooling left, so the solids track the air temperature and heat-sensitive material will degrade.`);
  }

  // Energy
  if (s.thermalEfficiency !== null && s.thermalEfficiency < 0.35) {
    push('warning', `Thermal efficiency is ${pc(s.thermalEfficiency)} % and the specific energy is ${n(s.specificEnergy, 0)} kJ per kg of water, against a theoretical floor of about 2400. The exhaust is leaving at ${n(s.tAirOut, 0)} °C, and that sensible heat is where it is going.`);
  }
  if (s.utilisation !== null && s.utilisation < 0.4) {
    push('info', `Only ${(s.utilisation * 100).toFixed(0)} % of the temperature rise bought in the heater is being taken out again in the drum. Either the air flow is too high for the load or the drum is too short to use it.`);
  }

  // Dust and gas cleaning
  if (s.velocityRatio > 0.5) {
    push('warning', `Superficial gas velocity is ${n(s.gasVelocity, 2)} m/s against a particle terminal velocity of ${n(s.terminalVelocity, 2)} m/s. At ${pc(s.velocityRatio)} % of terminal velocity the drum is entraining ${pc(s.dustFraction, 1)} % of the solids, and that is product going into the gas cleaning plant rather than into the bin.`);
  }
  if (s.stackDustConc !== null && s.stackDustConc > REF.stackDustLimit) {
    push('error', `Stack dust is ${n(s.stackDustConc, 0)} mg/m³ against a limit of ${REF.stackDustLimit} mg/m³. Check the cyclone before the bag filter: the filter is sized to polish, not to carry the whole load.`);
  }
  if (s.cycloneEff < REF.cycloneEfficiency * 0.9) {
    push('warning', `Cyclone efficiency has fallen to ${(s.cycloneEff * 100).toFixed(0)} % from a design ${(REF.cycloneEfficiency * 100).toFixed(0)} %. Everything it misses is passed to the bag filter, which will blind faster and raise the pressure drop across the whole train.`);
  }

  // Balance integrity
  if (s.waterClosure > 1e-3) push('warning', `The water balance closes to ${(s.waterClosure * 100).toFixed(3)} %.`);
  if (s.solidsClosure > 1e-3) push('warning', `The solids balance closes to ${(s.solidsClosure * 100).toFixed(3)} %.`);
  if (s.energyClosure > 1e-3) push('warning', `The enthalpy balance closes to ${(s.energyClosure * 100).toFixed(3)} %.`);

  if (!m.some(i => i.level === 'error' || i.level === 'warning')) {
    push('info', `Duty met: product at ${n(s.xOut, 4)} kg/kg against a ${n(x.moistureTarget, 4)} kg/kg target, ${n(s.W, 0)} kg/h evaporated at ${n(s.specificEnergy, 0)} kJ per kg of water, ${pc(s.thermalEfficiency)} % thermal efficiency.`);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Calculation trace
// ---------------------------------------------------------------------------
function buildSteps(s, x, fx) {
  if (!(s.dryFeed > 0 && s.G > 0)) return [];
  const f = (v, d = 2) => (Number.isFinite(v) ? Number(v).toFixed(d) : '—');
  return [
    {
      title: '1. Feed on a dry basis',
      equation: 'F_dry = F_wet / (1 + X_in)        water = F_dry · X_in',
      substitution: `F_dry = ${f(x.feedRate, 0)} / (1 + ${f(x.moistureIn, 3)}) = ${f(s.dryFeed, 1)} kg/h`,
      result: `${f(s.dryFeed, 1)} kg/h of bone-dry solid carrying ${f(s.waterIn - s.waterInAir, 1)} kg/h of water`,
      note: 'The dry solid flow is the one quantity that does not change down the length of the drum, which is why every balance is written on it.'
    },
    {
      title: '2. Ambient air and the wet bulb',
      equation: 'Y = 0.622·p_v/(P − p_v)        (Y_sat(T_wb) − Y)·λ(T_wb) = c_s·(T − T_wb)',
      substitution: `p_v = ${f(x.ambientRH, 0)} % × p_sat(${f(x.ambientTemp, 1)} °C) → Y_in = ${f(s.yIn, 4)} kg/kg`,
      result: `Wet bulb ${f(s.tWetBulb, 1)} °C at the drum inlet, latent heat ${f(s.lambdaWb, 0)} kJ/kg`,
      note: 'Heating the air from ambient to the drum inlet does not change Y at all. It only raises how much more the air could hold.'
    },
    {
      title: '3. Residence time from the drum settings',
      equation: 'τ = 0.23·L/(S·N^0.9·D) − 0.6·B·L·G/F',
      substitution: `conveying ${f(s.conveying, 1)} min − gas drag ${f(s.drag, 1)} min (G/F = ${f(s.G / Math.max(s.dryFeed, 1e-9), 2)}, B = ${f(s.B, 3)})`,
      result: `${f(s.tauMin, 1)} min in the drum, holding ${f(s.holdup, 0)} kg of dry solids at ${f(s.loading * 100, 1)} % loading`,
      note: 'In co-current flow the gas pushes the solids along, so more air always buys less time. That is the trade against the heat transfer in the next step.'
    },
    {
      title: '4. Heat the drum can transfer',
      equation: 'Ua = 237·G^0.67/D        Q = Ua·V·ΔT_lm',
      substitution: `G = ${f(s.gasMassVelocity, 3)} kg/m²·s → Ua = ${f(s.ua, 1)} W/m³·K over ${f(s.volume, 1)} m³ at ΔT_lm = ${f(s.deltaTlm, 1)} K`,
      result: `${f(s.qTransferred / 3600, 1)} kW transferred, of which ${f(s.qEvaporation / 3600, 1)} kW is left for evaporation`,
      note: 'More air raises Ua but shortens the residence time. Which effect wins depends on where the dryer currently sits.'
    },
    {
      title: '5. Drying kinetics over the time available',
      equation: 'N_c = Q_evap/(holdup·λ)        constant rate to X_c, then falling rate',
      substitution: `N_c = ${f(s.qEvaporation / 3600, 1)} kW / (${f(s.holdup, 0)} kg × ${f(s.lambdaWb, 0)} kJ/kg) = ${f(s.nC, 4)} kg/kg·h`,
      result: `${f(x.moistureIn, 3)} → ${f(s.xOut, 4)} kg/kg in ${f(s.tauMin, 1)} min`,
      note: s.timeNeeded === null
        ? 'The target sits at or below the equilibrium moisture, which is an asymptote the material cannot cross.'
        : `Reaching the ${f(x.moistureTarget, 4)} kg/kg target needs ${f(s.timeNeeded * 60, 1)} min.`
    },
    {
      title: '6. Moisture and enthalpy balance on the air',
      equation: 'Y_out = Y_in + W/G        G·H_in + solids in = G·H_out + solids out + losses',
      substitution: `Y_out = ${f(s.yIn, 4)} + ${f(s.W, 1)}/${f(s.G, 0)} = ${f(s.yOut, 4)} kg/kg`,
      result: `Exhaust at ${f(s.tAirOut, 1)} °C and ${f(s.rhOut * 100, 1)} % relative humidity`,
      note: `Saturation at that temperature would be ${f(s.ySatOut, 4)} kg/kg, so the air still has ${f((s.ySatOut - s.yOut) * s.G, 0)} kg/h of capacity left at the working limit.`
    },
    {
      title: '7. Entrainment and gas cleaning',
      equation: 'u_t = √(4·g·d·(ρ_p − ρ_g)/(3·C_d·ρ_g))        dust = attrition + k·(u_g/u_t)^1.5',
      substitution: `u_g = ${f(s.gasVelocity, 3)} m/s against u_t = ${f(s.terminalVelocity, 2)} m/s, ratio ${f(s.velocityRatio, 3)}`,
      result: `${f(s.dustFraction * 100, 2)} % entrained, ${f(s.cycloneCatch, 3)} kg/h caught by the cyclone and ${f(s.stackDust, 4)} kg/h to stack`,
      note: `Stack concentration ${f(s.stackDustConc, 1)} mg/m³ against a ${REF.stackDustLimit} mg/m³ limit.`
    },
    {
      title: '8. Energy and product',
      equation: 'Q_heater = G·c_s·(T_in − T_amb)/η        SEC = Q_heater/W        η_th = W·λ/Q_heater',
      substitution: `Q_heater = ${f(s.heaterDutyKW, 1)} kW at ${f(x.heaterEfficiency, 0)} % heater efficiency`,
      result: `${f(s.productWet, 1)} kg/h of product at ${f(s.xOut, 4)} kg/kg, ${f(s.specificEnergy, 0)} kJ per kg of water, ${f(s.thermalEfficiency * 100, 1)} % thermal efficiency`,
      note: `Balances close to ${(s.waterClosure * 100).toFixed(4)} % on water, ${(s.solidsClosure * 100).toFixed(4)} % on solids and ${(s.energyClosure * 100).toFixed(4)} % on enthalpy.`
    }
  ];
}

// ---------------------------------------------------------------------------
// Equipment state and streams
// ---------------------------------------------------------------------------
const fmt = (v, d, unit) => (Number.isFinite(v) ? `${v.toFixed(d)} ${unit}` : '—');

function equipmentFrom(s, x, fx) {
  const off = !(s.dryFeed > 0 && s.G > 0 && s.tau > 0);
  const run = (alarm = false) => ({ state: off ? 'stopped' : alarm ? 'warning' : 'running', alarm });
  const eq = {};

  eq[TAGS.feedHopper] = {
    ...run(false), level: off ? 0 : 0.65,
    values: { 'Wet feed': fmt(x.feedRate, 0, U.massFlow), Moisture: fmt(x.moistureIn, 3, U.moisture), Temperature: fmt(x.solidTempIn, 1, U.tempC) }
  };
  eq[TAGS.feedScrew] = {
    ...run(false), load: off ? 0 : clamp(x.feedRate / inputSpec.feedRate.max, 0, 1),
    values: { Throughput: fmt(x.feedRate, 0, U.massFlow), 'Dry solids': fmt(s.dryFeed, 1, U.massFlow) }
  };
  eq[TAGS.supplyFan] = {
    ...run(false), load: off ? 0 : clamp(s.G / inputSpec.airFlow.max, 0, 1),
    values: { 'Air flow': fmt(s.G, 0, U.massFlow), 'Volume flow': fmt(s.supplyVolume * 3600, 0, U.volFlow), Power: fmt(s.supplyFanPower, 2, U.powerKW) }
  };
  eq[TAGS.heater] = {
    ...run(s.utilisation !== null && s.utilisation < 0.4),
    duty: off ? 0 : clamp(s.heaterDutyKW / 3000, 0, 1),
    values: { 'Outlet temperature': fmt(x.airTempIn, 0, U.tempC), Duty: fmt(s.heaterDutyKW, 1, U.powerKW), Efficiency: fmt(x.heaterEfficiency, 0, U.pct) }
  };
  eq[TAGS.drum] = {
    ...run(!s.targetMet || s.tauMin < 3 || (s.loading !== null && s.loading > 0.18)),
    load: off ? 0 : clamp(s.loading === null ? 0 : s.loading / 0.2, 0, 1),
    level: off ? 0 : clamp(s.loading === null ? 0 : s.loading / 0.2, 0, 1),
    speed: off ? 0 : x.drumSpeed,
    values: {
      'Residence time': fmt(s.tauMin, 1, U.timeMin), Loading: fmt(s.loading * 100, 1, U.pct),
      'Heat transferred': fmt(s.qTransferred / 3600, 1, U.powerKW),
      'Product moisture': fmt(s.xOut, 4, U.moisture), 'Product temperature': fmt(s.tSolidOut, 1, U.tempC)
    }
  };
  eq[TAGS.cyclone] = {
    ...run(s.cycloneEff < REF.cycloneEfficiency * 0.9),
    load: off ? 0 : clamp(s.dustFraction / 0.1, 0, 1),
    values: { Efficiency: fmt(s.cycloneEff * 100, 1, U.pct), 'Solids caught': fmt(s.cycloneCatch, 3, U.massFlow), 'Inlet dust': fmt(s.dustRate, 3, U.massFlow) }
  };
  eq[TAGS.bagFilter] = {
    ...run(s.stackDustConc !== null && s.stackDustConc > REF.stackDustLimit),
    load: off ? 0 : clamp(s.toBagFilter / Math.max(s.dustRate, 1e-9), 0, 1),
    values: { Efficiency: fmt(REF.bagFilterEfficiency * 100, 1, U.pct), 'Solids caught': fmt(s.bagCatch, 4, U.massFlow), 'Stack dust': fmt(s.stackDustConc, 1, 'mg/m³') }
  };
  eq[TAGS.exhaustFan] = {
    ...run(false), load: off ? 0 : clamp(s.exhaustFanPower / 60, 0, 1),
    values: { 'Volume flow': fmt(s.gasVolumeOut * 3600, 0, U.volFlow), 'Pressure drop': fmt(s.pressureDrop / 1000, 2, U.pressKPa), Power: fmt(s.exhaustFanPower, 2, U.powerKW) }
  };
  eq[TAGS.stack] = {
    ...run(s.stackDustConc !== null && s.stackDustConc > REF.stackDustLimit),
    values: { Temperature: fmt(s.tAirOut, 1, U.tempC), 'Relative humidity': fmt(s.rhOut * 100, 1, U.pct), Dust: fmt(s.stackDustConc, 1, 'mg/m³') }
  };
  eq[TAGS.productScrew] = {
    ...run(false), load: off ? 0 : clamp(s.productWet / inputSpec.feedRate.max, 0, 1),
    values: { Throughput: fmt(s.productWet, 1, U.massFlow), Moisture: fmt(s.xOut, 4, U.moisture) }
  };
  eq[TAGS.cooler] = {
    ...run(s.tSolidOut > 110), duty: off ? 0 : clamp(s.coolerDuty / 3600 / 200, 0, 1),
    values: { 'Inlet temperature': fmt(s.tSolidOut, 1, U.tempC), 'Outlet temperature': fmt(s.productTempCooled, 1, U.tempC), Duty: fmt(s.coolerDuty / 3600, 2, U.powerKW) }
  };
  eq[TAGS.productBin] = {
    ...run(!s.targetMet), level: off ? 0 : 0.55,
    values: { 'Product rate': fmt(s.productWet, 1, U.massFlow), Moisture: fmt(s.xOut, 4, U.moisture), Temperature: fmt(s.productTempCooled, 1, U.tempC) }
  };
  eq[TAGS.mcc] = {
    ...run(false), load: off ? 0 : clamp(s.totalPower / 200, 0, 1),
    values: { 'Total electrical': fmt(s.totalPower, 2, U.powerKW), 'Heater duty': fmt(s.heaterDutyKW, 1, U.powerKW) }
  };
  // Numeric companions to the display strings above — the same readings held as
  // numbers, so they can be scaled and compared rather than only read. The
  // strings in `values` carry their units inside them, and parsing a number
  // back out of one would be the interface deriving a process value. See
  // contract.js.
  //
  // A dryer is a machine for moving heat into water, so it has two honest
  // gradients running through it and they run opposite ways: the gas cools from
  // the heater to the stack, and the solids warm from the feed to the drum and
  // are then cooled again. Each unit reports the temperature of whatever is
  // passing through it, not an average of the two.
  const tempAt = {
    [TAGS.feedHopper]: x.solidTempIn,
    [TAGS.feedScrew]: x.solidTempIn,
    [TAGS.supplyFan]: x.ambientTemp,
    [TAGS.heater]: x.airTempIn,
    [TAGS.drum]: s.tAirOut,
    [TAGS.cyclone]: s.tAirOut,
    [TAGS.bagFilter]: s.tAirOut,
    [TAGS.exhaustFan]: s.tAirOut,
    [TAGS.stack]: s.tAirOut,
    [TAGS.productScrew]: s.tSolidOut,
    [TAGS.cooler]: s.productTempCooled,
    [TAGS.productBin]: s.productTempCooled,
    [TAGS.mcc]: NaN
  };
  // Moisture belongs to the solids. The gas train carries water too, but as
  // humidity in a different unit against a different basis, and colouring both
  // from one scale would be comparing two quantities that do not compare.
  const moistureAt = {
    [TAGS.feedHopper]: x.moistureIn,
    [TAGS.feedScrew]: x.moistureIn,
    [TAGS.drum]: s.xOut,
    [TAGS.productScrew]: s.xOut,
    [TAGS.cooler]: s.xOut,
    [TAGS.productBin]: s.xOut
  };
  const only1 = v => (off || !Number.isFinite(v) ? null : v);
  for (const [tag, e] of Object.entries(eq)) {
    e.metrics = {
      tempC: only1(tempAt[tag]),
      moisture: only1(moistureAt[tag]),
      load: only1(e.load ?? e.duty)
    };
  }
  return eq;
}

function streamsFrom(s, x) {
  const velocity = (id, volumePerHour) => {
    const d = REF.bore[id];
    if (!d || !(volumePerHour > 0)) return 0;
    return (volumePerHour / 3600) / (Math.PI * d * d / 4);
  };
  const solidVolume = kgPerHour => kgPerHour / REF.bulkDensity;
  const mk = (id, flow, phase, label, volumePerHour) => ({
    id, flow: Number.isFinite(flow) && flow > 0 ? flow : 0, phase,
    label: Number.isFinite(flow) && flow > 0 ? label : '—',
    velocity: velocity(id, volumePerHour)
  });
  const t = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(v < 1 ? 3 : d) : '—');
  const ambientDensity = REF.P / (REF.Rair * (x.ambientTemp + 273.15));
  const hotDensity = REF.P / (REF.Rair * (x.airTempIn + 273.15));
  const airVolAmbient = s.G * (1 + s.yIn) / ambientDensity;
  const airVolHot = s.G * (1 + s.yIn) / hotDensity;
  const exhaustVol = s.gasVolumeOut * 3600;
  const wetFeed = s.dryFeed * (1 + x.moistureIn);

  return [
    mk(STREAMS.wetFeed, wetFeed, 'solid', `${t(wetFeed)} kg/h · ${t(x.moistureIn, 3)} kg/kg`, solidVolume(wetFeed)),
    mk(STREAMS.feedToDrum, wetFeed, 'solid', `${t(wetFeed)} kg/h · ${t(x.solidTempIn)} °C`, solidVolume(wetFeed)),
    mk(STREAMS.ambientAir, s.G, 'air', `${t(s.G, 0)} kg/h · ${t(s.yIn, 4)} kg/kg`, airVolAmbient),
    mk(STREAMS.fanDischarge, s.G, 'air', `${t(s.G, 0)} kg/h · ${t(x.ambientTemp)} °C`, airVolAmbient),
    mk(STREAMS.fuel, s.heaterDutyKW > 0 ? s.heaterDutyKW / 13.9 : 0, 'gas', `${t(s.heaterDutyKW, 1)} kW duty`, s.heaterDutyKW / 13.9 * 1.2),
    mk(STREAMS.hotAir, s.G, 'gas', `${t(s.G, 0)} kg/h · ${t(x.airTempIn, 0)} °C`, airVolHot),
    mk(STREAMS.drumExhaust, s.G, 'gas', `${t(s.tAirOut)} °C · ${t(s.rhOut * 100)} % RH`, exhaustVol),
    mk(STREAMS.cycloneFines, s.cycloneCatch, 'solid', `${t(s.cycloneCatch, 3)} kg/h fines`, solidVolume(s.cycloneCatch)),
    mk(STREAMS.cycloneGas, s.G, 'gas', `${t(s.toBagFilter, 3)} kg/h dust carried`, exhaustVol),
    mk(STREAMS.filterFines, s.bagCatch, 'solid', `${t(s.bagCatch, 4)} kg/h fines`, solidVolume(s.bagCatch)),
    mk(STREAMS.cleanExhaust, s.G, 'gas', `${t(s.stackDustConc)} mg/m³ dust`, exhaustVol),
    mk(STREAMS.stackGas, s.G, 'gas', `${t(exhaustVol, 0)} m³/h · ${t(s.tAirOut)} °C`, exhaustVol),
    mk(STREAMS.driedProduct, s.drumProduct * (1 + s.xOut), 'solid', `${t(s.drumProduct * (1 + s.xOut))} kg/h · ${t(s.tSolidOut)} °C`, solidVolume(s.drumProduct * (1 + s.xOut))),
    mk(STREAMS.productToCooler, s.productWet, 'solid', `${t(s.productWet)} kg/h · ${t(s.xOut, 4)} kg/kg`, solidVolume(s.productWet)),
    mk(STREAMS.coolProduct, s.productWet, 'solid', `${t(s.productWet)} kg/h · ${t(s.productTempCooled)} °C`, solidVolume(s.productWet))
  ];
}

// ---------------------------------------------------------------------------
// Contract implementation
// ---------------------------------------------------------------------------
function validate(inputs) {
  return validateSpec(inputSpec, inputs);
}

function getInitialState(inputs = {}) {
  const blank = { ...inputs, feedRate: 0, airFlow: 0 };
  const fx = faultEffects([]);
  const s0 = solveDryer(blank, { xOut: blank.moistureIn ?? 0 }, fx);
  const built = buildResults(finishDryer(blank, s0, fx), blank, fx);
  const nulls = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) =>
    [k, { ...v, value: v.kind === KIND.REF ? v.value : null, ...(v.share === undefined ? {} : { share: null }) }]));
  return {
    status: Status.READY, converged: false, iterations: null, residual: null,
    reason: 'Not calculated — set the operating conditions and run the simulation.',
    kpis: built.kpis.map(k => ({ ...k, value: null })),
    results: nulls(built.results), massBalance: nulls(built.massBalance),
    energyBalance: nulls(built.energyBalance), quality: nulls(built.quality),
    charts: [], messages: [], diagnostics: [], streams: [], equipment: {}, steps: [], convergence: []
  };
}

function run(inputs, { scenario = 'base', faults = [] } = {}) {
  const fx = faultEffects(faults);
  const { eff, notes } = effectiveInputs(inputs, fx);

  // The outlet moisture, the air outlet temperature and the heat transferred all
  // depend on one another. solveDryer clamps its answer into [X_e, X_in], so the
  // residual is non-negative at the bottom of the bracket and non-positive at the
  // top: the sign change is guaranteed and bisection is certain to find it.
  const residual = xg => solveDryer(eff, { xOut: xg }, fx).xOut - xg;
  const solve = bisect(residual, REF.equilibriumMoisture, eff.moistureIn, { tol: 1e-9, maxIter: 200 });

  // bisect stops when the bracket collapses as well as when the tolerance is met, so
  // the residual is checked here rather than assumed.
  const finalResidual = solve.x === null ? null : Math.abs(residual(solve.x));
  const rootFound = solve.x !== null && finalResidual < 1e-7;
  const s = finishDryer(eff, solveDryer(eff, { xOut: solve.x ?? eff.moistureIn }, fx), fx);

  // The trace carries this engine's own verdict rather than the solver's,
  // because this engine does not take the solver's word for it: bisection stops
  // when the bracket collapses as well as when the tolerance is met, and the
  // check above is what decides which of those happened.
  const convergence = [trace(
    'moisture',
    'Coupled moisture and enthalpy balance',
    'How far the outlet moisture that comes out of the drum model is from the outlet moisture that was fed into it, in kg water per kg bone-dry solid. It reaches zero when one guess reproduces itself, which closes the moisture balance, the enthalpy balance and the drum heat transfer at the same time.',
    1e-7, { ...solve, converged: rootFound, residual: finalResidual }
  )].filter(Boolean);

  if (!rootFound) {
    return {
      ...getInitialState(inputs), status: Status.ERROR, converged: false,
      iterations: solve.iterations, residual: finalResidual, convergence,
      reason: 'Coupled moisture and enthalpy balance did not converge',
      messages: [],
      diagnostics: [...notes.map(text => ({ level: 'warning', text })), {
        level: 'error',
        text: `The coupled moisture and enthalpy balance did not converge: the residual stalled at ${finalResidual === null ? 'no bracketed root' : finalResidual.toExponential(2)} after ${solve.iterations} iterations. No results are reported, because an unconverged balance is not a balance.`
      }]
    };
  }

  // A converged solve can still describe a machine that cannot be operated.
  const infeasible = [];
  if (s.tWetBulb === null || s.lambdaWb === null) {
    infeasible.push(`The wet-bulb temperature of the drying air did not solve at ${eff.airTempIn.toFixed(0)} °C and a humidity ratio of ${s.yIn.toFixed(4)} kg/kg. Without it there is no surface temperature for the solids and no latent heat to evaporate against, so no result is reported rather than one built on an assumed value.`);
  } else if (s.tauMin <= 0) {
    infeasible.push(`The gas drag term of ${s.drag.toFixed(1)} min exceeds the conveying time of ${s.conveying.toFixed(1)} min, so the residence time is negative. At a gas-to-solids ratio of ${(s.G / Math.max(s.dryFeed, 1e-9)).toFixed(1)} the air blows the solids straight through the drum. Reduce the air flow, slow the drum, flatten the slope, or use a coarser feed.`);
  } else if (s.deltaTlm === null) {
    infeasible.push(`The air leaves the drum no hotter than the solids, so there is no temperature difference left to drive heat transfer anywhere along the drum. There is no operable state at ${eff.airTempIn.toFixed(0)} °C inlet with ${s.G.toFixed(0)} kg/h of air against this feed.`);
  }
  if (infeasible.length) {
    return {
      ...getInitialState(inputs), status: Status.ERROR,
      converged: rootFound, iterations: solve.iterations, residual: finalResidual, convergence,
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
    converged: rootFound, iterations: solve.iterations, residual: finalResidual,
    convergence, reason: scenario, ...built,
    messages: [], diagnostics,
    streams: streamsFrom(s, eff), equipment: equipmentFrom(s, eff, fx),
    steps: buildSteps(s, eff, fx), state: s
  };
}

/**
 * How this plant may be shaded. The domains are fixed to the validated range of
 * the model rather than stretched to fit the run: a scale that rescales itself
 * makes every case look equally hot and makes two runs impossible to compare by
 * eye, which is the one thing a colour mode is for.
 */
const colourModes = [
  {
    id: 'state', label: 'Running state', kind: 'state',
    what: 'Each unit in the colour of what it is doing — running, warning, tripped or stopped. This is what colour has meant here all along.'
  },
  {
    id: 'thermal', label: 'Temperature', kind: 'scale',
    metric: 'tempC', unit: U.tempC,
    domain: [inputSpec.ambientTemp.min, inputSpec.airTempIn.max], scale: 'linear', digits: 0,
    what: 'The temperature of whatever is passing through each unit. Two gradients run through a dryer and they run opposite ways — the gas cools from the heater to the stack while the solids warm from the feed to the drum — so each unit reports its own stream rather than an average of the two.'
  },
  {
    id: 'moisture', label: 'Solids moisture', kind: 'scale',
    metric: 'moisture', unit: U.moisture,
    domain: [0, inputSpec.moistureIn.max], scale: 'linear', digits: 3,
    what: 'Water carried by the solids, dry basis, as they pass each unit. Only the solids train has a reading: the gas carries water too, but as humidity against a different basis, and one ramp across both would be comparing quantities that do not compare.'
  }
];

export default {
  id: 'industrial-dryer',
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
