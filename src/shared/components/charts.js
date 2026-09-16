import { svg, clear } from '../dom.js';

/**
 * Dependency-free SVG charts. Data comes from the engine only — nothing here
 * computes a process value, and a series with no points says "not calculated"
 * rather than drawing an empty axis as if zero were the answer.
 *
 * The house style: a baseline and gridlines rather than a box, tick labels in
 * the mono face at the ends of each scale, and the line itself as the only
 * saturated thing in the frame. A chart in this rail is a supporting reading,
 * so it is drawn to be understood at a glance and not to be admired.
 */
const PAD = { l: 40, r: 12, t: 24, b: 26 };

const fmtTick = v => {
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 1e4 || a < 1e-2) return v.toExponential(0);
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  return v.toFixed(2);
};

const empty = (root, w, h, text = 'Not calculated') => {
  root.appendChild(svg('text', {
    x: w / 2, y: h / 2, fill: 'var(--ink-ghost)', 'font-size': 11,
    'font-family': 'var(--font)', 'text-anchor': 'middle', text
  }));
  return root;
};

/** Horizontal gridlines with their values, and a baseline along the bottom. */
function grid(root, w, h, y0, y1, sy, lines = 3) {
  // The left rule. Gridlines alone leave the plot floating; one vertical line
  // is what makes the values read as measured against a scale.
  root.appendChild(svg('path', {
    d: `M${PAD.l} ${PAD.t} V${h - PAD.b}`, stroke: 'var(--line)', fill: 'none', 'stroke-width': 1
  }));
  for (let i = 0; i <= lines; i++) {
    const v = y0 + (y1 - y0) * (i / lines);
    const y = sy(v);
    root.appendChild(svg('path', {
      d: `M${PAD.l} ${y.toFixed(1)} H${w - PAD.r}`,
      stroke: i === 0 ? 'var(--line-strong)' : 'var(--line-soft)', fill: 'none',
      'stroke-width': i === 0 ? 1 : 1
    }));
    root.appendChild(svg('text', {
      x: PAD.l - 6, y: (y + 3.2).toFixed(1), fill: 'var(--ink-ghost)', 'font-size': 8.5,
      'font-family': 'var(--mono)', 'text-anchor': 'end', text: fmtTick(v)
    }));
  }
}

export function lineChart({ series = [], width = 320, height = 160, xLabel = '', yLabel = '' }) {
  const root = svg('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', role: 'img' });
  const pts = series.flatMap(s => s.points || []);
  if (!pts.length) return empty(root, width, height);

  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys, 0), y1 = Math.max(...ys);
  const sx = v => PAD.l + (v - x0) / ((x1 - x0) || 1) * (width - PAD.l - PAD.r);
  const sy = v => (height - PAD.b) - (v - y0) / ((y1 - y0) || 1) * (height - PAD.t - PAD.b);

  grid(root, width, height, y0, y1 || 1, sy);

  series.forEach((s, i) => {
    const colour = s.color || 'var(--hue)';
    const d = s.points.map((p, j) => `${j ? 'L' : 'M'}${sx(p[0]).toFixed(1)} ${sy(p[1]).toFixed(1)}`).join(' ');
    // A faint area under the first series. It is what makes the shape of a
    // curve readable at this size; a second one would be a mess, so only the
    // first gets it.
    if (i === 0) {
      const base = sy(y0).toFixed(1);
      root.appendChild(svg('path', {
        d: `${d} L${sx(s.points[s.points.length - 1][0]).toFixed(1)} ${base} L${sx(s.points[0][0]).toFixed(1)} ${base} Z`,
        fill: colour, opacity: 0.1, stroke: 'none'
      }));
    }
    root.appendChild(svg('path', {
      d, fill: 'none', stroke: colour, 'stroke-width': 1.8,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 1 - i * 0.28
    }));
  });

  // Scale ends, so the axis is readable without a full tick ladder.
  root.appendChild(svg('text', {
    x: PAD.l, y: height - 6, fill: 'var(--ink-ghost)', 'font-size': 8.5,
    'font-family': 'var(--mono)', text: fmtTick(x0)
  }));
  root.appendChild(svg('text', {
    x: width - PAD.r, y: height - 6, fill: 'var(--ink-ghost)', 'font-size': 8.5,
    'font-family': 'var(--mono)', 'text-anchor': 'end', text: fmtTick(x1)
  }));
  if (xLabel) root.appendChild(svg('text', {
    x: (PAD.l + width - PAD.r) / 2, y: height - 6, fill: 'var(--ink-faint)', 'font-size': 9,
    'font-family': 'var(--font)', 'text-anchor': 'middle', text: xLabel
  }));
  if (yLabel) root.appendChild(svg('text', {
    x: 2, y: 11, fill: 'var(--ink-ghost)', 'font-size': 9,
    'font-family': 'var(--mono)', 'letter-spacing': '.06em', text: yLabel
  }));
  return root;
}

