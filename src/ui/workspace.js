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
import { createHud } from './hud.js';
import { createSheet } from './sheet.js';
import { signature } from '../shared/components/signature.js';
import { icon } from '../shared/icons.js';

const PHASE_NAME = {
  liquid: 'Liquid', gas: 'Gas', steam: 'Steam', air: 'Air', solid: 'Solid', slurry: 'Slurry'
};

/**
 * Assembles one simulator workspace.
 *
 * 3D ↔ 2D synchronisation: both views are pure subscribers to `selection` in
 * the store, and both report clicks back into the same key. Neither talks to
 * the other, which is why they cannot drift.
 *
 * The layout is three columns on a desktop and four screens with a bottom bar
 * on a phone. Which one is showing is a CSS decision driven by data attributes,
 * so nothing is rebuilt when the window changes size and the 3D context is
 * never lost — a tab that unmounted the canvas would have to recompile every
 * shader on the way back.
 */
export function mountWorkspace(root, sim) {
  const defaults = Object.fromEntries(Object.entries(sim.engine.inputSpec).map(([k, d]) => [k, d.default]));
  const store = createStore({
    inputs: { ...defaults }, errors: {}, messages: [], status: Status.READY,
    result: sim.engine.getInitialState(defaults), selection: null, hover: null,
    level: 'student', scenario: 'base', faults: [], tourStep: null, resetRequest: 0,
    dirty: false
  });
  const runtime = createRuntime(sim.engine, store);

  const plant3d = el('div', { class: 'panel' }, [
    el('header', {}, [el('span', { text: '3D plant' }), el('span', { id: 'presetbar', class: 'btnrow' })])
  ]);
  // The vignette is a CSS gradient over the canvas rather than a post-processing
  // pass: a constant full-screen gradient costs nothing here and a whole extra
  // render target there.
  const host3d = el('div', { class: 'canvas-host', dataset: { vignette: 'true' } });
  plant3d.appendChild(host3d);

  const fsPanel = el('div', { class: 'panel' }, [
    el('header', {}, [el('span', { text: 'Process flow diagram' }), el('span', { id: 'fsbar', class: 'btnrow' })])
  ]);
  const hostFs = el('div', { class: 'canvas-host' });
  fsPanel.appendChild(hostFs);

  const infoHost = el('div');
  const tourHost = el('div', { class: 'body' });
  const left = el('div', { class: 'grid pane col-left' });
  const rail = el('div', { class: 'grid pane col-rail' });
  const stage = el('div', { class: 'stage' }, [plant3d, fsPanel]);

  // ---- one screen at a time on a phone ---------------------------------
  const TABS = [
    { id: 'plant', label: 'Plant', icon: 'plant', panes: [stage, plant3d] },
    { id: 'diagram', label: 'Diagram', icon: 'diagram', panes: [stage, fsPanel] },
    { id: 'controls', label: 'Controls', icon: 'sliders', panes: [left] },
    { id: 'results', label: 'Results', icon: 'trend', panes: [rail] }
  ];
  const tabbar = el('div', { class: 'tabbar', role: 'tablist' });
  const tabButtons = new Map();

  function showTab(id) {
    for (const t of TABS) tabButtons.get(t.id)?.setAttribute('aria-selected', String(t.id === id));
    // A pane is active if the showing tab wants it, so the stage stays mounted
    // while its two panels take turns inside it.
    const wanted = new Set(TABS.find(t => t.id === id)?.panes || []);
    for (const node of [stage, plant3d, fsPanel, left, rail]) node.dataset.active = String(wanted.has(node));
  }
  for (const t of TABS) {
    const b = el('button', {
      role: 'tab', html: `${icon(t.icon)}<span>${t.label}</span>`,
      'aria-label': t.label, onClick: () => showTab(t.id)
    });
    tabButtons.set(t.id, b);
    tabbar.appendChild(b);
  }
  showTab('plant');

  // Run is a floating action rather than a fifth tab: it is the one thing you
  // do here, and it has to be reachable from every screen without becoming a
  // destination of its own.
  const fab = el('button', {
    class: 'fab', html: `${icon('play')}<span>Run</span>`,
    title: 'Run the simulation', onClick: () => runtime.run()
  });

  const workspace = el('div', { class: 'workspace' }, [left, stage, rail, fab, tabbar]);
  clear(root).appendChild(workspace);

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
  let view = null, streams = null, presets = null, stopPerf = null, hud = null;
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
    const start = built.presets?.overview;
    if (start) view.jumpTo(start.pos, start.target);

    hud = createHud(host3d);

    // The caption controls float over the plant: they belong to the view, and a
    // panel header already carrying seven camera presets has no room for them.
    const capBar = el('div', { class: 'canvas-toolbar' });
    host3d.appendChild(capBar);

    const detail = el('span', { class: 'btnrow', style: 'gap:2px' });
    const initial = view.captions;
    let remembered = { ...initial };
    const anyOn = f => CAPTION_FIELDS.some(k => f[k]);

    const capBtn = toggleBtn('Captions', anyOn(initial), on => {
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
      detail.appendChild(toggleBtn(CAPTION_LABEL[key], !!initial[key], on => {
        const next = view.setCaptions({ [key]: on });
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
      const fps = view.fps;
      perf.textContent = fps === null
        ? `${view.workMs.toFixed(1)} ms/frame · ${view.tier}`
        : `${Math.round(fps)} fps · ${view.tier}`;
      perf.dataset.tier = view.tier === 'low' ? 'low' : 'ok';
      perf.title = `${view.workMs.toFixed(1)} ms of render work per frame, held at ${view.tier} quality`;
    }, 700);
    stopPerf = () => clearInterval(tick);
  } else {
    host3d.appendChild(el('div', { class: 'empty', style: 'height:100%;align-content:center' }, [
      el('div', { class: 'glyph', html: icon('cube') }),
      el('b', { text: 'WebGL is unavailable' }),
      el('p', { text: 'The 3D plant is switched off on this machine. The flowsheet carries the same solved process state, and every result remains available.' })
    ]));
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
    add('streams', 'Values', 'Show the calculated flow on each stream');
    fsbar.append(
      el('span', { class: 'sep' }),
      el('button', { class: 'btn', text: '−', title: 'Zoom out', onClick: () => flowsheet.zoom(1 / 1.3) }),
      el('button', { class: 'btn', text: 'Fit', title: 'Fit the whole diagram', onClick: () => flowsheet.fit() }),
      el('button', { class: 'btn', text: '+', title: 'Zoom in', onClick: () => flowsheet.zoom(1.3) })
    );

    // Phase legend, built from the phases this flowsheet actually uses so it
    // never lists one that is absent.
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
  const tour = sim.tour?.length ? createTour(sim.tour, { view, store, flowsheet, presets }) : null;
  const tourStart = tour ? el('button', {
    class: 'btn ghost', style: 'padding:3px 9px;font-size:var(--t-fine)', text: 'Start',
    onClick: () => { tour.start(); tour.render(tourHost, () => tour.render(tourHost)); }
  }) : null;

  left.append(
    panel({ title: 'Session', body: [createModeSwitch(store), el('div', { style: 'height:14px' }), createCaseBar(sim, store, runtime)] }),
    createControls(sim.engine, store, { onRun: () => runtime.run() }),
    createScenarioPanel(sim, store)
  );
  rail.append(
    createResults(sim.engine, store),
    panel({ title: 'Guided tour', right: tourStart, body: [tourHost] }),
    infoHost,
    assumptionsPanel(sim.engine.assumptions, sim.engine.modelVersion),
    signature({ compact: true })
  );
  if (tour) tour.render(tourHost, () => tour.render(tourHost));

  // On a phone the equipment card comes up over the view it was selected from
  // rather than sending you to another screen to read it.
  const sheet = createSheet(document.body);
  const onPhone = () => { try { return matchMedia('(max-width:900px)').matches; } catch { return false; } };

  // ---- state fan-out --------------------------------------------------
  function equipmentEntry(s) {
    const usable = s.status === Status.COMPLETE || s.status === Status.WARNING;
    if (!usable || !s.selection) return null;
    return sim.engine.getEquipmentState(s.result)[s.selection] || null;
  }

  function paintSelection(s) {
    const info = sim.equipmentInfo?.[s.selection];
    const entry = equipmentEntry(s);
    view?.select?.(s.selection);
    flowsheet?.select(s.selection);
    hud?.show(s.selection, info, entry);
    clear(infoHost).appendChild(equipmentCard(info, entry?.values || null));
    if (s.selection && onPhone()) {
      sheet.show(s.selection, info?.name || '', equipmentCard(info, entry?.values || null));
    } else if (!s.selection) {
      sheet.close();
    }
  }

  store.subKeys(['selection'], paintSelection);
  store.subKeys(['hover'], s => flowsheet?.hover(s.hover));
  store.subKeys(['result', 'status'], s => {
    const usable = s.status === Status.COMPLETE || s.status === Status.WARNING;
    const eq = usable ? sim.engine.getEquipmentState(s.result) : {};
    const st = usable ? sim.engine.getStreams(s.result) : [];
    flowsheet?.[usable ? 'applyState' : 'clearState'](st, eq);
    view?.setEquipmentValues?.(eq);
    streams?.update(usable ? Object.fromEntries(st.map(x => [x.id, x])) : {});
    sim.plant?.applyState?.(eq, st);
    // The HUD is a view of the same state and has to move with it.
    if (s.selection) hud?.show(s.selection, sim.equipmentInfo?.[s.selection], eq[s.selection] || null);
    // A run that produced a result describes the inputs that produced it.
    if (usable || s.status === Status.ERROR) store.set({ dirty: false });
    fab.dataset.busy = String(s.status === Status.CALCULATING || s.status === Status.CONVERGING);
  });
  store.subKeys(['resetRequest'], s => { if (s.resetRequest) { runtime.reset({ ...defaults }); store.set({ dirty: false }); } });

  // Changing the scenario invalidates whatever was solved under the previous
  // one. The first call is the subscription announcing itself at mount, not a
  // change — acting on it would greet everyone with "the scenario changed".
  let scenarioSeen = false;
  store.subKeys(['scenario', 'faults'], () => {
    if (!scenarioSeen) { scenarioSeen = true; return; }
    store.set({
      status: Status.READY, result: emptyResult('The scenario changed — run the plant again.'),
      messages: [], dirty: false
    });
  });

  return {
    store, runtime,
    dispose() {
      stopPerf?.(); streams?.dispose?.(); view?.dispose(); flowsheet?.dispose();
      hud?.dispose(); sheet.dispose(); clear(root);
    }
  };
}
