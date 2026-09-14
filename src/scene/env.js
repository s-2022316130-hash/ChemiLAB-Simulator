import * as THREE from 'three';
import { token, tokenNumber } from '../shared/theme.js';

/**
 * Scene environment: sky, ground, lighting rig and the image-based lighting
 * that gives metal something to reflect.
 *
 * All of it is driven by the design tokens in theme.css, so switching the
 * interface between light and dark moves the plant with it — the sky, the
 * ground, the intensity of the sun and the strength of the reflections are one
 * decision made in one place rather than two palettes that drift apart.
 *
 * Nothing here reads or computes a process value. This module is lighting.
 */

const rgb = (name, fallback) => new THREE.Color(token(name, fallback));

/**
 * Vertical sky gradient with a soft sun bloom placed where the key light is.
 * Drawn as an equirectangular texture: it is the scene background and it is
 * also what the reflection probe sees, so the sky a surface reflects is the
 * sky actually behind it.
 */
function skyTexture(hue) {
  const W = 512, H = 256;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');

  const top = rgb('--scene-sky-top', '#cddcf0');
  const mid = rgb('--scene-sky-mid', '#e6eef8');
  const low = rgb('--scene-sky-low', '#f4f0e8');
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, `#${top.getHexString()}`);
  g.addColorStop(0.52, `#${mid.getHexString()}`);
  g.addColorStop(0.72, `#${low.clone().lerp(hue, 0.05).getHexString()}`);
  g.addColorStop(1, `#${low.clone().lerp(new THREE.Color(0x000000), 0.12).getHexString()}`);
  c.fillStyle = g; c.fillRect(0, 0, W, H);

  // Sun bloom, up and to the +X/+Z quadrant where the key light sits.
  const sx = W * 0.17, sy = H * 0.26;
  const sun = c.createRadialGradient(sx, sy, 0, sx, sy, H * 0.55);
  const warm = rgb('--scene-key', '#fff6e8');
  sun.addColorStop(0, `rgba(${(warm.r * 255) | 0},${(warm.g * 255) | 0},${(warm.b * 255) | 0},0.85)`);
  sun.addColorStop(0.35, `rgba(${(warm.r * 255) | 0},${(warm.g * 255) | 0},${(warm.b * 255) | 0},0.18)`);
  sun.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = sun; c.fillRect(0, 0, W, H);

  // A wide, very soft wash of the simulator's own colour near the horizon, so
  // the five units do not all stand under the same sky.
  const hx = c.createRadialGradient(W * 0.72, H * 0.62, 0, W * 0.72, H * 0.62, H * 0.7);
  hx.addColorStop(0, `rgba(${(hue.r * 255) | 0},${(hue.g * 255) | 0},${(hue.b * 255) | 0},0.12)`);
  hx.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = hx; c.fillRect(0, 0, W, H);

  const tex = new THREE.CanvasTexture(cv);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Concrete hardstanding: slab joints on a 6 m grid with a little tonal
 * variation, rather than one flat colour. A plant standing on a plain plane
 * always reads as a model; a plant standing on a surface reads as a plant.
 */
function groundTexture() {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const c = cv.getContext('2d');
  const base = rgb('--scene-ground', '#dcdfe6');
  c.fillStyle = `#${base.getHexString()}`;
  c.fillRect(0, 0, S, S);

  // Tonal blotches: laid-at-different-times concrete is never one colour.
  for (let i = 0; i < 130; i++) {
    const r = 6 + Math.random() * 26;
    const shade = base.clone().lerp(new THREE.Color(Math.random() > 0.5 ? 0xffffff : 0x000000), 0.02 + Math.random() * 0.045);
    c.fillStyle = `#${shade.getHexString()}`;
    c.globalAlpha = 0.5;
    c.beginPath(); c.arc(Math.random() * S, Math.random() * S, r, 0, Math.PI * 2); c.fill();
  }
  c.globalAlpha = 1;

  const joint = base.clone().lerp(new THREE.Color(0x000000), 0.22);
  c.strokeStyle = `#${joint.getHexString()}`;
  c.lineWidth = 2;
  c.strokeRect(0.5, 0.5, S - 1, S - 1);
  c.lineWidth = 1; c.globalAlpha = 0.5;
  c.beginPath(); c.moveTo(S / 2, 0); c.lineTo(S / 2, S); c.moveTo(0, S / 2); c.lineTo(S, S / 2); c.stroke();

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * A miniature studio, rendered once into a reflection probe. Emissive panels
 * stand in for the sun and for sky fill, which is what puts a moving highlight
 * on a vessel as the camera swings around it. Without this, metal is just a
 * flat grey and nothing in the scene looks made of anything.
 */
function probeScene(hue) {
  const s = new THREE.Scene();
  const sky = rgb('--scene-amb-sky', '#dceafc');
  const grd = rgb('--scene-amb-ground', '#c8c3b6');

  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(60, 24, 16),
    new THREE.MeshBasicMaterial({ side: THREE.BackSide })
  );
  // Vertex colours give the probe a horizon: sky above, ground below.
  const pos = shell.geometry.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const k = Math.min(Math.max(pos.getY(i) / 60 * 0.5 + 0.5, 0), 1);
    tmp.copy(grd).lerp(sky, k ** 0.6).lerp(hue, 0.05 * (1 - Math.abs(k - 0.5) * 2));
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  shell.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  shell.material.vertexColors = true;
  s.add(shell);

  const panel = (w, h, colour, intensity, pos3, look) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(colour).multiplyScalar(intensity), side: THREE.DoubleSide })
    );
    m.position.set(...pos3); m.lookAt(...(look || [0, 0, 0]));
    s.add(m);
  };
  panel(34, 34, rgb('--scene-key', '#fff6e8'), 5.5, [26, 40, 20]);
  panel(46, 22, rgb('--scene-fill', '#cfe0f5'), 1.6, [-34, 20, -26]);
  panel(26, 26, hue, 1.4, [-16, 12, 34]);
  return s;
}