export function barChart({ bars = [], width = 320, height = 160, unit = '' }) {
  const root = svg('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', role: 'img' });
  if (!bars.length) return empty(root, width, height);

  // A negative bar is a real answer here — an expander recovers shaft power
  // rather than consuming it — so the scale holds one and the bars grow from
  // zero in whichever direction the value goes.
  const max = Math.max(...bars.map(b => b.value), 0);
  const min = Math.min(...bars.map(b => b.value), 0);
  const range = (max - min) || 1;
  const sy = v => (height - PAD.b) - ((v - min) / range) * (height - PAD.t - PAD.b);
  grid(root, width, height, min, max, sy, 2);
  const zero = sy(0);

  const pitch = (width - PAD.l - PAD.r) / bars.length;
  bars.forEach((b, i) => {
    const x = PAD.l + i * pitch + pitch * 0.22;
    const w = pitch * 0.56;
    const top = Math.min(sy(b.value), zero);
    const h = Math.max(Math.abs(sy(b.value) - zero), 1);
    const rect = svg('rect', {
      x: x.toFixed(1), y: top.toFixed(1), width: w.toFixed(1), height: h.toFixed(1),
      rx: 2, fill: b.color || 'var(--hue)', opacity: 0.85
    });
    rect.appendChild(svg('title', { text: `${b.label}: ${fmtTick(b.value)}${unit ? ' ' + unit : ''}` }));
    root.appendChild(rect);
    // Each bar carries its own value. A bar chart in an analysis tool that makes
    // you measure against a gridline to read a number is a picture of data.
    root.appendChild(svg('text', {
      x: (x + w / 2).toFixed(1), y: (top - 5).toFixed(1), fill: 'var(--ink)', 'font-size': 9,
      'font-family': 'var(--mono)', 'text-anchor': 'middle', text: fmtTick(b.value)
    }));
    root.appendChild(svg('text', {
      x: (x + w / 2).toFixed(1), y: height - 9, fill: 'var(--ink-faint)', 'font-size': 8.5,
      'font-family': 'var(--font)', 'text-anchor': 'middle', text: b.label
    }));
  });
  if (unit) root.appendChild(svg('text', {
    x: 2, y: 11, fill: 'var(--ink-ghost)', 'font-size': 9,
    'font-family': 'var(--mono)', 'letter-spacing': '.06em', text: unit
  }));
  return root;
}

/**
 * A single reading against a scale. The track is drawn all the way round so the
 * empty part of the range is visible — a gauge whose unfilled arc is invisible
 * shows a number, not a position in a range.
 */
export function gauge({ value, min = 0, max = 100, label = '', unit = '%', size = 128 }) {
  const root = svg('svg', { viewBox: '0 0 120 78', width: size, role: 'img' });
  const arc = (frac, colour, w, opacity = 1) => {
    const a = Math.PI * (1 - Math.max(0, Math.min(1, frac)));
    const x = 60 + 48 * Math.cos(a), y = 64 - 48 * Math.sin(a);
    return svg('path', {
      d: `M12 64 A48 48 0 ${frac > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}`,
      stroke: colour, 'stroke-width': w, fill: 'none', 'stroke-linecap': 'round', opacity
    });
  };
  root.appendChild(arc(1, 'var(--bg-3)', 8));
  const has = value !== null && value !== undefined && !Number.isNaN(value);
  if (has) {
    const frac = (value - min) / ((max - min) || 1);
    root.appendChild(arc(frac, 'var(--hue)', 8));
  }
  root.appendChild(svg('text', {
    x: 60, y: 57, 'text-anchor': 'middle', fill: 'var(--ink)', 'font-size': 17,
    'font-family': 'var(--mono)', 'font-weight': '600',
    text: has ? value.toFixed(1) : '—'
  }));
  root.appendChild(svg('text', {
    x: 60, y: 72, 'text-anchor': 'middle', fill: 'var(--ink-ghost)', 'font-size': 8,
    'font-family': 'var(--mono)', text: `${label} ${has ? unit : ''}`.trim()
  }));
  return root;
}

export { clear };

/**
 * Residual against iteration, for a convergence trace off `Result.convergence`.
 *
 * Logarithmic, and not as a stylistic choice. A solve that starts at 30 and
 * finishes at 5e-8 spans nine decades; drawn linearly it is a vertical drop
 * followed by nine tenths of a chart that reads as a flat line along zero,
 * which says nothing about the part that matters. On a log scale the same data
 * shows its slope, and the slope is the fact worth having — a straight fall is
 * a well-posed problem, a fall that flattens into a shelf is a loop the relaxation
 * is fighting, and a sawtooth is a model that is not continuous where the solver
 * assumed it was.
 *
 * The tolerance is drawn as a rule across the frame. Without it the curve has
 * no reference and "converged" is just a word on another line; with it, where
 * the curve crosses the rule is the answer, and how long it ran afterwards is
 * visible too.
 */
