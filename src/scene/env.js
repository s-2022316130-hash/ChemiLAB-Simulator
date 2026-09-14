import * as THREE from 'three';
import { token, tokenNumber, getTheme } from '../shared/theme.js';

/**
 * Scene environment: sky, ground, the lighting rig and the image-based lighting
 * that gives metal something to reflect.
 *
 * All of it is driven by the design tokens in theme.css, so switching the
 * interface between light and dark moves the plant with it — the sky, the
 * ground, the intensity of the sun and the strength of the reflections are one
 * decision made in one place rather than two palettes that drift apart.
 *
 * The two environments are genuinely different rigs rather than one rig turned
 * up and down:
 *
 *   DARK is a plot at night. A deep sky with a horizon band, a low warm key
 *   raking across the equipment so everything has a lit edge and a shadow side,
 *   a cool fill that keeps the shadow side readable rather than black, and a
 *   rim in the simulator's own colour so vessels separate from the sky. Bloom
 *   matters here: a lamp should read as a light source.
 *
 *   LIGHT is overcast daylight. A high broad key, a bright sky bounce, almost
 *   no bloom — bloom on a white page is haze — and a ground that reads as
 *   concrete rather than as a shadow.
 *
 * Nothing here reads or computes a process value. This module is lighting.
 */

const rgb = (name, fallback) => new THREE.Color(token(name, fallback));

/**
 * Vertical sky gradient with a horizon band and a soft sun placed where the key
 * light is. Drawn as an equirectangular texture: it is the scene background and
 * it is also what the reflection probe sees, so the sky a surface reflects is
 * the sky that is actually behind it.
 *
 * Resolution is 1024×512 rather than 512×256. It costs a quarter of a megabyte
 * and it is the difference between a horizon and a visible stair-step across
 * the top of every polished vessel.
 */
function skyTexture(hue, dark) {
  const W = 1024, H = 512;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');

  const top = rgb('--scene-sky-top', '#050810');
  const mid = rgb('--scene-sky-mid', '#0c1524');
  const low = rgb('--scene-sky-low', '#1b2739');
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, `#${top.getHexString()}`);
  g.addColorStop(0.42, `#${top.clone().lerp(mid, 0.75).getHexString()}`);
  g.addColorStop(0.56, `#${mid.getHexString()}`);
  g.addColorStop(0.70, `#${low.clone().lerp(hue, dark ? 0.10 : 0.04).getHexString()}`);
  g.addColorStop(0.76, `#${low.getHexString()}`);
  g.addColorStop(1, `#${low.clone().lerp(new THREE.Color(0x000000), dark ? 0.55 : 0.14).getHexString()}`);
  c.fillStyle = g; c.fillRect(0, 0, W, H);

  // The key light's own source, up and to the +X/+Z quadrant. Small and bright
  // rather than broad and dim: that is what puts a hard specular highlight on a
  // vessel and makes it read as polished steel.
  const sx = W * 0.17, sy = H * (dark ? 0.30 : 0.26);
  const warm = rgb('--scene-key', '#fff0d6');
  const rgbaWarm = a => `rgba(${(warm.r * 255) | 0},${(warm.g * 255) | 0},${(warm.b * 255) | 0},${a})`;
  const sun = c.createRadialGradient(sx, sy, 0, sx, sy, H * (dark ? 0.42 : 0.55));
  sun.addColorStop(0, rgbaWarm(dark ? 0.95 : 0.88));
  sun.addColorStop(0.12, rgbaWarm(dark ? 0.45 : 0.34));
  sun.addColorStop(0.4, rgbaWarm(dark ? 0.10 : 0.16));
  sun.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = sun; c.fillRect(0, 0, W, H);

  // A band of the simulator's own colour along the horizon, so the five units
  // do not all stand under the same sky. Wider and fainter in daylight.
  const hx = c.createRadialGradient(W * 0.72, H * 0.68, 0, W * 0.72, H * 0.68, H * 0.85);
  const rgbaHue = a => `rgba(${(hue.r * 255) | 0},${(hue.g * 255) | 0},${(hue.b * 255) | 0},${a})`;
  hx.addColorStop(0, rgbaHue(dark ? 0.20 : 0.11));
  hx.addColorStop(0.5, rgbaHue(dark ? 0.06 : 0.04));
  hx.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = hx; c.fillRect(0, 0, W, H);

  const tex = new THREE.CanvasTexture(cv);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Concrete hardstanding: slab joints on a 6 m grid, tonal variation and a
 * little aggregate speckle. A plant standing on a plain plane always reads as a
 * model; a plant standing on a surface reads as a plant.
 *
 * A matching roughness map goes with it, so the joints are wet-looking lines
 * rather than drawn ones and the slabs do not all shine identically. That one
 * extra channel is most of the difference between "a grey plane" and "concrete".
 */
