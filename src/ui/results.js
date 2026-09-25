import { el, clear } from '../shared/dom.js';
import { panel, kv, collapsible, message } from '../shared/components/panel.js';
import { val, num, isEmpty } from '../shared/format.js';
import { Status } from '../simulation/contract.js';
import { lineChart, barChart, gauge, residualChart } from '../shared/components/charts.js';
import { icon } from '../shared/icons.js';

/**
 * Results rail — the analysis side of the workspace.
 *
 * Before a successful run every calculated field shows an em dash. The rail
 * never fills itself with plausible-looking numbers, and a failed run clears
 * the previous one rather than leaving it on screen looking current.
 *
 * The hierarchy is deliberate and it is the main thing this file does. Not
 * every number can be the most important one:
 *
 *   1  status — did it solve, and is what I am looking at still the case
 *   2  anything wrong — warnings and errors, before the numbers they concern
 *   3  the lead reading, at twice the size of everything else
 *   4  the other headline readings
 *   5  process results, balances, quality — on demand, in sections
 *   6  the solver's own account of itself, and the calculation trace
 *
 * A closure error gets its own treatment rather than sitting in a list of
 * forty rows, because whether a balance closed is not the same kind of fact as
 * what the forty rows say.
 */

/** How far from closed a balance can be before the bar reads as a problem.
 *  This is a *display* scale for the bar, not a model tolerance: the engine
 *  decides convergence, and it reports the closure error itself. */
const CLOSURE_SCALE_PCT = 0.1;

export function createResults(engine, store) {
  const host = el('div', { class: 'rail-body' });
  // Movement on this rail means one thing: a new answer arrived. The rail is
  // redrawn for other reasons too — the detail level changes, the inputs go
  // stale — and replaying the arrival every time would teach the reader that
  // motion here means nothing. So the last result drawn is remembered, and
  // only a different one animates.
  let lastDrawn = null;
  // What each headline reading showed last time, as it was displayed. Compared
  // as the formatted string rather than the raw number: a reading that moved
  // in the ninth decimal place and still shows the same digits has not changed
  // for anyone looking at it, and pulsing it would say otherwise.
  let lastShown = new Map();
  // "Fresh" means not yet painted, not "first time drawn". A result arriving
  // sets `dirty` back to false straight afterwards, which redraws this rail a
  // second time in the same task, before anything reaches the screen — and a
  // test of "have I drawn this before" would call that second draw stale and
  // throw the arrival away unseen. So the arrival holds until a frame has
  // actually been painted with it.
  let arrivalChanged = new Set();
  let painted = true;
  const statusEl = el('span', { class: 'status', dataset: { s: 'READY' }, text: 'READY' });
  const p = panel({ title: 'Results', right: statusEl, body: [host] });

  function render() {
    const { result, status, messages, dirty } = store.get();
    statusEl.dataset.s = status;
    statusEl.textContent = status;
    clear(host);

    const usable = status === Status.COMPLETE || status === Status.WARNING;
    const busy = status === Status.CALCULATING || status === Status.CONVERGING;

    if (busy) {
      host.append(
        el('div', { class: 'working' }, [el('i')]),
        el('div', { class: 'empty' }, [
          el('div', { class: 'glyph', html: icon('gauge') }),
          el('b', { text: 'Solving' }),
          el('p', { text: 'Closing the balances and iterating to tolerance.' })
        ])
      );
      return;
    }

    // Anything wrong comes before the numbers it is about.
    if (messages?.length) host.append(...messages.slice(0, 6).map(m => message(m.level, m.text)));

    if (!usable) {
      host.appendChild(status === Status.ERROR ? errorState(result) : readyState(result));
      return;
    }

    // A result that no longer describes the inputs on screen says so at the
    // top, where it will be read before the numbers under it are trusted.
    if (dirty) {
      host.appendChild(message('info', 'The inputs have changed since this was calculated. These numbers describe the previous case.'));
    }

    const r = result;
    if (r !== lastDrawn) {
      const shown = new Map((r.kpis || []).map(k => [k.label, shownValue(k)]));
      arrivalChanged = new Set();
      // Nothing is "changed" on the first result there is: there is nothing it
      // changed from.
      if (lastDrawn) for (const [label, s] of shown) if (lastShown.has(label) && lastShown.get(label) !== s) arrivalChanged.add(label);
      lastShown = shown;
      lastDrawn = r;
      painted = false;
      requestAnimationFrame(() => { painted = true; });
    }
    const fresh = !painted;
    const changed = fresh ? arrivalChanged : new Set();
    host.dataset.fresh = String(fresh);
    host.append(
      kpiBlock(r.kpis || [], changed),
      section('Process results', r.results),
      balanceSection('Mass balance', r.massBalance),
      balanceSection('Energy balance', r.energyBalance),
      section('Quality against specification', r.quality),
      r.charts?.length ? collapsible('Trends and profiles', r.charts.map(chartBlock)) : null,
      solverSection(r),
      r.steps?.length ? collapsible('Show the calculation', r.steps.map(stepBlock)) : null
    );
  }

  store.subKeys(['result', 'status', 'messages', 'level', 'dirty'], render);
  return p;
}

