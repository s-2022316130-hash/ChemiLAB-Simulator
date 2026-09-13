/**
 * 02 — INDUSTRIAL DRYER
 * Status: complete. Engine, plant, flowsheet, equipment information, guided
 * tour and scenarios are all implemented and wired.
 *
 * Direct-fired co-current rotary drum dryer with a cyclone and a bag filter on
 * the exhaust: psychrometrics, the moisture and enthalpy balances solved
 * together, constant and falling rate drying, residence time and drum loading,
 * entrainment and gas cleaning, and the thermal performance.
 *
 * Equipment tags and stream ids are declared once in engine.js and imported by
 * plant.js and flowsheet.js, so the 3D group, the flowsheet node and the engine
 * key are the same string and selection sync cannot drift.
 */
import engine from './engine.js';
import plant from './plant.js';
import { FLOWSHEET } from './flowsheet.js';
import { EQUIPMENT } from './equipment.js';
import { TOUR } from './tour.js';
import { SCENARIOS } from './scenarios.js';

export default {
  id: 'industrial-dryer',
  name: 'Industrial Dryer',
  engine,
  plant,
  flowsheetSpec: FLOWSHEET,
  equipmentInfo: EQUIPMENT,
  tour: TOUR,
  scenarios: SCENARIOS
};
