import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { createEnvironment } from './env.js';
import { compact } from './geometry.js';
import { makeLabel, updateLabel, selectionRing, CAPTION_DEFAULT } from './labels.js';
import { highlight, setSceneTheme } from './materials.js';
import { onFrame, createQualityGovernor, damp, smoothstep } from '../shared/animation.js';
import { token, tokenNumber, getTheme, onThemeChange } from '../shared/theme.js';

export function webglAvailable() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
  catch { return false; }
}

// Captions live in a scene of their own and are composited after
// post-processing, so text stays crisp, is never smeared by bloom or shifted by
// tone mapping, and compositing it does not mean walking the whole plant twice.

/**
 * Shared 3D plant renderer. Owns camera, picking, hover, post-processing and
 * the render loop. It never reads engine internals — a plant module feeds it
 * equipment groups, and equipment state arrives as plain data from
 * engine.getEquipmentState().
 *
 * Three things here are worth knowing before changing any of it:
 *
 *  - Quality is measured, not assumed. The governor in shared/animation.js
 *    reports a tier, and bloom, shadow resolution and render scale follow it.
 *    The aim is a steady 60 fps on a teaching laptop rather than a peak frame
 *    rate on a workstation.
 *  - Shadows are static by default and refreshed a few times a second. The sun
 *    does not move and neither does most of the plant, so re-rendering the
 *    shadow map every frame buys nothing and costs a great deal.
 *  - The scene's colours come from the design tokens, so the plant repaints
 *    with the interface when the theme changes instead of being a dark island
 *    in a light page.
 */
