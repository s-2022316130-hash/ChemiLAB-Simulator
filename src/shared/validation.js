// Validation framework. Rules explain the ENGINEERING reason for rejection.
// Engines must never silently clamp an invalid input.
export const rules = {
  required: () => v => (v === null || v === undefined || v === '' || Number.isNaN(v))
    ? 'Value required — the balance cannot be closed without it.' : null,
  positive: (what = 'Flow') => v => v <= 0 ? `${what} must be greater than zero; a non-positive flow has no physical meaning here.` : null,
  nonNegative: (what = 'Value') => v => v < 0 ? `${what} cannot be negative.` : null,
  range: (lo, hi, unit = '', why = '') => v => (v < lo || v > hi)
    ? `Outside the validated model range ${lo}–${hi} ${unit}${why ? '. ' + why : '.'}` : null,
  max: (hi, unit = '', why = '') => v => v > hi ? `Above ${hi} ${unit}${why ? '. ' + why : '.'}` : null,
  min: (lo, unit = '', why = '') => v => v < lo ? `Below ${lo} ${unit}${why ? '. ' + why : '.'}` : null
};
// Fractions must close. tol is absolute.
export function fractionsSumTo(obj, target = 1, tol = 1e-6) {
  const s = Object.values(obj).reduce((a, b) => a + b, 0);
  return Math.abs(s - target) > tol
    ? `Composition sums to ${s.toFixed(6)}; it must sum to ${target} for a closed component balance.` : null;
}
// spec: { key: { label, rules:[fn], unit } }
export function validate(spec, inputs) {
  const errors = {};
  for (const [key, def] of Object.entries(spec)) {
    for (const r of def.rules || []) {
      const msg = r(inputs[key], inputs);
      if (msg) { errors[key] = `${def.label}: ${msg}`; break; }
    }
  }
  return { ok: Object.keys(errors).length === 0, errors };
}
