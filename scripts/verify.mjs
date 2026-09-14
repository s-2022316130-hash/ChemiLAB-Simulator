/**
 * Structural and behavioural verification for every simulator in the registry.
 * Run with: npm run verify  — or  node scripts/verify.mjs [simulatorId]
 */
import { gradeChallenge } from '../src/simulation/scenarios.js';
import { SIMULATORS } from '../src/app/registry.js';
import { validate as validateSpec } from '../src/shared/validation.js';

const MODULES = {
  'water-treatment': () => import('../src/simulators/water-treatment/index.js'),
  'industrial-dryer': () => import('../src/simulators/industrial-dryer/index.js'),
  fertilizer: () => import('../src/simulators/fertilizer/index.js'),
  paint: () => import('../src/simulators/paint/index.js'),
  'gas-processing': () => import('../src/simulators/gas-processing/index.js')
};
const only = process.argv[2];
const ids = only ? [only] : Object.keys(MODULES);
const FUZZ = Number(process.env.FUZZ || 20000);
let failures = 0;

const CARD_FIELDS = ['tag', 'name', 'type', 'purpose', 'howItWorks', 'whyUsed', 'inputs', 'outputs',
  'operatingVariables', 'designVariables', 'misoperation', 'theory', 'equations', 'practice',
  'safety', 'troubleshooting'];

