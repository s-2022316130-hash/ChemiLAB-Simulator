// Shared chemical-engineering terminology. Simulators extend with their own terms.
export const TERMS = {
  'mass balance': 'Accounting of mass entering, leaving and accumulating in a control volume. At steady state, in = out.',
  'energy balance': 'Accounting of enthalpy and work crossing a control volume boundary at steady state.',
  'residence time': 'Average time a fluid element spends inside a vessel: V/Q for ideal plug flow or a well-mixed tank.',
  'pressure drop': 'Loss of mechanical energy along a flow path from friction and fittings.',
  'recycle': 'A stream returned upstream to improve conversion or recovery; it makes the balance implicit and requires iteration.',
  'convergence': 'The iterative solution stopped changing within a stated tolerance. Without it, results are not trustworthy.',
  'specification': 'A required product property the process must meet, e.g. outlet moisture or residual turbidity.',
  'turndown': 'Ratio between maximum and minimum stable throughput of a unit.'
};
export function lookup(term) { return TERMS[term.toLowerCase()] ?? null; }
