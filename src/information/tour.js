import { el } from '../shared/dom.js';
import { val, isEmpty } from '../shared/format.js';
import { icon } from '../shared/icons.js';

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
        host.appendChild(el('div', { class: 'empty' }, [
          el('div', { class: 'glyph', html: icon('book') }),
          el('b', { text: 'Eight steps through the plant' }),
          el('p', { text: 'Each one moves the camera to a section, says why it exists, and puts the numbers it is about on screen while you change things.' })
        ]));
        return;
      }

      // Progress as a row of ticks rather than "3 of 8": it says where you are
      // and how much is left in the space a sentence would take.
      const ticks = el('div', { class: 'tour-ticks' },
        steps.map((_, k) => el('i', { dataset: { on: String(k <= i) } })));

      host.append(
        el('div', { class: 'tour-head' }, [
          el('span', { class: 'tour-n', text: `Step ${i + 1} / ${steps.length}` }),
          ticks
        ]),
        el('strong', { class: 'tour-title', text: s.title }),
        el('p', { class: 'tour-text', text: s.text })
      );

      // The numbers this step is about, as they stand right now.
      const result = store.get().result;
      const watched = (s.watch || []).map(k => [k, lookup(result, k)]).filter(e => e[1]);
      if (watched.length) {
        host.append(
          el('div', { class: 'sect', dataset: { accent: 'true' }, text: 'Watch while you change things' }),
          el('div', { class: 'tour-watch' }, watched.map(([key, f]) => el('div', { class: 'kv' }, [
            el('span', { class: 'k', text: f.label || key }),
            el('span', {
              class: `v ${isEmpty(f.value) ? 'empty' : ''}`,
              text: isEmpty(f.value) ? '—' : val(f.value, f.unit, f.digits ?? 2)
            })
          ])))
        );
      }

      host.append(el('div', { class: 'btnrow', style: 'margin-top:12px' }, [
        el('button', {
          class: 'btn', text: 'Back', disabled: i === 0 || null,
          onClick: () => { go(i - 1); onChange?.(); }
        }),
        el('button', {
          class: 'btn primary',
          html: i === steps.length - 1 ? 'Finish' : `Next ${icon('arrow')}`,
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