export function createPlantView(container, { onSelect, onHover } = {}) {
  if (!webglAvailable()) return { fallback: true, dispose() {} };

  const hue = new THREE.Color(token('--hue', '#0e7490'));
  setSceneTheme(getTheme());

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 600);
  camera.position.set(30, 20, 30);

  const renderer = new THREE.WebGLRenderer({
    antialias: true, powerPreference: 'high-performance', stencil: false
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = tokenNumber('--scene-exposure', 1);
  if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.rotateSpeed = 0.75;
  controls.zoomSpeed = 0.9;
  controls.panSpeed = 0.7;
  controls.maxPolarAngle = Math.PI * 0.492;
  controls.minDistance = 6;
  controls.maxDistance = 190;
  controls.target.set(0, 4, 0);

  const env = createEnvironment(scene, renderer, hue);

  const marker = selectionRing(hue); marker.visible = false; scene.add(marker);
  const captionScene = new THREE.Scene();
  const labels = new THREE.Group(); captionScene.add(labels);

  // Atmosphere: a slow drift of motes catching the light. It is the cheapest
  // thing in the scene that makes it feel like a place rather than a render.
  const motes = buildMotes(hue);
  scene.add(motes);

  // Caption switches. Three independent answers to three different questions —
  // which unit is this, what is it called, what is it doing — so turning them
  // all off is what "captions off" means.
  let captions = { ...CAPTION_DEFAULT };
  let equipmentState = {};

  const equipment = new Map();   // tag -> {group, meta, label}
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  let hovered = null, selected = null;

  // --- post-processing -----------------------------------------------------
  // A multisampled HDR target, so bloom works on real high-dynamic-range values
  // and the geometry keeps its hardware antialiasing through the chain.
  const rt = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType, samples: 4, depthBuffer: true, stencilBuffer: false
  });
  const composer = new EffectComposer(renderer, rt);
  const renderPass = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(512, 512), tokenNumber('--scene-bloom', 0.22), 0.5, 1.0);
  const outlinePass = new OutlinePass(new THREE.Vector2(512, 512), scene, camera);
  outlinePass.edgeStrength = 3.2;
  outlinePass.edgeGlow = 0.35;
  outlinePass.edgeThickness = 1.4;
  outlinePass.pulsePeriod = 0;
  outlinePass.visibleEdgeColor.copy(hue);
  outlinePass.hiddenEdgeColor.copy(hue).multiplyScalar(0.35);
  outlinePass.enabled = false;
  composer.addPass(renderPass);
  composer.addPass(outlinePass);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  let usePost = true;

  // --- shadows -------------------------------------------------------------
  // The shadow map is re-rendered on demand rather than every frame. Nothing
  // that matters casts a fast-moving shadow, and this is the single largest
  // saving available in a scene this size.
  let shadowDue = 0;
  function refreshShadows() { shadowDue = 2; }
  refreshShadows();

  function resize() {
    const w = Math.max(container.clientWidth, 1), h = Math.max(container.clientHeight, 1);
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloomPass.setSize(Math.round(w / 3), Math.round(h / 3));
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    refreshShadows();
  }
  const ro = new ResizeObserver(resize); ro.observe(container); resize();

  // --- picking -------------------------------------------------------------
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

  const el = renderer.domElement;
  el.style.touchAction = 'none';
  el.style.cursor = 'grab';

  let idle = 0, pressed = false, pressAt = null, moved = 0, flying = false;
  const wake = () => { idle = 0; };

  el.addEventListener('pointerdown', ev => {
    pressed = true; moved = 0; pressAt = { x: ev.clientX, y: ev.clientY };
    el.style.cursor = 'grabbing'; wake();
  });
  const onPointerUp = () => { pressed = false; el.style.cursor = hovered ? 'pointer' : 'grab'; };
  addEventListener('pointerup', onPointerUp);
  el.addEventListener('wheel', wake, { passive: true });

  el.addEventListener('pointermove', ev => {
    wake();
    if (pressed) {
      moved = Math.max(moved, Math.hypot(ev.clientX - pressAt.x, ev.clientY - pressAt.y));
      return;                                   // orbiting, not pointing
    }
    const tag = pick(ev);
    el.style.cursor = tag ? 'pointer' : 'grab';
    if (tag === hovered) return;
    if (hovered && hovered !== selected && equipment.has(hovered)) highlight(equipment.get(hovered).group, false);
    hovered = tag;
    if (hovered && hovered !== selected && equipment.has(hovered)) highlight(equipment.get(hovered).group, true);
    syncOutline();
    refreshShadows();
    onHover?.(tag);
  });
  el.addEventListener('pointerleave', () => {
    if (hovered && hovered !== selected && equipment.has(hovered)) highlight(equipment.get(hovered).group, false);
    hovered = null; syncOutline(); onHover?.(null);
  });
  // A click that followed a drag is an orbit, not a selection. Four pixels of
  // travel is the difference between pointing at a pump and looking around it.
  el.addEventListener('click', ev => { if (moved <= 4) onSelect?.(pick(ev)); });

  function syncOutline() {
    const list = [];
    if (selected && equipment.has(selected)) list.push(equipment.get(selected).group);
    else if (hovered && equipment.has(hovered)) list.push(equipment.get(hovered).group);
    outlinePass.selectedObjects = list;
    // The pass costs nothing while nothing is selected, so it is gated on
    // having something to outline rather than on the quality tier.
    outlinePass.enabled = usePost && list.length > 0;
  }

  // --- quality -------------------------------------------------------------
  const gov = createQualityGovernor();
  const offTier = gov.onTier(applyTier);
  /**
   * What each tier buys and what it costs. Multisampling on a half-float
   * target is the expensive part on an integrated GPU — it is bandwidth, four
   * times over — so it is the first thing to come down, then the resolution
   * the scene is rendered at, and only last the bloom itself.
   */
  function applyTier(tier) {
    const dpr = devicePixelRatio || 1;
    const samples = tier === 'high' ? 4 : tier === 'medium' ? 2 : 0;
    if (tier === 'high') {
      usePost = true;
      renderer.setPixelRatio(Math.min(dpr, 2));
      bloomPass.enabled = true;
      env.setShadowQuality(true, 2048);
    } else if (tier === 'medium') {
      usePost = true;
      renderer.setPixelRatio(Math.min(dpr, 1.25));
      bloomPass.enabled = true;
      env.setShadowQuality(true, 1024);
    } else {
      // Straight to the screen, where the hardware antialiasing the context was
      // created with does the job the multisampled target was doing.
      usePost = false;
      renderer.setPixelRatio(1);
      bloomPass.enabled = false;
      env.setShadowQuality(true, 1024);
    }
    if (composer.renderTarget1.samples !== samples) {
      for (const target of [composer.renderTarget1, composer.renderTarget2]) {
        target.dispose();
        target.samples = samples;
      }
    }
    motes.visible = tier !== 'low';
    composer.setPixelRatio(renderer.getPixelRatio());
    syncOutline();
    resize();
  }

  // --- theme ---------------------------------------------------------------
  const offTheme = onThemeChange(theme => {
    setSceneTheme(theme);
    hue.set(token('--hue', '#0e7490'));
    env.apply();
    renderer.toneMappingExposure = tokenNumber('--scene-exposure', 1);
    bloomPass.strength = tokenNumber('--scene-bloom', 0.22);
    outlinePass.visibleEdgeColor.copy(hue);
    outlinePass.hiddenEdgeColor.copy(hue).multiplyScalar(0.35);
    marker.traverse(o => { if (o.isMesh) o.material.color.copy(hue); });
    motes.material.color.copy(hue).lerp(new THREE.Color(0xffffff), 0.55);
    motes.material.opacity = theme === 'dark' ? 0.32 : 0.24;
    for (const [tag, e] of equipment) if (e.label) updateLabel(e.label, captions, equipmentState[tag]);
    refreshShadows();
  });

  // --- render loop ---------------------------------------------------------
  const tickers = new Set();
  let shadowClock = 0;

  const stopLoop = onFrame((dt, t) => {
    controls.update();

    // Idle orbit: after eight seconds of stillness the camera drifts round the
    // plant on its own. It restarts the moment anyone touches it, so it reads
    // as the view settling rather than as a control being taken away.
    idle += dt;
    if (idle > 10 && !pressed && !flying) {
      // About one degree and a half a second: enough that the view is alive and
      // the light moves across the equipment, slow enough that it never takes
      // the plant away from someone reading it.
      const k = smoothstep((idle - 10) / 4);
      const off = camera.position.clone().sub(controls.target);
      const a = 0.028 * dt * k;
      off.applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
      camera.position.copy(controls.target).add(off);
    }

    if (captions.tags || captions.names || captions.values) {
      // Constant apparent size: work out how many world units one screen pixel
      // covers at the label's distance, so every label reads the same whatever
      // the camera is doing. Far ones fade so a wide shot stays a plant rather
      // than a wall of text.
      const vh = renderer.domElement.clientHeight || 1;
      const pxToWorld = 2 * Math.tan((camera.fov * Math.PI / 180) / 2) / vh;
      // Captions fade relative to whatever the camera is looking at rather than
      // at a fixed distance. A water works fits in thirty metres and a prilling
      // tower is nearly sixty tall, and one absolute number cannot serve both:
      // it either buries the small plant in text or empties the large one.
      const focus = camera.position.distanceTo(controls.target);
      const fadeStart = focus * 1.25, fadeEnd = focus * 2.1;
      for (const l of labels.children) {
        if (l.userData.sig === 'empty') continue;
        const d = camera.position.distanceTo(l.position);
        const sel = l.userData.selected;
        const target = sel ? 1 : Math.max(0, Math.min(0.95, (fadeEnd - d) / (fadeEnd - fadeStart)));
        l.material.opacity = damp(l.material.opacity, target, 9, dt);
        l.visible = l.material.opacity > 0.02;
        const k = pxToWorld * d * 0.47 * (sel ? 1.25 : 1);
        l.scale.set(l.userData.pxW * k, l.userData.pxH * k, 1);
      }
    }

    if (marker.visible) {
      marker.rotation.y = t * 0.3;
      const pulse = 0.42 + 0.2 * Math.sin(t * 2.4);
      for (const r of marker.userData.rings) r.material.opacity = pulse;
    }

    if (motes.visible) {
      motes.rotation.y = t * 0.006;
      motes.position.y = Math.sin(t * 0.18) * 0.6;
    }

    tickers.forEach(fn => fn(dt, t, gov.quality));

    // Static shadows, refreshed a few times a second at full quality so the
    // turning parts of the plant still cast something honest.
    shadowClock += dt;
    if (shadowDue > 0) { renderer.shadowMap.needsUpdate = true; shadowDue--; shadowClock = 0; }
    else if (gov.tier === 'high' && shadowClock > 0.4) { renderer.shadowMap.needsUpdate = true; shadowClock = 0; }

    if (usePost) composer.render(dt); else renderer.render(scene, camera);

    // Captions composited last, at native resolution, outside the tone-mapped
    // and bloomed image — so a reading stays exactly the colour it was drawn.
    if (labels.children.length) {
      renderer.autoClear = false;
      renderer.render(captionScene, camera);
      renderer.autoClear = true;
    }
  });

  return {
    fallback: false, scene, camera, controls, renderer,

    /** meta: {tag, name, camera:{pos,target}, type} */
    addEquipment(group, meta) {
      // Fuse the static parts first: a plant built honestly out of primitives
      // arrives here as several hundred small meshes, and on an integrated GPU
      // the draw-call count is what decides whether the view holds 60 fps.
      compact(group);
      group.userData.tag = meta.tag;
      group.traverse(o => { o.userData.tag = meta.tag; });
      scene.add(group); equipment.set(meta.tag, { group, meta });
      // Every tagged item gets a floating caption, so a plant reads as named
      // sections rather than as an unlabelled mass of geometry. Built here
      // rather than per simulator, so no plant module can forget one.
      const box = new THREE.Box3().setFromObject(group);
      const label = makeLabel(meta.tag, meta.name || '', hue);
      label.position.set(
        (box.min.x + box.max.x) / 2,
        Number.isFinite(box.max.y) ? box.max.y + 1.7 : 4,
        (box.min.z + box.max.z) / 2
      );
      label.userData.tag = meta.tag;
      labels.add(label);
      equipment.get(meta.tag).label = label;
      updateLabel(label, captions, null);
      refreshShadows();
      return group;
    },

    /**
     * Which captions the plant shows. Captions help when reading a plant and
     * get in the way when looking at it, so this belongs to whoever is looking.
     */
    setCaptions(next) {
      captions = { ...captions, ...next };
      for (const [tag, e] of equipment) if (e.label) updateLabel(e.label, captions, equipmentState[tag]);
      return { ...captions };
    },
    get captions() { return { ...captions }; },

    /** Feed the captions the engine's equipment state, straight through. */
    setEquipmentValues(state) {
      equipmentState = state || {};
      for (const [tag, e] of equipment) if (e.label) updateLabel(e.label, captions, equipmentState[tag]);
      refreshShadows();
    },

    add(obj) { if (obj?.isGroup) compact(obj); scene.add(obj); return obj; },
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
        marker.position.set((box.min.x + box.max.x) / 2, 0.04, (box.min.z + box.max.z) / 2);
        marker.scale.setScalar(Number.isFinite(span) ? span * 0.62 + 1.2 : 3);
        marker.visible = true;
        if (e.label) e.label.userData.selected = true;
      } else {
        marker.visible = false;
      }
      syncOutline();
      refreshShadows();
    },

    focus(tagOrPreset) {
      const e = equipment.get(tagOrPreset);
      const cam = e?.meta.camera;
      if (cam) this.flyTo(cam.pos, cam.target);
    },

    /**
     * Eased camera move. Distance sets the duration, so a nudge across the
     * plot is quick and a jump from one end to the other is not a snap.
     */
    flyTo(pos, target = [0, 4, 0], ms = null) {
      const p0 = camera.position.clone(), t0 = controls.target.clone();
      const p1 = new THREE.Vector3(...pos), t1 = new THREE.Vector3(...target);
      const dist = p0.distanceTo(p1) + t0.distanceTo(t1);
      const dur = ms ?? Math.min(1500, Math.max(520, dist * 22));
      const start = performance.now();
      flying = true; idle = 0;
      const off = onFrame(() => {
        const k = Math.min((performance.now() - start) / dur, 1);
        const e = smoothstep(k);
        camera.position.lerpVectors(p0, p1, e);
        controls.target.lerpVectors(t0, t1, e);
        if (k >= 1) { off(); flying = false; }
      });
    },

    onTick(fn) { tickers.add(fn); return () => tickers.delete(fn); },
    refreshShadows,
    get fps() { return gov.fps; },
    get workMs() { return gov.workMs; },
    get quality() { return gov.quality; },
    get tier() { return gov.tier; },

    dispose() {
      stopLoop(); offTier(); offTheme(); gov.dispose();
      removeEventListener('pointerup', onPointerUp);
      ro.disconnect(); controls.dispose();
      env.dispose();
      composer.renderTarget1.dispose(); composer.renderTarget2.dispose();
      bloomPass.dispose?.(); outlinePass.dispose?.();
      labels.traverse(o => { o.material?.map?.dispose(); o.material?.dispose?.(); });
      motes.geometry.dispose(); motes.material.dispose();
      renderer.dispose();
      container.innerHTML = '';
    }
  };
}

/**
 * Slow-drifting motes in the air over the plot. Points, one draw call, no
 * per-frame work beyond a rotation on the parent.
 */
function buildMotes(hue) {
  const n = 420;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = 12 + Math.random() * 52, a = Math.random() * Math.PI * 2;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = 1 + Math.random() * 26;
    pos[i * 3 + 2] = Math.sin(a) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: hue.clone().lerp(new THREE.Color(0xffffff), 0.55),
    size: 0.11, transparent: true, opacity: getTheme() === 'dark' ? 0.32 : 0.24,
    depthWrite: false, sizeAttenuation: true, fog: true
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}
