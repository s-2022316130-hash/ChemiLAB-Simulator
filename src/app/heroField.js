import { onFrame } from '../shared/animation.js';
import { token, onThemeChange } from '../shared/theme.js';

/**
 * The animated field behind the hero.
 *
 * It is a living piping layout: orthogonal runs across the plot with junction
 * nodes where they meet, and packets travelling along them at different speeds.
 * That is deliberate rather than decorative — the first thing anyone sees on
 * this site is the grammar the rest of it uses, which is process lines with
 * things moving through them.
 *
 * Three constraints shaped the implementation:
 *
 *  - It must be cheap. One canvas, one 2D context, roughly forty short line
 *    segments and a dozen packets. It rides the shared rAF loop, so it stops
 *    with everything else when the tab is hidden and costs nothing when the
 *    home page is not mounted.
 *  - It must be quiet. Everything is drawn at low alpha against the page
 *    ground, so it reads as depth rather than as an animation demanding to be
 *    watched. The packets are the only thing with any brightness, and they are
 *    two pixels across.
 *  - It must respect a stated preference. With reduced motion the layout is
 *    drawn once, still, and nothing schedules a frame.
 */

const RUNS = 15;            // pipe runs across the plot
const PACKETS = 13;         // things moving through them
const reduced = () => {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch { return false; }
};

/** A small deterministic generator, so the layout is stable across a resize. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * One run: enters from the left edge, makes one or two right-angle turns, and
 * leaves to the right. Points are in 0…1 space so a resize is a rescale rather
 * than a rebuild.
 */
function buildRuns(rand) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    const y0 = 0.06 + rand() * 0.88;
    const y1 = Math.min(0.96, Math.max(0.04, y0 + (rand() - 0.5) * 0.5));
    const x1 = 0.18 + rand() * 0.3;
    const x2 = x1 + 0.16 + rand() * 0.34;
    const pts = rand() > 0.32
      ? [[-0.04, y0], [x1, y0], [x1, y1], [x2, y1], [x2, y0], [1.04, y0]]
      : [[-0.04, y0], [x2, y0], [x2, y1], [1.04, y1]];
    // Cumulative length, so a packet moves at a constant speed along the run
    // rather than sprinting through the short legs.
    const seg = [];
    let total = 0;
    for (let k = 1; k < pts.length; k++) {
      const d = Math.abs(pts[k][0] - pts[k - 1][0]) + Math.abs(pts[k][1] - pts[k - 1][1]);
      seg.push(d); total += d;
    }
    runs.push({ pts, seg, total, weight: 0.5 + rand() * 0.9 });
  }
  return runs;
}

/** Where a run is at fraction `u` of its length, in 0…1 space. */
function along(run, u) {
  let d = u * run.total;
  for (let k = 0; k < run.seg.length; k++) {
    if (d <= run.seg[k] || k === run.seg.length - 1) {
      const f = run.seg[k] > 0 ? Math.min(d / run.seg[k], 1) : 0;
      const a = run.pts[k], b = run.pts[k + 1];
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    }
    d -= run.seg[k];
  }
  return run.pts[run.pts.length - 1];
}

/**
 * Mount the field into `host`. Returns a dispose function; call it when the
 * page is torn down so the frame task and the observers go with it.
 */
export function createHeroField(host) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return () => { host.innerHTML = ''; };

  const rand = rng(20240914);
  const runs = buildRuns(rand);
  const packets = Array.from({ length: PACKETS }, () => ({
    run: Math.floor(rand() * runs.length),
    u: rand(),
    speed: 0.028 + rand() * 0.055
  }));

  let W = 0, H = 0, dpr = 1;
  let hue = '#26d0e0', line = '#222d3f', faint = '#4e5c74';

  function readTokens() {
    hue = token('--hue', '#26d0e0');
    line = token('--line-strong', '#222d3f');
    faint = token('--ink-ghost', '#4e5c74');
  }
  readTokens();

  function resize() {
    const r = host.getBoundingClientRect();
    // The field is wider than the page on purpose — it bleeds past both edges —
    // so a modest pixel ratio is plenty. This is background, not detail.
    dpr = Math.min(devicePixelRatio || 1, 1.75);
    W = Math.max(Math.round(r.width), 1);
    H = Math.max(Math.round(r.height), 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(0);
  }

  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    const X = v => v * W, Y = v => v * H;

    // The runs themselves.
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const run of runs) {
      ctx.beginPath();
      ctx.moveTo(X(run.pts[0][0]), Y(run.pts[0][1]));
      for (let k = 1; k < run.pts.length; k++) ctx.lineTo(X(run.pts[k][0]), Y(run.pts[k][1]));
      ctx.strokeStyle = line;
      ctx.globalAlpha = 0.16 * run.weight;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Junction marks where a run changes direction: small open squares, the way
    // a fitting is drawn on a drawing.
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = faint;
    ctx.lineWidth = 1;
    for (const run of runs) {
      for (let k = 1; k < run.pts.length - 1; k++) {
        const x = X(run.pts[k][0]), y = Y(run.pts[k][1]);
        ctx.strokeRect(x - 2, y - 2, 4, 4);
      }
    }

    // Packets. Drawn as a short bright stroke along the run rather than as a
    // dot, so each one reads as something with direction.
    ctx.lineCap = 'round';
    for (const p of packets) {
      const run = runs[p.run];
      const a = along(run, p.u);
      const b = along(run, Math.max(0, p.u - 0.035));
      ctx.beginPath();
      ctx.moveTo(X(b[0]), Y(b[1]));
      ctx.lineTo(X(a[0]), Y(a[1]));
      ctx.strokeStyle = hue;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2;
      ctx.stroke();
      // A softer, wider pass under it stands in for a glow without a shadow
      // blur, which is the expensive way to draw one.
      ctx.globalAlpha = 0.13;
      ctx.lineWidth = 6;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  let stop = () => {};
  if (!reduced()) {
    stop = onFrame(dt => {
      if (W < 2) return;
      for (const p of packets) {
        p.u += dt * p.speed;
        if (p.u > 1) { p.u -= 1; p.run = (p.run + 1) % runs.length; }
      }
      draw(dt);
    });
  }

  const offTheme = onThemeChange(() => { readTokens(); draw(0); });

  return () => {
    stop(); offTheme(); ro.disconnect();
    host.innerHTML = '';
  };
}
