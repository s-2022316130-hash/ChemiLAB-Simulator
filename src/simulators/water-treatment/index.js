/**
 * 01 — WATER TREATMENT PLANT
 * Status: complete. Engine, plant, flowsheet, equipment information, guided
 * tour and scenarios are all implemented and wired.
 *
 * Conventional surface water treatment: coagulation, flocculation,
 * sedimentation, rapid gravity filtration and free chlorine disinfection, with
 * the backwash washwater recovery recycle closed by the shared solver.
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
  id: 'water-treatment',
  name: 'Water Treatment Plant',
  engine,
  plant,
  flowsheetSpec: FLOWSHEET,
  equipmentInfo: EQUIPMENT,
  tour: TOUR,
  scenarios: SCENARIOS
};
