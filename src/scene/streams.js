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
 *
 * Three things about how a stream is *drawn* are worth stating, because they
 * are what make a pipe read as carrying something rather than as having beads
 * on it:
 *
 *   Direction. Every tracer is oriented along the curve's tangent at the point
 *   it sits on, and the shapes are asymmetric, so which way a line runs is
 *   visible without watching it move. On a still frame — a screenshot, a
 *   throttled tab — a flowsheet that has direction is still a flowsheet.
 *
 *   Character. A gas is not a liquid. Gas and steam are drawn as long, soft,
 *   faint wisps; a liquid is a compact slug; solids are lumps that tumble. The
 *   phase is already in the colour, and being in the motion as well means it
 *   reads at a glance and in a still.
 *
 *   Wake. Each tracer is stretched along its direction in proportion to speed,
 *   so a fast line reads as fast rather than as the same dots moving quicker.
 *   That is one multiply per tracer.
 */

/** Token name per phase. The values live in tokens.css. */
const PHASE_TOKEN = {
  liquid: '--stream-liquid', gas: '--stream-gas', steam: '--stream-steam',
  air: '--stream-air', solid: '--stream-solid', slurry: '--stream-slurry'
};

/**
 * How each phase is drawn. `size` is the base scale, `stretch` how much the
 * tracer elongates with speed, `gain` the emissive push past white that decides
 * whether the bloom pass picks it up.
 */
const PHASE_STYLE = {
  liquid: { shape: 'slug', size: 1.00, stretch: 1.5, opacity: 1.00, gain: 1.8 },
  slurry: { shape: 'lump', size: 1.20, stretch: 0.8, opacity: 1.00, gain: 1.5 },
  gas:    { shape: 'wisp', size: 0.85, stretch: 3.0, opacity: 0.62, gain: 1.5 },
  air:    { shape: 'wisp', size: 0.80, stretch: 2.6, opacity: 0.58, gain: 1.5 },
  steam:  { shape: 'wisp', size: 0.95, stretch: 3.4, opacity: 0.50, gain: 1.3 },
  solid:  { shape: 'lump', size: 1.25, stretch: 0.5, opacity: 1.00, gain: 1.3 }
};
const styleFor = phase => PHASE_STYLE[phase] || PHASE_STYLE.liquid;
const phaseColour = phase => new THREE.Color(token(PHASE_TOKEN[phase] || PHASE_TOKEN.liquid, '#43b4f5'));

/** Along +Y, so a tracer can be pointed down the pipe with one quaternion. */
const UP = new THREE.Vector3(0, 1, 0);

export function createStreamSystem(view) {
  const streams = new Map(); // id -> {curve, mesh, flow, speed, phase, offsets}

  // Three shared geometries for the whole scene rather than one per stream.
  // A slug is a rounded cone — blunt at the back, pointed forward, which is the
  // shape of something being pushed along a pipe. A wisp is the same idea drawn
  // long and soft. A lump is a lump.
  const GEO = {
    slug: new THREE.ConeGeometry(0.085, 0.26, 10, 1),
    wisp: new THREE.ConeGeometry(0.055, 0.34, 8, 1),
    lump: new THREE.IcosahedronGeometry(0.1, 0)
  };

  function add(id, path, { phase = 'liquid', maxTracers = 26 } = {}) {
    const curve = new THREE.CatmullRomCurve3(path.map(p => new THREE.Vector3(...p)));
    const style = styleFor(phase);
    // Pushed past white so the bloom pass picks it up: a live stream should read
    // as something moving and lit, not as a row of painted dots.
    const mat = new THREE.MeshBasicMaterial({
      color: phaseColour(phase).multiplyScalar(style.gain),
      toneMapped: false, fog: false,
      transparent: style.opacity < 1, opacity: style.opacity,
      depthWrite: style.opacity >= 1
    });
    const mesh = new THREE.InstancedMesh(GEO[style.shape], mat, maxTracers);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.castShadow = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    view.add(mesh);
    streams.set(id, {
      curve, mesh, maxTracers, phase, style,
      flow: 0, speed: 0, targetSpeed: 0, travel: 0, live: false,
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
  const tangent = new THREE.Vector3();
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
      // How far past its resting length a tracer is drawn at this speed.
      const wake = 1 + s.style.stretch * Math.min(s.speed / 0.4, 1);

      for (let i = 0; i < n; i++) {
        const u = (s.offsets[i] + s.travel) % 1;
        s.curve.getPointAt(u, dummy.position);
        s.curve.getTangentAt(u, tangent);
        dummy.quaternion.setFromUnitVectors(UP, tangent);

        // A gentle swell along the line reads as flow rather than as beads on a
        // string, and costs one sine per tracer.
        const k = s.style.size * fade * (0.82 + 0.22 * Math.sin((u * 7 + t * 1.6) * Math.PI));
        dummy.scale.set(k, k * wake, k);
        dummy.updateMatrix();
        s.mesh.setMatrixAt(i, dummy.matrix);
      }
      s.mesh.instanceMatrix.needsUpdate = true;
    }
  });

  const offTheme = onThemeChange(() => {
    for (const s of streams.values()) {
      s.mesh.material.color.copy(phaseColour(s.phase)).multiplyScalar(s.style.gain);
    }
  });

  return {
    add, update,
    get ids() { return [...streams.keys()]; },
    dispose() {
      offTick(); offTheme();
      for (const s of streams.values()) s.mesh.material.dispose();
      for (const g of Object.values(GEO)) g.dispose();
    }
  };
}
