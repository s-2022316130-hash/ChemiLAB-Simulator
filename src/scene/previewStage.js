import * as THREE from 'three';
import { createEnvironment } from './env.js';
import { setSceneTheme } from './materials.js';
import { compact } from './geometry.js';
import { createStreamSystem } from './streams.js';
import { resolvePresets } from './cameras.js';
import { onFrame } from '../shared/animation.js';
import { getTheme, onThemeChange, tokenNumber } from '../shared/theme.js';

/**
 * Live previews of the five plants, for the library tiles on the overview.
 *
 * Each tile shows its own plant actually running: built by the same plant
 * module the workspace uses, driven by the same engine at its base case, so a
 * stream that flows on the tile is a stream the model reports flow in, and a
 * fan that turns is one the engine has running. Nothing here is a recording or
 * an illustration of the plant; it is the plant, smaller.
 *
 * One WebGL renderer draws all of them. Five renderers would compile every
 * shader five times, upload every material five times and hold five GPU
 * contexts open on a page whose job is to be read. Here each plant has its own
 * scene and camera, the shared renderer draws it into a corner of one drawing
 * buffer, and the result is copied into that tile's own 2D canvas — so each
 * tile keeps its place in its own layer stack, under the scrims that keep its
 * text readable, rather than all of them being holes cut in the page above one
 * big canvas.
 *
 * It is deliberately lighter than the workspace view: no post-processing, no
 * captions, no picking, shadows rendered once, thirty frames a second, and only
 * for tiles that are on screen. A tile is a door into a simulator, not the
 * simulator; it should cost what a picture costs and look alive.
 */

/*
 * How much of the page the tiles may spend. Measured on a slow machine, one
 * plant costs 4 to 12 ms to draw and all five together about 35 ms — more than
 * the whole of a 30 fps frame, which would leave the overview stuttering under
 * the reader’s scroll. So the tiles are scheduled rather than all drawn every
 * frame: never more than a few milliseconds of tile work in any one frame, never
 * more than about a third of the main thread overall, and each tile’s frame rate
 * set from what drawing it actually costs. A fast machine still gets thirty
 * frames a second everywhere; a slow one gets a lower tile rate and a page that
 * still scrolls, which is the right way round. The tile being pointed at always
 * runs at the full rate, because that is the one being looked at.
 */
const MAX_FPS = 30;
const MIN_FPS = 6;
const FRAME_BUDGET_MS = 7;     // tile work allowed in any single frame
const MAIN_SHARE = 0.3;        // share of the main thread the tiles may use overall
const SWAY_DEG = 11;        // how far the camera drifts either side of its shot
const SWAY_PERIOD = 17;     // seconds for one full drift there and back

/**
 * The shot each tile frames. The same framing as the stills behind the tiles
 * (tools/backdrops.js), so the moment a tile goes live it looks like the
 * photograph starting to move rather than a different picture replacing it.
 */
const SHOTS = {
  'water-treatment': { from: 'main', azimuth: 34, elevation: 13, fill: 0.92, aim: 0.34 },
  'industrial-dryer': { from: 'main', azimuth: 26, elevation: 12, fill: 0.8, aim: 0.38 },
  fertilizer: { from: 'utilities', azimuth: 30, elevation: 12, fill: 0.9, aim: 0.44 },
  paint: { from: 'feed', azimuth: -34, elevation: 13, fill: 1.02, aim: 0.36 },
  'gas-processing': { from: 'main', azimuth: 28, elevation: 11, fill: 0.95, aim: 0.48 }
};

/** A phone has a fraction of the fill rate; a tile at arm's length needs less. */
const maxDpr = () => {
  const handheld = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return Math.min(devicePixelRatio || 1, handheld ? 1.25 : 1.5);
};

/**
 * The simulator's own hue, read the way the stylesheet assigns it. The
 * overview has no simulator on the root, so the hue for each tile has to be
 * asked of an element carrying that simulator's attribute — in the current
 * theme, because the light and dark hues differ.
 */
