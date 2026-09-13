import { Status } from './contract.js';
/**
 * Successive-substitution solver for recycle loops. Reports honest convergence:
 * it never returns converged:true unless the residual actually met the tolerance.
 */
export function fixedPoint(x0, step, { tol = 1e-5, maxIter = 100, relax = 1 } = {}) {
  let x = x0, residual = Infinity, i = 0, history = [];
  for (; i < maxIter; i++) {
    const xn = step(x);
    residual = norm(xn, x);
    history.push(residual);
    x = blend(x, xn, relax);
    if (residual < tol) return { x, converged: true, iterations: i + 1, residual, history };
  }
  return { x, converged: false, iterations: i, residual, history };
}
const asArr = v => (typeof v === 'number' ? [v] : Object.values(v));
function norm(a, b) {
  const A = asArr(a), B = asArr(b);
  return Math.sqrt(A.reduce((s, v, i) => s + ((v - B[i]) / (Math.abs(B[i]) > 1e-9 ? B[i] : 1)) ** 2, 0) / A.length);
}
function blend(x, xn, r) {
  if (typeof x === 'number') return x + r * (xn - x);
  const out = {}; for (const k of Object.keys(xn)) out[k] = x[k] + r * (xn[k] - x[k]); return out;
}
export function bisect(f, lo, hi, { tol = 1e-6, maxIter = 80 } = {}) {
  let flo = f(lo), fhi = f(hi);
  if (flo * fhi > 0) return { x: null, converged: false, iterations: 0, residual: null, reason: 'No sign change on the bracket — the specification is outside the feasible range of this model.' };
  let mid = lo, i = 0;
  for (; i < maxIter; i++) {
    mid = 0.5 * (lo + hi); const fm = f(mid);
    if (Math.abs(fm) < tol || (hi - lo) / 2 < tol) return { x: mid, converged: true, iterations: i + 1, residual: Math.abs(fm) };
    if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
  }
  return { x: mid, converged: false, iterations: i, residual: Math.abs(f(mid)) };
}
export const statusFromSolve = (s, hasWarn) =>
  !s.converged ? Status.ERROR : hasWarn ? Status.WARNING : Status.COMPLETE;
