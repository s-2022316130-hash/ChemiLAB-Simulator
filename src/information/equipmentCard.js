import { el } from '../shared/dom.js';
import { panel, kv, collapsible } from '../shared/components/panel.js';
import { icon } from '../shared/icons.js';

/**
 * Equipment information card.
 *
 * Every field is required for a real entry — an incomplete card is better shown
 * as "documentation pending" than invented.
 *
 * {tag,name,type,purpose,howItWorks,whyUsed,inputs[],outputs[],
 *  operatingVariables[], designVariables[], misoperation[],
 *  theory, equations[], practice, safety[], troubleshooting[{symptom,cause,action}]}
 *
 * The order is the order someone asks the questions: what is this, what is it
 * doing right now, how does it work, why is it here, and only then the depth.
 * Live readings sit directly under the name because they are the part that
 * changes; everything below them is reference and is collapsed by default.
 */
export function equipmentCard(info, liveValues = null) {
  if (!info) {
    return panel({
      title: 'Equipment',
      body: [el('div', { class: 'empty' }, [
        el('div', { class: 'glyph', html: icon('cursor') }),
        el('b', { text: 'Nothing selected' }),
        el('p', { text: 'Click a unit in the 3D plant or on the flowsheet. Both views select together.' })
      ])]
    });
  }

  const list = items => el('ul', { class: 'eq-list' }, (items || []).map(i => el('li', { text: i })));
  const prose = text => el('p', { class: 'eq-prose', text });

  const body = [
    el('div', { class: 'eq-head' }, [
      el('span', { class: 'eq-tag', text: info.tag }),
      el('div', {}, [
        el('strong', { class: 'eq-name', text: info.name }),
        info.type ? el('span', { class: 'eq-type', text: info.type }) : null
      ].filter(Boolean))
    ]),
    prose(info.purpose)
  ];

  if (liveValues && Object.keys(liveValues).length) {
    body.push(
      el('h3', { class: 'sect', dataset: { accent: 'true' }, text: 'Live from the model' }),
      el('div', { class: 'eq-live' }, Object.entries(liveValues).map(([k, v]) => kv(k, v)))
    );
  }

  body.push(
    collapsible('How it works', [prose(info.howItWorks)], true),
    collapsible('Why it is used', [prose(info.whyUsed)]),
    collapsible('Inputs and outputs', [el('div', {}, [
      el('div', { class: 'eq-sub', text: 'In' }), list(info.inputs),
      el('div', { class: 'eq-sub', text: 'Out' }), list(info.outputs)
    ])]),
    collapsible('Key operating variables', [list(info.operatingVariables)]),
    collapsible('Design variables', [list(info.designVariables)]),
    collapsible('If it is misoperated', [list(info.misoperation)]),
    info.theory && collapsible('Theory', [prose(info.theory)]),
    info.equations?.length && collapsible('Equations', info.equations.map(equationBlock)),
    info.practice && collapsible('Industrial practice', [prose(info.practice)]),
    info.safety?.length && collapsible('Safety', [list(info.safety)]),
    info.troubleshooting?.length && collapsible('Troubleshooting', info.troubleshooting.map(t =>
      el('div', { class: 'tshoot' }, [
        el('div', { class: 'ts-sym' }, [el('span', { class: 'ts-i', html: icon('alert') }), el('span', { text: t.symptom })]),
        el('div', { class: 'ts-row' }, [el('b', { text: 'Likely cause' }), el('span', { text: t.cause })]),
        el('div', { class: 'ts-row ts-act' }, [el('b', { text: 'Action' }), el('span', { text: t.action })])
      ])))
  );

  return panel({ title: 'Equipment inspection', body: body.filter(Boolean) });
}

export function equationBlock(eq) {
  return el('div', { class: 'eqn' }, [
    el('div', { class: 'eqn-what', text: eq.what }),
    el('code', { class: 'eqn-code', text: eq.equation }),
    eq.why && el('div', { class: 'eqn-note', text: `Why it matters: ${eq.why}` }),
    eq.inputs && el('div', { class: 'eqn-meta', text: `Inputs: ${eq.inputs.join(', ')}` }),
    eq.units && el('div', { class: 'eqn-meta', text: `Units: ${eq.units}` }),
    eq.interpretation && el('div', { class: 'eqn-note', text: eq.interpretation })
  ].filter(Boolean));
}
