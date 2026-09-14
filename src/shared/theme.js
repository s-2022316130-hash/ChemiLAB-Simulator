/**
 * Theme control and design-token access.
 *
 * One source of truth for colour: the tokens live in theme.css, and anything
 * that needs a colour outside CSS — the 3D renderer, the caption plates, the
 * flowsheet — reads it from here rather than repeating a hex. That is what
 * keeps the plant and the interface the same shade of the same colour.
 *
 * Dark is the default, because a control room is a dark room: an instrument is
 * read as a luminous mark on a deep ground, and that is the register this
 * belongs to. Light is a second, deliberately designed environment rather than
 * an inversion of it. The choice is remembered per browser, and the system
 * preference is only consulted the first time, before a choice has been made.
 */
const KEY = 'chemilab.theme.v1';
const THEMES = ['light', 'dark'];
const listeners = new Set();

function stored() {
  try { const v = localStorage.getItem(KEY); return THEMES.includes(v) ? v : null; }
  catch { return null; }
}
function systemPreference() {
  // Only an explicit system preference for light moves off the default.
  try { return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; }
  catch { return 'dark'; }
}

/** The theme in force, whether it was chosen, inherited or defaulted. */
export function getTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/**
 * Apply a theme. Everything that cannot be expressed in CSS — the 3D scene
 * above all — subscribes rather than polling, so one switch repaints the
 * whole application in step.
 */
export function setTheme(theme, { persist = true } = {}) {
  const next = THEMES.includes(theme) ? theme : 'dark';
  document.documentElement.dataset.theme = next;
  document.documentElement.style.colorScheme = next;
  if (persist) { try { localStorage.setItem(KEY, next); } catch { /* private mode: honour it for this session only */ } }
  for (const fn of listeners) fn(next);
  return next;
}

export function toggleTheme() { return setTheme(getTheme() === 'dark' ? 'light' : 'dark'); }

export function onThemeChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Called once at start-up, before the first paint of anything themed. */
export function initTheme() {
  return setTheme(stored() ?? systemPreference(), { persist: false });
}

// --- token access ----------------------------------------------------------
// Reading a custom property is a layout-free lookup, but it is not free, so
// results are cached per theme and the cache is dropped whenever the theme or
// the active simulator changes.
let cache = new Map(), cacheKey = '';
function tokens() {
  const key = `${getTheme()}|${document.documentElement.dataset.sim || ''}`;
  if (key !== cacheKey) { cache = new Map(); cacheKey = key; }
  return cache;
}

/** A design token as a CSS colour string. Returns `fallback` if it is not set. */
export function token(name, fallback = '#000000') {
  const c = tokens();
  if (c.has(name)) return c.get(name);
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const out = v || fallback;
  c.set(name, out);
  return out;
}

/** A numeric token — light intensities, exposure, bloom strength. */
export function tokenNumber(name, fallback = 1) {
  const v = parseFloat(token(name, ''));
  return Number.isFinite(v) ? v : fallback;
}

/** Drop the token cache. Called when the simulator hue changes. */
export function invalidateTokens() { cache = new Map(); cacheKey = ''; }
