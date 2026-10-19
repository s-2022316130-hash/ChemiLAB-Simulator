import { el } from '../shared/dom.js';
import { val, isEmpty } from '../shared/format.js';
import { reducedMotion } from '../shared/motion.js';
import { onFrame } from '../shared/animation.js';
import { Status } from '../simulation/contract.js';
import { href } from './router.js';
import { TOTALS } from './registry.js';
import { FILM, loadTrack } from './heroFilm.js';

/**
 * The overview's hero: the claim, over a film of a working plant.
 *
 * The film is unit 05, the natural gas plant, rendered from the simulator's own
 * three.js scene running at its base case (see heroFilm.js and
 * tools/heroVideo.js). Over it, each labelled unit carries its tag, and the
 * labels ride on the units as the camera drifts, from the track recorded when
 * the film was rendered.
 *
 * What is written about a unit is the simulator's own and nothing else:
 *
 *   - names and purposes come from the plant's equipment cards;
 *   - every reading is the engine's base case, solved here in the browser —
 *     the same call Run makes on a freshly opened simulator — and formatted as
 *     the engine formats it;
 *   - until that solve has happened every reading is an em dash, and if it did
 *     not converge they stay that way and the caption says so.
 *
 * The film loads after the page has painted, and the engine and cards once it
 * is idle; three.js is never touched. The film plays only while the hero is on
 * screen. Under a reduced-motion or reduced-data preference it is not loaded at
 * all: the poster — the film's own first frame — stands in, with its labels.
 */

const SIM = 'gas-processing';
const PLANT_KPIS = ['Sales gas rate', 'Hydrogen sulphide in sales gas', 'Ethane recovery', 'Specifications met'];
const EM = '—';
// Where the frame is cropped when the screen is not its shape: right of centre,
// because that is where the plant stands and the left is the headline's.
const CROP = { x: 0.66, y: 0.5 };

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const inWords = n => WORDS[n] || String(n);
const Cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const firstSentence = s => { const i = (s || '').indexOf('. '); return i > 0 ? s.slice(0, i + 1) : (s || ''); };
const idle = fn => (typeof requestIdleCallback === 'function'
  ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 200));

