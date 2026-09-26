import { el, clear } from '../shared/dom.js';
import { SIMULATORS, TOTALS, getSimulator, STATE_LABEL } from './registry.js';
import { href } from './router.js';
import { invalidateTokens } from '../shared/theme.js';
import { icon } from '../shared/icons.js';
import { previewNode } from './previews.js';
import { backdropFor } from './backdrops.js';
import { psychroChart } from './psychro.js';
import { heroPlantNode } from './heroPlant.js';
import { signature, AUTHOR } from '../shared/components/signature.js';
import { reducedMotion } from '../shared/motion.js';
import { createLiveTiles } from './liveTiles.js';

/**
 * Page renderers.
 *
 * The overview has one job: to say what this is, in the order someone decides
 * whether to care. Brand, claim, the library itself, how it works, and then get
 * out of the way. Every number on it is counted from the registry — there is no
 * figure here that is not a count of something that exists.
 */

export function homePage(view, { section = null } = {}) {
  delete document.documentElement.dataset.sim;
  // The overview has a ground of its own — see HOME in theme.css — and the
  // workspace keeps the one it has always had.
  document.documentElement.dataset.page = 'home';
  invalidateTokens();
  const gallery = el('section', { class: 'simsec', id: 'library' });
  const how = el('section', { class: 'capsec', id: 'method' });

  // Scrolling happens inside .view, not on the document, so the anchors are
  // handled here rather than left to the browser's own hash behaviour — which
  // would also fight the router for the address bar.
  // Smooth unless the reader has asked for less motion: a scroll that glides
  // the page past is movement, and the preference is about movement.
  const goTo = (node, smooth = true) =>
    node.scrollIntoView({ behavior: smooth && !reducedMotion() ? 'smooth' : 'auto', block: 'start' });

  gallery.append(
    sectionHead('The library', 'Five process units, each with a working model behind it.',
      'Every unit is a complete simulator: a 3D plant, a flowsheet, an engine that closes its balances, six faults to diagnose and three graded challenges. Open one and change something.'),
    el('div', { class: 'simgrid' }, SIMULATORS.map((s, i) => simTile(s, i)))
  );

  how.append(
    sectionHead('How it works', 'A model underneath, and nothing on screen that is not from it.',
      'The interface is forbidden from computing a process value. Anything that has not been calculated shows an em dash rather than a plausible-looking number, and every correlation carries its provenance.'),
    el('div', { class: 'capgrid' }, CAPABILITIES.map(capCard))
  );

  const page = el('div', { class: 'home' }, [
    // The hero is a drawing plate: a sheet border with zone references and
    // centring marks, an engraved psychrometric chart as its ground, the plant
    // in elevation, and the facts in a title block. Every piece of it is
    // drawing-office furniture that a drawing actually carries.
    el('section', { class: 'hero plate' }, [
      plateFrame(),
      el('figure', { class: 'plate-chart' }, [
        psychroChart(),
        el('figcaption', { text: 'Psychrometric chart at 101.325 kPa' })
      ]),
      el('div', { class: 'hero-copy' }, [
        el('h1', { text: 'Run the plant. Then find out why it behaves that way.' }),
        el('p', { class: 'lede', text: 'Change an operating condition, solve the balances, and watch the same solved state appear in the 3D plant, the flowsheet, the results rail and the equations behind them. Not an animation of a process — a process model with a plant drawn on top of it.' }),
        el('div', { class: 'cta' }, [
          // A link to the library route rather than a scroll of its own, so the
          // masthead nav follows it and the address says where you are.
          el('a', { class: 'btn primary', href: href.simulators, text: 'Explore the simulators' }),
          el('button', {
            class: 'btn',
            html: `${icon('book')} How it works`,
            onClick: () => goTo(how)
          })
        ])
      ]),
      el('div', { class: 'hero-art' }, [heroPlantNode()]),
      // The facts about the library, as a title block records a drawing’s:
      // counted from the registry, each one a count of something that exists.
      el('dl', { class: 'titleblock' }, [
        cell('Process units', TOTALS.simulators),
        cell('Tagged equipment', TOTALS.units),
        cell('Faults to diagnose', TOTALS.faults),
        cell('Guided tour steps', TOTALS.tourSteps)
      ])
    ]),
    gallery,
    how,
    siteFooter(),
    signature()
  ]);

  clear(view).appendChild(page);
  view.scrollTop = 0;
  // Arriving at the library from elsewhere lands on it at once. Gliding down
  // from the top of a page that has only just appeared would be a second
  // transition stacked on the first.
  if (section === 'library') goTo(gallery, false);
  // The five plants, running, in their own tiles. Loaded only as the library
  // nears the screen, so the overview itself stays as light as it was.
  const live = createLiveTiles(gallery.querySelector('.simgrid'), new Map(SIMULATORS.map(s => [s.id, s])));
  return {
    // Leaving the overview hands the preview renderer’s GPU context straight
    // back: the simulator being opened is about to want one.
    dispose() { live.dispose(); delete document.documentElement.dataset.page; },
    // The overview and the library are one page, so moving between them is a
    // scroll to the right place rather than a rebuild of the same page.
    navigate(route) {
      if (route.name === 'simulators') { goTo(gallery); return true; }
      if (route.name === 'home') {
        view.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
        return true;
      }
      return false;
    }
  };
}

