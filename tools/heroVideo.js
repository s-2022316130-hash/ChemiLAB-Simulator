/**
 * Film the gas plant for the overview's hero.
 *
 * The same idea as tools/backdrops.js, in motion: rather than stock footage of
 * somebody else's facility, the hero runs a film of the plant the hero opens —
 * the same three.js scene, geometry library, reflection probe and tone mapping
 * the simulator draws, running at the engine's base case so the flare is lit,
 * the stream tracers are moving and the status lamps are on. A plant that is
 * rebuilt is re-filmed by running this again.
 *
 * The camera drifts on a closed path — a few degrees of orbit, a little rise
 * and a slight push in and back — so the loop has no seam in the camera. What
 * the plant itself does (tracers, flare, lamps) is not periodic, so the film is
 * rendered one second long and the capture server cross-fades that second over
 * the opening one. Played on a loop, it never visibly restarts.
 *
 * Every frame is rendered at an exact thirtieth of a second on the virtual
 * clock in hero-video.html, so the film is smooth however long each frame
 * took to draw, and posted to the capture server with where each hotspot unit
 * landed in it. Those positions let the hero's labels ride on the units as the
 * camera moves.
 *
 * Nothing here ships. Run it with `npm run hero-film`.
 */
import * as THREE from 'three';
import { createPlantView } from '../src/scene/renderer.js';
import { createStreamSystem } from '../src/scene/streams.js';
import { resolvePresets } from '../src/scene/cameras.js';

const q = new URL(location.href).searchParams;
const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);

/**
 * The shot. Low, from the south-east, with the whole train in frame and pushed
 * right so the left of the picture is open sky and ground for the headline.
 * Every value can be overridden from the address bar while composing.
 */
const FILM = {
  width: num('w', 1920), height: num('h', 1080), fps: 30,
  seconds: num('sec', 16),
  blend: 1,                        // seconds rendered past the loop, cross-faded over its start
  // What the shot is of: the union of the plant's own preset clusters, so the
  // subject stays a list of real tags. Framing a cluster rather than the whole
  // plot brings the camera in among the vessels (see tools/backdrops.js).
  // Separated by "+", "," or a space — a "+" in an address arrives as a space.
  from: (q.get('from') || 'separation').split(/[+,\s]+/).filter(Boolean),
  azimuth: num('az', 33), elevation: num('el', 8), fill: num('fill', 1.0), aim: num('aim', 0.42),
  pan: num('pan', 0.18),           // fraction of the frame width the plant is pushed right
  sway: num('sway', 4),            // degrees of orbit either side over one loop
  rise: num('rise', 1.2),          // degrees of elevation change over one loop
  push: num('push', 0.05),         // fraction of the distance the camera moves in, mid-loop
  warm: 3                          // seconds of plant time run before the first frame
};

/** The units the hero labels: their positions are recorded for every frame. */
const HOT = ['V-501', 'T-501', 'T-502', 'T-503', 'E-502', 'EX-501', 'T-505', 'K-501', 'TK-501'];

const DEG = Math.PI / 180;
const STILL = q.has('still');
const log = document.getElementById('log');
const say = t => { log.textContent += `\n${t}`; };
const wait = ms => new Promise(r => setTimeout(r, ms));

