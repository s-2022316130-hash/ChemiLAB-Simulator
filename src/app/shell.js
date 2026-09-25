import { el, clear } from '../shared/dom.js';
import { href } from './router.js';
import { getTheme, toggleTheme, onThemeChange } from '../shared/theme.js';
import { icon } from '../shared/icons.js';
import { viewTransition } from '../shared/motion.js';
// The mark is a real file rather than a string in here, so the same artwork is
// the masthead, the favicon and anything else that ever needs it. Inlined at
// build time, which is also what keeps the one-file build self-contained.
import logoMark from '../../assets/chemilab-logo.svg?raw';

/**
 * Application shell: the masthead and the view it frames.
 *
 * The masthead has one job beyond navigation — to say, at a glance and without
 * being read, which facility you are standing in. It does that three ways at
 * once: the breadcrumb names it, the hairline under the bar takes its colour,
 * and every accent on the page follows from the same token. None of those is
 * text you have to stop and read.
 *
 * It never wraps and never grows. A two-line header pushes the workspace down
 * the page, and the workspace is the product.
 */

const SIGNIFIER = 'Process simulation';

/** The tab icon, from the same artwork as the masthead. */
function setFavicon() {
  const link = document.querySelector('link[rel="icon"]') || el('link', { rel: 'icon' });
  link.type = 'image/svg+xml';
  link.href = `data:image/svg+xml,${encodeURIComponent(logoMark)}`;
  if (!link.isConnected) document.head.appendChild(link);
}

export function createShell(mount) {
  setFavicon();

  const view = el('main', { class: 'view' });

  const nav = el('nav', {}, [
    el('a', { href: href.home, text: 'Overview' }),
    el('a', { href: href.simulators, text: 'Simulators' })
  ]);

  // Breadcrumb: CHEMILAB / INDUSTRIAL DRYER / PROCESS SIMULATION. On the
  // overview it collapses to the product on its own, because there is no
  // location to report and a crumb trail of one item is noise.
  const crumbs = el('div', { class: 'crumbs' });

  const themeBtn = el('button', { class: 'iconbtn' });
  const paintThemeBtn = () => {
    const dark = getTheme() === 'dark';
    themeBtn.innerHTML = icon(dark ? 'sun' : 'moon');
    themeBtn.title = dark ? 'Switch to the light theme' : 'Switch to the dark theme';
    themeBtn.setAttribute('aria-label', themeBtn.title);
  };
  // The new theme spreads out from the button that asked for it. A cross-fade
  // would say "the page changed"; a reveal from the control says "you changed
  // it, from here" — which is the only thing a theme transition has to say.
  // The centre of the button rather than the pointer, so a keyboard press,
  // which has no pointer position, reveals from the same place a click does.
  themeBtn.addEventListener('click', () => {
    const r = themeBtn.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const reach = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const root = document.documentElement.style;
    root.setProperty('--vt-x', `${x}px`);
    root.setProperty('--vt-y', `${y}px`);
    root.setProperty('--vt-r', `${Math.ceil(reach)}px`);
    viewTransition('theme', () => toggleTheme());
  });
  onThemeChange(paintThemeBtn);
  paintThemeBtn();

  const top = el('header', { class: 'topbar' }, [
    el('a', { class: 'brand', href: href.home, title: 'ChemiLAB Simulator' }, [
      // aria-hidden: the wordmark beside it already names the product, and a
      // link that reads "ChemiLAB ChemiLAB Virtual plant" helps nobody.
      el('span', { class: 'mark', html: logoMark, 'aria-hidden': 'true' }),
      el('span', { class: 'wordmark' }, [
        el('b', { text: 'ChemiLAB' }),
        el('span', { text: 'Virtual plant' })
      ])
    ]),
    nav,
    el('div', { class: 'spacer' }),
    crumbs,
    themeBtn
  ]);

  mount.append(top, view);

  // One indicator for the whole nav, which slides to whichever page is
  // current, rather than an underline drawn under each link in turn. Two
  // underlines that swap say "this one now, that one before"; one that moves
  // says "you went from there to here", which is what navigating is.
  //
  // It is placed without a transition the first time, or every page load
  // would open with the indicator sliding in from the left edge.
  function placeIndicator() {
    const a = nav.querySelector('a[aria-current="page"]');
    nav.style.setProperty('--nav-on', a ? '1' : '0');
    if (!a) return;
    nav.style.setProperty('--nav-x', `${a.offsetLeft}px`);
    nav.style.setProperty('--nav-w', `${a.offsetWidth}px`);
    if (!nav.dataset.ready) requestAnimationFrame(() => { nav.dataset.ready = 'true'; });
  }
  // The links change padding at narrow widths, so the indicator is placed again
  // whenever the nav changes size rather than only when the route changes.
  if (typeof ResizeObserver === 'function') new ResizeObserver(placeIndicator).observe(nav);

  return {
    view,
    setRoute(route, title) {
      [...nav.children].forEach(a => a.removeAttribute('aria-current'));
      nav.children[route.name === 'home' ? 0 : 1]?.setAttribute('aria-current', 'page');
      placeIndicator();

      clear(crumbs);
      if (title) {
        crumbs.append(
          el('i', { text: '/' }),
          el('span', { class: 'here', text: title }),
          el('i', { class: 'leaf', text: '/' }),
          el('span', { class: 'leaf', text: SIGNIFIER })
        );
      } else {
        crumbs.appendChild(el('span', { class: 'leaf', text: 'Five process units' }));
      }
    },
    clearView: () => clear(view)
  };
}
