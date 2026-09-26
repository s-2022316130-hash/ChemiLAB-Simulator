import { svg } from '../shared/dom.js';

/**
 * The engraving behind the overview's hero: a psychrometric chart.
 *
 * Every chemical engineering student has spent an afternoon with one of these,
 * and it is the right ground for this page for the same reason the plant is
 * drawn in elevation rather than as an icon — it is the subject's own
 * drawing, not decoration borrowed from somewhere else.
 *
 * It is also a real chart. The curves are computed, not sketched:
 *
 *   saturation pressure   Magnus–Tetens over water (Alduchov & Eskridge, 1996)
 *                         p_s = 0.61094 · exp(17.625 T / (T + 243.04))  kPa
 *   humidity ratio        w = 0.621945 · φ p_s / (P − φ p_s)            kg/kg dry air
 *   enthalpy              h = 1.006 T + w (2501 + 1.86 T)               kJ/kg dry air
 *
 * at P = 101.325 kPa, dry bulb 0–50 °C and w up to 0.030 kg/kg. Constant
 * relative-humidity curves every 10 %, enthalpy lines every 10 kJ/kg, a
 * dry-bulb grid every 5 °C that stops at saturation, humidity lines that start
 * from it — which is how the printed charts are drawn, and why a chart is
 * recognisable at a glance even when it is barely there.
 *
 * Nothing on it is a reading. It carries no state and is drawn once.
 */

const P = 101.325;
const T0 = 0, T1 = 50, W1 = 0.03;
const VW = 1000, VH = 640;

const psat = T => 0.61094 * Math.exp((17.625 * T) / (T + 243.04));
const wAt = (T, phi) => { const pv = phi * psat(T); return (0.621945 * pv) / (P - pv); };
const wOnH = (T, h) => (h - 1.006 * T) / (2501 + 1.86 * T);

const X = T => ((T - T0) / (T1 - T0)) * VW;
const Y = w => VH - (w / W1) * VH;

/** Polyline through the points that are inside the chart, as a path string. */
function line(points) {
  const inside = points.filter(([, w]) => w >= 0 && w <= W1);
  if (inside.length < 2) return '';
  return inside.map(([T, w], i) => `${i ? 'L' : 'M'}${X(T).toFixed(1)} ${Y(w).toFixed(1)}`).join(' ');
}

/** Dry bulb at which a line of constant w meets saturation. */
function tSatForW(w) {
  let lo = -20, hi = 60;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (wAt(mid, 1) < w) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Dry bulb at which a line of constant h meets saturation. */
function tSatForH(h) {
  let lo = -20, hi = 60;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (wOnH(mid, h) > wAt(mid, 1)) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

const range = (a, b, step) => { const out = []; for (let v = a; v <= b + 1e-9; v += step) out.push(+v.toFixed(6)); return out; };

export function psychroChart() {
  const root = svg('svg', {
    class: 'psychro', viewBox: `-40 -20 ${VW + 110} ${VH + 60}`,
    preserveAspectRatio: 'xMaxYMax meet', 'aria-hidden': 'true', focusable: 'false'
  });

  const path = (d, cls, i = 0) => d && svg('path', { d, class: cls, pathLength: 1, style: `--i:${i}` });
  // A curve that falls wholly outside the chart has no path at all.
  const add = (g, n) => { if (n) g.appendChild(n); };

  // Dry-bulb grid: vertical, from the axis up to saturation.
  const grid = svg('g', { class: 'ps-grid' });
  for (const T of range(5, T1, 5)) {
    const wTop = Math.min(wAt(T, 1), W1);
    add(grid, path(`M${X(T).toFixed(1)} ${Y(0)} L${X(T).toFixed(1)} ${Y(wTop).toFixed(1)}`, 'ps-g'));
  }
  // Humidity grid: horizontal, from saturation out to the right-hand axis.
  for (const w of range(0.002, W1, 0.002)) {
    const Ts = Math.max(tSatForW(w), T0);
    if (Ts >= T1) continue;
    add(grid, path(`M${X(Ts).toFixed(1)} ${Y(w).toFixed(1)} L${X(T1)} ${Y(w).toFixed(1)}`, 'ps-g'));
  }
  root.appendChild(grid);

  // Enthalpy lines, from saturation down to dry air.
  const hs = svg('g', { class: 'ps-h' });
  range(10, 130, 10).forEach((h, i) => {
    const Ts = tSatForH(h), Tz = h / 1.006;
    const pts = range(Math.max(Ts, T0), Math.min(Tz, T1), 0.5).map(T => [T, wOnH(T, h)]);
    const d = line(pts);
    add(hs, path(d, 'ps-hl', i));
  });
  root.appendChild(hs);

  // Relative humidity, 10 % to 90 %, then saturation on top.
  const rh = svg('g', { class: 'ps-rh' });
  range(0.1, 0.9, 0.1).forEach((phi, i) => {
    add(rh, path(line(range(T0, T1, 0.5).map(T => [T, wAt(T, phi)])), 'ps-r', i));
  });
  root.appendChild(rh);
  add(root, path(line(range(T0, T1, 0.25).map(T => [T, wAt(T, 1)])), 'ps-sat', 10));

  // The humidity scale up the right, as printed charts carry it — numbers
  // only. The dry-bulb scale along the foot is left off: on the plate that
  // edge runs under the title block, and half a scale is worse than none.
  const ticks = svg('g', { class: 'ps-ticks' });
  for (const w of range(0.005, W1, 0.005)) {
    ticks.appendChild(svg('text', { x: VW + 12, y: Y(w) + 5, text: w.toFixed(3) }));
  }
  root.appendChild(ticks);
  return root;
}
