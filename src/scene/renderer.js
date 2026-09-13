import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ground } from './geometry.js';
import { makeLabel, updateLabel, skyTexture, selectionRing } from './labels.js';
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
  // The signature hue of the simulator on screen, read from the shell so the
  // plant lighting and the interface agree on what this unit's colour is.
  const hue = new THREE.Color(
    getComputedStyle(document.documentElement).getPropertyValue('--hue').trim() || '#f5a524'
  );
  const scene = new THREE.Scene();
  scene.background = skyTexture(hue);
  scene.fog = new THREE.Fog(new THREE.Color(0x15121a).lerp(hue, 0.06).getHex(), 70, 190);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
  camera.position.set(26, 18, 26);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.49; controls.target.set(0, 4, 0);

  // Four lights rather than two: a warm key for form, a cool fill so the shadow
  // side stays readable, a rim in the simulator's own hue to lift equipment off
  // the background, and a hemisphere for ambient bounce.
  scene.add(new THREE.HemisphereLight(0xbfd4e8, 0x2a2233, 0.5));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.0);
  key.position.set(26, 38, 18); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = key.shadow.camera.bottom = -46;
  key.shadow.camera.right = key.shadow.camera.top = 46;
  key.shadow.camera.far = 150; key.shadow.bias = -0.0006; key.shadow.normalBias = 0.02;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x9fc4e8, 0.5);
  fill.position.set(-28, 16, -20); scene.add(fill);
  const rim = new THREE.DirectionalLight(hue.clone().lerp(new THREE.Color(0xffffff), 0.35), 0.8);
  rim.position.set(-14, 10, 30); scene.add(rim);

  scene.add(ground({ size: 150 }));
  const grid = new THREE.GridHelper(150, 75, 0x5a4d69, 0x312a3c);
  grid.material.transparent = true; grid.material.opacity = 0.45;
  grid.position.y = 0.012; scene.add(grid);
  // A soft pool of the unit's hue under the plot, so the plant sits on the
  // ground instead of floating on a flat plane.
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(58, 48),
    new THREE.MeshBasicMaterial({ color: hue, transparent: true, opacity: 0.055, depthWrite: false })
  );
  pool.rotation.x = -Math.PI / 2; pool.position.y = 0.006; scene.add(pool);

  const marker = selectionRing(hue); marker.visible = false; scene.add(marker);
  const labels = new THREE.Group(); scene.add(labels);
  // Caption detail: off | tag | name | values. Live values are only ever the
  // engine's own formatted readings for that tag, never anything derived here.
  let captionMode = 'name';
  let lastValues = {};

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
  const stopLoop = onFrame((dt, t) => {
    controls.update();
    // Labels are billboards: they turn to face the camera and fade out with
    // distance, so a wide shot does not become a wall of text.
    if (captionMode !== 'off') {
      // Constant apparent size: work out how many world units one screen pixel
      // covers at the label's distance, so every label reads the same whatever
      // the camera is doing. Far ones fade out so a wide shot stays a plant
      // rather than a wall of text.
      const vh = renderer.domElement.clientHeight || 1;
      const pxToWorld = 2 * Math.tan((camera.fov * Math.PI / 180) / 2) / vh;
      for (const l of labels.children) {
        l.quaternion.copy(camera.quaternion);
        const d = camera.position.distanceTo(l.position);
        const sel = l.userData.selected;
        l.material.opacity = sel ? 1 : Math.max(0, Math.min(0.92, (74 - d) / 30));
        l.visible = sel || l.material.opacity > 0.02;
        const k = pxToWorld * d * 0.62 * (sel ? 1.25 : 1);
        l.scale.set(l.userData.pxW * k, l.userData.pxH * k, 1);
      }
    }
    if (marker.visible) {
      marker.rotation.z = t * 0.35;
      marker.material.opacity = 0.4 + 0.22 * Math.sin(t * 2.2);
    }
    tickers.forEach(fn => fn(dt, t, gov.quality));
    renderer.render(scene, camera);
  });

  return {
    fallback: false, scene, camera, controls, renderer,
    /** meta: {tag, name, camera:{pos,target}, type} */
    addEquipment(group, meta) {
      group.userData.tag = meta.tag;
      group.traverse(o => { o.userData.tag = meta.tag; });
      scene.add(group); equipment.set(meta.tag, { group, meta });
      // Every tagged item gets a floating label, so a plant reads as named
      // sections rather than as an unlabelled mass of geometry. Built here
      // rather than per simulator, so no plant module can forget one.
      const box = new THREE.Box3().setFromObject(group);
      const label = makeLabel(meta.tag, meta.name || '', hue);
      label.position.set(
        (box.min.x + box.max.x) / 2,
        Number.isFinite(box.max.y) ? box.max.y + 1.6 : 4,
        (box.min.z + box.max.z) / 2
      );
      label.userData.tag = meta.tag;
      labels.add(label);
      equipment.get(meta.tag).label = label;
      updateLabel(label, captionMode, null);
      return group;
    },
    /**
     * Caption detail level. Captions help when reading a plant and get in the
     * way when looking at it, so how much they say belongs to whoever is looking.
     */
    setCaptionMode(mode) {
      captionMode = ['off', 'tag', 'name', 'values'].includes(mode) ? mode : 'name';
      labels.visible = captionMode !== 'off';
      if (captionMode !== 'off') {
        for (const [tag, e] of equipment) {
          if (e.label) updateLabel(e.label, captionMode, lastValues[tag]?.values ?? null);
        }
      }
      return captionMode;
    },
    get captionMode() { return captionMode; },
    /** Feed the captions the engine's equipment state, straight through. */
    setEquipmentValues(state) {
      lastValues = state || {};
      if (captionMode !== 'values') return;
      for (const [tag, e] of equipment) {
        if (e.label) updateLabel(e.label, captionMode, lastValues[tag]?.values ?? null);
      }
    },
    add(obj) { scene.add(obj); return obj; },
    getEquipment: tag => equipment.get(tag) || null,
    listEquipment: () => [...equipment.values()].map(e => e.meta),
    select(tag) {
      if (selected && equipment.has(selected)) {
        highlight(equipment.get(selected).group, false);
        const prev = equipment.get(selected).label;
        if (prev) prev.userData.selected = false;
      }
      selected = tag;
      const e = tag ? equipment.get(tag) : null;
      if (e) {
        highlight(e.group, true);
        // Ground ring under the selection, so it reads from any camera angle
        // rather than only when the highlighted face happens to be visible.
        const box = new THREE.Box3().setFromObject(e.group);
        const span = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
        marker.position.set((box.min.x + box.max.x) / 2, 0.03, (box.min.z + box.max.z) / 2);
        marker.scale.setScalar(Number.isFinite(span) ? span * 0.62 + 1.2 : 3);
        marker.visible = true;
        if (e.label) e.label.userData.selected = true;
      } else {
        marker.visible = false;
      }
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
