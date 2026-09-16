import { svg, clear } from '../shared/dom.js';
import { symbolFor } from './symbols.js';

/**
 * 2D engineering flowsheet. Renders the SAME solved state as the 3D plant.
 * Selection is two-way: it reports clicks upward and accepts selection downward.
 *
 * spec = { width, height, nodes:[{tag,type,label,x,y}], edges:[{id,from,to,points?,phase}] }
 *
 * What makes this read as a drawing rather than as a graph:
 *
 *   Line hierarchy. A process line is drawn three times — a dark casing, the
 *   line itself, and marching dashes over it when the engine reports flow. The
 *   casing is what stops a line disappearing where it crosses another one, and
 *   it is the reason a real P&ID is legible at all.
 *
 *   Direction, repeatedly. Arrows are placed along the whole run rather than
 *   once at the end, so which way a stream goes is answerable anywhere you
 *   happen to be looking, including in a still frame.
 *
 *   Focus. Selecting a unit dims everything else instead of only highlighting
 *   it. "Where is this" is a question about the rest of the diagram as much as
 *   about the thing itself.
 *
 * Nothing here computes a process value. Labels are the strings the engine
 * reported and nothing else.
 */
export function createFlowsheet(container, spec, { onSelect, onHover } = {}) {
  const root = svg('svg', {
    class: 'fs-scroll', viewBox: `0 0 ${spec.width} ${spec.height}`,
    width: '100%', height: '100%', style: 'display:block'
  });

  // Drafting paper: a fine dot grid with a coarser rule over it, and a soft
  // shadow under every symbol. All static, so it costs one paint and nothing
  // after it.
  const defs = svg('defs', {}, [
    svg('pattern', { id: 'fs-dots', width: 22, height: 22, patternUnits: 'userSpaceOnUse' }, [
      svg('circle', { cx: 1, cy: 1, r: 1, fill: 'var(--line)', opacity: 0.5 })
    ]),
    svg('pattern', { id: 'fs-rule', width: 110, height: 110, patternUnits: 'userSpaceOnUse' }, [
      svg('path', { d: 'M110 0H0V110', fill: 'none', stroke: 'var(--line-soft)', 'stroke-width': 1, opacity: 0.85 })
    ]),
    svg('filter', { id: 'fs-shadow', x: '-40%', y: '-40%', width: '180%', height: '180%' }, [
      svg('feDropShadow', { dx: 0, dy: 1.5, stdDeviation: 2.2, 'flood-color': 'var(--n-990)', 'flood-opacity': 0.42 })
    ])
  ]);
  root.appendChild(defs);
  root.appendChild(svg('rect', { x: 0, y: 0, width: spec.width, height: spec.height, fill: 'url(#fs-rule)' }));
  root.appendChild(svg('rect', { x: 0, y: 0, width: spec.width, height: spec.height, fill: 'url(#fs-dots)' }));

  const gCasing = svg('g', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  const gEdges = svg('g', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  const gArrows = svg('g');
  const gNodes = svg('g');
  const gTags = svg('g');
  const gNames = svg('g');
  const gLabels = svg('g');
  root.append(gCasing, gEdges, gArrows, gNodes, gTags, gNames, gLabels);
  container.appendChild(root);

  const nodeEls = new Map(), edgeEls = new Map();
  // tag -> Set(edge id). Selecting a unit should leave the streams that run
  // into and out of it lit while the rest of the diagram recedes; without this
  // the selected column sits bright in the middle of its own dimmed pipework,
  // which is the opposite of what "where is this" means.
  const touching = new Map();
  // Set by the pan handlers below; read by the node click handlers above them.
  let panDistance = () => 0;
  const pos = Object.fromEntries(spec.nodes.map(n => [n.tag, [n.x, n.y]]));

  /** Total length of a polyline, so arrows can be spaced along it evenly. */
  const runLength = pts => {
    let d = 0;
    for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return d;
  };
  /** The point and heading at a distance along a polyline. */
  function at(pts, dist) {
    let d = dist;
    for (let i = 1; i < pts.length; i++) {
      const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (d <= seg || i === pts.length - 1) {
        const f = seg > 0 ? Math.min(d / seg, 1) : 0;
        const a = pts[i - 1], b = pts[i];
        return {
          x: a[0] + (b[0] - a[0]) * f,
          y: a[1] + (b[1] - a[1]) * f,
          ang: Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI
        };
      }
      d -= seg;
    }
    const last = pts[pts.length - 1];
    return { x: last[0], y: last[1], ang: 0 };
  }

  for (const e of spec.edges) {
    const pts = e.points || [pos[e.from], pos[e.to]];
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ');

    // Casing: a dark, slightly wider stroke under the line. It is what keeps a
    // crossing readable, and it is how every drafted diagram has ever done it.
    const casing = svg('path', {
      d, fill: 'none', stroke: 'var(--bg-0)', 'stroke-width': 7,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.9
    });
    const path = svg('path', {
      d, fill: 'none', stroke: 'var(--line-strong)', 'stroke-width': 2.6,
      'stroke-linejoin': 'round'
    });
    // A wide, low-opacity copy under the line gives a live stream a glow without
    // an SVG filter, which is expensive to animate.
    const glow = svg('path', {
      d, fill: 'none', stroke: 'var(--stream-liq)', 'stroke-width': 11, opacity: 0,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round'
    });
    // Marching dashes along a live line. Same rule as the 3D tracers: this only
    // moves where the engine reported a flow, so a still line is a dead line.
    const flowPath = svg('path', {
      class: 'fs-flow', 'data-live': 'false', d, fill: 'none', stroke: 'var(--stream-liq)',
      'stroke-width': 3, opacity: 0, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
    });
    gCasing.appendChild(casing);
    gEdges.append(glow, path, flowPath);

    // Arrows along the whole run rather than one at the end. A diagram that
    // says which way things go only at the last leg is answering the question
    // in the one place nobody is looking.
    const len = runLength(pts);
    const count = Math.max(1, Math.min(4, Math.round(len / 90)));
    const arrows = [];
    for (let i = 0; i < count; i++) {
      const f = (i + 0.5) / count;
      const p = at(pts, len * f);
      arrows.push(svg('path', {
        class: 'fs-arrow', d: 'M-5.5 -4 L5.5 0 L-5.5 4 Z', fill: 'var(--line-strong)',
        transform: `translate(${p.x.toFixed(1)},${p.y.toFixed(1)}) rotate(${p.ang.toFixed(1)})`
      }));
    }
    gArrows.append(...arrows);

    // The stream value sits at the middle of the run, knocked out of the
    // background so it survives crossing a line.
    const mid = at(pts, len * 0.5);
    const label = svg('text', {
      class: 'fs-val', x: (mid.x + 8).toFixed(1), y: (mid.y - 9).toFixed(1),
      'font-size': 12.5, 'font-family': 'var(--mono)', fill: 'var(--ink-faint)',
      'paint-order': 'stroke', stroke: 'var(--bg-0)', 'stroke-width': 5,
      'stroke-linejoin': 'round', text: '—'
    });
    gLabels.appendChild(label);

    const group = [path, glow, flowPath, casing, label, ...arrows];
    edgeEls.set(e.id, { path, glow, flowPath, casing, label, arrows, group });
    for (const end of [e.from, e.to]) {
      if (!end) continue;
      if (!touching.has(end)) touching.set(end, new Set());
      touching.get(end).add(e.id);
    }
  }

  for (const n of spec.nodes) {
    const g = svg('g', { class: 'fs-node', transform: `translate(${n.x},${n.y})`, filter: 'url(#fs-shadow)' });
    g.appendChild(symbolFor(n.type, n.label));

    // A small status lamp on the shoulder of every symbol. Before a run it is
    // hollow; after one it carries the state the engine reported. It is the
    // fastest way to read a plant: one glance across the diagram.
    const lamp = svg('circle', {
      class: 'fs-lamp', cx: 15, cy: -22, r: 3.4,
      fill: 'var(--bg-1)', stroke: 'var(--line-strong)', 'stroke-width': 1.4
    });
    g.appendChild(lamp);

    const tagText = svg('text', {
      class: 'fs-tag', y: 46, 'text-anchor': 'middle', 'font-size': 13.5, 'font-weight': '700',
      'font-family': 'var(--mono)', fill: 'var(--accent)',
      'paint-order': 'stroke', stroke: 'var(--bg-0)', 'stroke-width': 5, 'stroke-linejoin': 'round',
      text: n.tag
    });
    const nameText = svg('text', {
      y: 60, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--ink-faint)',
      'paint-order': 'stroke', stroke: 'var(--bg-0)', 'stroke-width': 4, 'stroke-linejoin': 'round',
      text: n.label || ''
    });
    gTags.appendChild(tagText); gNames.appendChild(nameText);
    // Captions ride with the node but live in their own layers, so each kind can
    // be switched on and off without rebuilding the diagram.
    tagText.setAttribute('transform', `translate(${n.x},${n.y})`);
    nameText.setAttribute('transform', `translate(${n.x},${n.y})`);

    g.appendChild(svg('title', { text: `${n.tag} — ${n.label || ''}` }));
    // A drag that happened to start on a symbol was a pan, not a selection.
    g.addEventListener('click', () => { if (panDistance() <= 5) onSelect?.(n.tag); });
    g.addEventListener('mouseenter', () => onHover?.(n.tag));
    g.addEventListener('mouseleave', () => onHover?.(null));
    gNodes.appendChild(g);
    nodeEls.set(n.tag, { g, lamp, tagText, nameText });
  }

  // --- pan and zoom ---------------------------------------------------------
  // A flowsheet drawn 1260 units wide is unreadable in a 360-pixel column, so
  // the diagram is a surface you move around rather than a fixed picture: drag
  // to pan, wheel or pinch to zoom, and a Fit control to get back.
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
    touched();
  }
  function fit() { Object.assign(vb, home); applyView(); touched(); }

  // A one-line hint over the diagram, gone the moment it has been acted on.
  const hint = document.createElement('div');
  hint.className = 'fs-hint';
  hint.dataset.gone = 'false';
  hint.textContent = 'Drag to pan · scroll to zoom · click a unit';
  container.appendChild(hint);
  let hintTimer = setTimeout(() => { hint.dataset.gone = 'true'; }, 9000);
  function touched() {
    if (hint.dataset.gone === 'true') return;
    hint.dataset.gone = 'true';
    clearTimeout(hintTimer);
  }

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
    if (dragged > 6) touched();
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
    clearTimeout(hintTimer);
  };

  let captions = { tags: true, names: true, streams: true };
  function applyCaptions() {
    gTags.style.display = captions.tags ? '' : 'none';
    gNames.style.display = captions.names ? '' : 'none';
    gLabels.style.display = captions.streams ? '' : 'none';
  }
  applyCaptions();

  /** Lamp colour for an equipment state the engine reported. */
  function lampFor(st) {
    if (!st) return ['var(--bg-1)', 'var(--line-strong)'];
    if (st.alarm) return ['var(--err)', 'var(--err)'];
    if (st.state === 'warning') return ['var(--warn)', 'var(--warn)'];
    if (st.state === 'running') return ['var(--ok)', 'var(--ok)'];
    if (st.state === 'stopped' || st.state === 'off') return ['var(--ink-ghost)', 'var(--ink-ghost)'];
    return ['var(--bg-1)', 'var(--line-strong)'];
  }

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
    select(tag) {
      nodeEls.forEach((n, t) => n.g.classList.toggle('sel', t === tag));
      // Selecting dims the rest. "Where is this" is a question about the whole
      // diagram, not only about the thing being pointed at — but the streams
      // belonging to the selection are part of the answer, so they stay lit.
      const own = tag ? (touching.get(tag) || new Set()) : null;
      edgeEls.forEach((e, id) => {
        const on = !tag || own.has(id);
        for (const node of e.group) node.classList.toggle('fs-dim', !on);
      });
      root.dataset.focus = String(!!tag);
      touched();
    },
    hover(tag) { nodeEls.forEach((n, t) => n.g.classList.toggle('hov', t === tag)); },

    /**
     * Shade the symbols by a colour mode: `{tag: '#rrggbb' | null}`.
     *
     * The fill takes the reading; the outline and the lamp go on carrying the
     * running state. Keeping them on separate channels is what makes the two
     * readable at once — a hot unit that has also tripped shows a red ring
     * around a warm body, and neither fact has to displace the other.
     *
     * A tag with no reading keeps the resting fill rather than taking the cold
     * end of the ramp. A compressor the model gives no temperature is not a
     * cold compressor.
     */
    setNodeTint(map) {
      const m = map || {};
      nodeEls.forEach((n, tag) => {
        const b = n.g.querySelector('.fs-body');
        if (!b) return;
        const c = m[tag];
        b.setAttribute('fill', c || 'var(--bg-1)');
        n.g.dataset.tinted = String(!!c);
      });
    },

    /** streams: engine.getStreams() result; equipment: engine.getEquipmentState() */
    applyState(streams = [], equipment = {}) {
      for (const s of streams) {
        const e = edgeEls.get(s.id); if (!e) continue;
        const live = Number.isFinite(s.flow) && s.flow > 0;
        const colour = `var(--stream-${s.phase || 'liq'})`;
        e.flowPath.setAttribute('opacity', live ? 0.95 : 0);
        e.flowPath.setAttribute('stroke', colour);
        e.flowPath.setAttribute('data-live', String(live));
        e.glow.setAttribute('opacity', live ? 0.18 : 0);
        e.glow.setAttribute('stroke', colour);
        e.path.setAttribute('stroke', live ? colour : 'var(--line-strong)');
        e.path.setAttribute('stroke-opacity', live ? 0.5 : 1);
        e.label.textContent = s.label ?? '—';
        e.label.setAttribute('fill', live ? colour : 'var(--ink-ghost)');
        for (const a of e.arrows) {
          a.setAttribute('fill', live ? colour : 'var(--line-strong)');
          a.setAttribute('opacity', live ? 1 : 0.4);
        }
      }
      for (const [tag, st] of Object.entries(equipment)) {
        const n = nodeEls.get(tag); if (!n) continue;
        const b = n.g.querySelector('.fs-body');
        if (b) {
          b.setAttribute('stroke', st.alarm ? 'var(--err)' : st.state === 'running' ? 'var(--ok)' : st.state === 'warning' ? 'var(--warn)' : 'var(--ink-dim)');
          b.setAttribute('stroke-opacity', '1');
          b.setAttribute('stroke-width', st.alarm || st.state === 'warning' ? '2.6' : '2');
        }
        const [fill, stroke] = lampFor(st);
        n.lamp.setAttribute('fill', fill);
        n.lamp.setAttribute('stroke', stroke);
        n.lamp.dataset.alarm = String(!!st.alarm || st.state === 'warning');
      }
    },

    clearState() {
      // Back to the resting colours: nothing has been calculated, and the
      // diagram should not imply that anything has.
      edgeEls.forEach(e => {
        e.flowPath.setAttribute('opacity', 0);
        e.flowPath.setAttribute('data-live', 'false');
        e.glow.setAttribute('opacity', 0);
        e.path.setAttribute('stroke', 'var(--line-strong)');
        e.path.setAttribute('stroke-opacity', 1);
        e.label.textContent = '—';
        e.label.setAttribute('fill', 'var(--ink-ghost)');
        for (const a of e.arrows) {
          a.setAttribute('fill', 'var(--line-strong)');
          a.setAttribute('opacity', 0.4);
        }
      });
      nodeEls.forEach(n => {
        const b = n.g.querySelector('.fs-body');
        if (b) {
          b.setAttribute('stroke', b.style.color || 'var(--ink-dim)');
          b.setAttribute('stroke-opacity', '0.9');
          b.setAttribute('stroke-width', '2');
        }
        n.lamp.setAttribute('fill', 'var(--bg-1)');
        n.lamp.setAttribute('stroke', 'var(--line-strong)');
        n.lamp.dataset.alarm = 'false';
      });
    },

    dispose() { stopGestures(); clear(container); }
  };
}
