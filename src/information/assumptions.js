import { el } from '../shared/dom.js';
import { panel } from '../shared/components/panel.js';
import { KIND } from '../simulation/contract.js';
/** assumption = {text, kind: KIND.*, source?} */
export function assumptionsPanel(assumptions = [], modelVersion = '—') {
  const groups = Object.values(KIND).map(kind => ({ kind, items: assumptions.filter(a => a.kind === kind) })).filter(g => g.items.length);
  return panel({
    title: 'Model assumptions',
    right: el('span', { class: 'tag', text: `model ${modelVersion}` }),
    body: [
      el('p', { style: 'font-size:12px;color:var(--ink-dim);margin:0 0 10px', text: 'This is a teaching model. It is not a validated commercial process simulator and must not be used for design.' }),
      ...groups.map(g => el('div', { style: 'margin-bottom:10px' }, [
        el('div', { style: 'font-family:var(--mono);font-size:11px;color:var(--accent)', text: g.kind }),
        el('ul', { style: 'margin:4px 0 0 16px;padding:0;font-size:12.5px;color:var(--ink-dim)' },
          g.items.map(a => el('li', { text: a.source ? `${a.text} (${a.source})` : a.text })))
      ]))
    ]
  });
}