async function post(name, body) {
  const res = await fetch(`/__hero/${name}`, { method: 'POST', body });
  if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text()}`);
}

/** The camera at time t on a closed path round the base shot. */
function poseAt(base, t) {
  const ph = (t / FILM.seconds) * Math.PI * 2;
  const target = new THREE.Vector3(...base.target);
  const off = new THREE.Vector3(...base.pos).sub(target);
  const r = off.length();
  const az = Math.atan2(off.x, off.z) + FILM.sway * DEG * Math.sin(ph);
  const el = Math.asin(off.y / r) + FILM.rise * DEG * Math.cos(ph);
  const dist = r * (1 - FILM.push * 0.5 * (1 - Math.cos(ph)));
  const dir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
  const pos = target.clone().addScaledVector(dir, dist);
  // Push the plant right: move camera and target together to the left, by a
  // share of the width the frame covers at the target's distance.
  const forward = dir.clone().negate();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const width = 2 * dist * Math.tan((45 * DEG) / 2) * (FILM.width / FILM.height);
  const shift = right.multiplyScalar(-FILM.pan * width);
  pos.add(shift); target.add(shift);
  return { pos: pos.toArray(), target: target.toArray() };
}

async function film() {
  const mod = (await import('../src/simulators/gas-processing/index.js')).default;

  // A small live view keeps the animation loop running cheaply; every frame
  // of the film is drawn by snapshot() at full size from its own pose.
  const host = document.createElement('div');
  host.style.cssText = 'width:480px;height:270px';
  document.getElementById('stage').appendChild(host);
  const view = createPlantView(host);
  if (view.fallback) throw new Error('no WebGL in this browser');
  view.setCaptions({ tags: false, names: false, values: false });
  const streams = createStreamSystem(view);
  mod.plant.build(view, streams);

  // The plant running at its base case, exactly as the workspace shows it after Run.
  const inputs = Object.fromEntries(Object.entries(mod.engine.inputSpec).map(([k, d]) => [k, d.default]));
  const result = mod.engine.run(inputs, { scenario: 'base', faults: [] });
  const eq = mod.engine.getEquipmentState(result), st = mod.engine.getStreams(result);
  view.setEquipmentValues?.(eq);
  streams.update(Object.fromEntries(st.map(s => [s.id, s])));
  mod.plant.applyState?.(eq, st);

  const subject = [...new Set(FILM.from.flatMap(id => {
    const s = mod.plant.presetSpec?.[id]?.subject;
    if (!s) throw new Error(`no preset "${id}" to take a subject from`);
    return s;
  }))];
  const { shot } = resolvePresets(view, {
    shot: { subject, azimuth: FILM.azimuth, elevation: FILM.elevation, fill: FILM.fill, aim: FILM.aim, aspect: FILM.width / FILM.height }
  });
  if (!shot) throw new Error('nothing to frame');
  view.jumpTo(shot.pos, shot.target);

  // Let it settle: shaders compile on the first real frames, then the plant
  // runs on its own clock until the tracers and the flare are in their stride.
  await wait(1500);
  for (let i = 0; i < FILM.warm * FILM.fps; i++) {
    window.__clock.step(1000 / FILM.fps);
    if (i % 15 === 0) await wait(20);
  }
  say(`base shot  pos ${shot.pos.join(', ')}  target ${shot.target.join(', ')}`);

  const loopFrames = FILM.seconds * FILM.fps;
  const total = STILL ? 4 : loopFrames + FILM.blend * FILM.fps;
  const track = Object.fromEntries(HOT.map(t => [t, []]));
  const preview = document.getElementById('preview');
  const started = Date.now();     // wall time, for the progress line; the film runs on __clock

  for (let f = 0; f < total; f++) {
    // Stills are spread across the loop, so the composition can be checked at
    // both ends of the camera's travel without rendering the whole film.
    const frame = STILL ? Math.round((f / 4) * loopFrames) : f;
    const t = frame / FILM.fps;
    window.__clock.step(STILL ? (loopFrames / 4) * (1000 / FILM.fps) : 1000 / FILM.fps);
    const { image, anchors } = view.snapshot({ width: FILM.width, height: FILM.height, pose: poseAt(shot, t) });
    if (!STILL && f < loopFrames) {
      for (const a of anchors) {
        if (!track[a.tag]) continue;
        track[a.tag].push([+(a.x / FILM.width).toFixed(4), +(a.y / FILM.height).toFixed(4), a.onScreen ? 1 : 0]);
      }
    }
    const blob = await new Promise(r => image.toBlob(r, 'image/jpeg', 0.93));
    await post(STILL ? `still-${f}.jpg` : `frame-${String(f).padStart(4, '0')}.jpg`, blob);
    if (STILL || f % 30 === 0) {
      preview.src = URL.createObjectURL(blob);
      say(`  frame ${f + 1} / ${total}   ${Math.round((Date.now() - started) / 1000)} s`);
    }
  }

  if (STILL) { say('\nstills written'); document.title = 'DONE — hero stills'; return; }

  await post('anchors.json', JSON.stringify({
    fps: FILM.fps, frames: loopFrames, width: FILM.width, height: FILM.height, tags: track
  }));
  await post('done.json', JSON.stringify({ fps: FILM.fps, seconds: FILM.seconds, blend: FILM.blend, width: FILM.width, height: FILM.height }));
  say('\nall frames posted — the capture server is encoding');
  document.title = 'DONE — hero film';
}

film().catch(err => {
  say(`\nFAILED: ${err.message}`);
  document.title = 'FAILED — hero film';
  throw err;
});
