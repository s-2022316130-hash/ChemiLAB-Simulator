import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { createEnvironment } from './env.js';
import { REFERENCE_ASPECT, BASE_FOV } from './cameras.js';
import { compact } from './geometry.js';
import { makeLabel, updateLabel, selectionRing, CAPTION_DEFAULT } from './labels.js';
import { highlight, setSceneTheme, tint } from './materials.js';
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
/** A phone is not a small laptop: it has a coarse pointer and a slow GPU behind
 *  a very high pixel ratio, and both change what the renderer should do. */
const coarsePointer = () => { try { return matchMedia('(pointer:coarse)').matches; } catch { return false; } };
const smallScreen = () => Math.min(innerWidth, innerHeight) < 820;

export function createPlantView(container, { onSelect, onHover } = {}) {
  if (!webglAvailable()) return { fallback: true, dispose() {} };
  const touch = coarsePointer();
  const handheld = touch && smallScreen();

  const hue = new THREE.Color(token('--hue', '#0e7490'));
  setSceneTheme(getTheme());

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 600);
  camera.position.set(30, 20, 30);

  const renderer = new THREE.WebGLRenderer({
    antialias: true, powerPreference: 'high-performance', stencil: false,
    // The scene is composited through an HDR target, so the drawing buffer only
    // ever holds the final tone-mapped image. Leaving it non-preserved lets the
    // driver discard it rather than copy it every frame.
    preserveDrawingBuffer: false
  });
  // A phone reports a pixel ratio of 3 and has a fraction of the fill rate to
  // pay for it. Rendering every one of those pixels buys nothing at arm's
  // length and costs the frame rate that does matter.
  const maxDpr = handheld ? 1.5 : 2;
  renderer.setPixelRatio(Math.min(devicePixelRatio, maxDpr));
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
  // One finger orbits, two pan and pinch to zoom — the gestures a map uses.
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  if (touch) { controls.rotateSpeed = 0.55; controls.zoomSpeed = 1.1; }
  controls.minDistance = 6;
  // Far enough back to frame a long plant from a phone held upright, which is
  // where fitFactor() can ask the camera to stand.
  controls.maxDistance = 330;
  controls.target.set(0, 4, 0);

  const env = createEnvironment(scene, renderer, hue);

  /**
   * Framing a wide plant in a tall viewport.
   *
   * A perspective camera's field of view is vertical, so a phone held upright
   * sees far less *across* than the landscape panel every camera preset was
   * framed for — on a 375-wide screen that is a factor of five, and without a
   * correction every preset opens inside the plant.
   *
   * The correction is made in two places because neither alone is enough.
   * Widening the field of view is free and distortion-free up to a point; past
   * about sixty-five degrees it starts to bow the verticals of a column, which
   * on a process plant is the one thing that must stay straight. So the field
   * of view opens as far as that limit and standing further back covers the
   * rest, up to a cap — a little cropping at the ends of a long plant is a
   * better trade than a plant too small to read, and the view pans.
   */
  const MAX_FOV = 64;
  const tanHalf = deg => Math.tan(deg * Math.PI / 360);
  // The horizontal field of view the presets were composed for.
  const H_REF = 2 * Math.atan(tanHalf(BASE_FOV) * REFERENCE_ASPECT);

  /** The vertical field of view that would hold the reference width at this aspect. */
  const neededFov = aspect =>
    2 * Math.atan(Math.tan(H_REF / 2) / Math.max(aspect, 0.2)) * 180 / Math.PI;

  function applyFov() {
    const want = neededFov(camera.aspect || REFERENCE_ASPECT);
    camera.fov = Math.min(Math.max(want, BASE_FOV), MAX_FOV);
    camera.updateProjectionMatrix();
  }

  /**
   * How much of the shortfall to cover by standing further back.
   *
   * Not all of it. Covering it completely keeps every metre of a hundred-metre
   * plot on a phone screen, and the plant arrives as a small object in the
   * middle of a large sky with nothing in the top and bottom thirds of the
   * frame — technically the whole plant, practically unreadable. Covering most
   * of it crops a little off each end at a size worth looking at, and the view
   * pans and pinches.
   */
  const FIT_SHARE = 0.35;

  const fitFactor = () => {
    const a = camera.aspect || REFERENCE_ASPECT;
    if (a >= REFERENCE_ASPECT) return 1;
    const want = neededFov(a);
    const used = Math.min(Math.max(want, BASE_FOV), MAX_FOV);
    const full = tanHalf(want) / tanHalf(used);
    return Math.min(2.6, 1 + (full - 1) * FIT_SHARE);
  };
  /** A preset position pulled back to frame the same thing in this panel. */
  function framed(pos, target) {
    const k = fitFactor();
    if (k === 1) return new THREE.Vector3(...pos);
    const t = new THREE.Vector3(...target);
    return t.clone().add(new THREE.Vector3(...pos).sub(t).multiplyScalar(k));
  }

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
  let captions = handheld ? { tags: true, names: false, values: false } : { ...CAPTION_DEFAULT };
  let equipmentState = {};
  // The colour mode currently on the plant, kept so a theme change can be
  // re-applied to it: the tint is mixed from the palette, and the palette is
  // what a theme change rewrites.
  let tintMap = {};

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
  // Threshold rather than strength decides whether bloom reads as light or as
  // haze. At 1.0 only genuinely emissive things bloom — lamps, flame, stream
  // tracers — which is what is wanted in daylight. At night it comes down so a
  // hot specular on a vessel catches as well, and the radius stays tight: a
  // wide radius is fog, not glow.
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(512, 512),
    tokenNumber('--scene-bloom', 0.6), 0.34, tokenNumber('--scene-bloom-threshold', 0.85));
  const outlinePass = new OutlinePass(new THREE.Vector2(512, 512), scene, camera);
  outlinePass.edgeStrength = 4.2;
  outlinePass.edgeGlow = 0.22;
  outlinePass.edgeThickness = 1.1;
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
    // Half rather than a third: the bloom buffer decides how clean the glow is,
    // and at a third the highlight on a lamp becomes a soft blob.
    bloomPass.setSize(Math.max(Math.round(w / 2), 128), Math.max(Math.round(h / 2), 128));
    camera.aspect = w / h;
    applyFov();
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
  // A finger never lands as still as a mouse, so the threshold follows the device.
  const tapSlop = touch ? 12 : 4;
  el.addEventListener('click', ev => { if (moved <= tapSlop) onSelect?.(pick(ev)); });

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
  // Handhelds start one tier down rather than spending their first seconds
  // discovering that they cannot afford the top one.
  const gov = createQualityGovernor(handheld ? { startTier: 'medium', budgetMs: 12, headroomMs: 8 } : {});
  const offTier = gov.onTier(applyTier);
  if (handheld) applyTier(gov.tier);
  /**
   * What each tier buys and what it costs. Multisampling on a half-float
   * target is the expensive part on an integrated GPU — it is bandwidth, four
   * times over — so it is the first thing to come down, then the resolution
   * the scene is rendered at, and only last the bloom itself.
   */
  function applyTier(tier) {
    const dpr = Math.min(devicePixelRatio || 1, maxDpr);
    const samples = tier === 'high' ? 4 : tier === 'medium' ? 2 : 0;
    if (tier === 'high') {
      usePost = true;
      renderer.setPixelRatio(dpr);
      bloomPass.enabled = true;
      env.setShadowQuality(true, handheld ? 1024 : 3072);
    } else if (tier === 'medium') {
      usePost = true;
      renderer.setPixelRatio(Math.min(dpr, 1.25));
      bloomPass.enabled = true;
      env.setShadowQuality(true, 1024);
    } else {
      // Straight to the screen, where the hardware antialiasing the context was
      // created with does the job the multisampled target was doing.
      usePost = false;
      renderer.setPixelRatio(Math.min(dpr, 1));
      bloomPass.enabled = false;
      env.setShadowQuality(true, handheld ? 512 : 1024);
    }
    if (composer.renderTarget1.samples !== samples) {
      for (const target of [composer.renderTarget1, composer.renderTarget2]) {
        target.dispose();
        target.samples = samples;
      }
    }
    motes.visible = tier !== 'low' && !handheld;
    composer.setPixelRatio(renderer.getPixelRatio());
    syncOutline();
    resize();
  }

  // --- theme ---------------------------------------------------------------
  const offTheme = onThemeChange(theme => {
    setSceneTheme(theme);
    // The palette the tint is mixed from has just been rewritten, so the mix
    // has to be taken again. The ramp colours change with the theme too, and
    // whoever owns the colour mode recomputes those and calls back through;
    // this keeps the plant from flashing its untinted colours in between.
    for (const [tag, e] of equipment) tint(e.group, tintMap[tag] ?? null);
    hue.set(token('--hue', '#0e7490'));
    env.apply();
    renderer.toneMappingExposure = tokenNumber('--scene-exposure', 1);
    bloomPass.strength = tokenNumber('--scene-bloom', 0.6);
    bloomPass.threshold = tokenNumber('--scene-bloom-threshold', 0.85);
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
    // A tab layout hides the 3D panel rather than unmounting it. Rendering a
    // view with no width costs a frame and shows nobody anything.
    if (container.clientWidth < 2 || container.clientHeight < 2) return;
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
    // Two and a half refreshes a second. Fast enough that a turning agitator or
    // a moving conveyor casts something honest, slow enough that most frames
    // never pay for a shadow pass at all. Measured at 0.25 s and 0.4 s on the
    // reference machine the difference was inside the noise, so the cheaper of
    // the two is kept — there is no reason to do the same work more often for a
    // picture nobody can tell apart.
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

    /**
     * Shade the plant by a colour mode: `{tag: '#rrggbb' | null}`.
     *
     * A tag the map does not mention, or maps to null, is cleared rather than
     * left as it was — a stale tint is worse than none, because it is a reading
     * from a run that is no longer on screen. Nothing else about the scene
     * changes: the geometry, the camera and the captions are untouched, and the
     * selection outline goes on doing its own job over the top.
     */
    setEquipmentTint(map) {
      const m = map || {};
      tintMap = m;
      for (const [tag, e] of equipment) tint(e.group, m[tag] ?? null);
      refreshShadows();
    },

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
      const p1 = framed(pos, target), t1 = new THREE.Vector3(...target);
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

    /**
     * A still of the plant at an arbitrary size, for the asset pipeline.
     *
     * The gallery backdrops are photographs of these same plants rather than
     * stock industrial photography. That was a licensing decision before it was
     * an aesthetic one — but it turns out to be the better picture as well: the
     * subject is exactly the process the tile is about, down to the vessel, and
     * a plant that gets rebuilt can simply be re-photographed.
     *
     * What comes out is the plant and nothing that belongs to *operating* it.
     * Captions live in a separate scene that the composer never renders, so
     * they are absent already; the selection ring and the hover outline are
     * switched off here. Bloom is forced on regardless of what the quality
     * governor has decided about this machine, because an offline render has no
     * frame budget to hold.
     *
     * The read-back is synchronous and immediately after the render. The
     * context is created without a preserved drawing buffer, so those pixels
     * exist only until the browser next composites — a capture one task later
     * comes back blank.
     *
     * Nothing in the running application calls this; tools/backdrops.js does.
     */
    capture({ width = 1600, height = 700, type = 'image/webp', quality = 0.82 } = {}) {
      const hadMarker = marker.visible;
      const hadOutline = outlinePass.enabled;
      const hadBloom = bloomPass.enabled;
      const hadDpr = renderer.getPixelRatio();

      marker.visible = false;
      outlinePass.enabled = false;
      bloomPass.enabled = true;

      renderer.setPixelRatio(1);
      composer.setPixelRatio(1);
      renderer.setSize(width, height, false);
      composer.setSize(width, height);
      bloomPass.setSize(Math.max(Math.round(width / 2), 128), Math.max(Math.round(height / 2), 128));
      camera.aspect = width / height;
      applyFov();
      renderer.shadowMap.needsUpdate = true;
      composer.render(0);
      const url = renderer.domElement.toDataURL(type, quality);

      marker.visible = hadMarker;
      outlinePass.enabled = hadOutline;
      bloomPass.enabled = hadBloom;
      renderer.setPixelRatio(hadDpr);
      composer.setPixelRatio(hadDpr);
      resize();
      return url;
    },

    /** Place the camera at a preset immediately, framed for this panel. */
    jumpTo(pos, target = [0, 4, 0]) {
      camera.position.copy(framed(pos, target));
      controls.target.set(...target);
      controls.update();
      refreshShadows();
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
