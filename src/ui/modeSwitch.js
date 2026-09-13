import { el } from '../shared/dom.js';
import { LEVEL_ORDER } from '../simulation/contract.js';
const LABEL = { student: 'Student', engineer: 'Engineer', expert: 'Expert' };
export function createModeSwitch(store) {
  return el('div', { class: 'btnrow' }, LEVEL_ORDER.map(lv =>
    el('button', {
      class: 'btn', text: LABEL[lv],
      onClick: e => { store.set({ level: lv }); [...e.target.parentNode.children].forEach(c => c.classList.remove('primary')); e.target.classList.add('primary'); }
    })
  ).map((b, i) => (i === 0 ? (b.classList.add('primary'), b) : b)));
}
