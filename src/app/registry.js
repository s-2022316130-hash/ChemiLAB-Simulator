/**
 * Simulator registry. Modules are lazily imported so an unfinished simulator
 * never costs the rest of the application anything.
 * Build order is fixed: finish one simulator before starting the next.
 */
export const SIMULATORS = [
  { id: 'water-treatment', number: '01', name: 'Water Treatment Plant',
    tagline: 'Coagulation, flocculation, sedimentation, filtration, disinfection',
    state: 'complete', load: () => import('../simulators/water-treatment/index.js') },
  { id: 'industrial-dryer', number: '02', name: 'Industrial Dryer',
    tagline: 'Convective drying, humidity and moisture balances, thermal efficiency',
    state: 'complete', load: () => import('../simulators/industrial-dryer/index.js') },
  { id: 'fertilizer', number: '03', name: 'Ammonia–Urea Fertilizer Plant',
    tagline: 'Synthesis loop, conversion, recycle, urea reaction and prilling',
    state: 'complete', load: () => import('../simulators/fertilizer/index.js') },
  { id: 'paint', number: '04', name: 'Paint Manufacturing Plant',
    tagline: 'Dispersion, milling, let-down, rheology and batch quality',
    state: 'planned', load: () => import('../simulators/paint/index.js') },
  { id: 'gas-processing', number: '05', name: 'Natural Gas Processing Plant',
    tagline: 'Separation, dehydration, sweetening, NGL recovery, sales-gas spec',
    state: 'planned', load: () => import('../simulators/gas-processing/index.js') }
];
export const getSimulator = id => SIMULATORS.find(s => s.id === id) || null;
export const STATE_LABEL = { complete: 'Complete', scaffold: 'Framework ready', planned: 'Planned' };
