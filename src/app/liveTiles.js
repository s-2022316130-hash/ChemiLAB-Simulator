import { el } from '../shared/dom.js';
import { reducedMotion } from '../shared/motion.js';

/**
 * Bring the library tiles to life.
 *
 * Every tile starts as the still photograph it has always been, which is on
 * screen at once and costs nothing. When the library comes near the viewport
 * the preview stage loads — three.js and the plant modules, none of which the
 * overview needs until then — and each tile's plant is built in turn, most
 * visible first, with a pause between them so the page never stops answering
 * a scroll. As each plant draws its first frame the tile cross-fades from the
 * photograph to the plant running, framed identically, so it reads as the
 * picture starting to move.
 *
 * Only tiles on screen are drawn. A plant scrolled out of view costs nothing
 * per frame, and a hidden tab costs nothing at all.
 *
 * With reduced motion the tiles stay still, as photographs, and a plant only
 * runs while its tile is pointed at or focused. Something that moves on its own
 * as soon as a page opens is exactly what that preference asks not to see;
 * something that moves because you reached for it is not.
 *
 * Nothing on a tile is a reading. The plant runs at its engine's base case —
 * what Run gives on a freshly opened simulator — and the tile shows it moving,
 * not any number from it.
 */

/** WebGL without importing the renderer, which would pull three.js in with it. */
function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

const idle = () => new Promise(r => (typeof requestIdleCallback === 'function'
  ? requestIdleCallback(() => r(), { timeout: 700 })
  : setTimeout(r, 90)));

export function createLiveTiles(grid, entries) {
  if (!grid || !hasWebGL()) return { dispose() {} };

  const reduced = reducedMotion();
  let stage = null, booting = null, queueing = false, disposed = false;

  const tiles = [...grid.querySelectorAll('.simtile')]
    .map(node => ({ node, id: node.dataset.id, entry: entries.get(node.dataset.id), visible: false, hovered: false, preview: null, building: false }))
    .filter(t => t.entry && t.entry.state === 'complete' && t.node.querySelector('.tile-photo'));

  const wanted = t => (reduced ? t.hovered : true);

  /** Hand the tile's state to its preview, and show the plant once it has a frame. */
  function sync(t) {
    const p = t.preview;
    if (!p) return;
    p.visible = t.visible;
    p.wanted = wanted(t);
    p.focus = t.hovered;
    t.node.dataset.live = String(p.ready && t.visible && p.wanted);
  }

  function boot() {
    booting ||= import('../scene/previewStage.js').then(({ createPreviewStage }) => {
      if (!disposed) stage = createPreviewStage();
    }).catch(() => { stage = null; });
    return booting;
  }

  async function build(t) {
    if (t.preview || t.building || disposed) return;
    t.building = true;
    await boot();
    if (disposed || !stage || stage.lost) return;
    const canvas = el('canvas', { class: 'tile-live', 'aria-hidden': 'true' });
    t.node.querySelector('.tile-photo').appendChild(canvas);
    let p = null;
    try { p = await stage.add(t.entry, canvas); } catch { p = null; }
    if (disposed) { p?.dispose(); return; }
    if (!p) { canvas.remove(); t.building = false; return; }
    t.preview = p;
    p.onReady = () => sync(t);
    // A lost context puts every tile back to its photograph, which is what it
    // was before any of this started.
    p.onLost = () => { t.node.dataset.live = 'false'; };
    sync(t);
  }

  /** Build the plants one at a time, on-screen tiles first. */
  async function runQueue() {
    if (queueing || reduced) return;
    queueing = true;
    try {
      for (;;) {
        const next = tiles
          .filter(t => !t.preview && !t.building)
          .sort((a, b) => Number(b.visible) - Number(a.visible))[0];
        if (!next || disposed) break;
        await build(next);
        await idle();
      }
    } finally { queueing = false; }
  }

  const seen = new IntersectionObserver(items => {
    for (const it of items) {
      const t = tiles.find(x => x.node === it.target);
      if (!t) continue;
      t.visible = it.isIntersecting;
      sync(t);
    }
    if (tiles.some(t => t.visible)) runQueue();
  }, { rootMargin: '160px 0px' });

  const offs = [];
  for (const t of tiles) {
    seen.observe(t.node);
    const on = () => { t.hovered = true; if (reduced) build(t).then(() => sync(t)); sync(t); };
    const off = () => { t.hovered = false; sync(t); };
    t.node.addEventListener('pointerenter', on);
    t.node.addEventListener('pointerleave', off);
    t.node.addEventListener('focus', on);
    t.node.addEventListener('blur', off);
    offs.push(() => {
      t.node.removeEventListener('pointerenter', on);
      t.node.removeEventListener('pointerleave', off);
      t.node.removeEventListener('focus', on);
      t.node.removeEventListener('blur', off);
    });
  }

  return {
    dispose() {
      disposed = true;
      seen.disconnect();
      offs.forEach(fn => fn());
      stage?.dispose();
      for (const t of tiles) { t.node.dataset.live = 'false'; t.node.querySelector('.tile-live')?.remove(); }
    }
  };
}
