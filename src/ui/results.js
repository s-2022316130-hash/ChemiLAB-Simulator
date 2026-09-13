import { el, clear } from '../shared/dom.js';
import { panel, kv, collapsible, message } from '../shared/components/panel.js';
import { val, isEmpty } from '../shared/format.js';
import { Status } from '../simulation/contract.js';
import { lineChart, barChart, gauge } from '../shared/components/charts.js';
/**
 * Structured results rail. Before a successful run every calculated field shows
 * an em dash — the rail never fills itself with plausible-looking numbers.
 */
export function createResults(engine, store) {
  const host = el('div');
  const statusEl = el('span', { class: 'status', dataset: { s: 'READY' }, text: 'READY' });
  const p = panel({ title: 'Results', right: statusEl, body: [host] });
  function section(title, rows) {
    return collapsible(title, rows.length ? rows : [el('div', { class: 'fallback', text: 'Not calculated' })], true);
  }
  function render() {
    const { result, status, messages } = store.get();
    statusEl.dataset.s = status; statusEl.textContent = status;
    clear(host);
    const usable = status === Status.COMPLETE || status === Status.WARNING;
    if (messages?.length) host.append(...messages.slice(0, 6).map(m => message(m.level, m.text)));
    if (!usable) {
      host.appendChild(el('div', { class: 'fallback', text: status === Status.ERROR ? 'The last calculation did not produce a valid solution. Fix the inputs and run again.' : 'Set the operating conditions and run the simulation.' }));
      return;
    }
    const r = result;
    host.append(
      section('Key performance indicators', (r.kpis || []).map(k => kv(k.label, isEmpty(k.value) ? '—' : val(k.value, k.unit, k.digits ?? 2)))),
      section('Process results', Object.entries(r.results || {}).map(([k, v]) => kv(v.label || k, isEmpty(v.value) ? '—' : val(v.value, v.unit, v.digits ?? 2)))),
      section('Mass balance', Object.entries(r.massBalance || {}).map(([k, v]) => kv(v.label || k, isEmpty(v.value) ? '—' : val(v.value, v.unit, 2)))),
      section('Energy balance', Object.entries(r.energyBalance || {}).map(([k, v]) => kv(v.label || k, isEmpty(v.value) ? '—' : val(v.value, v.unit, 2)))),
      section('Quality', Object.entries(r.quality || {}).map(([k, v]) => kv(v.label || k, isEmpty(v.value) ? '—' : val(v.value, v.unit, 2)))),
      r.charts?.length ? collapsible('Trends and profiles', r.charts.map(c =>
        c.type === 'bar' ? barChart(c) : c.type === 'gauge' ? gauge(c) : lineChart(c))) : null,
      collapsible('Solver', [
        kv('Converged', r.converged ? 'yes' : 'no'),
        kv('Iterations', isEmpty(r.iterations) ? '—' : String(r.iterations)),
        kv('Residual', isEmpty(r.residual) ? '—' : r.residual.toExponential(2))
      ]),
      r.steps?.length ? collapsible('Show calculation', r.steps.map(stepBlock)) : null
    );
  }
  store.subKeys(['result', 'status', 'messages', 'level'], render);
  return p;
}
function stepBlock(s) {
  return el('div', { style: 'margin-bottom:10px;border-left:2px solid var(--line);padding-left:8px' }, [
    el('div', { style: 'font-size:12.5px', text: s.title }),
    s.equation && el('code', { style: 'display:block;font-family:var(--mono);font-size:11.5px;color:var(--accent);white-space:pre-wrap', text: s.equation }),
    s.substitution && el('code', { style: 'display:block;font-family:var(--mono);font-size:11.5px;color:var(--ink-dim);white-space:pre-wrap', text: s.substitution }),
    s.result && el('div', { style: 'font-family:var(--mono);font-size:12px', text: `→ ${s.result}` }),
    s.note && el('div', { style: 'font-size:11.5px;color:var(--ink-faint)', text: s.note })
  ].filter(Boolean));
}
