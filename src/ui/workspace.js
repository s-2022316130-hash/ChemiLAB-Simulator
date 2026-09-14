import { el, clear } from '../shared/dom.js';
import { panel } from '../shared/components/panel.js';
import { createStore } from '../shared/store.js';
import { createRuntime } from '../simulation/runtime.js';
import { Status, emptyResult } from '../simulation/contract.js';
import { createPlantView, webglAvailable } from '../scene/renderer.js';
import { createStreamSystem } from '../scene/streams.js';
import { createCameraPresets } from '../scene/cameras.js';
import { CAPTION_FIELDS, CAPTION_LABEL, CAPTION_DEFAULT } from '../scene/labels.js';
import { createFlowsheet } from '../flowsheet/view2d.js';
import { equipmentCard } from '../information/equipmentCard.js';
import { assumptionsPanel } from '../information/assumptions.js';
import { createTour } from '../information/tour.js';
import { createControls } from './controls.js';
import { createResults } from './results.js';
import { createScenarioPanel } from './scenarioPanel.js';
import { createCaseBar } from './caseBar.js';
import { createModeSwitch } from './modeSwitch.js';

const PHASE_NAME = {
  liquid: 'Liquid', gas: 'Gas', steam: 'Steam', air: 'Air', solid: 'Solid', slurry: 'Slurry'
};

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
  const fsPanel = el('div', { class: 'panel' }, [el('header', {}, [el('span', { text: 'Process flow diagram' }), el('span', { id: 'fsbar', class: 'btnrow' })])]);
  const hostFs = el('div', { class: 'canvas-host' }); fsPanel.appendChild(hostFs);

  const infoHost = el('div');
  const tourHost = el('div', { class: 'body' });
  const left = el('div', { class: 'grid' });
  const rail = el('div', { class: 'grid' });
  const stage = el('div', { class: 'stage' }, [plant3d, fsPanel]);
  clear(root).appendChild(el('div', { class: 'workspace' }, [left, stage, rail]));

  /** A button that shows whether it is on rather than needing a click to find out. */
  function toggleBtn(label, initial, onChange, title) {
    const b = el('button', {
      class: 'btn', dataset: { on: String(initial) }, text: label, title,
      onClick: () => {
        const next = b.dataset.on !== 'true';
        b.dataset.on = String(next);
        onChange(next);
      }
    });
    return b;
  }

  // ---- 3D -------------------------------------------------------------
  let view = null, streams = null, presets = null, stopPerf = null;
  if (webglAvailable() && sim.plant) {
    view = createPlantView(host3d, {
      onSelect: tag => store.set({ selection: tag }),
      onHover: tag => store.set({ hover: tag })
    });
    streams = createStreamSystem(view);
    const built = sim.plant.build(view, streams);
    presets = createCameraPresets(view, built.presets || {});
    const bar = plant3d.querySelector('#presetbar');
    presets.list().forEach(p => bar.appendChild(el('button', { class: 'btn', text: p.label, onClick: () => presets.go(p.id) })));
    // Open on the overview rather than on whatever the camera was initialised
    // to, so the first thing seen is the whole plant.
    const start = built.presets?.overview;
    if (start) { view.camera.position.set(...start.pos); view.controls.target.set(...start.target); }

    // The caption controls float over the plant: they belong to the view, and
    // a panel header already carrying seven camera presets has no room for them.
    const capBar = el('div', { class: 'canvas-toolbar' });
    host3d.appendChild(capBar);

    // Captions help when reading a plant and get in the way when looking at
    // it, so how much they say belongs to whoever is looking. One switch turns
    // them off outright; the three beside it choose what a caption carries.
    const detail = el('span', { class: 'btnrow', style: 'gap:3px' });
    let remembered = { ...CAPTION_DEFAULT };
    const anyOn = f => CAPTION_FIELDS.some(k => f[k]);

    const capBtn = toggleBtn('Captions', anyOn(CAPTION_DEFAULT), on => {
      if (on) {
        const restore = anyOn(remembered) ? remembered : { ...CAPTION_DEFAULT };
        view.setCaptions(restore);
        CAPTION_FIELDS.forEach((k, i) => { detail.children[i].dataset.on = String(!!restore[k]); });
      } else {
        remembered = view.captions;
        view.setCaptions({ tags: false, names: false, values: false });
      }
      detail.style.display = on ? '' : 'none';
    }, 'Show or hide every equipment caption in the 3D plant');

    for (const key of CAPTION_FIELDS) {
      detail.appendChild(toggleBtn(CAPTION_LABEL[key], !!CAPTION_DEFAULT[key], on => {
        const next = view.setCaptions({ [key]: on });
        // Turning the last one off is the same decision as switching captions
        // off, so the master switch follows rather than contradicting it.
        capBtn.dataset.on = String(anyOn(next));
        if (!anyOn(next)) { remembered = { ...CAPTION_DEFAULT }; detail.style.display = 'none'; }
      }, key === 'values'
        ? 'Show the live readings the engine reported for each unit'
        : `Show equipment ${key} on each caption`));
    }
    capBar.append(capBtn, el('span', { class: 'sep' }), detail);

    // Measured frame rate, so "smooth" is a number rather than a claim.
    const perf = el('span', { class: 'perf', title: 'Measured frame rate and the render quality it is being held at' });
    capBar.append(el('span', { class: 'sep' }), perf);
    const tick = setInterval(() => {
      // Frame rate when the browser is really asking for frames; the cost of
      // a frame when it is not, which is the honest number in a throttled or
      // occluded tab rather than a made-up one.
      const fps = view.fps;
      perf.textContent = fps === null
        ? `${view.workMs.toFixed(1)} ms/frame · ${view.tier}`
        : `${Math.round(fps)} fps · ${view.tier}`;
      perf.dataset.tier = view.tier === 'low' ? 'low' : 'ok';
      perf.title = `${view.workMs.toFixed(1)} ms of render work per frame, held at ${view.tier} quality`;
    }, 700);
    stopPerf = () => clearInterval(tick);
  } else {
    host3d.appendChild(el('div', { class: 'fallback', text: 'WebGL is unavailable, so the 3D plant is switched off. The flowsheet below carries the same process state and all results remain available.' }));
  }

  // ---- 2D -------------------------------------------------------------
  const flowsheet = sim.flowsheetSpec ? createFlowsheet(hostFs, sim.flowsheetSpec, {
    onSelect: tag => store.set({ selection: tag }),
    onHover: tag => store.set({ hover: tag })
  }) : null;

  if (flowsheet) {
    const fsbar = fsPanel.querySelector('#fsbar');
    const add = (key, label, title) => fsbar.appendChild(
      toggleBtn(label, flowsheet.captions[key], on => flowsheet.setCaptions({ [key]: on }), title)
    );
    add('tags', 'Tags', 'Show equipment tags on the diagram');
    add('names', 'Names', 'Show equipment names on the diagram');
    add('streams', 'Stream values', 'Show the calculated flow on each stream');

    // Phase legend: which colour means which kind of material. Built from the
    // phases this flowsheet actually uses, so it never lists one that is absent.
    const phases = [...new Set((sim.flowsheetSpec.edges || []).map(e => e.phase || 'liquid'))];
    if (phases.length > 1) {
      hostFs.appendChild(el('div', { class: 'legend' }, phases.map(p =>
        el('span', { style: `color:var(--stream-${p === 'liquid' ? 'liquid' : p})` }, [
          el('i'), el('span', { text: PHASE_NAME[p] || p, style: 'color:var(--ink-faint)' })
        ])
      )));
    }
  }

  // ---- panels ---------------------------------------------------------
  const tour = sim.tour?.length ? createTour(sim.tour, { view, store, flowsheet }) : null;
  left.append(
    panel({ title: 'Mode', body: [createModeSwitch(store), el('div', { style: 'height:8px' }), createCaseBar(sim, store, runtime)] }),
    createControls(sim.engine, store, { onRun: () => runtime.run() }),
    createScenarioPanel(sim, store)
  );
  rail.append(
    createResults(sim.engine, store),
    panel({ title: 'Guided tour', right: tour ? el('button', { class: 'btn', style: 'padding:3px 10px;font-size:11px', text: 'Start', onClick: () => { tour.start(); tour.render(tourHost, () => tour.render(tourHost)); } }) : null, body: [tourHost] }),
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
    // Captions show the engine's formatted readings, passed straight through.
    view?.setEquipmentValues?.(eq);
    streams?.update(usable ? Object.fromEntries(st.map(x => [x.id, x])) : {});
    sim.plant?.applyState?.(eq, st);
  });
  store.subKeys(['resetRequest'], s => { if (s.resetRequest) runtime.reset({ ...defaults }); });
  store.subKeys(['scenario', 'faults'], () => store.set({ status: Status.READY, result: emptyResult('Scenario changed — run again'), messages: [] }));

  return {
    store, runtime,
    dispose() { stopPerf?.(); streams?.dispose?.(); view?.dispose(); flowsheet?.dispose(); clear(root); }
  };
}
function liveValuesFor(state, sim) {
  const usable = state.status === Status.COMPLETE || state.status === Status.WARNING;
  if (!usable || !state.selection) return null;
  const eq = sim.engine.getEquipmentState(state.result)[state.selection];
  return eq?.values || null;
}
