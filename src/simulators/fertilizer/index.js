/**
 * 03 — AMMONIA–UREA FERTILIZER PLANT
 * Status: complete. Engine, plant, flowsheet, equipment information, guided
 * tour and scenarios are all implemented and wired.
 *
 * Two coupled recycle loops: a Haber–Bosch synthesis loop making ammonia, and a
 * total-recycle urea loop making and finishing the fertilizer. Both teach the
 * same lesson — overall conversion is set by recovery rather than by what the
 * reactor manages on one pass — and each is limited by what has to be bled out
 * of it: inerts on the ammonia side, water on the urea side.
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
  id: 'fertilizer',
  name: 'Ammonia–Urea Fertilizer Plant',
  engine,
  plant,
  flowsheetSpec: FLOWSHEET,
  equipmentInfo: EQUIPMENT,
  tour: TOUR,
  scenarios: SCENARIOS
};