/** The simulator library: the overview, opened at the five units. */
export function simulatorsPage(view) { return homePage(view, { section: 'library' }); }

/* --- pieces ---------------------------------------------------------------- */

/** One cell of the title block: what it records, then the figure. */
function cell(label, value) {
  return el('div', {}, [el('dt', { text: label }), el('dd', { text: String(value) })]);
}

/**
 * The sheet border. Two rules with the zone references between them — columns
 * 1 to 8 along the top and foot, rows A to D down the sides — and a centring
 * mark at the middle of each edge, as a drawing sheet is laid out (ISO 5457).
 * Decorative to a screen reader, so it is hidden from one.
 */
function plateFrame() {
  const zones = (n, cls, label) => el('div', { class: `zones ${cls}` },
    Array.from({ length: n }, (_, i) => el('span', { text: label(i) })));
  const num = i => String(i + 1), row = i => 'ABCD'[i];
  return el('div', { class: 'plate-frame', 'aria-hidden': 'true' }, [
    zones(8, 'z-top', num), zones(8, 'z-bottom', num),
    zones(4, 'z-left', row), zones(4, 'z-right', row),
    el('i', { class: 'cmark cm-t' }), el('i', { class: 'cmark cm-b' }),
    el('i', { class: 'cmark cm-l' }), el('i', { class: 'cmark cm-r' })
  ]);
}

function sectionHead(kicker, title, body) {
  // The kicker is no longer drawn: a tracked-capitals label over a heading
  // that already says the same thing is noise. The argument stays so the call
  // sites keep saying what each section is.
  return el('div', { class: 'sec-head', dataset: { section: kicker } }, [
    el('div', {}, [
      el('h2', { text: title }),
      el('p', { text: body })
    ])
  ]);
}

/**
 * The industrial still behind a tile.
 *
 * It is decoration, so it is aria-hidden and carries an empty alt: the tile
 * already says what the unit is in words, and a screen reader announcing "a
 * photograph of a water treatment plant" after that is noise.
 *
 * It arrives lazily, decodes off the main thread and fades in when it lands.
 * Until then the gradient placeholder underneath is what is on screen, in the
 * tile's own colour — so a tile that is still loading looks deliberate rather
 * than broken, and nothing moves when the picture arrives.
 */
function tilePhoto(id) {
  const src = backdropFor(id);
  if (!src) return null;
  const img = el('img', {
    class: 'tile-photo-img', src, alt: '', loading: 'lazy', decoding: 'async',
    dataset: { ready: 'false' }
  });
  const show = () => { img.dataset.ready = 'true'; };
  // A cached image can be complete before the listener is attached, in which
  // case no load event is ever coming.
  if (img.complete && img.naturalWidth) show();
  else img.addEventListener('load', show, { once: true });
  return el('div', { class: 'tile-photo', 'aria-hidden': 'true' }, [img]);
}

/**
 * One tile in the gallery. The whole tile is the link — a "launch" affordance
 * that is the only clickable part of a card is a smaller target pretending to
 * be a bigger one.
 */
