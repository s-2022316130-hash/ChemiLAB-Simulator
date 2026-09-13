import { el, clear } from '../shared/dom.js';
import { SIMULATORS, getSimulator, STATE_LABEL } from './registry.js';
import { href } from './router.js';

export function homePage(view) {
  delete document.documentElement.dataset.sim;
  clear(view).appendChild(el('div', { class: 'home' }, [
    el('h1', { text: 'Run the plant, then find out why it behaves that way.' }),
    el('p', { class: 'lede', text: 'Five process units, each with a working model behind it. Change an operating condition, solve the balances, and watch the same state appear in the plant, the flowsheet and the equations. Every number on screen comes from the model or from a reference value that says so.' }),
    el('div', { class: 'simlist' }, SIMULATORS.map(simCard))
  ]));
  return {};
}
function simCard(s) {
  return el('a', { class: 'simcard', href: href.simulator(s.id), dataset: { state: s.state, id: s.id } }, [
    el('span', { class: 'id', text: s.number }),
    el('span', {}, [el('h3', { text: s.name }), el('small', { text: s.tagline })]),
    el('span', { class: 'pill', text: STATE_LABEL[s.state] })
  ]);
}
export function simulatorsPage(view) { return homePage(view); }

export async function simulatorPage(view, id) {
  const entry = getSimulator(id);
  clear(view);
  // The signature hue is set on the root before anything mounts, because the 3D
  // renderer reads it at construction to tint its lighting and its sky.
  document.documentElement.dataset.sim = id || '';
  if (!entry) { view.appendChild(el('div', { class: 'home' }, [el('h1', { text: 'Unknown simulator' }), el('a', { href: href.home, text: 'Back to the list' })])); return {}; }
  const mod = (await entry.load()).default;
  if (!mod.engine) {
    view.appendChild(placeholder(entry, mod));
    return {};
  }
  const { mountWorkspace } = await import('../ui/workspace.js'); // keeps three.js out of the initial bundle
  return mountWorkspace(view, mod);
}
function placeholder(entry, mod) {
  return el('div', { class: 'home' }, [
    el('h1', { text: entry.name }),
    el('p', { class: 'lede', text: entry.tagline }),
    el('div', { class: 'panel' }, [
      el('header', {}, [el('span', { text: 'Status' }), el('span', { class: 'tag', text: STATE_LABEL[entry.state] })]),
      el('div', { class: 'body' }, [
        el('p', { style: 'margin-top:0;color:var(--ink-dim);font-size:13px', text: 'The process model for this unit has not been written yet. The shared framework — 3D renderer, flowsheet, controls, results rail, validation, scenarios, cases — is ready and waiting for it. No sample numbers are shown here, because showing invented process values would teach the wrong thing.' }),
        el('div', { style: 'font-family:var(--mono);font-size:11px;color:var(--ink-faint);margin-bottom:6px', text: 'Planned scope' }),
        el('ul', { style: 'margin:0 0 0 16px;padding:0;color:var(--ink-dim);font-size:12.5px' }, (mod.plannedScope || []).map(t => el('li', { text: t })))
      ])
    ]),
    el('p', { style: 'margin-top:18px' }, [el('a', { href: href.home, text: 'Back to the simulator list' })])
  ]);
}