/**
 * Builds the environment and hands back a handle that can repaint it. The
 * renderer calls `apply()` whenever the theme changes; nothing else needs to
 * know that a theme exists.
 */
export function createEnvironment(scene, renderer, hue, { size = 330 } = {}) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  // --- ground --------------------------------------------------------------
  const groundMat = new THREE.MeshStandardMaterial({ roughness: 0.94, metalness: 0.02 });
  const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), groundMat);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  groundMesh.position.y = -0.002;
  scene.add(groundMesh);

  // A soft dark pool under the works. Real ambient occlusion costs a depth
  // pass every frame; this costs one transparent quad and does most of the
  // job of settling the plant onto the ground.
  const aoCv = document.createElement('canvas');
  aoCv.width = aoCv.height = 128;
  {
    const c = aoCv.getContext('2d');
    const g = c.createRadialGradient(64, 64, 6, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,0.30)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.13)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  }
  const aoTex = new THREE.CanvasTexture(aoCv);
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(size * 0.62, size * 0.62),
    new THREE.MeshBasicMaterial({ map: aoTex, transparent: true, depthWrite: false, opacity: 0.9 })
  );
  pool.rotation.x = -Math.PI / 2; pool.position.y = 0.008; pool.renderOrder = -2;
  scene.add(pool);

  // A wash of the simulator's own colour on the hardstanding, so each unit
  // has an identity from the first glance rather than from reading the title.
  const tint = new THREE.Mesh(
    new THREE.CircleGeometry(size * 0.34, 64),
    new THREE.MeshBasicMaterial({ color: hue, transparent: true, opacity: 0.05, depthWrite: false })
  );
  tint.rotation.x = -Math.PI / 2; tint.position.y = 0.012; tint.renderOrder = -1;
  scene.add(tint);

  const grid = new THREE.GridHelper(size * 0.6, Math.round(size * 0.3));
  grid.material.transparent = true;
  grid.position.y = 0.02;
  scene.add(grid);

  // --- lighting rig --------------------------------------------------------
  // Four sources: a key that casts the shadows and gives every object its form,
  // a cool fill so the shadow side stays readable, a rim in the simulator's own
  // hue to lift equipment off the sky, and a hemisphere for bounce.
  const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffffff, 2);
  key.position.set(38, 52, 26);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = key.shadow.camera.bottom = -52;
  key.shadow.camera.right = key.shadow.camera.top = 52;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 170;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.03;
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(0xffffff, 0.6);
  fill.position.set(-34, 22, -26);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(hue.clone().lerp(new THREE.Color(0xffffff), 0.4), 0.7);
  rim.position.set(-18, 14, 34);
  scene.add(rim);

  let sky = null, envMap = null, groundTex = null;

  function apply() {
    // Sky and reflection probe.
    sky?.dispose();
    sky = skyTexture(hue);
    scene.background = sky;

    envMap?.dispose();
    const ps = probeScene(hue);
    envMap = pmrem.fromScene(ps, 0.035).texture;
    ps.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
    scene.environment = envMap;
    if ('environmentIntensity' in scene) scene.environmentIntensity = tokenNumber('--scene-env-int', 1);

    // Ground.
    groundTex?.dispose();
    groundTex = groundTexture();
    groundTex.repeat.set(size / 6, size / 6);
    groundMat.map = groundTex;
    groundMat.color.set(0xffffff);
    groundMat.needsUpdate = true;

    grid.material.color.copy(rgb('--scene-grid', '#b9c2d0'));
    grid.material.opacity = 0.32;

    // Atmosphere. The fog colour is the horizon colour, so distance reads as
    // depth rather than as a grey curtain drawn across the plot.
    const fogColour = rgb('--scene-fog', '#e3eaf4');
    scene.fog = new THREE.Fog(fogColour, 90, 265);

    // Lights.
    hemi.color.copy(rgb('--scene-amb-sky', '#dceafc'));
    hemi.groundColor.copy(rgb('--scene-amb-ground', '#c8c3b6'));
    hemi.intensity = tokenNumber('--scene-amb-int', 1.15);
    key.color.copy(rgb('--scene-key', '#fff6e8'));
    key.intensity = tokenNumber('--scene-key-int', 2.6);
    fill.color.copy(rgb('--scene-fill', '#cfe0f5'));
    fill.intensity = tokenNumber('--scene-fill-int', 0.75);

    pool.material.opacity = tokenNumber('--scene-env-int', 1) > 0.8 ? 0.9 : 0.55;
  }
  apply();

  return {
    apply,
    key, fill, rim, hemi, ground: groundMesh, grid,
    get envMap() { return envMap; },
    /** Shadow resolution follows the quality tier rather than the hardware. */
    setShadowQuality(on, resolution = 2048) {
      key.castShadow = on;
      if (on && key.shadow.mapSize.width !== resolution) {
        key.shadow.mapSize.set(resolution, resolution);
        key.shadow.map?.dispose();
        key.shadow.map = null;
      }
    },
    dispose() {
      sky?.dispose(); envMap?.dispose(); groundTex?.dispose(); aoTex.dispose();
      pmrem.dispose();
      groundMesh.geometry.dispose(); groundMat.dispose();
      pool.geometry.dispose(); pool.material.dispose();
      tint.geometry.dispose(); tint.material.dispose();
      grid.geometry.dispose(); grid.material.dispose();
    }
  };
}
