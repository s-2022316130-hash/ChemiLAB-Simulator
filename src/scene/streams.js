import * as THREE from 'three';
import { token, onThemeChange } from '../shared/theme.js';

/**
 * Animated stream tracers along a pipe path.
 *
 * Rule: a stream only animates when the engine reports a non-zero flow for it,
 * and the speed is proportional to the calculated velocity — never a decorative
 * constant. A pipe with nothing in it shows nothing.
 *
 * Colour comes from the same design tokens the flowsheet uses, so a phase is
 * one colour across the whole application: what is blue in the diagram is blue
 * in the plant.
 */

/** Token name per phase. The values live in theme.css. */
const PHASE_TOKEN = {
  liquid: '--stream-liquid', gas: '--stream-gas', steam: '--stream-steam',
  air: '--stream-air', solid: '--stream-solid', slurry: '--stream-slurry'
};
/** Tracer size per phase: a gas tracer is a wisp, a solids tracer is a lump. */
const PHASE_SIZE = { liquid: 1, gas: 0.8, steam: 0.85, air: 0.8, solid: 1.25, slurry: 1.2 };

const phaseColour = phase => new THREE.Color(token(PHASE_TOKEN[phase] || PHASE_TOKEN.liquid, '#0284c7'));

export function createStreamSystem(view) {
  const streams = new Map(); // id -> {curve, mesh, flow, speed, phase, offsets}
  const geo = new THREE.SphereGeometry(0.1, 8, 6);

  function add(id, path, { phase = 'liquid', maxTracers = 26 } = {}) {
    const curve = new THREE.CatmullRomCurve3(path.map(p => new THREE.Vector3(...p)));
    // Pushed past white so the bloom pass picks it up: a live stream should
    // read as something moving and lit, not as a row of painted dots.
    const mat = new THREE.MeshBasicMaterial({
      color: phaseColour(phase).multiplyScalar(1.7), toneMapped: false, fog: false
    });
    const mesh = new THREE.InstancedMesh(geo, mat, maxTracers);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.castShadow = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    view.add(mesh);
    streams.set(id, {
      curve, mesh, maxTracers, phase, flow: 0, speed: 0, targetSpeed: 0, travel: 0,
      size: PHASE_SIZE[phase] ?? 1,
      offsets: Float32Array.from({ length: maxTracers }, (_, i) => i / maxTracers)
    });
    return mesh;
  }

  /** state: {id: {flow, velocity?}} straight from engine.getStreams() */
  function update(state) {
    for (const [id, s] of streams) {
      const st = state?.[id];
      const flow = st?.flow ?? 0;
      s.flow = Number.isFinite(flow) ? flow : 0;
      // Velocity sets the speed. The cap keeps a very fast line legible rather
      // than turning it into a blur that says nothing about its flow.
      s.targetSpeed = s.flow > 0 ? Math.min(0.05 + (st.velocity ?? 0.5) * 0.045, 0.55) : 0;
      s.live = s.flow > 0;
    }
  }

  const dummy = new THREE.Object3D();
  const offTick = view.onTick((dt, t, quality) => {
    for (const s of streams.values()) {
      // Speed is eased rather than stepped, so a change in operating conditions
      // shows as the line accelerating rather than as the tracers teleporting.
      s.speed += (s.targetSpeed - s.speed) * Math.min(dt * 4, 1);
      if (!s.live && s.speed < 0.004) { s.mesh.visible = false; s.mesh.count = 0; continue; }
      s.mesh.visible = true;
      // Travel accumulates, so the pattern never jumps when the speed changes.
      s.travel = (s.travel + dt * s.speed) % 1;

      const n = Math.max(4, Math.round(s.maxTracers * quality));
      s.mesh.count = n;
      const fade = Math.min(s.speed / 0.06, 1);
      for (let i = 0; i < n; i++) {
        const u = (s.offsets[i] + s.travel) % 1;
        s.curve.getPointAt(u, dummy.position);
        // A gentle swell along the line reads as flow rather than as beads on
        // a string, and costs one sine per tracer.
        const k = s.size * fade * (0.82 + 0.22 * Math.sin((u * 7 + t * 1.6) * Math.PI));
        dummy.scale.setScalar(k);
        dummy.updateMatrix();
        s.mesh.setMatrixAt(i, dummy.matrix);
      }
      s.mesh.instanceMatrix.needsUpdate = true;
    }
  });

  const offTheme = onThemeChange(() => {
    for (const s of streams.values()) s.mesh.material.color.copy(phaseColour(s.phase)).multiplyScalar(1.7);
  });

  return {
    add, update,
    get ids() { return [...streams.keys()]; },
    dispose() {
      offTick(); offTheme();
      for (const s of streams.values()) s.mesh.material.dispose();
      geo.dispose();
    }
  };
}
