import { el, clear } from '../shared/dom.js';
import { stateOf } from '../scene/labels.js';

const ORDER = ['tripped', 'warning', 'stopped', 'running'];
const GAP_MS = 2500;   // at most one spoken update this often

/** "1 tripped, 2 warning, 13 running" — trouble first. */
function counts(states) {
  const n = {};
  for (const s of states.values()) if (s) n[s] = (n[s] || 0) + 1;
  return ORDER.filter(k => n[k]).map(k => `${n[k]} ${k}`).join(', ');
}

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

  // The plant's state in words. The canvas draws it in colour; this says it.
  // `sayEl` sits inside the HUD, which is already a polite live region, and
  // carries short, throttled announcements of what changed. `summaryEl` is
  // outside it and always holds the whole picture, for the canvas to be
  // described by without that description being read out on every update.
  const sayEl = el('p', { class: 'hud-say sr-only' });
  const summaryEl = el('p', { class: 'sr-only', id: 'plant-state-summary', text: 'No run yet, so no unit has a state.' });

  const root = el('div', {
    class: 'hud', dataset: { on: 'false' },
    role: 'status', 'aria-live': 'polite'
  }, [
    el('div', { class: 'hud-top' }, [tagEl, stateEl]),
    nameEl, rowsEl, footEl, sayEl
  ]);
  host.append(root, summaryEl);

  let told = new Map();          // what was last announced, tag → state
  let pending = null, timer = 0, last = -Infinity;
  const nameOf = (info, tag) => info?.[tag]?.name ? `${info[tag].name} (${tag})` : tag;

  function flush() {
    timer = 0;
    const { now, info } = pending;
    pending = null;
    const changed = [...now].filter(([tag, s]) => s && told.get(tag) !== s);
    let text = '';
    if (!told.size) {
      text = `Run complete. Units: ${counts(now)}.`;
    } else if (changed.length && changed.length <= 3) {
      text = changed.map(([tag, s]) => `${nameOf(info, tag)} now ${s}`).join('; ') + '.';
    } else if (changed.length) {
      text = `${changed.length} units changed state. Units: ${counts(now)}.`;
    }
    told = now;
    last = performance.now();
    if (text) sayEl.textContent = text;
  }

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
    /**
     * Unit states after a run, as words. `eq` is the engine's equipment
     * record, or null when no result is on screen; `info` names the units.
     * Announcements are coalesced: a burst of runs says one thing, about the
     * last of them, no sooner than GAP_MS after the previous one.
     */
    states(eq, info) {
      if (!eq) {
        clearTimeout(timer); timer = 0; pending = null; told = new Map();
        summaryEl.textContent = 'No run on screen, so no unit has a state.';
        return;
      }
      const now = new Map(Object.entries(eq).map(([tag, entry]) => [tag, stateOf(entry)]));
      summaryEl.textContent = now.size ? `After the last run: ${counts(now) || 'no unit reported a state'}.` : '';
      pending = { now, info };
      if (!timer) timer = setTimeout(flush, Math.max(0, last + GAP_MS - performance.now()));
    },
    dispose() { clearTimeout(timer); root.remove(); summaryEl.remove(); }
  };
}
