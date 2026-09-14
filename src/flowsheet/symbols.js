import { svg } from '../shared/dom.js';
// ISA-style equipment symbols. Each returns an SVG <g> drawn around (0,0).
const S = 'var(--ink-dim)', A = 'var(--accent)';
/**
 * Symbols carry the colour of the job they do, so a flowsheet reads as a
 * sequence of process sections rather than as one outline weight repeated.
 * The stroke is overwritten by view2d.applyState with the live equipment state,
 * so these are the resting colours only.
 */
const FUNCTION_COLOR = {
  pump: 'var(--stream-liquid)', blower: 'var(--stream-air)', compressor: 'var(--stream-gas)',
  heater: 'var(--warn)', exchanger: 'var(--info)',
  clarifier: 'var(--info)', filter: 'var(--info)', column: 'var(--info)',
  dryer: 'var(--warn)', reactor: 'var(--kind-approx)', mixer: 'var(--kind-user)',
  tank: 'var(--ok)', vessel: 'var(--ok)',
  valve: 'var(--err)', instrument: 'var(--kind-ref)', block: 'var(--ink-faint)'
};
const body = (node, kind) => {
  node.setAttribute('class', 'fs-body');
  node.setAttribute('stroke', S);
  node.setAttribute('fill', 'var(--bg-1)');
  node.setAttribute('stroke-width', '2');
  if (kind) node.style.color = FUNCTION_COLOR[kind] || S;
  return node;
};
export const SYMBOLS = {
  vessel: () => svg('g', {}, [body(svg('rect', { x: -14, y: -24, width: 28, height: 48, rx: 14 }))]),
  tank: () => svg('g', {}, [body(svg('rect', { x: -20, y: -18, width: 40, height: 36 }))]),
  pump: () => svg('g', {}, [body(svg('circle', { r: 14 })), svg('path', { d: 'M-14 0 L0 -14 L14 0 Z', fill: 'none', stroke: S })]),
  blower: () => svg('g', {}, [body(svg('circle', { r: 14 })), svg('path', { d: 'M-9 8 L9 -8', stroke: S })]),
  compressor: () => svg('g', {}, [body(svg('circle', { r: 15 })), svg('path', { d: 'M-15 -8 L15 -14 M-15 8 L15 14', stroke: S, fill: 'none' })]),
  exchanger: () => svg('g', {}, [body(svg('circle', { r: 16 })), svg('path', { d: 'M-16 0 L-6 -9 L6 9 L16 0', fill: 'none', stroke: S })]),
  heater: () => svg('g', {}, [body(svg('circle', { r: 16 })), svg('path', { d: 'M-8 8 q8 -16 16 0', fill: 'none', stroke: 'var(--warn)' })]),
  column: () => svg('g', {}, [body(svg('rect', { x: -12, y: -34, width: 24, height: 68, rx: 12 })),
    ...[-20, -8, 4, 16].map(y => svg('path', { d: `M-12 ${y} H12`, stroke: S, opacity: .6 }))]),
  reactor: () => svg('g', {}, [body(svg('rect', { x: -16, y: -26, width: 32, height: 52, rx: 8 })), svg('circle', { r: 7, fill: 'none', stroke: S })]),
  filter: () => svg('g', {}, [body(svg('rect', { x: -18, y: -20, width: 36, height: 40 })),
    ...[-10, 0, 10].map(y => svg('path', { d: `M-18 ${y} H18`, stroke: S, 'stroke-dasharray': '3 3', opacity: .7 }))]),
  clarifier: () => svg('g', {}, [body(svg('path', { d: 'M-22 -16 H22 L0 22 Z' }))]),
  mixer: () => svg('g', {}, [body(svg('rect', { x: -16, y: -18, width: 32, height: 36 })), svg('path', { d: 'M0 -18 V6 M-8 6 H8', stroke: S, fill: 'none' })]),
  dryer: () => svg('g', {}, [body(svg('rect', { x: -26, y: -14, width: 52, height: 28, rx: 6 })), svg('path', { d: 'M-14 6 q6 -12 12 0 q6 12 12 0', fill: 'none', stroke: S })]),
  valve: () => svg('g', {}, [svg('path', { d: 'M-11 -9 L11 9 L11 -9 L-11 9 Z', fill: 'var(--bg-1)', stroke: 'var(--valve,var(--ink-dim))', class: 'fs-body' })]),
  instrument: (label = '') => svg('g', {}, [body(svg('circle', { r: 12 })), svg('text', { y: 4, 'text-anchor': 'middle', 'font-size': 9, fill: A, 'font-family': 'var(--mono)', text: label })]),
  block: () => svg('g', {}, [body(svg('rect', { x: -22, y: -16, width: 44, height: 32 }))])
};
export function symbolFor(type, label) {
  const f = SYMBOLS[type] || SYMBOLS.block;
  const g = f(label);
  // The resting colour of a symbol is the colour of the job it does. view2d
  // overwrites the stroke with the live equipment state on every solved run;
  // `color` is what the CSS hover and selection rules pick up, and what the
  // symbol falls back to before anything has been calculated.
  const c = FUNCTION_COLOR[type] || S;
  g.querySelectorAll('.fs-body').forEach(b => {
    b.style.color = c;
    b.setAttribute('stroke', c);
    b.setAttribute('stroke-opacity', '0.9');
  });
  return g;
}
