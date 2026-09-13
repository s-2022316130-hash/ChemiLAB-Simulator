/**
 * 03 — Ammonia–Urea Fertilizer Plant
 * Status: route registered, process model not implemented.
 * Do not start this simulator until the previous one is functionally complete.
 */
export default {
  id: 'fertilizer',
  name: 'Ammonia–Urea Fertilizer Plant',
  engine: null, plant: null, flowsheetSpec: null, equipmentInfo: null, tour: null, scenarios: null,
  plannedScope: [
    'Synthesis gas feed, H2:N2 ratio, inerts',
    'Ammonia loop: equilibrium conversion, per-pass conversion, recycle, purge',
    'Urea reactor: CO2/NH3 ratio, conversion, carbamate recycle',
    'Evaporation and prilling, product quality',
    'Energy balance and purge-gas recovery',
    'Faults: compressor trip, low loop pressure, catalyst deactivation, recycle failure'
  ]
};
