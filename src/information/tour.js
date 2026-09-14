import { el } from '../shared/dom.js';
import { kv } from '../shared/components/panel.js';
import { val, isEmpty } from '../shared/format.js';
/**
 * Guided tour runner. A step moves the camera, highlights the equipment,
 * explains the section — and puts the numbers that step is about in front of
 * whoever is reading it, live.
 *
 * step = {id, title, text, tag?, preset?, watch:[resultKeys]}
 *
 * The watch list is the point of a step as much as the text is. A step about
 * the critical pigment volume concentration is not much use unless Λ is on the
 * screen while the formulation is being changed, so the panel re-renders
 * whenever a new result arrives and reads those keys straight out of it.
 * Anything the engine did not calculate shows an em dash, like everywhere else.
 */
export function createTour(steps, { view, store, flowsheet }) {
  let i = -1, host = null, onChange = null;

  function go(n) {
    i = Math.max(0, Math.min(n, steps.length - 1));
    const s = steps[i];
    if (s.tag) { store.set({ selection: s.tag }); view?.focus?.(s.tag); flowsheet?.select(s.tag); }
    else if (s.preset) view?.flyTo?.(...s.preset);
    store.set({ tourStep: i });
    return s;
  }

  /** Find a watched key wherever the engine chose to report it. */
  function lookup(result, key) {
    for (const section of ['results', 'quality', 'massBalance', 'energyBalance']) {
      const f = result?.[section]?.[key];
      if (f) return f;
    }
    return null;
  }

  const api = {
    steps,
    get index() { return i; },
    start: () => go(0),
    next: () => go(i + 1),
    prev: () => go(i - 1),
    stop() { i = -1; store.set({ tourStep: null }); },

    render(container, cb) {
      if (container) host = container;
      if (cb) onChange = cb;
      if (!host) return;
      host.innerHTML = '';
      const s = steps[i];
      if (!s) {
        host.appendChild(el('div', { class: 'fallback', text: 'Start the tour to walk through the process section by section.' }));
        return;
      }
      host.append(
        el('div', { style: 'font-family:var(--mono);font-size:11px;color:var(--ink-faint)', text: `Step ${i + 1} of ${steps.length}` }),
        el('strong', { text: s.title }),
        el('p', { style: 'font-size:12.5px;color:var(--ink-dim)', text: s.text })
      );

      // The numbers this step is about, as they stand right now.
      const result = store.get().result;
      const watched = (s.watch || []).map(k => [k, lookup(result, k)]).filter(e => e[1]);
      if (watched.length) {
        host.append(
          el('div', { style: 'font-family:var(--mono);font-size:10.5px;color:var(--ink-faint);letter-spacing:.06em;text-transform:uppercase;margin:10px 0 2px', text: 'Watch while you change things' }),
          el('div', {}, watched.map(e => kv(e[1].label || e[0],
            isEmpty(e[1].value) ? '—' : val(e[1].value, e[1].unit, e[1].digits ?? 2))))
        );
      }

      host.append(el('div', { class: 'btnrow', style: 'margin-top:10px' }, [
        el('button', { class: 'btn', text: 'Back', disabled: i === 0 || null, onClick: () => { go(i - 1); onChange?.(); } }),
        el('button', {
          class: 'btn primary', text: i === steps.length - 1 ? 'Finish' : 'Next',
          onClick: () => { if (i === steps.length - 1) api.stop(); else go(i + 1); onChange?.(); }
        })
      ]));
    }
  };

  // A tour step is about numbers that move, so the panel follows the result
  // rather than waiting for the next click.
  store.subKeys(['result', 'status'], () => { if (host && i >= 0) api.render(); });
  return api;
}
