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
/**
 * `tol` is the residual tolerance, in the units of f. `xtol` is a separate floor on
 * the bracket width, in the units of x, and defaults to machine precision. The two
 * measure different things and must not share a number: a bracket floor set to the
 * residual tolerance stops the search long before the residual it was asked for was
 * ever met, and the result then reports as not converged when it simply stopped early.
 */
export function bisect(f, lo, hi, { tol = 1e-6, maxIter = 80, xtol = null } = {}) {
  const xEps = xtol ?? Math.max(Math.abs(lo), Math.abs(hi), 1) * 1e-14;
  // |f| after each evaluation the search actually used, so the approach to the
  // root can be shown rather than summarised by its last value. It costs one
  // push per iteration and it is the difference between "converged in 41" and
  // seeing that the residual fell like a stone and then sat on a shelf.
  const history = [];
  let flo = f(lo), fhi = f(hi);
  // A root sitting exactly on an endpoint is still a root. Without these two checks
  // the sign test below cannot bracket it — flo*fm is zero rather than negative — so
  // the interval walks away from the answer and reports a residual it never met.
  if (Math.abs(flo) < tol) return { x: lo, converged: true, iterations: 0, residual: Math.abs(flo), history: [Math.abs(flo)] };
  if (Math.abs(fhi) < tol) return { x: hi, converged: true, iterations: 0, residual: Math.abs(fhi), history: [Math.abs(fhi)] };
  if (flo * fhi > 0) return { x: null, converged: false, iterations: 0, residual: null, history, reason: 'No sign change on the bracket — the specification is outside the feasible range of this model.' };
  let mid = lo, i = 0;
  for (; i < maxIter; i++) {
    mid = 0.5 * (lo + hi); const fm = f(mid);
    history.push(Math.abs(fm));
    // The bracket collapsing is a reason to stop, but it is not on its own a reason to
    // claim convergence: a discontinuous residual can pinch to nothing while still
    // sitting far from zero. Only the tolerance actually being met counts.
    if (Math.abs(fm) < tol || (hi - lo) / 2 < xEps) {
      return { x: mid, converged: Math.abs(fm) < tol, iterations: i + 1, residual: Math.abs(fm), history };
    }
    if (flo * fm <= 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
  }
  return { x: mid, converged: false, iterations: i, residual: Math.abs(f(mid)), history };
}

/**
 * A convergence trace, in the shape `Result.convergence` carries.
 *
 * The solver knows the numbers; only the engine knows what they mean. Rather
 * than let five engines each invent a slightly different object, they call this
 * and supply the two things the solver cannot know: what was being iterated and
 * what its residual measures. `tol` is passed in rather than read back off the
 * solve because a solver is not obliged to remember what it was asked for, and
 * a tolerance line drawn from a guess would be worse than no line.
 *
 * A solve with no history — an analytic branch, or a root sitting on an
 * endpoint — returns a trace with an empty history rather than nothing at all.
 * "Solved without iterating" is a real answer and the rail should be able to
 * say it.
 */
export function trace(id, label, what, tol, solve) {
  if (!solve) return null;
  return {
    id, label, what, tol,
    history: Array.isArray(solve.history) ? solve.history.filter(Number.isFinite) : [],
    converged: solve.converged === true,
    iterations: Number.isFinite(solve.iterations) ? solve.iterations : null,
    residual: Number.isFinite(solve.residual) ? solve.residual : null
  };
}
export const statusFromSolve = (s, hasWarn) =>
  !s.converged ? Status.ERROR : hasWarn ? Status.WARNING : Status.COMPLETE;