for (const id of ids) {
  const sim = (await MODULES[id]()).default;
  const { engine, plant, flowsheetSpec: fs, equipmentInfo: eqInfo, tour, scenarios } = sim;
  const fail = [];
  const ok = m => console.log('  ok   ' + m);
  const bad = m => { fail.push(m); console.log('  FAIL ' + m); };
  console.log('\n==================== ' + id + ' ====================');

  if (!engine) { bad('no engine'); continue; }
  const d = Object.fromEntries(Object.entries(engine.inputSpec).map(([k, v]) => [k, v.default]));

  // --- identity ------------------------------------------------------------
  const tags = Object.values(engine.TAGS), streams = Object.values(engine.STREAMS);
  const nodes = fs.nodes.map(n => n.tag), edges = fs.edges.map(e => e.id);
  new Set(tags).size === tags.length ? ok(tags.length + ' unique tags') : bad('duplicate tags');
  new Set(streams).size === streams.length ? ok(streams.length + ' unique stream ids') : bad('duplicate streams');
  tags.every(t => nodes.includes(t)) ? ok('every tag has a flowsheet node') : bad('tags without a node: ' + tags.filter(t => !nodes.includes(t)));
  nodes.every(t => tags.includes(t)) ? ok('every node is a real tag') : bad('nodes without a tag: ' + nodes.filter(t => !tags.includes(t)));
  streams.every(s => edges.includes(s)) ? ok('every stream has an edge') : bad('streams without an edge: ' + streams.filter(s => !edges.includes(s)));
  edges.every(s => streams.includes(s)) ? ok('every edge is a real stream') : bad('edges without a stream: ' + edges.filter(s => !streams.includes(s)));
  tags.every(t => eqInfo[t]) ? ok('every tag has an equipment card') : bad('tags without a card: ' + tags.filter(t => !eqInfo[t]));
  const thin = Object.entries(eqInfo).filter(e => CARD_FIELDS.some(f => e[1][f] === undefined || (Array.isArray(e[1][f]) && !e[1][f].length)));
  thin.length === 0 ? ok('every card is complete') : bad('incomplete cards: ' + thin.map(e => e[0]));
  tour.every(s => !s.tag || tags.includes(s.tag)) ? ok('every tour step points at a real tag') : bad('tour steps with a bad tag');
  scenarios.faults.every(f => tags.includes(f.appliesTo)) ? ok('every fault points at a real tag') : bad('faults with a bad tag');
  scenarios.faults.every(f => engine.FAULT_IDS.includes(f.id)) ? ok('every fault is implemented') : bad('undeclared faults');

  // --- registry ------------------------------------------------------------
  // The overview counts tagged units, faults, challenges and tour steps across
  // the whole library, and it does so from the registry rather than by loading
  // five engines to ask them. That means the registry holds four numbers that
  // could quietly stop being true, so they are checked here instead.
  const entry = SIMULATORS.find(x => x.id === id);
  if (!entry) bad('not in the registry');
  else {
    const actual = {
      units: tags.length,
      faults: scenarios.faults.length,
      challenges: scenarios.challenges.length,
      tourSteps: tour.length
    };
    const wrong = Object.entries(actual)
      .filter(([k, v]) => (entry.counts?.[k] ?? null) !== v)
      .map(([k, v]) => k + ' declared ' + (entry.counts?.[k] ?? '—') + ', actually ' + v);
    wrong.length === 0
      ? ok('registry counts match: ' + Object.entries(actual).map(e => e.join(' ')).join(', '))
      : bad('registry counts out of date — ' + wrong.join('; '));
  }
  // Flowsheet geometry.
  let close = 0;
  for (let i = 0; i < fs.nodes.length; i++) for (let j = i + 1; j < fs.nodes.length; j++) {
    const a = fs.nodes[i], b = fs.nodes[j];
    if (Math.abs(a.x - b.x) < 78 && Math.abs(a.y - b.y) < 78) { console.log('       close: ' + a.tag + ' / ' + b.tag); close++; }
  }
  close === 0 ? ok('no flowsheet nodes overlap') : bad(close + ' overlapping node pairs');
  const offCanvas = fs.nodes.filter(n => n.x < 36 || n.x > fs.width - 36 || n.y < 36 || n.y > fs.height - 36);
  offCanvas.length === 0 ? ok('every node is inside the canvas') : bad('off canvas: ' + offCanvas.map(n => n.tag));

  // --- contract ------------------------------------------------------------
  for (const m of ['id', 'modelVersion', 'inputSpec', 'assumptions', 'equations', 'validate',
    'getInitialState', 'run', 'getDiagnostics', 'getEquipmentState', 'getStreams', 'getSteps']) {
    if (engine[m] === undefined) bad('missing contract member ' + m);
  }
  const base = engine.run(d, {});
  base.status !== 'ERROR' ? ok('base case ' + base.status) : bad('base case ERROR: ' + base.diagnostics.find(x => x.level === 'error')?.text.slice(0, 90));
  if (base.status !== 'ERROR') {
    Object.keys(engine.getEquipmentState(base)).length === tags.length ? ok('equipment state covers every tag') : bad('equipment state incomplete');
    engine.getStreams(base).length === streams.length ? ok('stream state covers every stream') : bad('stream state incomplete');
    engine.getSteps(base).length >= 6 ? ok(engine.getSteps(base).length + ' calculation steps') : bad('too few steps');
    base.converged ? ok('base case converged') : bad('base case not converged');
  }
  engine.assumptions.length >= 12 ? ok(engine.assumptions.length + ' assumptions') : bad('too few assumptions');
  engine.equations.length >= 5 ? ok(engine.equations.length + ' equations') : bad('too few equations');

  // --- initial state -------------------------------------------------------
  const init = engine.getInitialState(d);
  init.status === 'READY' && !init.converged ? ok('initial state READY, not converged') : bad('initial state wrong');
  init.kpis.every(k => k.value === null) ? ok('every initial KPI is null') : bad('a KPI leaks a value');
  const leak = Object.entries(init.results).filter(e => e[1].value !== null && e[1].kind !== 'Educational reference value');
  leak.length === 0 ? ok('no calculated field leaks before a run') : bad('leaking: ' + leak.map(e => e[0]));
  !gradeChallenge(scenarios.challenges[0], init).graded ? ok('challenges ungraded before a run') : bad('a challenge graded an empty result');

  // --- challenges ----------------------------------------------------------
  for (const c of scenarios.challenges) {
    const g = gradeChallenge(c, base);
    console.log('       ' + c.id.padEnd(18) + (g.graded ? (g.pass ? 'PASS' : 'fail') : 'UNGRADED') + '  ' + g.text);
    if (!g.graded && base.status !== 'ERROR') bad('challenge ' + c.id + ' not graded by the base case');
  }

  // --- fuzz ----------------------------------------------------------------
  const spec = engine.inputSpec, keys = Object.keys(spec);
  let n = 0, errs = 0, warns = 0, comps = 0, thrown = 0, badConv = 0, nan = 0;
  const rnd = (lo, hi) => lo + Math.random() * (hi - lo);
  for (let i = 0; i < FUZZ; i++) {
    const x = {};
    for (const k of keys) x[k] = rnd(spec[k].min, spec[k].max);
    const faults = engine.FAULT_IDS.filter(() => Math.random() < 0.12);
    if (!engine.validate(x).ok) continue;
    n++;
    try {
      const r = engine.run(x, { faults });
      if (r.status === 'ERROR') errs++; else if (r.status === 'WARNING') warns++; else comps++;
      if (r.status !== 'ERROR') {
        if (!r.converged) badConv++;
        for (const sec of ['results', 'quality', 'massBalance', 'energyBalance']) {
          for (const kk of Object.keys(r[sec] || {})) {
            const f = r[sec][kk];
            if (f.value !== null && !Number.isFinite(f.value)) { if (nan < 4) console.log('       non-finite ' + sec + '.' + kk); nan++; }
          }
        }
        for (const s of r.streams) if (!Number.isFinite(s.flow) || s.flow < 0) { if (nan < 4) console.log('       bad flow ' + s.id); nan++; }
        for (const [tag, st] of Object.entries(r.equipment)) {
          for (const v of Object.values(st.values || {})) if (typeof v !== 'string') { if (nan < 4) console.log('       non-string equipment value on ' + tag); nan++; }
        }
      }
    } catch (e) { thrown++; if (thrown < 3) console.log('       THROW ' + e.message); }
  }
  console.log('       ' + n + ' valid cases: ' + comps + ' complete, ' + warns + ' warning, ' + errs + ' error');
  thrown === 0 ? ok('nothing thrown in ' + n + ' cases') : bad(thrown + ' cases threw');
  nan === 0 ? ok('no non-finite or malformed value') : bad(nan + ' malformed values');
  badConv === 0 ? ok('no result reported without convergence') : bad(badConv + ' unconverged results reported');

  // --- neighbourhood -------------------------------------------------------
  let nbErr = 0, nbTot = 0;
  for (const k of keys) for (const f of [0.6, 0.8, 1.2, 1.4]) {
    const v = Math.min(Math.max(d[k] * f, spec[k].min), spec[k].max);
    const patched = { ...d, [k]: v };
    if (!engine.validate(patched).ok) continue;
    nbTot++;
    const r = engine.run(patched, {});
    if (r.status === 'ERROR') {
      nbErr++;
      console.log('       ' + k + '=' + v.toFixed(2) + ' -> ' + (r.diagnostics.find(x => x.level === 'error')?.text.slice(0, 86) || 'ERROR'));
    }
  }
  console.log('       ' + (nbTot - nbErr) + ' of ' + nbTot + ' neighbours solve');

  console.log(fail.length ? '  >>> ' + fail.length + ' FAILURES' : '  >>> all checks passed');
  failures += fail.length;
}

console.log(failures ? '\nTOTAL FAILURES: ' + failures : '\nAll simulators passed.');
process.exit(failures ? 1 : 0);
