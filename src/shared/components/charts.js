import { svg, clear } from '../dom.js';
// Dependency-free SVG charts. Data comes from the engine only.
const C = { ink: 'var(--ink-dim)', line: 'var(--line)', acc: 'var(--accent)' };
function axes(w, h, pad) {
  return [svg('path', { d: `M${pad} ${pad} V${h - pad} H${w - pad}`, stroke: C.line, fill: 'none' })];
}
export function lineChart({ series = [], width = 300, height = 150, xLabel = '', yLabel = '' }) {
  const pad = 28, root = svg('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', role: 'img' });
  axes(width, height, pad).forEach(n => root.appendChild(n));
  const pts = series.flatMap(s => s.points || []);
  if (!pts.length) { root.appendChild(svg('text', { x: width / 2, y: height / 2, fill: 'var(--ink-faint)', 'font-size': 11, 'text-anchor': 'middle', text: 'Not calculated' })); return root; }
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs) || 1, y0 = Math.min(...ys, 0), y1 = Math.max(...ys) || 1;
  const sx = v => pad + (v - x0) / ((x1 - x0) || 1) * (width - 2 * pad);
  const sy = v => (height - pad) - (v - y0) / ((y1 - y0) || 1) * (height - 2 * pad);
  series.forEach((s, i) => {
    const d = s.points.map((p, j) => `${j ? 'L' : 'M'}${sx(p[0]).toFixed(1)} ${sy(p[1]).toFixed(1)}`).join(' ');
    root.appendChild(svg('path', { d, fill: 'none', stroke: s.color || C.acc, 'stroke-width': 1.6, opacity: 1 - i * 0.2 }));
  });
  if (yLabel) root.appendChild(svg('text', { x: 2, y: 10, fill: C.ink, 'font-size': 9, text: yLabel }));
  if (xLabel) root.appendChild(svg('text', { x: width - pad, y: height - 4, fill: C.ink, 'font-size': 9, 'text-anchor': 'end', text: xLabel }));
  return root;
}
export function barChart({ bars = [], width = 300, height = 150, unit = '' }) {
  const pad = 26, root = svg('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%' });
  axes(width, height, pad).forEach(n => root.appendChild(n));
  if (!bars.length) { root.appendChild(svg('text', { x: width / 2, y: height / 2, fill: 'var(--ink-faint)', 'font-size': 11, 'text-anchor': 'middle', text: 'Not calculated' })); return root; }
  const max = Math.max(...bars.map(b => b.value)) || 1, bw = (width - 2 * pad) / bars.length;
  bars.forEach((b, i) => {
    const h = (b.value / max) * (height - 2 * pad - 12);
    root.appendChild(svg('rect', { x: pad + i * bw + bw * 0.2, y: height - pad - h, width: bw * 0.6, height: Math.max(h, 0.5), fill: b.color || C.acc, opacity: .85 }));
    root.appendChild(svg('text', { x: pad + i * bw + bw * 0.5, y: height - pad + 10, fill: C.ink, 'font-size': 9, 'text-anchor': 'middle', text: b.label }));
  });
  if (unit) root.appendChild(svg('text', { x: 2, y: 10, fill: C.ink, 'font-size': 9, text: unit }));
  return root;
}
export function gauge({ value, min = 0, max = 100, label = '', unit = '%', size = 110 }) {
  const root = svg('svg', { viewBox: '0 0 120 76', width: size });
  const arc = (frac, color, w) => {
    const a = Math.PI * (1 - frac), x = 60 + 48 * Math.cos(a), y = 64 - 48 * Math.sin(a);
    return svg('path', { d: `M12 64 A48 48 0 ${frac > .5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}`, stroke: color, 'stroke-width': w, fill: 'none', 'stroke-linecap': 'round' });
  };
  root.appendChild(arc(1, 'var(--bg-3)', 9));
  const has = value !== null && value !== undefined && !Number.isNaN(value);
  if (has) root.appendChild(arc(Math.max(0, Math.min(1, (value - min) / (max - min))), C.acc, 9));
  root.appendChild(svg('text', { x: 60, y: 58, 'text-anchor': 'middle', fill: 'var(--ink)', 'font-size': 16, 'font-family': 'var(--mono)', text: has ? `${value.toFixed(1)}` : '—' }));
  root.appendChild(svg('text', { x: 60, y: 72, 'text-anchor': 'middle', fill: 'var(--ink-faint)', 'font-size': 8, text: `${label} ${has ? unit : ''}`.trim() }));
  return root;
}
export { clear };
