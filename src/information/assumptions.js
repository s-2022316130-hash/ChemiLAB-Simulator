import { el } from '../shared/dom.js';
import { panel, collapsible } from '../shared/components/panel.js';
import { KIND } from '../simulation/contract.js';
import { TERMS } from './glossary.js';

/**
 * Model assumptions, grouped by where the number came from.
 *
 * Provenance is the whole point of this panel. A first-principles calculation
 * and an educational approximation are both "the model", and a student has a
 * right to know which one they are standing on — so each group is marked in its
 * own colour and named for what it is, rather than all of it appearing as one
 * undifferentiated list of caveats.
 */

/** The provenance colours, matched to the --kind-* tokens in tokens.css. */
const KIND_TOKEN = {
  [KIND.USER]: '--kind-user',
  [KIND.CALC]: '--kind-calc',
  [KIND.FIRST]: '--kind-calc',
  [KIND.CORR]: '--kind-corr',
  [KIND.APPROX]: '--kind-approx',
  [KIND.REF]: '--kind-ref'
};

/** assumption = {text, kind: KIND.*, source?} */
export function assumptionsPanel(assumptions = [], modelVersion = '—') {
  const groups = Object.values(KIND)
    .map(kind => ({ kind, items: assumptions.filter(a => a.kind === kind) }))
    .filter(g => g.items.length);

  return panel({
    title: 'Model assumptions',
    right: el('span', { class: 'tag', text: `model ${modelVersion}` }),
    body: [
      el('div', { class: 'msg', dataset: { lvl: 'info' } }, [
        el('strong', { text: 'This is a teaching model. ' }),
        document.createTextNode('It is not a validated commercial process simulator and must not be used for design.')
      ]),
      ...groups.map(g => el('div', { class: 'kindgroup', style: `--kind:var(${KIND_TOKEN[g.kind] || '--ink-faint'})` }, [
        el('div', { class: 'kindhead' }, [
          el('i'),
          el('span', { text: g.kind }),
          el('b', { text: String(g.items.length) })
        ]),
        el('ul', { class: 'eq-list' },
          g.items.map(a => el('li', { text: a.source ? `${a.text} (${a.source})` : a.text })))
      ])),
      // The vocabulary the assumptions above are written in, which is worth
      // having in the same place as the assumptions themselves.
      collapsible('Terminology', Object.entries(TERMS).map(([term, meaning]) =>
        el('div', { class: 'term' }, [
          el('div', { class: 'term-t', text: term }),
          el('div', { class: 'term-d', text: meaning })
        ])))
    ]
  });
}