function groundTextures(dark) {
  const S = 512;
  const albedo = document.createElement('canvas');
  albedo.width = albedo.height = S;
  const c = albedo.getContext('2d');
  const base = rgb('--scene-ground', '#1b212c');
  c.fillStyle = `#${base.getHexString()}`;
  c.fillRect(0, 0, S, S);

  // Tonal blotches: concrete laid at different times is never one colour.
  for (let i = 0; i < 220; i++) {
    const r = 10 + Math.random() * 52;
    const shade = base.clone().lerp(
      new THREE.Color(Math.random() > 0.5 ? 0xffffff : 0x000000),
      0.02 + Math.random() * (dark ? 0.05 : 0.055));
    c.fillStyle = `#${shade.getHexString()}`;
    c.globalAlpha = 0.45;
    c.beginPath(); c.arc(Math.random() * S, Math.random() * S, r, 0, Math.PI * 2); c.fill();
  }
  // Aggregate. Invisible at distance, and the reason the surface does not
  // shimmer into a flat colour when the camera comes down to it.
  c.globalAlpha = dark ? 0.10 : 0.14;
  for (let i = 0; i < 2600; i++) {
    c.fillStyle = Math.random() > 0.5 ? '#ffffff' : '#000000';
    c.fillRect(Math.random() * S, Math.random() * S, 1, 1);
  }
  c.globalAlpha = 1;

  const joint = base.clone().lerp(new THREE.Color(0x000000), dark ? 0.34 : 0.22);
  c.strokeStyle = `#${joint.getHexString()}`;
  c.lineWidth = 3;
  c.strokeRect(1.5, 1.5, S - 3, S - 3);
  c.lineWidth = 2; c.globalAlpha = 0.55;
  c.beginPath(); c.moveTo(S / 2, 0); c.lineTo(S / 2, S); c.moveTo(0, S / 2); c.lineTo(S, S / 2); c.stroke();
  c.globalAlpha = 1;

  // Roughness: the joints hold water and read smoother, the slabs vary.
  const rough = document.createElement('canvas');
  rough.width = rough.height = S;
  const r2 = rough.getContext('2d');
  r2.fillStyle = '#e6e6e6';                       // rough by default
  r2.fillRect(0, 0, S, S);
  r2.globalAlpha = 0.35;
  for (let i = 0; i < 90; i++) {
    const rr = 14 + Math.random() * 60;
    r2.fillStyle = Math.random() > 0.5 ? '#ffffff' : '#b4b4b4';
    r2.beginPath(); r2.arc(Math.random() * S, Math.random() * S, rr, 0, Math.PI * 2); r2.fill();
  }
  r2.globalAlpha = 1;
  r2.strokeStyle = '#8a8a8a';
  r2.lineWidth = 3; r2.strokeRect(1.5, 1.5, S - 3, S - 3);
  r2.lineWidth = 2;
  r2.beginPath(); r2.moveTo(S / 2, 0); r2.lineTo(S / 2, S); r2.moveTo(0, S / 2); r2.lineTo(S, S / 2); r2.stroke();

  const mk = (canvas, srgb) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (srgb && 'colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: mk(albedo, true), roughnessMap: mk(rough, false) };
}

/**
 * A miniature studio, rendered once into a reflection probe. Emissive panels
 * stand in for the sun and for sky fill, which is what puts a moving highlight
 * on a vessel as the camera swings around it. Without this, metal is a flat
 * grey and nothing in the scene looks made of anything.
 *
 * The dark rig keeps a bright, small key panel and darkens everything else: a
 * night plot is mostly reflections of one hard source and a lot of nothing, and
 * an evenly lit probe is exactly what makes a dark scene look washed out.
 */
function probeScene(hue, dark) {
  const s = new THREE.Scene();
  const sky = rgb('--scene-amb-sky', '#7ea4d4');
  const grd = rgb('--scene-amb-ground', '#221d2b');

  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(60, 32, 20),
    new THREE.MeshBasicMaterial({ side: THREE.BackSide })
  );
  const pos = shell.geometry.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const k = Math.min(Math.max(pos.getY(i) / 60 * 0.5 + 0.5, 0), 1);
    tmp.copy(grd).lerp(sky, k ** (dark ? 1.4 : 0.6))
      .lerp(hue, 0.06 * (1 - Math.abs(k - 0.5) * 2));
    if (dark) tmp.multiplyScalar(0.55);
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  shell.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  shell.material.vertexColors = true;
  s.add(shell);

  const panel = (w, h, colour, intensity, pos3) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(colour).multiplyScalar(intensity), side: THREE.DoubleSide
      })
    );
    m.position.set(...pos3); m.lookAt(0, 0, 0);
    s.add(m);
  };
  // Key: small and hot in the dark, broad and soft in daylight.
  panel(dark ? 18 : 32, dark ? 18 : 32, rgb('--scene-key', '#fff2dc'), dark ? 17 : 7, [26, 40, 20]);
  panel(46, 22, rgb('--scene-fill', '#8fb6e4'), dark ? 0.9 : 1.6, [-34, 20, -26]);
  // Enough hue to tint a polished vessel, not enough to paint the concrete.
  panel(30, 30, hue, dark ? 1.0 : 1.1, [-16, 12, 34]);
  // A dim ground bounce card, so the undersides of vessels are not solid black.
  panel(70, 70, grd, dark ? 0.5 : 1.1, [0, -22, 0]);
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
  const maxAniso = renderer.capabilities?.getMaxAnisotropy?.() ?? 4;

  // --- ground --------------------------------------------------------------
  const groundMat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0.04 });
  const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), groundMat);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  groundMesh.position.y = -0.002;
  scene.add(groundMesh);

  // A soft dark pool under the works. Real ambient occlusion costs a depth pass
  // every frame; this costs one transparent quad and does most of the job of
  // settling the plant onto the ground rather than leaving it hovering.
  const aoCv = document.createElement('canvas');
  aoCv.width = aoCv.height = 256;
  {
    const c = aoCv.getContext('2d');
    const g = c.createRadialGradient(128, 128, 10, 128, 128, 128);
    g.addColorStop(0, 'rgba(0,0,0,0.42)');
    g.addColorStop(0.45, 'rgba(0,0,0,0.20)');
    g.addColorStop(0.78, 'rgba(0,0,0,0.05)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, 256, 256);
  }
  const aoTex = new THREE.CanvasTexture(aoCv);
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(size * 0.66, size * 0.66),
    new THREE.MeshBasicMaterial({ map: aoTex, transparent: true, depthWrite: false, opacity: 0.9 })
  );
  pool.rotation.x = -Math.PI / 2; pool.position.y = 0.008; pool.renderOrder = -2;
  scene.add(pool);

  // A wash of the simulator's own colour on the hardstanding. Very restrained:
  // enough that each unit has an identity from the first glance, not enough
  // that the concrete stops being concrete.
  const tint = new THREE.Mesh(
    new THREE.CircleGeometry(size * 0.36, 64),
    new THREE.MeshBasicMaterial({ color: hue, transparent: true, opacity: 0.03, depthWrite: false })
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
  key.shadow.normalBias = 0.028;
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(0xffffff, 0.6);
  fill.position.set(-34, 22, -26);
  scene.add(fill);

  // The rim sits behind and to one side, in the unit's own colour. It is what
  // separates a dark vessel from a dark sky, and it is the single most useful
  // light in the whole rig once the background goes dark.
  const rim = new THREE.DirectionalLight(hue.clone(), 0.7);
  rim.position.set(-22, 16, 38);
  scene.add(rim);

  let sky = null, envMap = null, groundTex = null, roughTex = null;

  function apply() {
    const dark = getTheme() === 'dark';

    sky?.dispose();
    sky = skyTexture(hue, dark);
    scene.background = sky;

    envMap?.dispose();
    const ps = probeScene(hue, dark);
    envMap = pmrem.fromScene(ps, 0.035).texture;
    ps.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
    scene.environment = envMap;
    if ('environmentIntensity' in scene) scene.environmentIntensity = tokenNumber('--scene-env-int', 1);

    groundTex?.dispose(); roughTex?.dispose();
    const g = groundTextures(dark);
    groundTex = g.map; roughTex = g.roughnessMap;
    for (const t of [groundTex, roughTex]) {
      t.repeat.set(size / 6, size / 6);
      t.anisotropy = Math.min(maxAniso, 16);
    }
    groundMat.map = groundTex;
    groundMat.roughnessMap = roughTex;
    // Concrete is a dielectric. Any metalness at all makes it take the colour
    // of whatever is lighting it, which is how a hardstanding ends up looking
    // painted in the simulator's own hue instead of looking like concrete.
    groundMat.roughness = dark ? 0.88 : 0.94;
    groundMat.metalness = 0;
    groundMat.color.set(0xffffff);
    groundMat.needsUpdate = true;

    grid.material.color.copy(rgb('--scene-grid', '#3c4e6b'));
    // The concrete already carries its slab joints, so this is a whisper on top
    // of them rather than a second grid competing with the first.
    grid.material.opacity = dark ? 0.10 : 0.16;

    // Atmosphere. The fog colour is the horizon colour, so distance reads as
    // depth rather than as a grey curtain drawn across the plot. It starts far
    // enough back that the plant itself is never in it — fog over the subject
    // is exactly what "faded" looks like.
    const fogColour = rgb('--scene-fog', '#0b1220');
    scene.fog = new THREE.Fog(fogColour, dark ? 130 : 110, dark ? 320 : 285);

    hemi.color.copy(rgb('--scene-amb-sky', '#7ea4d4'));
    hemi.groundColor.copy(rgb('--scene-amb-ground', '#221d2b'));
    hemi.intensity = tokenNumber('--scene-amb-int', 0.42);
    key.color.copy(rgb('--scene-key', '#fff0d6'));
    key.intensity = tokenNumber('--scene-key-int', 3.25);
    fill.color.copy(rgb('--scene-fill', '#8fb6e4'));
    fill.intensity = tokenNumber('--scene-fill-int', 0.55);
    rim.color.copy(hue).lerp(new THREE.Color(0xffffff), dark ? 0.18 : 0.45);
    // The rim is for separating equipment from the sky, not for colouring the
    // plot. Strong enough to draw an edge, weak enough that the ground under it
    // is still grey.
    rim.intensity = dark ? 0.85 : 0.45;

    tint.material.opacity = dark ? 0.028 : 0.022;
    pool.material.opacity = tokenNumber('--scene-contact', dark ? 0.46 : 0.30) * 2;
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
      sky?.dispose(); envMap?.dispose(); groundTex?.dispose(); roughTex?.dispose(); aoTex.dispose();
      pmrem.dispose();
      groundMesh.geometry.dispose(); groundMat.dispose();
      pool.geometry.dispose(); pool.material.dispose();
      tint.geometry.dispose(); tint.material.dispose();
      grid.geometry.dispose(); grid.material.dispose();
    }
  };
}
