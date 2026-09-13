import { el } from '../dom.js';
export function panel({ title, right = null, body = [], cls = '' }) {
  const b = el('div', { class: 'body' }, body);
  const p = el('div', { class: `panel ${cls}` }, [el('header', {}, [el('span', { text: title }), right].filter(Boolean)), b]);
  p.body = b;
  return p;
}
export function kv(k, v, { unit = '', mono = true } = {}) {
  const empty = v === '—' || v === null || v === undefined;
  return el('div', { class: 'kv' }, [
    el('span', { class: 'k', text: k }),
    el('span', { class: `v ${empty ? 'empty' : ''}`, text: empty ? '—' : `${v}${unit ? ' ' + unit : ''}` })
  ]);
}
export function collapsible(title, contentNodes, open = false) {
  const d = el('details', { class: 'collapsible', open: open || null }, [
    el('summary', { text: title, style: 'cursor:pointer;color:var(--ink-dim);font-size:12.5px;padding:6px 0' }),
    el('div', {}, contentNodes)
  ]);
  return d;
}
export function message(level, text) { return el('div', { class: 'msg', dataset: { lvl: level }, text }); }
export function levelWrap(node, minLevel) { node.dataset.level = minLevel; return node; }
