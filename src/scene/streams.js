import * as THREE from 'three';
/**
 * Animated stream tracers along a pipe path.
 * Rule: a stream only animates when the engine reports a non-zero flow for it.
 * Speed is proportional to the calculated velocity/flow — not a decorative constant.
 */
const PHASE_COLOR = { liquid: 0x3aa0ff, gas: 0xb58cff, steam: 0xe7eef5, air: 0x9fd4e8, solid: 0xc9a227, slurry: 0x6f8f6a };
export function createStreamSystem(view) {
  const streams = new Map(); // id -> {curve, points, mesh, flow, speed}
  const geo = new THREE.SphereGeometry(0.09, 6, 6);
  function add(id, path, { phase = 'liquid', maxTracers = 26 } = {}) {
    const curve = new THREE.CatmullRomCurve3(path.map(p => new THREE.Vector3(...p)));
    const mat = new THREE.MeshBasicMaterial({ color: PHASE_COLOR[phase] ?? PHASE_COLOR.liquid });
    const mesh = new THREE.InstancedMesh(geo, mat, maxTracers);
    mesh.frustumCulled = false; mesh.count = 0; view.add(mesh);
    streams.set(id, { curve, mesh, maxTracers, flow: 0, speed: 0, offsets: new Float32Array(maxTracers).map((_, i) => i / maxTracers) });
    return mesh;
  }
  /** state: {id: {flow, velocity?}} straight from engine.getStreams() */
  function update(state) {
    for (const [id, s] of streams) {
      const st = state?.[id];
      const flow = st?.flow ?? 0;
      s.flow = Number.isFinite(flow) ? flow : 0;
      s.speed = s.flow > 0 ? Math.min(0.06 + (st.velocity ?? 0.5) * 0.04, 0.5) : 0;
      s.mesh.visible = s.flow > 0;
    }
  }
  const dummy = new THREE.Object3D();
  view.onTick((dt, t, quality) => {
    for (const s of streams.values()) {
      if (!s.mesh.visible) { s.mesh.count = 0; continue; }
      const n = Math.max(4, Math.round(s.maxTracers * quality));
      s.mesh.count = n;
      for (let i = 0; i < n; i++) {
        const u = ((s.offsets[i] + t * s.speed) % 1);
        s.curve.getPointAt(u, dummy.position); dummy.updateMatrix();
        s.mesh.setMatrixAt(i, dummy.matrix);
      }
      s.mesh.instanceMatrix.needsUpdate = true;
    }
  });
  return { add, update, get ids() { return [...streams.keys()]; } };
}
