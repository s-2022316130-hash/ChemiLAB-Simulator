import { el } from '../shared/dom.js';
/**
 * Guided tour runner. A step moves the camera, highlights equipment,
 * explains the section and names the variables to watch.
 * step = {id, title, text, tag?, preset?, watch:[resultKeys]}
 */
export function createTour(steps, { view, store, flowsheet }) {
  let i = -1;
  function go(n) {
    i = Math.max(0, Math.min(n, steps.length - 1));
    const s = steps[i];
    if (s.tag) { store.set({ selection: s.tag }); view?.focus?.(s.tag); flowsheet?.select(s.tag); }
    else if (s.preset) view?.flyTo?.(...s.preset);
    store.set({ tourStep: i });
    return s;
  }
  return {
    steps, get index() { return i; },
    start: () => go(0), next: () => go(i + 1), prev: () => go(i - 1),
    stop() { i = -1; store.set({ tourStep: null }); },
    render(container, onChange) {
      container.innerHTML = '';
      const s = steps[i];
      if (!s) { container.appendChild(el('div', { class: 'fallback', text: 'Start the tour to walk through the process section by section.' })); return; }
      container.append(
        el('div', { style: 'font-family:var(--mono);font-size:11px;color:var(--ink-faint)', text: `Step ${i + 1} of ${steps.length}` }),
        el('strong', { text: s.title }),
        el('p', { style: 'font-size:12.5px;color:var(--ink-dim)', text: s.text }),
        el('div', { class: 'btnrow' }, [
          el('button', { class: 'btn', text: 'Back', onClick: () => { go(i - 1); onChange?.(); } }),
          el('button', { class: 'btn primary', text: i === steps.length - 1 ? 'Finish' : 'Next', onClick: () => { i === steps.length - 1 ? this.stop() : go(i + 1); onChange?.(); } })
        ])
      );
    }
  };
}
