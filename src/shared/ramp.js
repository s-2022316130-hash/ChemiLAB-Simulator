import { token } from './theme.js';

/**
 * The colour ramp for engine-declared colour modes.
 *
 * One rule governs this file: it converts a number the engine reported into a
 * colour, and it never decides what the number means. The value, its unit and
 * the domain it is read against all come from `engine.colourModes`; what
 * happens here is a lookup and an interpolation, which is presentation.
 *
 * The domain is fixed by the engine rather than taken from the run. That is the
 * decision this whole feature stands on. A ramp stretched to fit whatever the
 * current case happens to contain makes every plant look equally hot, hides the
 * difference between a cold start and a runaway, and makes two runs impossible
 * to compare by eye — which is the one thing shading a plant by a number is
 * for. A fixed scale means the dryer at 600 °C is the same red every time, and
 * that turning the heater down visibly cools the drawing.
 */
const STOPS = ['--ramp-1', '--ramp-2', '--ramp-3', '--ramp-4', '--ramp-5'];

let cache = null, cacheKey = '';

/** Ramp colours for the current theme, re-read only when the theme changes. */
function stops() {
  const key = document.documentElement.dataset.theme || 'dark';
  if (key !== cacheKey) {
    cacheKey = key;
    cache = STOPS.map(t => rgb(token(t, '#888888')));
  }
  return cache;
}

/** Whatever the token resolved to, as three 0–255 channels. */
function rgb(css) {
  const s = String(css).trim();
  const hex = s.replace('#', '');
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return [0, 1, 2].map(i => parseInt(hex[i] + hex[i], 16));
  }
  const m = s.match(/-?\d+(\.\d+)?/g);
  return m && m.length >= 3 ? m.slice(0, 3).map(n => Math.round(Number(n))) : [136, 136, 136];
}

const hex2 = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

/**
 * Where a reading sits on its mode's scale, 0 to 1, or null if there is none.
 *
 * A value outside the declared domain clamps to the end rather than extending
 * it. The domain is the range the model was validated over, so a reading past
 * it is already being reported as an alarm elsewhere; stretching the scale to
 * swallow it would quietly rescale every other unit in the plant to accommodate
 * one that is out of bounds.
 */
export function position(value, mode) {
  if (!mode || !Number.isFinite(value)) return null;
  const [lo, hi] = mode.domain || [0, 1];
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi === lo) return null;
  if (mode.scale === 'log') {
    // A log scale cannot show zero or a negative reading. Clamping into the
    // domain first means a true zero shades as the bottom of the scale, which
    // is where it belongs, rather than disappearing.
    const c = Math.max(Math.min(value, hi), Math.max(lo, Number.MIN_VALUE));
    return (Math.log10(c) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo));
  }
  return Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
}

/** The ramp colour at 0..1, as `#rrggbb`. */
export function rampAt(t) {
  const s = stops();
  const k = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0)) * (s.length - 1);
  const i = Math.min(Math.floor(k), s.length - 2);
  const f = k - i;
  const a = s[i], b = s[i + 1];
  return `#${hex2(a[0] + (b[0] - a[0]) * f)}${hex2(a[1] + (b[1] - a[1]) * f)}${hex2(a[2] + (b[2] - a[2]) * f)}`;
}

/** The colour for a unit with no reading on this scale. Not a low reading. */
export const rampNone = () => token('--ramp-none', '#5d6878');

/** A CSS gradient across the whole ramp, for the legend. */
export const rampGradient = () =>
  `linear-gradient(90deg, ${STOPS.map(t => token(t, '#888')).join(', ')})`;

/**
 * The colour for every tag under one mode, straight from the equipment state.
 *
 * Returns `{tag: '#rrggbb' | null}`. A null means "no reading" and the views
 * leave that unit in its own colours rather than shading it as though it had
 * reported a zero — a compressor with no temperature in the model is not a cold
 * compressor, and a plant that draws it as one is lying quietly.
 */
export function colourFor(mode, equipment) {
  const out = {};
  if (!mode || mode.kind !== 'scale') return out;
  for (const [tag, entry] of Object.entries(equipment || {})) {
    const v = entry?.metrics?.[mode.metric];
    const t = position(v, mode);
    out[tag] = t === null ? null : rampAt(t);
  }
  return out;
}