function hueOf(id) {
  const probe = document.createElement('i');
  probe.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden';
  probe.dataset.theme = getTheme();
  probe.dataset.sim = id;
  document.body.appendChild(probe);
  const v = getComputedStyle(probe).getPropertyValue('--hue').trim();
  probe.remove();
  return v || '#26d0e0';
}

export function createPreviewStage() {
  const glCanvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({
    canvas: glCanvas, antialias: true, stencil: false, alpha: false,
    powerPreference: 'default', preserveDrawingBuffer: false
  });
  // Sizes below are in device pixels already; the renderer is not asked to
  // multiply them again.
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  // Plain PCF rather than the workspace’s soft variant: at tile size the softer
  // edge is invisible and it samples the shadow map several times per pixel.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = tokenNumber('--scene-exposure', 1);
  if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
  setSceneTheme(getTheme());

  const previews = new Set();
  let bufW = 1, bufH = 1;
  let lost = false;
  glCanvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; for (const p of previews) p.onLost?.(); });

  /** The drawing buffer only ever grows, so a resize never reallocates it per tile. */
  function ensureBuffer(w, h) {
    if (w <= bufW && h <= bufH) return;
    bufW = Math.max(bufW, w); bufH = Math.max(bufH, h);
    renderer.setSize(bufW, bufH, false);
  }

  let drawCost = 4;   // ms per tile draw, smoothed — measured, not assumed
  const stopLoop = onFrame((dt, t) => {
    if (lost) return;
    const live = [...previews].filter(p => p.shouldDraw());
    if (!live.length) return;
    const now = performance.now();
    const ambient = Math.min(MAX_FPS, Math.max(MIN_FPS, (MAIN_SHARE * 1000) / (drawCost * live.length)));
    // The one being pointed at first, then whichever has waited longest.
    live.sort((a, b) => (Number(b.focus) - Number(a.focus)) || (a.lastAt - b.lastAt));
    let spent = 0;
    for (const p of live) {
      const interval = 1000 / (p.focus ? MAX_FPS : ambient);
      if (now - p.lastAt < interval) continue;
      if (spent > 0 && spent + drawCost > FRAME_BUDGET_MS) break;
      const s = performance.now();
      // Each tile advances by the time since *it* was last drawn, so a plant
      // drawn at eight frames a second still turns at the right speed.
      p.draw(Math.min((now - p.lastAt) / 1000, 0.25), t);
      const c = performance.now() - s;
      drawCost += (c - drawCost) * 0.15;
      spent += c;
      p.lastAt = now;
    }
  });

  const offTheme = onThemeChange(theme => {
    setSceneTheme(theme);
    renderer.toneMappingExposure = tokenNumber('--scene-exposure', 1);
    for (const p of previews) p.retheme();
  });

  /**
   * Build one tile's plant. `canvas` is the tile's own 2D canvas; the plant
   * module and engine come from the simulator's registry entry.
   */
  async function add(entry, canvas) {
    const mod = (await entry.load()).default;
    if (!mod.plant || !mod.engine || lost) return null;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 2, 0.1, 600);
    const hue = new THREE.Color(hueOf(entry.id));
    const env = createEnvironment(scene, renderer, hue);
    env.setShadowQuality(true, 1024);

    // The part of the plant view that a plant module and the stream system
    // actually use. Anything more would be a second workspace renderer.
    const equipment = new Map();
    const tickers = new Set();
    const view = {
      scene, camera,
      add(obj) { if (obj?.isGroup) compact(obj); scene.add(obj); return obj; },
      addEquipment(group, meta) { compact(group); scene.add(group); equipment.set(meta.tag, { group, meta }); return group; },
      onTick(fn) { tickers.add(fn); return () => tickers.delete(fn); },
      getEquipment: tag => equipment.get(tag) || null,
      listEquipment: () => [...equipment.values()].map(e => e.meta),
      jumpTo() {}, flyTo() {}
    };
    const streams = createStreamSystem(view);
    mod.plant.build(view, streams);

    // The plant runs at its base case — the answer the engine gives with every
    // input at its default, which is exactly what pressing Run on a freshly
    // opened simulator produces. Streams flow where that answer has flow.
    const defaults = Object.fromEntries(Object.entries(mod.engine.inputSpec).map(([k, d]) => [k, d.default]));
    const result = mod.engine.run(defaults, { scenario: 'base', faults: [] });
    const eq = mod.engine.getEquipmentState(result);
    const st = mod.engine.getStreams(result);
    mod.plant.applyState?.(eq, st);
    streams.update?.(Object.fromEntries(st.map(s => [s.id, s])));

    const ctx = canvas.getContext('2d', { alpha: false });
    const spec = SHOTS[entry.id] || { from: 'overview', azimuth: 30, elevation: 14, fill: 0.9, aim: 0.4 };
    const subject = mod.plant.presetSpec?.[spec.from]?.subject ?? '*';
    let base = null, w = 0, h = 0, shadowsDue = true, age = 0;
    // Each tile drifts on its own phase, so five plants never sway in step —
    // which would read as the page moving rather than five things running.
    const phase = previews.size * 1.3;

    function frame() {
      const box = canvas.getBoundingClientRect();
      const dpr = maxDpr();
      w = Math.max(2, Math.round(box.width * dpr));
      h = Math.max(2, Math.round(box.height * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const { shot } = resolvePresets(view, { shot: { subject, aspect: camera.aspect, ...spec } });
      base = shot ? { pos: new THREE.Vector3(...shot.pos), target: new THREE.Vector3(...shot.target) } : null;
    }
    frame();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(frame) : null;
    ro?.observe(canvas);

    const offset = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const p = {
      entry, canvas, visible: false, wanted: true, focus: false, ready: false, lastAt: 0,
      shouldDraw() { return p.visible && p.wanted && !!base; },
      draw(dt, t) {
        age += dt;
        tickers.forEach(fn => fn(dt, t, 1));
        const a = THREE.MathUtils.degToRad(SWAY_DEG) * Math.sin((age / SWAY_PERIOD) * Math.PI * 2 + phase);
        offset.copy(base.pos).sub(base.target).applyAxisAngle(up, a);
        camera.position.copy(base.target).add(offset);
        camera.lookAt(base.target);

        ensureBuffer(w, h);
        renderer.setViewport(0, 0, w, h);
        renderer.setScissor(0, 0, w, h);
        renderer.setScissorTest(true);
        if (shadowsDue) { renderer.shadowMap.needsUpdate = true; shadowsDue = false; }
        renderer.render(scene, camera);
        // The viewport sits at the bottom-left of the drawing buffer, which in
        // image coordinates — origin at the top — starts bufH - h down.
        ctx.drawImage(glCanvas, 0, bufH - h, w, h, 0, 0, w, h);
        if (!p.ready) { p.ready = true; p.onReady?.(); }
      },
      /** One frame now, for a tile that should show the plant still. */
      still() { if (base && !lost) p.draw(0, 0); },
      retheme() {
        hue.set(hueOf(entry.id));
        env.apply();
        shadowsDue = true;
        if (p.visible && !p.wanted) p.still();
      },
      dispose() {
        ro?.disconnect();
        previews.delete(p);
        // The stream system holds a theme listener of its own; left alone it
        // would outlive the tile and fire into a disposed scene on every theme
        // change after the reader has moved on.
        streams.dispose?.();
        tickers.clear();
        scene.traverse(o => { o.geometry?.dispose?.(); });
        env.dispose();
      }
    };
    previews.add(p);
    return p;
  }

  return {
    add,
    get lost() { return lost; },
    dispose() {
      stopLoop(); offTheme();
      for (const p of [...previews]) p.dispose();
      renderer.dispose();
      // Hand the context back now rather than whenever the collector gets to
      // it: the workspace is about to ask for one of its own.
      renderer.forceContextLoss?.();
    }
  };
}