/* --- blocks ---------------------------------------------------------------- */

function kpiBlock(kpis, changed = new Set()) {
  if (!kpis.length) return null;
  return el('div', { class: 'kpis' }, kpis.map((k, i) => kpiCard(k, i === 0, i, changed.has(k.label))));
}

/** A reading as it appears on the card, for telling whether it changed. */
const shownValue = k => (isEmpty(k.value) ? '—' : num(k.value, k.digits ?? 2));

/** A headline number reads as a card; the lead one reads as the answer. */
function kpiCard(k, lead, index = 0, changed = false) {
  const empty = isEmpty(k.value);
  const node = el('div', {
    class: 'kpi',
    // `changed` marks a reading whose displayed value is different from the
    // previous run. It is a pulse, not a count-up: animating the number from the
    // old value to the new one would put on screen, for half a second, a series
    // of values no engine ever calculated.
    dataset: { empty: String(empty), lead: String(!!lead), changed: String(!!changed) },
    style: `--i:${index}`,
    title: k.label
  }, [
    el('span', { class: 'kpi-l', text: k.label }),
    el('div', {}, [
      el('span', { class: 'kpi-v', text: empty ? '—' : num(k.value, k.digits ?? 2) }),
      !empty && k.unit ? el('span', { class: 'kpi-u', text: k.unit }) : null
    ].filter(Boolean))
  ]);
  // A verdict the engine reported, shown as a coloured edge rather than as a
  // word appended to the label.
  if (k.pass === true || k.pass === false) node.dataset.verdict = k.pass ? 'pass' : 'fail';
  return node;
}

/** A plain section of readings, open by default. */
function section(title, fields) {
  const rows = Object.entries(fields || {}).map(([k, v]) => row(k, v));
  return collapsible(title, rows.length ? rows : [notCalculated()], true);
}

/**
 * A balance section. Closure is lifted out of the list: whether the balance
 * closed is the question the section exists to answer, and burying it between
 * "Total in" and "Carbon in" answers it only to whoever already knew to look.
 */
function balanceSection(title, fields) {
  const entries = Object.entries(fields || {});
  if (!entries.length) return collapsible(title, [notCalculated()], true);

  // Engines that have not been told about families fall back to the flat list
  // this section has always drawn. Nothing here invents a grouping.
  const tagged = entries.filter(([, f]) => f.family && f.side);
  if (!tagged.length) {
    const closures = entries.filter(([k]) => /closure/i.test(k));
    const rest = entries.filter(([k]) => !/closure/i.test(k));
    const body = [...closures.map(([, f]) => closureBlock(f)), ...rest.map(([k, f]) => row(k, f))];
    if (closures.length) body.push(closureNote());
    return collapsible(title, body, true);
  }

  // Several balances can live in one object — a solids balance and a water
  // balance are two different questions asked of the same plant — and until the
  // engines said so they were interleaved in one list with nothing to mark
  // where one ended. Grouped, each is readable on its own; ungrouped, neither
  // was.
  const families = [];
  for (const [k, f] of entries) {
    const fam = f.family || '';
    let g = families.find(x => x.id === fam);
    if (!g) families.push(g = { id: fam, rows: [], closures: [] });
    (f.side === 'closure' ? g.closures : g.rows).push([k, f]);
  }

  const multi = families.length > 1;
  const body = [];
  let anyClosure = false;
  for (const g of families) {
    if (multi) body.push(el('div', { class: 'bal-fam', text: famLabel(g.id) }));
    for (const [, f] of g.closures) { body.push(closureBlock(f)); anyClosure = true; }

    // Rows in the order the engine listed them, with a heading each time the
    // direction changes. The engine already orders them in reading order — in,
    // its total, out, its total — so following that beats re-sorting into an
    // order nobody wrote.
    //
    // Headings only where there are two sides to tell apart. A group that is
    // only a feed broken into its components has nothing to separate, and an
    // "In" over it would be labelling a distinction that is not being made —
    // worse than no label, because the next row down would look like it was
    // being claimed as an inlet.
    const sided = g.rows.some(([, f]) => f.side === 'in') && g.rows.some(([, f]) => f.side === 'out');
    let side = null;
    for (const [k, f] of g.rows) {
      if (sided && (f.side === 'in' || f.side === 'out') && f.side !== side) {
        side = f.side;
        body.push(el('div', { class: 'bal-side', text: side === 'in' ? 'In' : 'Out' }));
      }
      body.push(balRow(k, f));
    }
  }
  if (anyClosure) body.push(closureNote());
  return collapsible(title, body, true);
}

