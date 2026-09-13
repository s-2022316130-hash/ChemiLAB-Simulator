// Hash router: works from a static host and from file://, no server rewrite needed.
export function createRouter(routes, render) {
  function parse() {
    const raw = location.hash.replace(/^#\/?/, '');
    const parts = raw.split('/').filter(Boolean);
    if (!parts.length) return { name: 'home', params: {} };
    if (parts[0] === 'simulators' && parts[1]) return { name: 'simulator', params: { id: parts[1] } };
    if (parts[0] === 'simulators') return { name: 'simulators', params: {} };
    return { name: 'home', params: {} };
  }
  let current = null;
  async function handle() {
    const route = parse();
    current?.dispose?.();
    current = await routes[route.name](route.params);
    render(route, current);
  }
  addEventListener('hashchange', handle);
  return { start: handle, get route() { return parse(); }, go: path => { location.hash = path; } };
}
export const href = {
  home: '#/', simulators: '#/simulators', simulator: id => `#/simulators/${id}`
};
