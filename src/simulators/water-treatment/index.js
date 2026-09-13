/**
 * 01 — WATER TREATMENT PLANT
 * Status: framework wired, process model NOT yet implemented.
 *
 * Set `engine` to the real engine (./engine.js) once it satisfies the contract in
 * src/simulation/contract.js. Until then the route renders the honest placeholder
 * instead of a dashboard full of invented numbers.
 */
export default {
  id: 'water-treatment',
  name: 'Water Treatment Plant',
  engine: null,          // -> import engine from './engine.js'
  plant: null,           // -> import plant from './plant.js'
  flowsheetSpec: null,   // -> import { FLOWSHEET } from './flowsheet.js'
  equipmentInfo: null,   // -> import { EQUIPMENT } from './equipment.js'
  tour: null,            // -> import { TOUR } from './tour.js'
  scenarios: null,       // -> import { SCENARIOS } from './scenarios.js'
  plannedScope: [
    'Raw water feed: flow, turbidity, alkalinity, temperature, pH',
    'Rapid mix and coagulation: coagulant dose, G value, mixing time',
    'Flocculation: tapered G, residence time, floc growth model',
    'Sedimentation: overflow rate, surface loading, removal efficiency correlation',
    'Rapid sand filtration: filtration rate, headloss build-up, backwash trigger',
    'Disinfection: chlorine demand, residual, CT value against a target log removal',
    'Sludge production balance and backwash water recovery',
    'Faults: coagulant underdose, short-circuiting, blocked filter, pump failure, turbidity spike'
  ]
};
