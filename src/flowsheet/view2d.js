import { svg, clear } from '../shared/dom.js';
import { symbolFor } from './symbols.js';
/**
 * 2D engineering flowsheet. Renders the SAME solved state as the 3D plant.
 * Selection is two-way: it reports clicks upward and accepts selection downward.
 * spec = { width, height, nodes:[{tag,type,label,x,y}], edges:[{id,from,to,points?,phase}] }
 */
export function createFlowsheet(container, spec, { onSelect, onHover } = {}) {
  const root = svg('svg', { viewBox: `0 0 ${spec.width} ${spec.height}`, width: '100%', height: '100%', style: 'display:block' });
  const gEdges = svg('g', { 'stroke-linecap': 'round' });
  const gNodes = svg('g');
  const gLabels = svg('g');
  root.append(gEdges, gNodes, gLabels);
  container.appendChild(root);

  const nodeEls = new Map(), edgeEls = new Map(), labelEls = new Map();
  const pos = Object.fromEntries(spec.nodes.map(n => [n.tag, [n.x, n.y]]));

  for (const e of spec.edges) {
    const pts = e.points || [pos[e.from], pos[e.to]];
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ');
    const path = svg('path', { d, fill: 'none', stroke: 'var(--line)', 'stroke-width': 3, 'stroke-linejoin': 'round' });
    // A wide, low-opacity copy under the line gives a live stream a glow without
    // needing an SVG filter, which is expensive to animate.
    const glow = svg('path', { d, fill: 'none', stroke: 'var(--stream-liq)', 'stroke-width': 11, opacity: 0, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    const flowPath = svg('path', { d, fill: 'none', stroke: 'var(--stream-liq)', 'stroke-width': 3, opacity: 0, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    gEdges.append(path, glow, flowPath);
    const mid = pts[Math.floor(pts.length / 2)] || pts[0];
    const label = svg('text', { x: mid[0] + 7, y: mid[1] - 7, 'font-size': 13, 'font-family': 'var(--mono)', fill: 'var(--ink-dim)', 'paint-order': 'stroke', stroke: 'var(--bg-0)', 'stroke-width': 4.5, 'stroke-linejoin': 'round', text: '—' });
    gLabels.appendChild(label);
    edgeEls.set(e.id, { path, glow, flowPath, label });
  }
  for (const n of spec.nodes) {
    const g = svg('g', { class: 'fs-node', transform: `translate(${n.x},${n.y})` });
    g.appendChild(symbolFor(n.type, n.label));
    g.appendChild(svg('text', {
      y: 46, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': '700',
      'font-family': 'var(--mono)', fill: 'var(--accent)',
      'paint-order': 'stroke', stroke: 'var(--bg-0)', 'stroke-width': 5, 'stroke-linejoin': 'round',
      text: n.tag
    }));
    g.appendChild(svg('text', {
      y: 61, 'text-anchor': 'middle', 'font-size': 11.5, fill: 'var(--ink-faint)',
      'paint-order': 'stroke', stroke: 'var(--bg-0)', 'stroke-width': 4, 'stroke-linejoin': 'round',
      text: n.label || ''
    }));
    g.appendChild(svg('title', { text: `${n.tag} — ${n.label || ''}` }));
    g.addEventListener('click', () => onSelect?.(n.tag));
    g.addEventListener('mouseenter', () => onHover?.(n.tag));
    g.addEventListener('mouseleave', () => onHover?.(null));
    gNodes.appendChild(g); nodeEls.set(n.tag, g);
  }
  return {
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
        e.glow.setAttribute('opacity', live ? 0.16 : 0);
        e.glow.setAttribute('stroke', colour);
        e.label.textContent = s.label ?? '—';
        e.label.setAttribute('fill', live ? colour : 'var(--ink-faint)');
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
        e.glow.setAttribute('opacity', 0);
        e.label.textContent = '—';
        e.label.setAttribute('fill', 'var(--ink-faint)');
      });
      nodeEls.forEach(g => {
        const b = g.querySelector('.fs-body'); if (!b) return;
        b.setAttribute('stroke', b.style.color || 'var(--ink-dim)');
        b.setAttribute('stroke-opacity', '0.55');
        b.setAttribute('stroke-width', '1.6');
      });
    },
    dispose() { clear(container); }
  };
}
