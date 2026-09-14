/**
 * One shared requestAnimationFrame loop.
 *
 * Rendering and animation are decoupled from the solver: nothing in here ever
 * calls an engine, and nothing an engine does ever blocks a frame. The loop
 * stops itself when the last task unsubscribes and when the tab is hidden, so
 * an idle simulator costs nothing.
 */
const tasks = new Set();
let running = false, last = 0, frameId = 0;

// A long stall — a tab returning to the foreground, a solver run on the main
// thread — must not teleport every animation. dt is clamped so motion resumes
// from where it was rather than jumping.
const MAX_DT = 1 / 20;

let smoothedDt = 1 / 60;
let smoothedWork = 4;
let lastRaw = 1 / 60;

function frame(t) {
  frameId = 0;
  const raw = (t - last) / 1000;
  last = t;
  lastRaw = raw;
  const dt = Math.min(Math.max(raw, 0), MAX_DT);
  smoothedDt += (dt - smoothedDt) * 0.1;
  // How long the frame's own work took, separately from how long the browser
  // waited before asking for it. The two are not the same thing: a throttled
  // or occluded tab is handed frames slowly while each one is cheap, and a
  // renderer that confuses the two will keep lowering quality for no reason.
  const t0 = performance.now();
  for (const fn of tasks) fn(dt, t / 1000);
  smoothedWork += (performance.now() - t0 - smoothedWork) * 0.08;
  if (tasks.size && document.visibilityState !== 'hidden') frameId = requestAnimationFrame(frame);
  else running = false;
}

function kick() {
  if (running || !tasks.size || document.visibilityState === 'hidden') return;
  running = true; last = performance.now();
  frameId = requestAnimationFrame(frame);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0; running = false;
  } else kick();
});

export function onFrame(fn) {
  tasks.add(fn);
  kick();
  return () => tasks.delete(fn);
}

/** Smoothed frame time in seconds, for anything that wants to pace itself. */
export const frameTime = () => smoothedDt;

/** Milliseconds of work the last frames actually took, excluding any wait. */
export const frameWork = () => smoothedWork;

/** The most recent unclamped gap between frames, in seconds. */
export const lastInterval = () => lastRaw;

/**
 * Frame-rate independent exponential smoothing. `lambda` is the rate: the
 * higher it is the faster the value chases its target. Using this instead of
 * `a += (b - a) * 0.1` means a 30 fps machine and a 144 Hz machine take the
 * same amount of *time* to settle rather than the same number of frames.
 */
export const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));

/** Smootherstep, for transitions that need to start and stop at rest. */
export const smoothstep = k => { const x = Math.min(Math.max(k, 0), 1); return x * x * x * (x * (x * 6 - 15) + 10); };

/**
 * Adaptive quality governor.
 *
 * A 3D plant has to hold its frame rate on an integrated laptop GPU in a
 * lecture theatre as well as on a workstation, so quality is measured and
 * adjusted rather than assumed. Two things are published:
 *
 *   quality — a 0.35…1 scalar for anything continuously variable, such as how
 *             many tracers a stream draws.
 *   tier    — 'high' | 'medium' | 'low', for switches that cannot be partly on,
 *             such as the bloom pass or the resolution the scene renders at.
 *
 * Both move with dwell time and hysteresis. A governor that reacts to a single
 * slow frame oscillates, and an oscillating renderer looks far worse than a
 * consistently simpler one.
 */
export function createQualityGovernor({ budgetMs = 13.5, headroomMs = 9.5, startTier = 'high' } = {}) {
  const TIERS = ['low', 'medium', 'high'];
  // Where to begin. A machine that is very unlikely to afford the top tier —
  // a phone — starts below it rather than spending its first seconds finding
  // that out, which is a visible drop rather than a smooth start.
  let quality = 1, tierIndex = Math.max(0, TIERS.indexOf(startTier));
  let below = 0, above = 0, settle = 2.5, age = 0;   // seconds out of band, and since start
  let fps = null, fpsAge = 0;               // null until a real interval is seen
  // A tier that has failed twice is not tried again. Without this ratchet a
  // machine that sits just the wrong side of the budget oscillates between two
  // tiers every few seconds, and bloom switching on and off looks far worse
  // than never having had it.
  let ceiling = 2;
  const failures = [0, 0, 0];
  const listeners = new Set();

  const off = onFrame(dt => {
    if (dt <= 0) return;
    // Ignore the opening seconds outright: shader compilation and texture
    // upload make the first frames unrepresentative of anything.
    if (settle > 0) { settle -= dt; return; }
    age += dt;

    // Frame rate is only meaningful when the browser is actually asking for
    // frames at display rate. A gap longer than 100 ms is a stall or a
    // throttled tab, not a slow renderer, so it is not counted.
    const raw = lastInterval();
    if (raw > 0.004 && raw < 0.1) {
      fps = fps === null ? 1 / raw : fps + ((1 / raw) - fps) * 0.06;
      fpsAge = 0;
    } else {
      fpsAge += dt;
      if (fpsAge > 2) fps = null;
    }

    // Quality follows the cost of the work, which is measurable whatever the
    // browser is doing with the frames afterwards.
    const work = frameWork();
    if (work > budgetMs) { below += dt; above = 0; }
    else if (work < headroomMs) { above += dt; below = 0; }
    else { below = Math.max(below - dt, 0); above = Math.max(above - dt, 0); }

    const wasTier = tierIndex;
    if (below > 1.0 && tierIndex > 0) {
      // Demotions in the first seconds do not count against a tier. Shader
      // compilation, texture upload and the first shadow render make the
      // opening frames expensive on any machine, and a ratchet that trusted
      // them would leave every machine permanently on the lowest setting.
      if (age > 8) {
        failures[tierIndex]++;
        if (failures[tierIndex] >= 2) ceiling = Math.min(ceiling, tierIndex - 1);
      }
      tierIndex--; below = 0;
    } else if (above > 3.5 && tierIndex < ceiling) { tierIndex++; above = 0; }

    // The continuous dial moves faster than the tier, so density drops before
    // anything is switched off outright.
    if (work > budgetMs && quality > 0.35) quality = Math.max(0.35, quality - dt * 0.5);
    else if (work < headroomMs && quality < 1) quality = Math.min(1, quality + dt * 0.2);

    if (wasTier !== tierIndex) for (const fn of listeners) fn(TIERS[tierIndex]);
  });

  return {
    /** Measured frames per second, or null when the browser is not asking for frames at display rate. */
    get fps() { return fps; },
    /** Milliseconds of work per frame — what the renderer actually costs. */
    get workMs() { return frameWork(); },
    get quality() { return quality; },
    get tier() { return TIERS[tierIndex]; },
    /** Called whenever the tier changes, so a renderer can reconfigure once. */
    onTier(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    dispose() { off(); listeners.clear(); }
  };
}
