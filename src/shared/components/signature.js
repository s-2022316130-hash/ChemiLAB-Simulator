import { el } from '../dom.js';

/**
 * Author's signature.
 *
 * Two forms of one mark. On the overview it is given room, a rule above it and
 * a metallic gradient that picks up the active hue — the way a piece of work is
 * signed. Inside a simulator it is one quiet line at the end of the content,
 * because the workspace belongs to the plant and not to whoever built it.
 *
 * It is deliberately not a glowing effect. A name set in an italic serif
 * against this much mono and sans is distinctive precisely because nothing else
 * on the page looks like it; adding light to it would make it decoration.
 */
export const AUTHOR = 'Shafin Ahamed Neon';
export const DEPARTMENT = 'Department of Applied Chemistry & Chemical Engineering';
export const INSTITUTION = 'University of Dhaka';
export const CONTACT = 'shafin.neon11@gmail.com';

export function signature({ compact = false } = {}) {
  return el('div', { class: 'signature', dataset: { compact: String(compact) } }, [
    !compact && el('span', { class: 'rule' }),
    el('span', { class: 'by', text: compact ? 'Built by' : 'Designed and built by' }),
    el('span', { class: 'name', text: AUTHOR }),
    // Department and institution on their own lines rather than in one run.
    // Set in the mono face at micro size, the whole thing is seventy-odd
    // characters and would either wrap somewhere arbitrary or force the
    // signature wider than anything else on the page.
    !compact && el('span', { class: 'role' }, [
      el('span', { text: DEPARTMENT }),
      el('span', { class: 'inst', text: INSTITUTION })
    ]),
    !compact && el('a', { class: 'contact', href: `mailto:${CONTACT}`, text: CONTACT })
  ].filter(Boolean));
}

export default signature;
