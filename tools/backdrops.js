/**
 * Photograph the five plants.
 *
 * The gallery tiles carry a real industrial backdrop behind their text. Rather
 * than licensing stock photography of *somebody else's* facility, each tile is
 * backed by a still of the plant it actually opens — the same three.js scene,
 * the same industrial geometry library, the same reflection probe and tone
 * mapping, rendered offline at a size and a camera angle that would be wrong
 * for the live panel but is right for a wide strip behind a heading.
 *
 * That makes the backdrop honest: the vessels on the water treatment tile are
 * the vessels in the water treatment plant. It also means a plant that gets
 * rebuilt is re-photographed by running this again, rather than drifting away
 * from a photograph nobody can update.
 *
 * Run it with `npm run backdrops`, which starts a dev server with a small
 * endpoint that writes what this page posts to it.
 *
 * Nothing here ships. This file is not reachable from the application and is
 * excluded from the production build.
 */
import * as THREE from 'three';
import { createPlantView } from '../src/scene/renderer.js';
import { createStreamSystem } from '../src/scene/streams.js';
import { resolvePresets } from '../src/scene/cameras.js';
import { SIMULATORS } from '../src/app/registry.js';

/**
 * How each plant is photographed.
 *
 * Much lower to the ground than any live preset — around fifteen degrees, where
 * a process plant reads as a silhouette of towers against sky rather than as a
 * site plan. The bearing is chosen per plant for the side with the most
 * structure on it.
 *
 * What each one looks *at* is borrowed from the plant's own preset list rather
 * than being the whole plot, and that turned out to be the whole problem. A
 * bounding box is fitted by solving every corner, and at fifteen degrees the
 * corner that binds is the far one: most of the solved distance is the depth of
 * the plot, not its size. Pushing `fill` up barely moves the camera, because
 * the distance asymptotes to however deep the site is — a hundred and four
 * metres at the gas plant. The result is a correct, tiny plant on a large
 * ground plane: a model on a table.
 *
 * Aiming at a cluster instead — the treatment train, the urea synthesis line,
 * the contactor towers — gives a small box to fit, so the camera comes in among
 * the vessels and the rest of the plant runs out of frame and recedes behind
 * it. Which is what an industrial photograph actually looks like. `from` names
 * which of the plant's own presets to borrow that cluster from, so the subject
 * stays a list of real tags and cannot drift out of step with the plant.
 *
 * The tile then crops this strip hard again on top of that: at its widest it
 * shows barely a third of the frame height, so the mass has to sit in the
 * middle band, which is what `aim` is placing.
 */
const SHOTS = {
  'water-treatment': { from: 'main', azimuth: 34, elevation: 13, fill: 0.92, aim: 0.34 },
  'industrial-dryer': { from: 'main', azimuth: 26, elevation: 12, fill: 0.8, aim: 0.38 },
  'fertilizer': { from: 'utilities', azimuth: 30, elevation: 12, fill: 0.9, aim: 0.44 },
  'paint': { from: 'feed', azimuth: -34, elevation: 13, fill: 1.02, aim: 0.36 },
  'gas-processing': { from: 'main', azimuth: 28, elevation: 11, fill: 0.95, aim: 0.48 }
};

// Two sizes. The wide one is what a desktop tile gets; the small one is what a
// phone gets, and a phone is never handed the large file.
const SIZES = [
  { suffix: '', width: 1600, height: 700, quality: 0.8 },
  { suffix: '@sm', width: 800, height: 350, quality: 0.74 }
];

const DEBUG = new URL(location.href).searchParams.has('debug');

const log = document.getElementById('log');
const shots = document.getElementById('shots');
const stage = document.getElementById('stage');
const say = t => { log.textContent += `\n${t}`; };

const wait = ms => new Promise(r => setTimeout(r, ms));

async function post(name, dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  const res = await fetch(`/__backdrop/${name}.webp`, { method: 'POST', body: blob });
  if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text()}`);
  return blob.size;
}

async function shoot(entry) {
  const mod = (await entry.load()).default;
  if (!mod.plant || !mod.engine) { say(`${entry.id}: no plant`); return; }

  const host = document.createElement('div');
  host.style.cssText = 'width:1600px;height:700px';
  stage.appendChild(host);

  const view = createPlantView(host);
  if (view.fallback) throw new Error('no webgl on this machine');
  const streams = createStreamSystem(view);
  mod.plant.build(view, streams);

  // Photograph the plant *running*. A solved state lights the flare, opens the
  // valves and gives the stream tracers something to trace — an idle plant
  // photographs as a model of a plant, which is the wrong picture for a tile
  // that is about a process.
  const defaults = Object.fromEntries(
    Object.entries(mod.engine.inputSpec).map(([k, d]) => [k, d.default]));
  const result = mod.engine.run(defaults, { scenario: 'base', faults: [] });
  mod.plant.applyState?.(mod.engine.getEquipmentState(result), mod.engine.getStreams(result));

  const wide = SIZES[0].width / SIZES[0].height;
  const spec = SHOTS[entry.id];
  const borrowed = mod.plant.presetSpec?.[spec.from];
  if (!borrowed) throw new Error(`${entry.id}: no preset "${spec.from}" to take a subject from`);
  const { shot } = resolvePresets(view, { shot: { subject: borrowed.subject, aspect: wide, ...spec } });
  if (!shot) throw new Error(`${entry.id}: nothing to frame`);
  view.jumpTo(shot.pos, shot.target);

  if (DEBUG) {
    const box = new THREE.Box3();
    for (const m of view.listEquipment()) {
      const g = view.getEquipment(m.tag)?.group;
      if (g) box.expandByObject(g);
    }
    const s = box.getSize(new THREE.Vector3());
    const d = view.camera.position.distanceTo(new THREE.Vector3(...shot.target));
    say(`    box ${s.x.toFixed(0)}×${s.y.toFixed(0)}×${s.z.toFixed(0)} m` +
        `  units ${view.listEquipment().length}` +
        `  dist ${d.toFixed(1)}  fov ${view.camera.fov.toFixed(1)}  aspect ${view.camera.aspect.toFixed(2)}`);
  }

  // Let the scene settle: shaders compile, the reflection probe renders, the
  // shadow map fills in and the stream tracers reach their stride.
  await wait(1400);

  for (const size of SIZES) {
    const url = view.capture(size);
    const bytes = await post(`${entry.id}${size.suffix}`, url);
    say(`  ${entry.id}${size.suffix}.webp  ${size.width}×${size.height}  ${Math.round(bytes / 1024)} KB`);
    if (!size.suffix) {
      const img = new Image();
      img.src = url;
      shots.appendChild(img);
    }
  }

  view.dispose();
  host.remove();
}

(async () => {
  log.textContent = `theme: ${document.documentElement.dataset.theme}`;
  try {
    for (const entry of SIMULATORS) {
      say(`${entry.number} ${entry.name}`);
      await shoot(entry);
    }
    say('\ndone — assets/plant-bg/ is written');
    document.title = 'DONE — backdrop capture';
  } catch (err) {
    say(`\nFAILED: ${err.message}`);
    document.title = 'FAILED — backdrop capture';
    throw err;
  }
})();
