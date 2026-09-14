/**
 * 04 — PAINT MANUFACTURING PLANT
 * Status: complete. Engine, plant, flowsheet, equipment information, guided
 * tour and scenarios are all implemented and wired.
 *
 * The first batch process in the set, and a different kind of problem from the
 * three before it. There is no steady state to find: a charge is made up, work
 * is put into it for a period, and what comes out is judged against a
 * specification. The number that decides almost everything is a ratio — the
 * pigment volume concentration against its critical value — because that is
 * where there stops being enough binder to fill the space between the pigment
 * particles, and gloss, opacity, permeability and durability all turn there.
 *
 * The second idea is that dispersion is not mixing. Breaking a pigment
 * agglomerate needs a hydrodynamic stress above its cohesive strength; below
 * that the blade can turn for an hour and change nothing.
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
  id: 'paint',
  name: 'Paint Manufacturing Plant',
  engine,
  plant,
  flowsheetSpec: FLOWSHEET,
  equipmentInfo: EQUIPMENT,
  tour: TOUR,
  scenarios: SCENARIOS
};
