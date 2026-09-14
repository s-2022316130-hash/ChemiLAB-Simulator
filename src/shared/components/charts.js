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

const empty = (root, w, h) => {
  root.appendChild(svg('text', {
    x: w / 2, y: h / 2, fill: 'var(--ink-ghost)', 'font-size': 11,
    'font-family': 'var(--font)', 'text-anchor': 'middle', text: 'Not calculated'
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
