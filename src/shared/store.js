// Single observable store per simulator session. Subscribers get (state, changedKeys).
export function createStore(initial = {}) {
  let state = { ...initial };
  const subs = new Set();
  return {
    get: () => state,
    set(patch) {
      const next = typeof patch === 'function' ? patch(state) : patch;
      const keys = Object.keys(next).filter(k => next[k] !== state[k]);
      if (!keys.length) return state;
      state = { ...state, ...next };
      subs.forEach(fn => fn(state, keys));
      return state;
    },
    // fn(state, changedKeys); called once immediately with ['*']
    sub(fn) { subs.add(fn); fn(state, ['*']); return () => subs.delete(fn); },
    subKeys(keys, fn) {
      return this.sub((s, ch) => { if (ch[0] === '*' || ch.some(k => keys.includes(k))) fn(s, ch); });
    }
  };
}
