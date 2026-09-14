import { el, clear } from '../shared/dom.js';
import { href } from './router.js';
import { getTheme, toggleTheme, onThemeChange } from '../shared/theme.js';

const SUN = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.4M12 19.6V22M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2 12h2.4M19.6 12H22M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1Z"/></svg>';

export function createShell(mount) {
  const view = el('main', { class: 'view' });
  const nav = el('nav', {}, [
    el('a', { href: href.home, text: 'Home' }),
    el('a', { href: href.simulators, text: 'Simulators' })
  ]);
  const context = el('span', { class: 'tag', text: 'no simulator loaded' });

  // Theme switch. It shows the theme it will move to, which is the convention
  // people already read these controls by.
  const themeBtn = el('button', { class: 'iconbtn' });
  const paintThemeBtn = () => {
    const dark = getTheme() === 'dark';
    themeBtn.innerHTML = dark ? SUN : MOON;
    themeBtn.title = dark ? 'Switch to the light theme' : 'Switch to the dark theme';
    themeBtn.setAttribute('aria-label', themeBtn.title);
  };
  themeBtn.addEventListener('click', () => toggleTheme());
  onThemeChange(paintThemeBtn);
  paintThemeBtn();

  const top = el('header', { class: 'topbar' }, [
    el('div', { class: 'brand' }, [
      el('span', { class: 'mark', text: 'CL' }),
      el('span', { class: 'wordmark' }, [
        el('b', { text: 'ChemiLAB Simulator' }),
        el('span', { text: 'Chemical engineering virtual plant' })
      ])
    ]),
    nav, el('div', { class: 'spacer' }), context, themeBtn
  ]);
  mount.append(top, view);
  return {
    view,
    setRoute(route, title) {
      [...nav.children].forEach(a => a.removeAttribute('aria-current'));
      const target = route.name === 'home' ? 0 : 1;
      nav.children[target]?.setAttribute('aria-current', 'page');
      context.textContent = title || 'no simulator loaded';
    },
    clearView: () => clear(view)
  };
}
