import { el, clear } from '../shared/dom.js';
import { panel, kv, collapsible, message } from '../shared/components/panel.js';
import { val, num, isEmpty } from '../shared/format.js';
import { Status } from '../simulation/contract.js';
import { lineChart, barChart, gauge } from '../shared/components/charts.js';
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
  const host = el('div');
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
    host.append(
      kpiBlock(r.kpis || []),
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

function kpiBlock(kpis) {
  if (!kpis.length) return null;
  return el('div', { class: 'kpis' }, kpis.map((k, i) => kpiCard(k, i === 0)));
}

/** A headline number reads as a card; the lead one reads as the answer. */
function kpiCard(k, lead) {
  const empty = isEmpty(k.value);
  const node = el('div', {
    class: 'kpi',
    dataset: { empty: String(empty), lead: String(!!lead) },
    style: `animation-delay:${lead ? 0 : 30}ms`,
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

  const closures = entries.filter(([k]) => /closure/i.test(k));
  const rest = entries.filter(([k]) => !/closure/i.test(k));

  const body = [
    ...closures.map(([, f]) => closureBlock(f)),
    ...rest.map(([k, f]) => row(k, f))
  ];
  if (closures.length) {
    body.push(el('div', {
      style: 'margin-top:6px;font-size:var(--t-fine);color:var(--ink-ghost);line-height:1.45',
      text: `The bar is scaled to ${CLOSURE_SCALE_PCT} % of throughput — a scale for reading the number, not a tolerance. Convergence is decided by the solver.`
    }));
  }
  return collapsible(title, body, true);
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

function solverSection(r) {
  return collapsible('Solver', [
    kv('Converged', r.converged ? 'yes' : 'no'),
    kv('Iterations', isEmpty(r.iterations) ? '—' : String(r.iterations)),
    kv('Residual', isEmpty(r.residual) ? '—' : r.residual.toExponential(2))
  ]);
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
