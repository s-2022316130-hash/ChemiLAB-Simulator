import { el } from '../shared/dom.js';
import { panel, kv, collapsible } from '../shared/components/panel.js';
/**
 * Equipment information schema. Every field is required for a real entry —
 * an incomplete card is better shown as "documentation pending" than invented.
 * {tag,name,type,purpose,howItWorks,whyUsed,inputs[],outputs[],
 *  operatingVariables[], designVariables[], misoperation[],
 *  theory, equations[], practice, safety[], troubleshooting[{symptom,cause,action}]}
 */
export function equipmentCard(info, liveValues = null) {
  if (!info) return panel({ title: 'Equipment', body: [el('div', { class: 'fallback', text: 'Select an item in the plant or the flowsheet.' })] });
  const list = (items) => el('ul', { style: 'margin:4px 0 8px 16px;padding:0;color:var(--ink-dim);font-size:12.5px' },
    (items || []).map(i => el('li', { text: i })));
  const body = [
    el('div', { style: 'display:flex;gap:8px;align-items:center;margin-bottom:6px' }, [
      el('strong', { text: info.name }), el('span', { class: 'tag', text: info.tag })
    ]),
    el('p', { style: 'margin:0 0 10px;color:var(--ink-dim);font-size:13px', text: info.purpose }),
  ];
  if (liveValues && Object.keys(liveValues).length) {
    body.push(el('div', { style: 'margin-bottom:8px' }, Object.entries(liveValues).map(([k, v]) => kv(k, v))));
  }
  body.push(
    collapsible('How it works', [el('p', { style: 'font-size:12.5px;color:var(--ink-dim)', text: info.howItWorks })], true),
    collapsible('Why it is used', [el('p', { style: 'font-size:12.5px;color:var(--ink-dim)', text: info.whyUsed })]),
    collapsible('Inputs and outputs', [el('div', {}, [el('div', { text: 'In', style: 'font-size:11px;color:var(--ink-faint)' }), list(info.inputs), el('div', { text: 'Out', style: 'font-size:11px;color:var(--ink-faint)' }), list(info.outputs)])]),
    collapsible('Key operating variables', [list(info.operatingVariables)]),
    collapsible('Design variables', [list(info.designVariables)]),
    collapsible('If it is misoperated', [list(info.misoperation)]),
    info.theory && collapsible('Theory', [el('p', { style: 'font-size:12.5px;color:var(--ink-dim)', text: info.theory })]),
    info.equations?.length && collapsible('Equations', info.equations.map(equationBlock)),
    info.practice && collapsible('Industrial practice', [el('p', { style: 'font-size:12.5px;color:var(--ink-dim)', text: info.practice })]),
    info.safety?.length && collapsible('Safety', [list(info.safety)]),
    info.troubleshooting?.length && collapsible('Troubleshooting', info.troubleshooting.map(t =>
      el('div', { style: 'margin-bottom:8px;font-size:12.5px' }, [
        el('div', { text: t.symptom }),
        el('div', { style: 'color:var(--ink-faint)', text: `Likely cause: ${t.cause}` }),
        el('div', { style: 'color:var(--accent)', text: `Action: ${t.action}` })
      ])))
  );
  return panel({ title: 'Equipment inspection', body: body.filter(Boolean) });
}
export function equationBlock(eq) {
  return el('div', { style: 'margin-bottom:10px' }, [
    el('div', { style: 'font-size:12.5px', text: eq.what }),
    el('code', { style: 'display:block;margin:4px 0;padding:6px 8px;background:var(--bg-2);border-left:2px solid var(--accent-deep);font-family:var(--mono);font-size:12px;white-space:pre-wrap', text: eq.equation }),
    eq.why && el('div', { style: 'font-size:11.5px;color:var(--ink-dim)', text: `Why it matters: ${eq.why}` }),
    eq.inputs && el('div', { style: 'font-size:11.5px;color:var(--ink-faint)', text: `Inputs: ${eq.inputs.join(', ')}` }),
    eq.units && el('div', { style: 'font-size:11.5px;color:var(--ink-faint)', text: `Units: ${eq.units}` }),
    eq.interpretation && el('div', { style: 'font-size:11.5px;color:var(--ink-dim)', text: eq.interpretation })
  ].filter(Boolean));
}
