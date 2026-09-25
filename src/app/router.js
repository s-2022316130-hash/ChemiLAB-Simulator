import { wait, durationOf } from '../shared/motion.js';

/**
 * Hash router: works from a static host and from file://, no server rewrite needed.
 *
 * A navigation has two phases, and the view carries which one it is in as
 * `data-phase` so the stylesheet can move it.
 *
 *   leave  the page on its way out fades and lifts, briefly. It is shorter than
 *          the entrance on purpose: an exit is never the interesting part, and
 *          one that takes as long as an arrival doubles every navigation.
 *   enter  the new page is mounted and its parts arrive in order.
 *
 * Not a View Transition. Opening a simulator builds a 3D scene synchronously —
 * compiling shaders, uploading geometry — and on a slow machine that is well
 * over a second. A View Transition holds the old frame frozen until the new one
 * is ready, so the page would appear to hang for exactly as long as the build
 * took. A short exit and a staged entrance keep something moving the whole way.
 */
export function createRouter(routes, render, { view } = {}) {
  function parse() {
    const raw = location.hash.replace(/^#\/?/, '');
    const parts = raw.split('/').filter(Boolean);
    if (!parts.length) return { name: 'home', params: {} };
    if (parts[0] === 'simulators' && parts[1]) return { name: 'simulator', params: { id: parts[1] } };
    if (parts[0] === 'simulators') return { name: 'simulators', params: {} };
    return { name: 'home', params: {} };
  }
  let current = null;
  let nav = 0;
  async function handle() {
    const my = ++nav;
    const route = parse();
    // Reduced motion still gets the exit: the stylesheet takes the lift out of
    // it and leaves the fade, and a fade is not movement.
    if (current && view) {
      view.dataset.phase = 'leave';
      await wait(durationOf('--dur-exit', 140));
      // A second navigation during the exit supersedes this one. It will run
      // its own exit and its own dispose; this one has nothing left to do.
      if (my !== nav) return;
    }
    current?.dispose?.();
    if (view) {
      // A new page starts at its top. Carrying the scroll position of the page
      // you left into one with a different length lands you somewhere
      // arbitrary in the middle of it.
      view.scrollTop = 0;
      view.dataset.phase = 'enter';
    }
    current = await routes[route.name](route.params);
    render(route, current);
  }
  addEventListener('hashchange', handle);
  return { start: handle, get route() { return parse(); }, go: path => { location.hash = path; } };
}
export const href = {
  home: '#/', simulators: '#/simulators', simulator: id => `#/simulators/${id}`
};