function simTile(s, i) {
  const ready = s.state === 'complete';
  return el('a', {
    class: 'simtile',
    href: href.simulator(s.id),
    dataset: { state: s.state, id: s.id },
    style: `animation-delay:${40 + i * 55}ms`,
    'aria-label': `${s.name} — ${s.tagline}`
  }, [
    tilePhoto(s.id),
    previewNode(s.id),
    el('div', { class: 'tile-top' }, [
      el('span', { class: 'id', text: s.number }),
      el('div', {}, [
        el('h3', { text: s.name }),
        el('span', { class: 'cat', text: discipline(s.category) })
      ])
    ]),
    el('small', { text: s.tagline }),
    // What the unit holds, said as a sentence rather than as four boxed chips.
    // Every figure is one the verification harness checks against the module.
    s.counts ? el('p', { class: 'tile-facts', text: facts(s.counts) }) : null,
    // A state badge only where there is something to say: five units that are
    // all operational do not each need a label announcing it.
    el('div', { class: 'tile-foot' }, [
      ready ? el('span', { class: 'launch', text: 'Open the plant' })
        : el('span', { class: 'pill', text: STATE_LABEL[s.state] })
    ])
  ]);
}

/** "Separation · Physical chemistry" read as the phrase it is. */
function discipline(category = '') {
  return category.split(/\s*·\s*/).filter(Boolean)
    .map((part, i) => (i ? part.charAt(0).toLowerCase() + part.slice(1) : part)).join(', ');
}

const facts = c =>
  `${c.units} tagged units, ${c.faults} faults, ${c.challenges} graded challenges and ${c.tourSteps} tour steps`;

const CAPABILITIES = [
  { title: 'A plant you can walk around',
    text: 'A three.js scene per unit, built from a shared industrial geometry library and lit by a reflection probe. Equipment is selectable, streams animate only where the engine reports flow, and quality is measured rather than assumed — a governor watches what a frame actually costs and holds the frame rate.' },
  { title: 'A flowsheet that is the same state',
    text: 'ISA-style symbols with live stream values, direction arrows and marching dashes on flowing lines. Selection is two-way with the 3D plant, so the two views are one process seen twice rather than two drawings kept in step by hand.' },
  { title: 'Balances that have to close',
    text: 'Fixed-point and bisection solvers that report convergence honestly. A run that does not meet its tolerance says so, and an invalid one clears the previous result rather than leaving stale numbers looking current.' },
  { title: 'Six faults per unit, undiagnosed',
    text: 'Each fault carries the symptoms a control room would actually see, in the order it would see them — and deliberately not the cause. Working that out from the instruments is the exercise.' },
  { title: 'Every number carries its provenance',
    text: 'First-principles calculation, engineering correlation, educational approximation or reference value: each is declared in the model assumptions. Nothing on screen is filled in to make a panel look busy.' },
  { title: 'Verified, not asserted',
    text: 'A harness checks identity between engine, flowsheet and cards in both directions, the full contract, that no value leaks before a run, the neighbourhood of every base case, and twenty thousand random operating points per engine.' }
];

/**
 * One of the general notes. No icon: a cube beside "a plant you can walk
 * around" says nothing the words do not, and six of them in a grid is
 * decoration, not information.
 */
function capCard(c) {
  return el('div', { class: 'cap' }, [
    el('h4', { text: c.title }),
    el('p', { text: c.text })
  ]);
}

function siteFooter() {
  return el('footer', { class: 'sitefoot' }, [
    el('div', { class: 'foot-brand' }, [
      el('b', { text: 'ChemiLAB Simulator' }),
      el('p', { text: 'An interactive chemical-engineering virtual plant. A teaching tool: not a validated commercial process simulator, and not to be used for plant design.' })
    ]),
    el('div', {}, [
      el('h5', { text: 'Simulation modules' }),
      el('ul', {}, SIMULATORS.map(s =>
        el('li', {}, [el('a', { href: href.simulator(s.id), text: `${s.number} · ${s.name}` })])))
    ]),
    el('div', {}, [
      el('h5', { text: 'Built with' }),
      el('ul', {}, [
        el('li', {}, [el('span', { text: 'Vanilla ES modules · no framework' })]),
        el('li', {}, [el('span', { text: 'three.js — plant, lighting, post-processing' })]),
        el('li', {}, [el('span', { text: 'SVG — flowsheets, symbols, charts' })]),
        el('li', {}, [el('span', { text: 'Vite — build and static deployment' })]),
        el('li', {}, [el('span', { text: `Author — ${AUTHOR}` })])
      ])
    ])
  ]);
}

