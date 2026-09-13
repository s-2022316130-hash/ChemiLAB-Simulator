import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ground } from './geometry.js';
import { highlight } from './materials.js';
import { onFrame, createQualityGovernor } from '../shared/animation.js';

export function webglAvailable() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
  catch { return false; }
}
/**
 * Shared 3D plant renderer. Owns camera, picking, hover and the render loop.
 * It never reads engine internals — a plant module feeds it equipment groups,
 * and equipment state arrives as plain data from engine.getEquipmentState().
 */
export function createPlantView(container, { onSelect, onHover } = {}) {
  if (!webglAvailable()) return { fallback: true, dispose() {} };
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070b10);
  scene.fog = new THREE.Fog(0x070b10, 55, 130);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
  camera.position.set(26, 18, 26);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.49; controls.target.set(0, 4, 0);

  scene.add(new THREE.HemisphereLight(0x7fa8c4, 0x101820, 0.9));
  const key = new THREE.DirectionalLight(0xdfe9f2, 1.15);
  key.position.set(20, 32, 14); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = key.shadow.camera.bottom = -40;
  key.shadow.camera.right = key.shadow.camera.top = 40;
  scene.add(key);
  scene.add(ground({ size: 90 }));
  const grid = new THREE.GridHelper(90, 45, 0x1e3040, 0x121c26); grid.position.y = 0.01; scene.add(grid);

  const equipment = new Map();   // tag -> {group, meta}
  const ray = new THREE.Raycaster(); const ptr = new THREE.Vector2();
  let hovered = null, selected = null;

  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(container); resize();

  function pick(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    ptr.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    ptr.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ptr, camera);
    const hits = ray.intersectObjects([...equipment.values()].map(e => e.group), true);
    if (!hits.length) return null;
    let o = hits[0].object;
    while (o && !o.userData.tag) o = o.parent;
    return o?.userData.tag || null;
  }
  renderer.domElement.addEventListener('pointermove', ev => {
    const tag = pick(ev);
    renderer.domElement.style.cursor = tag ? 'pointer' : 'grab';
    if (tag === hovered) return;
    if (hovered && hovered !== selected) highlight(equipment.get(hovered).group, false);
    hovered = tag;
    if (hovered && hovered !== selected) highlight(equipment.get(hovered).group, true);
    onHover?.(tag);
  });
  renderer.domElement.addEventListener('click', ev => onSelect?.(pick(ev)));

  const gov = createQualityGovernor();
  const tickers = new Set();
  const stopLoop = onFrame((dt, t) => { controls.update(); tickers.forEach(fn => fn(dt, t, gov.quality)); renderer.render(scene, camera); });

  return {
    fallback: false, scene, camera, controls, renderer,
    /** meta: {tag, name, camera:{pos,target}, type} */
    addEquipment(group, meta) {
      group.userData.tag = meta.tag;
      group.traverse(o => { o.userData.tag = meta.tag; });
      scene.add(group); equipment.set(meta.tag, { group, meta });
      return group;
    },
    add(obj) { scene.add(obj); return obj; },
    getEquipment: tag => equipment.get(tag) || null,
    listEquipment: () => [...equipment.values()].map(e => e.meta),
    select(tag) {
      if (selected && equipment.has(selected)) highlight(equipment.get(selected).group, false);
      selected = tag;
      if (tag && equipment.has(tag)) highlight(equipment.get(tag).group, true);
    },
    focus(tagOrPreset) {
      const e = equipment.get(tagOrPreset);
      const cam = e?.meta.camera;
      if (cam) this.flyTo(cam.pos, cam.target);
    },
    flyTo(pos, target = [0, 4, 0], ms = 700) {
      const p0 = camera.position.clone(), t0 = controls.target.clone();
      const p1 = new THREE.Vector3(...pos), t1 = new THREE.Vector3(...target);
      const start = performance.now();
      const off = onFrame(() => {
        const k = Math.min((performance.now() - start) / ms, 1), e = k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        camera.position.lerpVectors(p0, p1, e); controls.target.lerpVectors(t0, t1, e);
        if (k >= 1) off();
      });
    },
    onTick(fn) { tickers.add(fn); return () => tickers.delete(fn); },
    get fps() { return gov.fps; },
    get quality() { return gov.quality; },
    dispose() { stopLoop(); gov.dispose(); ro.disconnect(); controls.dispose(); renderer.dispose(); container.innerHTML = ''; }
  };
}
