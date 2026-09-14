import { svg, clear } from '../shared/dom.js';
import { symbolFor } from './symbols.js';
/**
 * 2D engineering flowsheet. Renders the SAME solved state as the 3D plant.
 * Selection is two-way: it reports clicks upward and accepts selection downward.
 * spec = { width, height, nodes:[{tag,type,label,x,y}], edges:[{id,from,to,points?,phase}] }
 */
export function createFlowsheet(container, spec, { onSelect, onHover } = {}) {
  const root = svg('svg', { class: 'fs-scroll', viewBox: `0 0 ${spec.width} ${spec.height}`, width: '100%', height: '100%', style: 'display:block' });
  // Drafting paper: a faint dot grid behind the diagram and a soft shadow under
  // every symbol. Both are static, so they cost one paint and nothing after it.
  const defs = svg('defs', {}, [
    svg('pattern', { id: 'fs-dots', width: 24, height: 24, patternUnits: 'userSpaceOnUse' }, [
      svg('circle', { cx: 1.2, cy: 1.2, r: 1.2, fill: 'var(--line)', opacity: 0.55 })
    ]),
    svg('filter', { id: 'fs-shadow', x: '-30%', y: '-30%', width: '160%', height: '160%' }, [
      svg('feDropShadow', { dx: 0, dy: 1.5, stdDeviation: 2, 'flood-color': 'var(--ink)', 'flood-opacity': 0.16 })
    ])
  ]);
  root.appendChild(defs);
  root.appendChild(svg('rect', { x: 0, y: 0, width: spec.width, height: spec.height, fill: 'url(#fs-dots)' }));
  const gEdges = svg('g', { 'stroke-linecap': 'round' });
  const gArrows = svg('g');
  const gNodes = svg('g');
  const gTags = svg('g');
  const gNames = svg('g');
  const gLabels = svg('g');
  root.append(gEdges, gArrows, gNodes, gTags, gNames, gLabels);
  container.appendChild(root);

  const nodeEls = new Map(), edgeEls = new Map(), labelEls = new Map();
  // Set by the pan handlers below; read by the node click handlers above them.
  let panDistance = () => 0;
  const pos = Object.fromEntries(spec.nodes.map(n => [n.tag, [n.x, n.y]]));

  for (const e of spec.edges) {
    const pts = e.points || [pos[e.from], pos[e.to]];
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ');
    const path = svg('path', { d, fill: 'none', stroke: 'var(--line-strong)', 'stroke-width': 3, 'stroke-linejoin': 'round' });
    // A wide, low-opacity copy under the line gives a live stream a glow without
    // needing an SVG filter, which is expensive to animate.
    const glow = svg('path', { d, fill: 'none', stroke: 'var(--stream-liq)', 'stroke-width': 11, opacity: 0, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    // Marching dashes along a live line. Same rule as the 3D tracers: this only
    // moves where the engine reported a flow, so a still line means a dead line.
    const flowPath = svg('path', {
      class: 'fs-flow', "data-live": 'false', d, fill: 'none', stroke: 'var(--stream-liq)',
      'stroke-width': 3.4, opacity: 0, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
    });
    gEdges.append(path, glow, flowPath);
    const mid = pts[Math.floor(pts.length / 2)] || pts[0];
    const label = svg('text', { x: mid[0] + 7, y: mid[1] - 7, 'font-size': 13, 'font-family': 'var(--mono)', fill: 'var(--ink-dim)', 'paint-order': 'stroke', stroke: 'var(--bg-0)', 'stroke-width': 4.5, 'stroke-linejoin': 'round', text: '—' });
    gLabels.appendChild(label);
    // A flow arrow at the midpoint of the last leg: a process diagram that does
    // not say which way anything goes is a picture, not a flowsheet.
    const a = pts[pts.length - 2] || pts[0], b2 = pts[pts.length - 1];
    const ang = Math.atan2(b2[1] - a[1], b2[0] - a[0]) * 180 / Math.PI;
    const ax = a[0] + (b2[0] - a[0]) * 0.55, ay = a[1] + (b2[1] - a[1]) * 0.55;
    const arrow = svg('path', {
      d: 'M-7 -5 L7 0 L-7 5 Z', fill: 'var(--line-strong)',
      transform: `translate(${ax},${ay}) rotate(${ang})`
    });
    gArrows.appendChild(arrow);
    edgeEls.set(e.id, { path, glow, flowPath, label, arrow });
  }
  for (const n of spec.nodes) {
    const g = svg('g', { class: 'fs-node', transform: `translate(${n.x},${n.y})`, filter: 'url(#fs-shadow)' });
    g.appendChild(symbolFor(n.type, n.label));
    const tagText = svg('text', {
      y: 46, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': '700',
      'font-family': 'var(--mono)', fill: 'var(--accent)',
      'paint-order': 'stroke', stroke: 'var(--bg-0)', 'stroke-width': 5, 'stroke-linejoin': 'round',
      text: n.tag
    });
    const nameText = svg('text', {
      y: 61, 'text-anchor': 'middle', 'font-size': 11.5, fill: 'var(--ink-faint)',
      'paint-order': 'stroke', stroke: 'var(--bg-0)', 'stroke-width': 4, 'stroke-linejoin': 'round',
      text: n.label || ''
    });
    gTags.appendChild(tagText); gNames.appendChild(nameText);
    // Captions ride with the node, but live in their own layers so each kind
    // can be switched on and off without rebuilding the diagram.
    tagText.setAttribute('transform', `translate(${n.x},${n.y})`);
    nameText.setAttribute('transform', `translate(${n.x},${n.y})`);
    g.appendChild(svg('title', { text: `${n.tag} — ${n.label || ''}` }));
    // A drag that happened to start on a symbol was a pan, not a selection.
    g.addEventListener('click', () => { if (panDistance() <= 5) onSelect?.(n.tag); });
    g.addEventListener('mouseenter', () => onHover?.(n.tag));
    g.addEventListener('mouseleave', () => onHover?.(null));
    gNodes.appendChild(g); nodeEls.set(n.tag, g);
  }
  // --- pan and zoom ---------------------------------------------------------
  // A flowsheet drawn 1260 units wide is unreadable in a 360-pixel column, so
  // the diagram is a surface you move around rather than a fixed picture:
  // drag to pan, wheel or pinch to zoom, and a Fit control to get back.
  const home = { x: 0, y: 0, w: spec.width, h: spec.height };
  const vb = { ...home };
  const MIN_W = spec.width / 10, MAX_W = spec.width * 1.4;
  const applyView = () => root.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);

  /** Pixels per diagram unit, allowing for the letterboxing of xMidYMid meet. */
  function frame() {
    const r = root.getBoundingClientRect();
    const k = Math.min(r.width / vb.w, r.height / vb.h) || 1;
    return { r, k, offX: (r.width - vb.w * k) / 2, offY: (r.height - vb.h * k) / 2 };
  }
  function toUser(clientX, clientY) {
    const { r, k, offX, offY } = frame();
    return { x: vb.x + (clientX - r.left - offX) / k, y: vb.y + (clientY - r.top - offY) / k };
  }
  /** Zoom by `factor` about a point that must stay where it is on screen. */
  function zoomAt(clientX, clientY, factor) {
    const p = toUser(clientX, clientY);
    const w = Math.min(MAX_W, Math.max(MIN_W, vb.w / factor));
    const f = vb.w / w;
    vb.x = p.x - (p.x - vb.x) / f;
    vb.y = p.y - (p.y - vb.y) / f;
    vb.w = w; vb.h = home.h * (w / home.w);
    applyView();
  }
  function fit() { Object.assign(vb, home); applyView(); }

  root.addEventListener('wheel', ev => {
    ev.preventDefault();
    zoomAt(ev.clientX, ev.clientY, Math.exp(-ev.deltaY * 0.0016));
  }, { passive: false });

  // Pointers are tracked by id so one finger pans and two pinch, on the same
  // handlers a mouse uses. Pointer capture is deliberately not taken: it would
  // redirect the click to the <svg> and a symbol could never be selected again.
  // The move and release handlers go on the window instead, so a drag that
  // leaves the panel still works.
  const active = new Map();
  let pinch = 0, dragged = 0;
  const spread = () => {
    const [a, b] = [...active.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const centre = () => {
    const pts = [...active.values()];
    return { x: pts.reduce((t, q) => t + q.x, 0) / pts.length, y: pts.reduce((t, q) => t + q.y, 0) / pts.length };
  };

  root.addEventListener('pointerdown', ev => {
    if (active.size === 0) dragged = 0;
    active.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (active.size === 2) pinch = spread();
  });

  const onMove = ev => {
    const prev = active.get(ev.pointerId);
    if (!prev) return;
    const dx = ev.clientX - prev.x, dy = ev.clientY - prev.y;
    active.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    // Travel accumulates. A slow pan is made of small steps, and measuring only
    // the largest of them would read a long drag as a tap.
    dragged += Math.hypot(dx, dy);
    if (active.size >= 2) {
      const now = spread();
      if (pinch > 0 && now > 0) { const c = centre(); zoomAt(c.x, c.y, now / pinch); }
      pinch = now;
      return;
    }
    const { k } = frame();
    vb.x -= dx / k; vb.y -= dy / k;
    applyView();
  };
  const onRelease = ev => {
    active.delete(ev.pointerId);
    if (active.size < 2) pinch = 0;
  };
  addEventListener('pointermove', onMove);
  addEventListener('pointerup', onRelease);
  addEventListener('pointercancel', onRelease);
  // Double tap or double click to fit, which is what everyone tries first.
  root.addEventListener('dblclick', fit);
  panDistance = () => dragged;
  const stopGestures = () => {
    removeEventListener('pointermove', onMove);
    removeEventListener('pointerup', onRelease);
    removeEventListener('pointercancel', onRelease);
  };

  let captions = { tags: true, names: true, streams: true };
  function applyCaptions() {
    gTags.style.display = captions.tags ? '' : 'none';
    gNames.style.display = captions.names ? '' : 'none';
    gLabels.style.display = captions.streams ? '' : 'none';
  }
  applyCaptions();

  return {
    /** Which captions the diagram shows. Independent of what has been solved. */
    setCaptions(next) { captions = { ...captions, ...next }; applyCaptions(); return { ...captions }; },
    get captions() { return { ...captions }; },
    /** Reset the view to the whole diagram. */
    fit,
    /** Zoom about the middle of the panel, for the on-screen controls. */
    zoom(factor) {
      const r = root.getBoundingClientRect();
      zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor);
    },
    select(tag) { nodeEls.forEach((g, t) => g.classList.toggle('sel', t === tag)); },
    hover(tag) { nodeEls.forEach((g, t) => g.classList.toggle('hov', t === tag)); },
    /** streams: engine.getStreams() result; equipment: engine.getEquipmentState() */
    applyState(streams = [], equipment = {}) {
      for (const s of streams) {
        const e = edgeEls.get(s.id); if (!e) continue;
        const live = Number.isFinite(s.flow) && s.flow > 0;
        const colour = `var(--stream-${s.phase || 'liq'})`;
        e.flowPath.setAttribute('opacity', live ? 0.95 : 0);
        e.flowPath.setAttribute('stroke', colour);
        e.flowPath.setAttribute('data-live', String(live));
        e.glow.setAttribute('opacity', live ? 0.16 : 0);
        e.glow.setAttribute('stroke', colour);
        e.label.textContent = s.label ?? '—';
        e.label.setAttribute('fill', live ? colour : 'var(--ink-faint)');
        e.arrow.setAttribute('fill', live ? colour : 'var(--line)');
        e.arrow.setAttribute('opacity', live ? 1 : 0.45);
      }
      for (const [tag, st] of Object.entries(equipment)) {
        const g = nodeEls.get(tag); if (!g) continue;
        const b = g.querySelector('.fs-body');
        if (!b) continue;
        b.setAttribute('stroke', st.alarm ? 'var(--err)' : st.state === 'running' ? 'var(--ok)' : st.state === 'warning' ? 'var(--warn)' : 'var(--ink-dim)');
        b.setAttribute('stroke-opacity', '1');
        b.setAttribute('stroke-width', st.alarm || st.state === 'warning' ? '2.4' : '1.8');
      }
    },
    clearState() {
      // Back to the resting colours: nothing has been calculated, and the
      // diagram should not imply that anything has.
      edgeEls.forEach(e => {
        e.flowPath.setAttribute('opacity', 0);
        e.flowPath.setAttribute('data-live', 'false');
        e.glow.setAttribute('opacity', 0);
        e.label.textContent = '—';
        e.label.setAttribute('fill', 'var(--ink-faint)');
        e.arrow.setAttribute('fill', 'var(--line-strong)');
        e.arrow.setAttribute('opacity', 0.5);
      });
      nodeEls.forEach(g => {
        const b = g.querySelector('.fs-body'); if (!b) return;
        b.setAttribute('stroke', b.style.color || 'var(--ink-dim)');
        b.setAttribute('stroke-opacity', '0.9');
        b.setAttribute('stroke-width', '2');
      });
    },
    dispose() { stopGestures(); clear(container); }
  };
}