/* --- simulator route -------------------------------------------------------- */

export async function simulatorPage(view, id) {
  const entry = getSimulator(id);
  clear(view);
  delete document.documentElement.dataset.page;
  // The signature hue is set on the root before anything mounts, because the 3D
  // renderer reads it at construction to tint its lighting and its sky.
  document.documentElement.dataset.sim = id || '';
  invalidateTokens();

  if (!entry) {
    view.appendChild(el('div', { class: 'home' }, [
      el('div', { class: 'panel', style: 'margin:64px auto;max-width:520px' }, [
        el('header', {}, [el('span', { text: 'Not found' })]),
        el('div', { class: 'body' }, [
          el('div', { class: 'empty' }, [
            el('div', { class: 'glyph', html: icon('alert') }),
            el('b', { text: 'No such simulator' }),
            el('p', { text: `Nothing is registered under "${id}". The library has ${TOTALS.simulators} units in it.` }),
            el('a', { class: 'btn', href: href.home, html: `${icon('home')} Back to the overview` })
          ])
        ])
      ])
    ]));
    return {};
  }

  // A loading state that says which plant is being built and roughly what that
  // involves, rather than a spinner over an empty page. Building a scene means
  // compiling shaders and uploading textures, and on a slow machine that is
  // long enough to be worth explaining.
  view.appendChild(loadingCard(entry));

  const mod = (await entry.load()).default;
  if (!mod.engine) {
    clear(view).appendChild(placeholder(entry, mod));
    return {};
  }
  const { mountWorkspace } = await import('../ui/workspace.js'); // keeps three.js out of the initial bundle
  return mountWorkspace(view, mod);
}

function loadingCard(entry) {
  return el('div', { class: 'home', style: 'display:grid;place-items:center;min-height:60vh' }, [
    el('div', { class: 'panel', style: 'width:min(420px,100%)' }, [
      el('header', {}, [
        el('span', { text: `Unit ${entry.number}` }),
        el('span', { class: 'status', dataset: { s: 'CALCULATING' }, text: 'BUILDING' })
      ]),
      el('div', { class: 'body' }, [
        el('div', { class: 'working' }, [el('i')]),
        el('div', { style: 'font-size:var(--t-h3);font-weight:600;margin-bottom:6px', text: entry.name }),
        el('p', { style: 'margin:0;color:var(--ink-faint);font-size:var(--t-small);line-height:1.6',
          text: 'Loading the process model and building the plant — compiling shaders, generating the reflection probe and fusing the static geometry.' })
      ])
    ])
  ]);
}

function placeholder(entry, mod) {
  return el('div', { class: 'home' }, [
    el('div', { style: 'padding:56px 0 0' }, [
      el('span', { class: 'eyebrow', text: `Unit ${entry.number}` }),
      el('h1', { style: 'font-size:var(--t-h1);margin:0 0 10px', text: entry.name }),
      el('p', { class: 'lede', text: entry.tagline })
    ]),
    el('div', { class: 'panel' }, [
      el('header', {}, [el('span', { text: 'Status' }), el('span', { class: 'tag', text: STATE_LABEL[entry.state] })]),
      el('div', { class: 'body' }, [
        el('p', { style: 'margin-top:0;color:var(--ink-dim);font-size:var(--t-small);line-height:1.65', text: 'The process model for this unit has not been written yet. The shared framework — 3D renderer, flowsheet, controls, results rail, validation, scenarios, cases — is ready and waiting for it. No sample numbers are shown here, because showing invented process values would teach the wrong thing.' }),
        el('div', { class: 'sect', text: 'Planned scope' }),
        el('ul', { style: 'margin:0 0 0 16px;padding:0;color:var(--ink-dim);font-size:var(--t-small);line-height:1.7' },
          (mod.plannedScope || []).map(t => el('li', { text: t })))
      ])
    ]),
    el('p', { style: 'margin-top:18px' }, [el('a', { href: href.home, text: '← Back to the library' })]),
    signature({ compact: true })
  ]);
}
