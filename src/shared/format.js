export const EMPTY = '—';
// Never invent a number. null/undefined/NaN renders as em dash.
export function num(v, digits = 2) {
  if (v === null || v === undefined || Number.isNaN(v)) return EMPTY;
  if (!Number.isFinite(v)) return EMPTY;
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e6 || a < 1e-3)) return v.toExponential(2);
  return v.toFixed(digits);
}
export function val(v, unit, digits = 2) {
  const s = num(v, digits);
  return s === EMPTY ? EMPTY : `${s} ${unit ?? ''}`.trim();
}
export function isEmpty(v){ return v === null || v === undefined || Number.isNaN(v); }
export function pct(v, digits = 1){ return num(v, digits) === EMPTY ? EMPTY : `${num(v,digits)} %`; }
export function stamp(d = new Date()){ return d.toISOString().replace('T',' ').slice(0,19); }
export function slug(s){ return String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }
