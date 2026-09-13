import { el, clear } from '../shared/dom.js';
import { panel } from '../shared/components/panel.js';
import { createStore } from '../shared/store.js';
import { createRuntime } from '../simulation/runtime.js';
import { Status, emptyResult } from '../simulation/contract.js';
import { createPlantView, webglAvailable } from '../scene/renderer.js';
import { createStreamSystem } from '../scene/streams.js';
import { createCameraPresets } from '../scene/cameras.js';
import { createFlowsheet } from '../flowsheet/view2d.js';
import { equipmentCard } from '../information/equipmentCard.js';
import { assumptionsPanel } from '../information/assumptions.js';
import { createTour } from '../information/tour.js';
import { createControls } from './controls.js';
import { createResults } from './results.js';
import { createScenarioPanel } from './scenarioPanel.js';
import { createCaseBar } from './caseBar.js';
import { createModeSwitch } from './modeSwitch.js';

/**
 * Assembles one simulator workspace.
 * 3D <-> 2D synchronisation: both views are pure subscribers to `selection` in the
 * store, and both report clicks back into the same key. Neither talks to the other.
 */
export function mountWorkspace(root, sim) {
  const defaults = Object.fromEntries(Object.entries(sim.engine.inputSpec).map(([k, d]) => [k, d.default]));
  const store = createStore({
    inputs: { ...defaults }, errors: {}, messages: [], status: Status.READY,
    result: sim.engine.getInitialState(defaults), selection: null, hover: null,
    level: 'student', scenario: 'base', faults: [], tourStep: null, resetRequest: 0
  });
  const runtime = createRuntime(sim.engine, store);

  const plant3d = el('div', { class: 'panel' }, [el('header', {}, [el('span', { text: '3D plant' }), el('span', { id: 'presetbar', class: 'btnrow' })])]);
  const host3d = el('div', { class: 'canvas-host' }); plant3d.appendChild(host3d);
  const fsPanel = el('div', { class: 'panel' }, [el('header', {}, [el('span', { text: 'Process flow diagram' })])]);
  const hostFs = el('div', { class: 'canvas-host' }); fsPanel.appendChild(hostFs);

  const infoHost = el('div');
  const tourHost = el('div', { class: 'body' });
  const left = el('div', { class: 'grid' });
  const rail = el('div', { class: 'grid' });
  const stage = el('div', { class: 'stage' }, [plant3d, fsPanel]);
  clear(root).appendChild(el('div', { class: 'workspace' }, [left, stage, rail]));

  // ---- 3D -------------------------------------------------------------
  let view = null, streams = null, presets = null;
  if (webglAvailable() && sim.plant) {
    view = createPlantView(host3d, {
      onSelect: tag => store.set({ selection: tag }),
      onHover: tag => store.set({ hover: tag })
    });
    streams = createStreamSystem(view);
    const built = sim.plant.build(view, streams);
    presets = createCameraPresets(view, built.presets || {});
    const bar = plant3d.querySelector('#presetbar');
    presets.list().forEach(p => bar.appendChild(el('button', { class: 'btn', style: 'padding:3px 7px;font-size:11px', text: p.label, onClick: () => presets.go(p.id) })));
  } else {
    host3d.appendChild(el('div', { class: 'fallback', text: 'WebGL is unavailable, so the 3D plant is switched off. The flowsheet below carries the same process state and all results remain available.' }));
  }

  // ---- 2D -------------------------------------------------------------
  const flowsheet = sim.flowsheetSpec ? createFlowsheet(hostFs, sim.flowsheetSpec, {
    onSelect: tag => store.set({ selection: tag }),
    onHover: tag => store.set({ hover: tag })
  }) : null;

  // ---- panels ---------------------------------------------------------
  const tour = sim.tour?.length ? createTour(sim.tour, { view, store, flowsheet }) : null;
  left.append(
    panel({ title: 'Mode', body: [createModeSwitch(store), el('div', { style: 'height:8px' }), createCaseBar(sim, store, runtime)] }),
    createControls(sim.engine, store, { onRun: () => runtime.run() }),
    createScenarioPanel(sim, store)
  );
  rail.append(
    createResults(sim.engine, store),
    panel({ title: 'Guided tour', right: tour ? el('button', { class: 'btn', style: 'padding:2px 8px;font-size:11px', text: 'Start', onClick: () => { tour.start(); tour.render(tourHost, () => tour.render(tourHost)); } }) : null, body: [tourHost] }),
    infoHost,
    assumptionsPanel(sim.engine.assumptions, sim.engine.modelVersion)
  );
  if (tour) tour.render(tourHost, () => tour.render(tourHost));

  // ---- state fan-out --------------------------------------------------
  store.subKeys(['selection'], s => {
    view?.select?.(s.selection); flowsheet?.select(s.selection);
    clear(infoHost).appendChild(equipmentCard(sim.equipmentInfo?.[s.selection], liveValuesFor(s, sim)));
  });
  store.subKeys(['hover'], s => flowsheet?.hover(s.hover));
  store.subKeys(['result', 'status'], s => {
    const usable = s.status === Status.COMPLETE || s.status === Status.WARNING;
    const eq = usable ? sim.engine.getEquipmentState(s.result) : {};
    const st = usable ? sim.engine.getStreams(s.result) : [];
    flowsheet?.[usable ? 'applyState' : 'clearState'](st, eq);
    streams?.update(usable ? Object.fromEntries(st.map(x => [x.id, x])) : {});
    sim.plant?.applyState?.(eq, st);
  });
  store.subKeys(['resetRequest'], s => { if (s.resetRequest) runtime.reset({ ...defaults }); });
  store.subKeys(['scenario', 'faults'], () => store.set({ status: Status.READY, result: emptyResult('Scenario changed — run again'), messages: [] }));

  return { store, runtime, dispose() { view?.dispose(); flowsheet?.dispose(); clear(root); } };
}
function liveValuesFor(state, sim) {
  const usable = state.status === Status.COMPLETE || state.status === Status.WARNING;
  if (!usable || !state.selection) return null;
  const eq = sim.engine.getEquipmentState(state.result)[state.selection];
  return eq?.values || null;
}
