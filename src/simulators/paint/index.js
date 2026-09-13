/**
 * 04 — Paint Manufacturing Plant
 * Status: route registered, process model not implemented.
 * Do not start this simulator until the previous one is functionally complete.
 */
export default {
  id: 'paint',
  name: 'Paint Manufacturing Plant',
  engine: null, plant: null, flowsheetSpec: null, equipmentInfo: null, tour: null, scenarios: null,
  plannedScope: [
    'Batch recipe: resin, pigment, solvent, additives',
    'High-speed dispersion: tip speed, dispersion energy, fineness of grind',
    'Bead mill pass and residence time',
    'Let-down and viscosity adjustment; shear-thinning rheology',
    'Batch mass balance, pigment volume concentration, solids content',
    'Quality: viscosity, gloss proxy, colour strength, fineness spec',
    'Faults: poor mixing, over-thinning, pigment agglomeration, wrong let-down order'
  ]
};
