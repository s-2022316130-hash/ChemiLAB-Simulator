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
    const path = svg('path', { d, fill: 'none', stroke: 'var(--line)', 'stroke-width': 2 });
    const flowPath = svg('path', { d, fill: 'none', stroke: 'var(--stream-liq)', 'stroke-width': 2, opacity: 0 });
    gEdges.append(path, flowPath);
    const mid = pts[Math.floor(pts.length / 2)] || pts[0];
    const label = svg('text', { x: mid[0] + 6, y: mid[1] - 6, 'font-size': 9.5, 'font-family': 'var(--mono)', fill: 'var(--ink-faint)', text: '—' });
    gLabels.appendChild(label);
    edgeEls.set(e.id, { path, flowPath, label });
  }
  for (const n of spec.nodes) {
    const g = svg('g', { class: 'fs-node', transform: `translate(${n.x},${n.y})` });
    g.appendChild(symbolFor(n.type, n.label));
    g.appendChild(svg('text', { y: 40, 'text-anchor': 'middle', 'font-size': 9, 'font-family': 'var(--mono)', fill: 'var(--accent)', text: n.tag }));
    g.appendChild(svg('text', { y: 51, 'text-anchor': 'middle', 'font-size': 9, fill: 'var(--ink-faint)', text: n.label || '' }));
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
        e.flowPath.setAttribute('opacity', live ? 0.9 : 0);
        e.flowPath.setAttribute('stroke', `var(--stream-${s.phase || 'liq'})`);
        e.label.textContent = s.label ?? '—';
      }
      for (const [tag, st] of Object.entries(equipment)) {
        const g = nodeEls.get(tag); if (!g) continue;
        const b = g.querySelector('.fs-body');
        if (b) b.setAttribute('stroke', st.alarm ? 'var(--err)' : st.state === 'running' ? 'var(--ok)' : st.state === 'warning' ? 'var(--warn)' : 'var(--ink-dim)');
      }
    },
    clearState() {
      edgeEls.forEach(e => { e.flowPath.setAttribute('opacity', 0); e.label.textContent = '—'; });
      nodeEls.forEach(g => g.querySelector('.fs-body')?.setAttribute('stroke', 'var(--ink-dim)'));
    },
    dispose() { clear(container); }
  };
}
