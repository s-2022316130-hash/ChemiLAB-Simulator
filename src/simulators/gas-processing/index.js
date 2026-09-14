/**
 * 05 — NATURAL GAS PROCESSING PLANT
 * Status: complete. Engine, plant, flowsheet, equipment information, guided
 * tour and scenarios are all implemented and wired.
 *
 * The whole train from wellhead to pipeline: inlet separation, amine
 * sweetening, glycol dehydration, cryogenic liquids recovery behind a
 * turboexpander, and recompression to sales pressure.
 *
 * Three ideas run through it. A gas plant is a sequence of specifications
 * rather than a sequence of units — nothing here was built because it was
 * interesting. Three of the four separation steps are the same calculation,
 * because Kremser's absorption factor governs the amine contactor, the glycol
 * contactor and the demethaniser alike. And the cold that condenses the liquids
 * is bought with a pressure drop the plant then has to pay back, which is where
 * the whole economics of liquids recovery sits.
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
  id: 'gas-processing',
  name: 'Natural Gas Processing Plant',
  engine,
  plant,
  flowsheetSpec: FLOWSHEET,
  equipmentInfo: EQUIPMENT,
  tour: TOUR,
  scenarios: SCENARIOS
};