const famLabel = id => (id ? id.charAt(0).toUpperCase() + id.slice(1) : 'Balance');

const closureNote = () => el('div', {
  class: 'bal-note',
  text: `The bar is scaled to ${CLOSURE_SCALE_PCT} % of throughput — a scale for reading the number, not a tolerance. Convergence is decided by the solver.`
});

/**
 * One line of a balance: what it is, how much, and how much of the whole.
 *
 * The percentage is the column that makes a balance readable. "34.45 kg/h to
 * clarifier sludge" means nothing on its own; "85 % of the solids charged"
 * means the clarifier is doing its job, and the reader gets there without
 * dividing two numbers four rows apart. The engine works the share out — a row
 * as a fraction of the charge is a process quantity, and this file does not
 * compute those.
 *
 * The chip carries the colour of the phase the quantity travels in, the same
 * colours the flowsheet and the 3D streams use. It is the cheapest possible
 * link between a number on the rail and a pipe on the drawing.
 */
function balRow(key, f) {
  const empty = isEmpty(f.value);
  return el('div', {
    class: 'balrow', dataset: { side: f.side || '', ctx: String(f.side === 'context') },
    title: f.label || key
  }, [
    el('i', { class: 'bal-chip', style: f.phase ? `background:var(--stream-${f.phase})` : '' }),
    el('span', { class: 'bal-l', text: f.label || key }),
    el('span', { class: 'bal-v', text: empty ? '—' : val(f.value, f.unit, f.digits ?? 2) }),
    el('span', {
      class: 'bal-p',
      text: isEmpty(f.share) ? '' : `${num(f.share * 100, f.share < 0.001 && f.share > 0 ? 3 : 1)} %`
    })
  ]);
}

function closureBlock(f) {
  const empty = isEmpty(f.value);
  const mag = empty ? 0 : Math.abs(f.value);
  const frac = Math.min(mag / CLOSURE_SCALE_PCT, 1) * 100;
  return el('div', {
    class: 'closure',
    dataset: { over: String(mag > CLOSURE_SCALE_PCT) },
    style: `--closure:${empty ? 0 : Math.max(frac, mag > 0 ? 2 : 0)}%`
  }, [
    el('div', { class: 'closure-h' }, [
      el('span', { text: f.label || 'Closure error' }),
      el('span', { text: empty ? '—' : val(f.value, f.unit, f.digits ?? 6) })
    ]),
    el('div', { class: 'bar' }, [el('i')])
  ]);
}

function row(key, f) {
  const node = kv(f.label || key, isEmpty(f.value) ? '—' : val(f.value, f.unit, f.digits ?? 2));
  if (f.pass === true || f.pass === false) {
    node.dataset.verdict = f.pass ? 'pass' : 'fail';
    node.querySelector('.v')?.setAttribute('title', f.pass ? 'On specification' : 'Off specification');
  }
  return node;
}

/**
 * What the solver actually did, and whether to believe the numbers above it.
 *
 * "Converged: yes" in a row of key–values is a fact nobody reads. The same fact
 * as a verdict, in the colour of its own status, with a sentence saying what
 * convergence did and did not establish, is the difference between a panel that
 * reports and a panel that tells you where you stand. A run that did not
 * converge is the single most important thing on this rail, so it is the one
 * thing here that is allowed to be loud.
 */
