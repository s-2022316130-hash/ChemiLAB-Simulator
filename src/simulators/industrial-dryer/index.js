/**
 * 02 — Industrial Dryer
 * Status: route registered, process model not implemented.
 * Do not start this simulator until the previous one is functionally complete.
 */
export default {
  id: 'industrial-dryer',
  name: 'Industrial Dryer',
  engine: null, plant: null, flowsheetSpec: null, equipmentInfo: null, tour: null, scenarios: null,
  plannedScope: [
    'Wet feed rate, initial and target moisture content (dry basis)',
    'Drying air: flow, inlet temperature, ambient humidity, heater duty',
    'Psychrometrics: humidity ratio, wet-bulb temperature, saturation',
    'Moisture balance and constant/falling rate drying periods',
    'Energy balance, specific energy consumption, thermal efficiency',
    'Residence time and dryer loading',
    'Faults: low air flow, insufficient heating, wet feed surge, high ambient humidity'
  ]
};