export function twinHero({ onHow } = {}) {
  const narrow = matchMedia('(max-width: 900px)').matches;
  const set = narrow ? FILM.small : FILM.large;
  const saveData = !!navigator.connection?.saveData;
  const still = reducedMotion() || saveData || !set.mp4;

  // ---- the film ---------------------------------------------------------------
  const video = el('video', {
    class: 'tw-video', poster: set.poster, preload: 'none', muted: '', loop: '', playsinline: '',
    disablepictureinpicture: '', 'aria-hidden': 'true', tabindex: '-1'
  });
  // Autoplay is allowed only for a muted video, and some browsers read the
  // property rather than the attribute.
  video.muted = true; video.defaultMuted = true; video.playsInline = true;
  if (!still) {
    // H.264 first: it decodes in hardware almost everywhere and is the smaller
    // file at this quality. VP9 is there for a browser without it.
    video.append(el('source', { src: set.mp4, type: 'video/mp4' }));
    if (set.webm) video.append(el('source', { src: set.webm, type: 'video/webm; codecs="vp9"' }));
  }
  const tags = el('div', { class: 'tw-tags' });
  const leader = el('div', { class: 'tw-leader', 'aria-hidden': 'true', hidden: '' });
  const film = el('div', { class: 'tw-film' }, [video, el('div', { class: 'tw-shade', 'aria-hidden': 'true' }), tags, leader]);

  // ---- the copy ---------------------------------------------------------------
  const copy = el('div', { class: 'tw-copy' }, [
    el('h1', { id: 'hero-title' }, [el('span', { text: 'Run the plant.' }), ' ', el('span', { text: 'See why it behaves that way.' })]),
    el('p', { class: 'tw-lede', text: `${Cap(inWords(TOTALS.simulators))} working process plants, from water treatment to cryogenic gas recovery. Change an operating condition, solve the balances, and read the same answer in the 3D plant, the flowsheet and the equations behind them.` }),
    el('div', { class: 'tw-cta' }, [
      el('a', { class: 'btn primary tw-go', href: href.simulator(SIM), text: 'Run this gas plant' }),
      el('a', { class: 'btn tw-all', href: href.simulators, text: `See all ${inWords(TOTALS.simulators)} plants` }),
      el('button', { class: 'btn ghost tw-how', type: 'button', text: 'How it works', onClick: () => onHow?.() })
    ]),
    el('ul', { class: 'tw-facts' }, [
      fact(TOTALS.units, 'tagged units'), fact(TOTALS.faults, 'faults to diagnose'), fact(TOTALS.tourSteps, 'guided tour steps')
    ])
  ]);

  const readout = el('div', { class: 'tw-readout', id: 'tw-readout', 'aria-live': 'polite' });
  const picker = el('div', { class: 'tw-picker', role: 'group', 'aria-label': 'Units in the film' });
  const caption = el('p', { class: 'tw-caption', text: 'Unit 05, natural gas processing, rendered from the simulator’s own 3D plant. Solving its base case in your browser…' });

  const section = el('section', { class: 'twin', 'aria-labelledby': 'hero-title', dataset: { run: 'true', still: String(still) } }, [
    film, copy, picker, readout, caption
  ]);

  // ---- the model ----------------------------------------------------------------
  const data = { eq: {}, kpis: [], names: {}, cards: {} };

  // ---- labels on the film ----------------------------------------------------------
  let track = null;
  const chips = new Map(), picks = new Map();
  let pinned = null, shown = null;

  function buildLabels() {
    for (const tag of Object.keys(track.tags)) {
      const chip = el('button', {
        class: 'tw-chip', type: 'button', 'aria-pressed': 'false', 'aria-controls': 'tw-readout',
        'aria-label': data.names[tag] ? `${tag}, ${data.names[tag]}` : tag
      }, [el('span', { text: tag })]);
      chip.addEventListener('pointerenter', () => preview(tag));
      chip.addEventListener('pointerleave', () => preview(null));
      chip.addEventListener('focus', () => preview(tag));
      chip.addEventListener('blur', () => preview(null));
      chip.addEventListener('click', () => pin(tag));
      chips.set(tag, chip);
      tags.append(chip);
      const b = el('button', { class: 'tw-pick', type: 'button', 'aria-pressed': 'false', 'aria-controls': 'tw-readout' },
        [el('b', { text: tag }), el('span', { text: data.names[tag] || '' })]);
      b.addEventListener('click', () => pin(tag));
      picks.set(tag, b);
      picker.append(b);
    }
    film.addEventListener('keydown', e => { if (e.key === 'Escape' && pinned) pin(pinned); });
    measure();
    place();
  }

  /** Where a unit is at film time t, in the film layer's pixels, or null if out of shot. */
  function at(tag, t) {
    const s = track.tags[tag];
    const n = track.frames;
    const f = ((t * track.fps) % n + n) % n;
    const i0 = Math.floor(f), i1 = (i0 + 1) % n, k = f - i0;
    const x0 = s[i0 * 2], y0 = s[i0 * 2 + 1], x1 = s[i1 * 2], y1 = s[i1 * 2 + 1];
    if (x0 < 0 || x1 < 0) return null;
    const u = (x0 + (x1 - x0) * k) / 10000, v = (y0 + (y1 - y0) * k) / 10000;
    // The film is cropped to cover the layer, about CROP — as object-position says.
    const scale = Math.max(box.width / track.width, box.height / track.height);
    const dw = track.width * scale, dh = track.height * scale;
    return [(box.width - dw) * CROP.x + u * dw, (box.height - dh) * CROP.y + v * dh];
  }

  // A label that would land under the headline is not shown.
  let clearX = 0, box = { width: 0, height: 0, left: 0, top: 0 };
  function measure() {
    box = film.getBoundingClientRect();
    const overlaid = getComputedStyle(film).position === 'absolute';
    clearX = overlaid ? copy.getBoundingClientRect().right - box.left + 24 : 0;
  }

  const filmTime = () => (still ? 0 : video.currentTime || 0);
  function place() {
    if (!track || !box.width) return;
    const t = filmTime();
    for (const [tag, chip] of chips) {
      const p = at(tag, t);
      const ok = !!p && p[0] > clearX && p[0] < box.width - 12 && p[1] > 48 && p[1] < box.height - 12;
      chip.dataset.off = String(!ok);
      if (p) chip.style.transform = `translate(${p[0].toFixed(1)}px, ${p[1].toFixed(1)}px)`;
    }
    drawLeader(t);
  }

  function drawLeader(t) {
    const p = shown && track && at(shown, t);
    if (!p || getComputedStyle(readout).position !== 'absolute' || chips.get(shown)?.dataset.off === 'true') { leader.hidden = true; return; }
    // From the unit to the readout, arriving on its top edge from above: down
    // (or up) to just over the panel, across to a point on it, then into it.
    // Drawn twice, a dark halo under the line, so it reads over lit steel.
    const rb = readout.getBoundingClientRect();
    const x0 = rb.left - box.left, x1 = rb.right - box.left, top = rb.top - box.top;
    const cx = Math.min(Math.max(p[0], x0 + 16), x1 - 16), elbow = top - 16;
    const n = v => v.toFixed(1);
    const pts = `${n(p[0])},${n(p[1])} ${n(p[0])},${n(elbow)} ${n(cx)},${n(elbow)} ${n(cx)},${n(top)}`;
    leader.hidden = false;
    leader.innerHTML = `<svg width="100%" height="100%"><polyline class="halo" points="${pts}"/><polyline points="${pts}"/></svg>`;
  }

  // ---- selection ----------------------------------------------------------------------
  function show(tag) {
    shown = tag;
    section.toggleAttribute('data-active', !!tag);
    for (const [t, c] of chips) c.classList.toggle('on', t === tag);
    renderReadout();
    drawLeader(filmTime());
  }
  function pin(tag) {
    pinned = pinned === tag ? null : tag;
    for (const [t, c] of chips) c.setAttribute('aria-pressed', String(t === pinned));
    for (const [t, b] of picks) b.setAttribute('aria-pressed', String(t === pinned));
    show(pinned);
  }
  const preview = tag => show(tag ?? pinned);

  function renderReadout() {
    const tag = shown;
    const rows = [];
    let head, sub;
    if (!tag) {
      head = el('p', { class: 'tw-r-head' }, [el('b', { text: 'Unit 05' }), el('span', { text: 'Natural gas processing' })]);
      sub = el('p', { class: 'tw-r-sub', text: 'Base case: the plant as it opens, before anything is changed.' });
      for (const label of PLANT_KPIS) {
        const k = data.kpis.find(x => x.label === label);
        rows.push([label, k && !isEmpty(k.value) ? val(k.value, k.unit, k.digits ?? 2) : EM]);
      }
    } else {
      head = el('p', { class: 'tw-r-head' }, [el('b', { text: tag }), el('span', { text: data.cards[tag]?.name || data.names[tag] || EM })]);
      sub = data.cards[tag]?.purpose ? el('p', { class: 'tw-r-sub', text: firstSentence(data.cards[tag].purpose) }) : null;
      const values = Object.entries(data.eq[tag]?.values || {}).filter(([, v]) => v && v !== EM).slice(0, 3);
      rows.push(...(values.length ? values : [['Readings', EM]]));
    }
    readout.replaceChildren(
      head, ...(sub ? [sub] : []),
      el('dl', { class: 'tw-r-rows' }, rows.map(([k, v]) => el('div', {}, [el('dt', { text: k }), el('dd', { text: v })]))),
      el('a', { class: 'tw-r-go', href: href.simulator(SIM), text: 'Open this plant in the simulator' })
    );
  }
  renderReadout();

  // ---- motion only while it can be seen ------------------------------------------------
  let visible = true, stopFrames = null, disposed = false;
  function run() {
    const go = visible && !still && document.visibilityState !== 'hidden';
    section.dataset.run = String(go);
    if (go) {
      if (video.preload !== 'none') video.play().catch(() => {});
      stopFrames ||= onFrame(place);
    } else {
      video.pause();
      stopFrames?.(); stopFrames = null;
      place();
    }
  }
  const seen = new IntersectionObserver(([e]) => { visible = !!e?.isIntersecting; run(); }, { threshold: 0.05 });
  seen.observe(section);
  const onVis = () => run();
  document.addEventListener('visibilitychange', onVis);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { measure(); place(); }) : null;
  ro?.observe(section);

  // ---- loading, in order: the film after paint, then the model and the track -----------
  requestAnimationFrame(() => {
    if (disposed || still) return;
    video.preload = 'auto';
    video.load();
    run();
  });
  idle(async () => {
    try {
      const [{ default: engine }, { EQUIPMENT }, { FLOWSHEET }, t] = await Promise.all([
        import('../simulators/gas-processing/engine.js'),
        import('../simulators/gas-processing/equipment.js'),
        import('../simulators/gas-processing/flowsheet.js'),
        loadTrack()
      ]);
      if (disposed) return;
      data.cards = EQUIPMENT;
      data.names = Object.fromEntries(FLOWSHEET.nodes.map(n => [n.tag, n.label]));
      const inputs = Object.fromEntries(Object.entries(engine.inputSpec).map(([k, d]) => [k, d.default]));
      const result = engine.run(inputs, { scenario: 'base', faults: [] });
      if ((result.status === Status.COMPLETE || result.status === Status.WARNING) && result.converged) {
        data.eq = engine.getEquipmentState(result);
        data.kpis = result.kpis || [];
        caption.textContent = 'Unit 05, natural gas processing, rendered from the simulator’s own 3D plant. Readings are its base case, solved in your browser as the page opened.';
      } else {
        caption.textContent = 'Unit 05, natural gas processing. The base case did not converge, so no readings are shown.';
      }
      track = t;
      buildLabels();
      renderReadout();
    } catch {
      if (disposed) return;
      caption.textContent = 'Unit 05, natural gas processing. The plant’s model could not be loaded, so no readings are shown.';
    }
  });

  return {
    node: section,
    dispose() {
      disposed = true;
      seen.disconnect(); ro?.disconnect(); stopFrames?.();
      document.removeEventListener('visibilitychange', onVis);
      video.pause(); video.replaceChildren(); video.load();   // drop the sources so nothing keeps downloading
    }
  };
}

function fact(n, label) {
  return el('li', {}, [el('b', { text: String(n) }), ` ${label}`]);
}