function solverSection(r) {
  const ok = r.converged === true;
  const traces = r.convergence || [];
  return collapsible('Run state', [
    el('div', { class: 'msg', dataset: { lvl: ok ? 'ok' : 'warning' } }, [
      el('strong', { text: ok ? 'Converged. ' : 'Did not converge. ' }),
      document.createTextNode(ok
        ? 'The solver met its tolerance, so the balances below close on the model’s own terms.'
        : 'The solver stopped before it met its tolerance. Treat every figure above as indicative only.')
    ]),
    kv('Iterations', isEmpty(r.iterations) ? '—' : String(r.iterations)),
    kv('Residual', isEmpty(r.residual) ? '—' : r.residual.toExponential(2)),
    kv('Solve time', isEmpty(r.solveMs) ? '—' : fmtMs(r.solveMs)),
    ...traces.map(traceBlock)
  ]);
}

/**
 * One solve, drawn.
 *
 * A residual is a verdict; a residual per iteration is the working, and they
 * answer different questions. Two runs can both report "converged" and have
 * arrived there completely differently — one falling straight to tolerance in a
 * dozen sweeps, the other crawling across six hundred while the inerts build up
 * against the purge. Only the second tells you the loop is nearly unstable at
 * these conditions, and only the chart tells you which one you have.
 *
 * Every trace carries its own verdict rather than borrowing the run's. A plant
 * with two flashes can have one of them stall while the other is fine, and a
 * single word at the top of the section cannot say which.
 */
function traceBlock(t) {
  const n = t.history?.length || 0;
  return el('figure', { class: 'chart trace', dataset: { ok: String(t.converged === true) } }, [
    el('figcaption', {}, [
      el('span', { text: t.label }),
      el('span', {
        class: 'trace-n',
        text: t.converged
          ? (n > 1 ? `met tolerance in ${n}` : 'no iteration needed')
          : 'stalled'
      })
    ]),
    residualChart({ history: t.history || [], tol: t.tol }),
    t.what ? el('p', { class: 'chart-note', text: t.what }) : null
  ].filter(Boolean));
}

/** Sub-millisecond solves are common here, and "0 ms" reads as "not measured". */
function fmtMs(ms) {
  if (ms >= 100) return `${Math.round(ms)} ms`;
  if (ms >= 10) return `${ms.toFixed(1)} ms`;
  return `${ms.toFixed(2)} ms`;
}

const notCalculated = () => el('div', { class: 'fallback', text: 'Not calculated' });

function readyState(result) {
  return el('div', { class: 'empty' }, [
    el('div', { class: 'glyph', html: icon('sliders') }),
    el('b', { text: 'Nothing calculated yet' }),
    el('p', { text: result?.reason || 'Set the operating conditions on the left and run the simulation.' })
  ]);
}

function errorState(result) {
  return el('div', { class: 'empty' }, [
    el('div', { class: 'glyph', html: icon('alert') }),
    el('b', { text: 'No valid solution' }),
    el('p', { text: result?.reason || 'The last calculation did not produce a valid solution. The previous result has been cleared rather than left on screen — fix the inputs above and run again.' })
  ]);
}

/**
 * A chart with the caption the engine gave it. Every chart spec carries a
 * `title` saying what it is a chart of, and until now the rail threw it away —
 * three unlabelled plots stacked in a column is a decoration, not an analysis.
 */
function chartBlock(c) {
  const body = c.type === 'bar' ? barChart(c) : c.type === 'gauge' ? gauge(c) : lineChart(c);
  return el('figure', { class: 'chart' }, [
    c.title ? el('figcaption', { text: c.title }) : null,
    body,
    c.note ? el('p', { class: 'chart-note', text: c.note }) : null
  ].filter(Boolean));
}

function stepBlock(s) {
  return el('div', { class: 'step' }, [
    el('div', { class: 'step-t', text: s.title }),
    s.equation && el('code', { class: 'eq', text: s.equation }),
    s.substitution && el('code', { class: 'sub', text: s.substitution }),
    s.result && el('div', { class: 'out', text: `→ ${s.result}` }),
    s.note && el('div', { class: 'note', text: s.note })
  ].filter(Boolean));
}
