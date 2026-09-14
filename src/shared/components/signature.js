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

export function signature({ compact = false } = {}) {
  return el('div', { class: 'signature', dataset: { compact: String(compact) } }, [
    !compact && el('span', { class: 'rule' }),
    el('span', { class: 'by', text: compact ? 'Built by' : 'Designed and built by' }),
    el('span', { class: 'name', text: AUTHOR }),
    !compact && el('span', { class: 'role', text: 'Applied Chemistry and Chemical Engineering' })
  ].filter(Boolean));
}

export default signature;
