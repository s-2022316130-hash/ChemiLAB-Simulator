import { el, clear } from '../shared/dom.js';

/**
 * Bottom sheet — equipment detail on a phone.
 *
 * On a desktop the equipment card lives in the results rail, where there is
 * room for it. On a phone there is no rail, and putting the card into one of
 * the four tabs would mean that tapping a vessel in the plant sends you to a
 * different screen to read about it — which is exactly the thing that makes
 * tabbed layouts frustrating.
 *
 * So on a phone the card comes up over whatever you are looking at, from the
 * bottom, and goes away with the same thumb. It is dragged down, tapped away on
 * the scrim, or closed with Escape.
 */
export function createSheet(mount) {
  const scrim = el('div', { class: 'sheet-scrim', dataset: { open: 'false' } });
  const title = el('span', { class: 'hud-tag' });
  const name = el('span', { class: 'nm' });
  const body = el('div', { class: 'sheet-body' });
  const grip = el('div', { class: 'grip' }, [el('i')]);

  const root = el('div', {
    class: 'sheet', dataset: { open: 'false' },
    role: 'dialog', 'aria-modal': 'false', 'aria-label': 'Equipment detail'
  }, [grip, el('div', { class: 'sheet-head' }, [title, name]), body]);

  mount.append(scrim, root);

  const close = () => { root.dataset.open = 'false'; scrim.dataset.open = 'false'; root.style.transform = ''; };
  scrim.addEventListener('click', close);
  const onKey = e => { if (e.key === 'Escape' && root.dataset.open === 'true') close(); };
  addEventListener('keydown', onKey);

  // Drag the grip down to dismiss. Below a third of the sheet it springs back,
  // which is the behaviour every sheet on a phone has and therefore the one
  // nobody has to learn.
  let startY = null, dy = 0;
  grip.addEventListener('pointerdown', e => {
    startY = e.clientY; dy = 0;
    grip.setPointerCapture(e.pointerId);
    root.style.transition = 'none';
  });
  grip.addEventListener('pointermove', e => {
    if (startY === null) return;
    dy = Math.max(0, e.clientY - startY);
    root.style.transform = `translateY(${dy}px)`;
  });
  const release = () => {
    if (startY === null) return;
    startY = null;
    root.style.transition = '';
    if (dy > root.offsetHeight * 0.33) close();
    else root.style.transform = '';
  };
  grip.addEventListener('pointerup', release);
  grip.addEventListener('pointercancel', release);

  return {
    get open() { return root.dataset.open === 'true'; },
    show(tag, label, node) {
      title.textContent = tag || '';
      name.textContent = label || '';
      clear(body).appendChild(node);
      root.dataset.open = 'true';
      scrim.dataset.open = 'true';
      root.style.transform = '';
      body.scrollTop = 0;
    },
    close,
    dispose() { removeEventListener('keydown', onKey); root.remove(); scrim.remove(); }
  };
}
