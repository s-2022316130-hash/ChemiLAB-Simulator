/**
 * 05 — Natural Gas Processing Plant
 * Status: route registered, process model not implemented.
 * Do not start this simulator until the previous one is functionally complete.
 */
export default {
  id: 'gas-processing',
  name: 'Natural Gas Processing Plant',
  engine: null, plant: null, flowsheetSpec: null, equipmentInfo: null, tour: null, scenarios: null,
  plannedScope: [
    'Wellhead feed: composition, flow, pressure, temperature',
    'Inlet separation and condensate removal',
    'Glycol dehydration: water dewpoint, glycol circulation, regeneration duty',
    'Acid gas removal to sales-gas H2S and CO2 specification',
    'NGL recovery: JT or turboexpander, C3+ recovery, ethane rejection',
    'Sales gas specification check: HHV, water content, hydrocarbon dewpoint',
    'Faults: compressor trip, low glycol circulation, high inlet temperature, hydrate risk'
  ]
};
