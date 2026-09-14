import { el, clear } from '../shared/dom.js';
import { href } from './router.js';
import { getTheme, toggleTheme, onThemeChange } from '../shared/theme.js';
import { icon } from '../shared/icons.js';

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

export function createShell(mount) {
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
  themeBtn.addEventListener('click', () => toggleTheme());
  onThemeChange(paintThemeBtn);
  paintThemeBtn();

  const top = el('header', { class: 'topbar' }, [
    el('a', { class: 'brand', href: href.home, title: 'ChemiLAB Simulator' }, [
      el('span', { class: 'mark', text: 'CL' }),
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

  return {
    view,
    setRoute(route, title) {
      [...nav.children].forEach(a => a.removeAttribute('aria-current'));
      nav.children[route.name === 'home' ? 0 : 1]?.setAttribute('aria-current', 'page');

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
