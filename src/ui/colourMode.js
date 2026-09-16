import { el } from '../shared/dom.js';
import { rampGradient, rampNone } from '../shared/ramp.js';
import { val } from '../shared/format.js';

/**
 * "Shade by" — what colour means on the plant right now.
 *
 * The modes are declared by the engine, never assembled here. That is what
 * makes this honest: the interface cannot offer to shade a water works by
 * temperature, because that plant is isothermal and its engine publishes no
 * temperature to shade by. An interface that built its own list would have to
 * either grey the option out or invent a number for it, and one of those is a
 * lie while the other is a menu of disappointments.
 *
 * It comes in two pieces because they belong in two places. The switch is a
 * control, so it joins the other view controls in the toolbar. The scale is a
 * legend, so it sits at the bottom-left corner of the viewport where every
 * drawing tool has put one for forty years — and, more practically, where it is
 * not competing with the toolbar for the same corner on a narrow canvas.
 *
 * The scale is not decoration. A shaded plant without one is a picture: you can
 * see that one vessel is redder than another and you cannot say by how much,
 * from what, or whether the grey one is cold or simply not measured.
 */
export function createColourMode(modes, onChange) {
  const list = (modes || []).filter(m => m && m.id && m.label);
  if (list.length < 2) return null;         // nothing to switch between

  let current = list[0];

  const pills = el('span', { class: 'btnrow cmode-pills', role: 'group', 'aria-label': 'Shade the plant by' });
  const bar = el('i', { class: 'cmode-bar' });
  const lo = el('span', { class: 'cmode-end' });
  const hi = el('span', { class: 'cmode-end' });
  const noneSwatch = el('i');
  const legend = el('div', { class: 'cmode-legend', hidden: true }, [
    el('div', { class: 'cmode-title' }),
    el('div', { class: 'cmode-track' }, [bar]),
    el('div', { class: 'cmode-ends' }, [lo, hi]),
    el('div', { class: 'cmode-none' }, [noneSwatch, el('span', { text: 'no reading' })])
  ]);

  const buttons = new Map();
  for (const m of list) {
    const b = el('button', {
      class: 'btn', type: 'button', text: m.label,
      title: m.what || m.label,
      'aria-pressed': 'false',
      onClick: () => apply(m.id)
    });
    buttons.set(m.id, b);
    pills.appendChild(b);
  }

  function paint() {
    for (const [id, b] of buttons) {
      const on = id === current.id;
      b.dataset.on = String(on);
      b.setAttribute('aria-pressed', String(on));
    }
    const scaled = current.kind === 'scale' && Array.isArray(current.domain);
    legend.hidden = !scaled;
    if (!scaled) return;
    bar.style.background = rampGradient();
    noneSwatch.style.background = rampNone();
    const [a, b2] = current.domain;
    const d = current.digits ?? 1;
    legend.querySelector('.cmode-title').textContent = current.label;
    lo.textContent = val(a, current.unit, d);
    hi.textContent = val(b2, current.unit, d);
    // A logarithmic ramp has to say so. The distance between two units on one is
    // a ratio rather than a difference, and a reader who assumes otherwise will
    // misread the middle of the plant by an order of magnitude.
    legend.dataset.log = String(current.scale === 'log');
    legend.title = current.what || '';
  }

  function apply(id) {
    const next = list.find(m => m.id === id);
    if (!next || next.id === current.id) return;
    current = next;
    paint();
    onChange?.(current);
  }

  paint();

  return {
    pills, legend,
    get mode() { return current; },
    /** Re-read the ramp from the design tokens — the colours move with theme. */
    refresh: paint,
    dispose() { pills.remove(); legend.remove(); }
  };
}
