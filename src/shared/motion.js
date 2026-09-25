/**
 * Motion helpers for the few transitions CSS cannot run on its own.
 *
 * Almost all of this interface's movement is declared in theme.css, where the
 * global `prefers-reduced-motion` rule already reaches it. What lives here is
 * the handful of cases where JavaScript has to wait for, or drive, a movement —
 * a page fading out before the next one is built, a theme change the browser
 * snapshots, a colour change in the 3D plant — and every one of them has to ask
 * the same question first, because the CSS rule cannot reach a `setTimeout`.
 */

const query = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

/** True when the person using this has asked for less movement. */
export const reducedMotion = () => !!query?.matches;

/** Resolve after the next painted frame — after the browser has shown a change. */
export const nextFrame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

/**
 * A plain delay. Not skipped under reduced motion: what it waits for is a fade,
 * and a fade is exactly what reduced motion keeps (see the REDUCED MOTION block
 * at the end of theme.css).
 */
export const wait = ms => (ms <= 0 ? Promise.resolve() : new Promise(r => setTimeout(r, ms)));

/**
 * Read a duration token such as `--dur-exit` as milliseconds.
 *
 * The number lives in tokens.css with every other duration, so the JavaScript
 * that waits on a transition waits exactly as long as the transition runs. Two
 * copies of one number drift, and a wait that is shorter than its animation
 * cuts the animation off.
 */
export function durationOf(token, fallback = 0) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return fallback;
  return raw.endsWith('ms') ? n : raw.endsWith('s') ? n * 1000 : n;
}

/**
 * Run a DOM change inside a View Transition when the browser has them;
 * otherwise just run it.
 *
 * `kind` is stamped on the root for the duration so the stylesheet can give
 * each kind of transition its own animation — the default cross-fade is right
 * for almost nothing here. Reduced motion does not skip it: the stylesheet
 * swaps the movement for a plain cross-fade, which is the point of asking.
 */
let vtSeq = 0;
export function viewTransition(kind, update) {
  if (typeof document.startViewTransition !== 'function') {
    update();
    return Promise.resolve();
  }
  const root = document.documentElement;
  // Starting a transition cancels the one already running, and the cancelled
  // one settles straight afterwards. Without a sequence number its clean-up
  // would remove the marker the new one has just set, and a quick second click
  // would lose its styling halfway through.
  const my = ++vtSeq;
  root.dataset.vt = kind;
  const t = document.startViewTransition(update);
  const done = () => { if (my === vtSeq) delete root.dataset.vt; };
  t.finished.then(done, done);
  // A skipped transition — a second click, or a page that went to the
  // background mid-way — rejects `ready` with an AbortError. The change itself
  // has still been applied; only the animation did not run, so there is
  // nothing to report.
  t.ready.catch(() => {});
  return t.finished.catch(() => {});
}