export function residualChart({ history = [], tol = null, width = 320, height = 150 }) {
  const root = svg('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', role: 'img' });
  const pts = history.filter(v => Number.isFinite(v) && v >= 0);
  // No history is not no answer: a single-phase flash and an analytic branch
  // both solve without iterating, and saying so beats an empty axis.
  if (!pts.length) return empty(root, width, height, 'Solved without iterating');
  if (pts.length === 1) return empty(root, width, height, 'Solved in a single pass');

  const hasTol = Number.isFinite(tol) && tol > 0;
  const positive = pts.filter(v => v > 0);
  const floor = positive.length ? Math.min(...positive) : 1e-12;
  const lo = hasTol ? Math.min(floor, tol) : floor;
  const hi = Math.max(...pts, hasTol ? tol : 0, lo * 10);

  let e0 = Math.floor(Math.log10(lo)), e1 = Math.ceil(Math.log10(hi));
  // Two decades minimum. A solve that improved by a factor of three is a real
  // result, and stretching it over the whole frame would make it look like a
  // collapse it was not.
  if (e1 - e0 < 2) e1 = e0 + 2;

  const plotH = height - PAD.t - PAD.b;
  // A residual of exactly zero has no logarithm. It sits on the floor of the
  // frame rather than being dropped — hitting the answer exactly is the best
  // outcome there is and it should not be the one point that vanishes.
  const sy = v => {
    const k = (Math.log10(v > 0 ? v : Math.pow(10, e0)) - e0) / (e1 - e0);
    return (height - PAD.b) - Math.max(0, Math.min(1, k)) * plotH;
  };
  const sx = i => PAD.l + (pts.length > 1 ? i / (pts.length - 1) : 0.5) * (width - PAD.l - PAD.r);

  // One gridline per decade while they are few enough to read; above that,
  // every other one, so the labels do not collide into a grey band.
  const step = Math.max(1, Math.ceil((e1 - e0) / 4));
  for (let e = e0; e <= e1; e += step) {
    const y = sy(Math.pow(10, e));
    root.appendChild(svg('path', {
      d: `M${PAD.l} ${y.toFixed(1)} H${width - PAD.r}`,
      stroke: e === e0 ? 'var(--line-strong)' : 'var(--line-soft)', fill: 'none', 'stroke-width': 1
    }));
    root.appendChild(svg('text', {
      x: PAD.l - 6, y: (y + 3.2).toFixed(1), fill: 'var(--ink-ghost)', 'font-size': 8.5,
      'font-family': 'var(--mono)', 'text-anchor': 'end',
      text: e === 0 ? '1' : `1e${e}`
    }));
  }
  root.appendChild(svg('path', {
    d: `M${PAD.l} ${PAD.t} V${height - PAD.b}`, stroke: 'var(--line)', fill: 'none', 'stroke-width': 1
  }));

  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join(' ');
  const base = (height - PAD.b).toFixed(1);
  root.appendChild(svg('path', {
    d: `${d} L${sx(pts.length - 1).toFixed(1)} ${base} L${sx(0).toFixed(1)} ${base} Z`,
    fill: 'var(--hue)', opacity: 0.1, stroke: 'none'
  }));
  root.appendChild(svg('path', {
    d, fill: 'none', stroke: 'var(--hue)', 'stroke-width': 1.8,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round'
  }));

  // The tolerance, over the curve rather than under it: the question this chart
  // answers is where the two meet.
  if (hasTol) {
    const y = sy(tol).toFixed(1);
    root.appendChild(svg('path', {
      d: `M${PAD.l} ${y} H${width - PAD.r}`, stroke: 'var(--ok)', fill: 'none',
      'stroke-width': 1.2, 'stroke-dasharray': '4 3', opacity: 0.9
    }));
    root.appendChild(svg('text', {
      x: width - PAD.r, y: Number(y) - 4, fill: 'var(--ok)', 'font-size': 8.5,
      'font-family': 'var(--mono)', 'text-anchor': 'end',
      'paint-order': 'stroke', stroke: 'var(--bg-1)', 'stroke-width': 3, 'stroke-linejoin': 'round',
      text: `tolerance ${tol.toExponential(0)}`
    }));
  }

  // Where it ended up, marked. The last value is the one the verdict was made on.
  root.appendChild(svg('circle', {
    cx: sx(pts.length - 1).toFixed(1), cy: sy(pts[pts.length - 1]).toFixed(1), r: 2.6,
    fill: 'var(--hue)', stroke: 'var(--bg-1)', 'stroke-width': 1.5
  }));

  root.appendChild(svg('text', {
    x: PAD.l, y: height - 6, fill: 'var(--ink-ghost)', 'font-size': 8.5,
    'font-family': 'var(--mono)', text: '1'
  }));
  root.appendChild(svg('text', {
    x: width - PAD.r, y: height - 6, fill: 'var(--ink-ghost)', 'font-size': 8.5,
    'font-family': 'var(--mono)', 'text-anchor': 'end', text: String(pts.length)
  }));
  root.appendChild(svg('text', {
    x: (PAD.l + width - PAD.r) / 2, y: height - 6, fill: 'var(--ink-faint)', 'font-size': 9,
    'font-family': 'var(--font)', 'text-anchor': 'middle', text: 'iteration'
  }));
  root.appendChild(svg('text', {
    x: 2, y: 11, fill: 'var(--ink-ghost)', 'font-size': 9,
    'font-family': 'var(--mono)', 'letter-spacing': '.06em', text: 'residual'
  }));
  return root;
}
