import { el, clear } from '../shared/dom.js';

/**
 * Engineering HUD — the plate that floats over the 3D plant for whatever is
 * selected.
 *
 * It carries exactly what a control-room faceplate carries: the tag, what the
 * item is called, the state it is in, and the readings the engine reported for
 * it. Nothing is computed here and nothing is inferred — `entry` is the
 * engine's own equipment record, already carrying em dashes for anything it did
 * not calculate, and this module renders it and stops.
 *
 * Deliberately a corner plate rather than a panel or a modal. The 3D view is
 * small already; anything that covers the middle of it is worse than useless,
 * and anything that has to be dismissed is one more thing to do. It appears
 * when something is selected and goes when nothing is.
 */
export function createHud(host) {
  const tagEl = el('span', { class: 'hud-tag' });
  const stateEl = el('span', { class: 'hud-state' });
  const nameEl = el('div', { class: 'hud-name' });
  const rowsEl = el('div', { class: 'hud-rows' });
  const footEl = el('div', { class: 'hud-foot' });

  const root = el('div', {
    class: 'hud', dataset: { on: 'false' },
    role: 'status', 'aria-live': 'polite'
  }, [
    el('div', { class: 'hud-top' }, [tagEl, stateEl]),
    nameEl, rowsEl, footEl
  ]);
  host.appendChild(root);

  return {
    /**
     * @param tag    the selected equipment tag, or null
     * @param info   the equipment information card for it, for its name
     * @param entry  engine.getEquipmentState()[tag] — {state, alarm, values}
     */
    show(tag, info, entry) {
      if (!tag) { root.dataset.on = 'false'; return; }
      root.dataset.on = 'true';
      tagEl.textContent = tag;
      nameEl.textContent = info?.name || '';
      nameEl.title = info?.name || '';

      // No run yet means no state to report, which is not the same as being
      // stopped. It says so rather than showing a colour that means something.
      const state = entry?.alarm ? 'warning' : (entry?.state || null);
      stateEl.dataset.s = state || '';
      stateEl.textContent = state ? state : 'no data';

      clear(rowsEl);
      const values = entry?.values ? Object.entries(entry.values) : [];
      if (values.length) {
        for (const [k, v] of values) {
          rowsEl.appendChild(el('div', { class: 'hud-row' }, [
            el('span', { text: k }),
            el('span', { class: v === '—' ? 'empty' : '', text: v })
          ]));
        }
        footEl.textContent = 'Live from the model';
      } else {
        rowsEl.appendChild(el('div', { class: 'hud-row' }, [
          el('span', { text: 'Readings' }),
          el('span', { class: 'empty', text: '—' })
        ]));
        footEl.textContent = 'Run the plant';
      }
    },
    dispose() { root.remove(); }
  };
}
