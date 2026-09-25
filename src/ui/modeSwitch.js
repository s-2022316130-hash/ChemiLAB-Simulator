import { el } from '../shared/dom.js';
import { LEVEL_ORDER } from '../simulation/contract.js';

/**
 * Detail level. Student, Engineer, Expert — which controls and which
 * assumptions are on screen.
 *
 * A segmented control rather than three buttons, because this is one setting
 * with three positions, not three things you can do. Three buttons where one is
 * highlighted reads as "I have already pressed that"; a segment reads as "this
 * is where the dial is", which is what it means.
 */
const LABEL = { student: 'Student', engineer: 'Engineer', expert: 'Expert' };
const HINT = {
  student: 'The controls that change the process, and the results they change.',
  engineer: 'Adds design variables, equipment sizing and the full calculation trace.',
  expert: 'Everything the model exposes, including the correlation parameters.'
};

export function createModeSwitch(store) {
  const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Detail level' });
  const note = el('div', {
    style: 'margin-top:7px;font-size:var(--t-fine);color:var(--ink-ghost);line-height:1.45;min-height:2.9em'
  });
  const buttons = LEVEL_ORDER.map(lv => el('button', {
    type: 'button', text: LABEL[lv], title: HINT[lv],
    onClick: () => store.set({ level: lv })
  }));
  seg.append(...buttons);
  // The selection is one thumb that slides between positions, drawn by the
  // stylesheet from these two numbers. A highlight that jumps from one button to
  // another reads as three buttons; one that travels reads as a dial being
  // turned, which is what changing the detail level is.
  seg.style.setProperty('--seg-n', String(LEVEL_ORDER.length));

  store.subKeys(['level'], s => {
    LEVEL_ORDER.forEach((lv, i) => buttons[i].setAttribute('aria-pressed', String(lv === s.level)));
    seg.style.setProperty('--seg-i', String(Math.max(0, LEVEL_ORDER.indexOf(s.level))));
    // Not before the first position is set, or the thumb would slide into place
    // from the left on every page load.
    if (!seg.dataset.ready) requestAnimationFrame(() => { seg.dataset.ready = 'true'; });
    note.textContent = HINT[s.level] || '';
  });

  return el('div', {}, [seg, note]);
}
