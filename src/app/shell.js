import { el, clear } from '../shared/dom.js';
import { href } from './router.js';
export function createShell(mount) {
  const view = el('main', { class: 'view' });
  const nav = el('nav', {}, [
    el('a', { href: href.home, text: 'Home' }),
    el('a', { href: href.simulators, text: 'Simulators' })
  ]);
  const context = el('span', { class: 'tag', text: 'no simulator loaded' });
  const top = el('header', { class: 'topbar' }, [
    el('div', { class: 'brand' }, [el('b', { text: 'ChemiLAB Simulator' }), el('span', { text: 'Chemical engineering virtual plant · simulation laboratory' })]),
    nav, el('div', { class: 'spacer' }), context
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
