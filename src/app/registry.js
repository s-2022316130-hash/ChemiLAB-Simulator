/**
 * Simulator registry. Modules are lazily imported so an unfinished simulator
 * never costs the rest of the application anything.
 * Build order is fixed: finish one simulator before starting the next.
 *
 * `category` is the branch of the discipline the unit belongs to. It is here
 * rather than in the engine because it is a way of organising the library for
 * someone choosing what to open, not a property of the process model.
 */
export const SIMULATORS = [
  { id: 'water-treatment', number: '01', name: 'Water Treatment Plant',
    category: 'Separation · Physical chemistry',
    tagline: 'Coagulation, flocculation, sedimentation, filtration, disinfection',
    counts: { units: 16, faults: 6, challenges: 3, tourSteps: 8 },
    state: 'complete', load: () => import('../simulators/water-treatment/index.js') },
  { id: 'industrial-dryer', number: '02', name: 'Industrial Dryer',
    category: 'Heat and mass transfer',
    tagline: 'Convective drying, humidity and moisture balances, thermal efficiency',
    counts: { units: 13, faults: 6, challenges: 3, tourSteps: 8 },
    state: 'complete', load: () => import('../simulators/industrial-dryer/index.js') },
  { id: 'fertilizer', number: '03', name: 'Ammonia–Urea Fertilizer Plant',
    category: 'Reaction engineering · Recycle',
    tagline: 'Synthesis loop, conversion, recycle, urea reaction and prilling',
    counts: { units: 16, faults: 6, challenges: 3, tourSteps: 8 },
    state: 'complete', load: () => import('../simulators/fertilizer/index.js') },
  { id: 'paint', number: '04', name: 'Paint Manufacturing Plant',
    category: 'Batch processing · Rheology',
    tagline: 'Dispersion, milling, let-down, rheology and batch quality',
    counts: { units: 14, faults: 6, challenges: 3, tourSteps: 8 },
    state: 'complete', load: () => import('../simulators/paint/index.js') },
  { id: 'gas-processing', number: '05', name: 'Natural Gas Processing Plant',
    category: 'Separation · Cryogenics',
    tagline: 'Separation, dehydration, sweetening, NGL recovery, sales-gas spec',
    counts: { units: 16, faults: 6, challenges: 3, tourSteps: 8 },
    state: 'complete', load: () => import('../simulators/gas-processing/index.js') }
];
/**
 * Totals across the library, for the overview. They are counted from the
 * declarations above rather than by loading five engines to ask them, which
 * would undo the code splitting for the sake of four numbers on a page.
 *
 * The declarations cannot drift: scripts/verify.mjs loads every module and
 * fails if any count here disagrees with what the simulator actually has.
 */
export const TOTALS = SIMULATORS.reduce((t, s) => ({
  simulators: t.simulators + 1,
  units: t.units + (s.counts?.units || 0),
  faults: t.faults + (s.counts?.faults || 0),
  challenges: t.challenges + (s.counts?.challenges || 0),
  tourSteps: t.tourSteps + (s.counts?.tourSteps || 0)
}), { simulators: 0, units: 0, faults: 0, challenges: 0, tourSteps: 0 });

export const getSimulator = id => SIMULATORS.find(s => s.id === id) || null;
export const STATE_LABEL = { complete: 'Operational', scaffold: 'Framework ready', planned: 'Planned' };
