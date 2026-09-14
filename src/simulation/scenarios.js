// Shared scenario/fault framework. Engines decide how a fault propagates.
export const MODES = [
  { id: 'base', name: 'Base case', description: 'Design conditions for this unit.' },
  { id: 'normal', name: 'Normal operation', description: 'Operator adjusts within the normal envelope.' },
  { id: 'optimisation', name: 'Optimisation', description: 'Meet the specification at lower energy or cost.' },
  { id: 'fault', name: 'Upset / fault', description: 'Introduce a process problem and diagnose it.' }
];
// fault = {id, name, description, appliesTo: tag, apply(inputs)->inputs, expectedSymptoms[]}
export function createScenarioSet(faults = [], challenges = []) {
  return {
    modes: MODES, faults, challenges,
    applyFaults(inputs, active = []) {
      return active.reduce((acc, id) => {
        const f = faults.find(x => x.id === id);
        return f ? f.apply({ ...acc }) : acc;
      }, { ...inputs });
    },
    getFault: id => faults.find(f => f.id === id) || null
  };
}
// challenge = {id, title, target:{key, op:'<='|'>='|'~', value, unit}, hint}
export function gradeChallenge(challenge, result) {
  // A results entry is {label, value, unit, digits}; older engines may expose a
  // bare number. Read the calculated value either way, and treat a field that was
  // never calculated as ungraded rather than as a failure.
  const entry = result?.results?.[challenge.target.key];
  const v = entry !== null && typeof entry === 'object' ? entry.value : entry;
  if (v === null || v === undefined || Number.isNaN(v) || typeof v !== 'number') return { graded: false, detail: 'Run the simulation to be graded.', text: 'Run the simulation to be graded.' };
  const { op, value, unit } = challenge.target;
  const pass = op === '<=' ? v <= value : op === '>=' ? v >= value : Math.abs(v - value) <= (challenge.target.tol ?? 0.05 * value);
  // `detail` is the reading on its own, for anywhere the title is already on
  // screen; `text` keeps the title for anywhere it is not.
  const detail = `${v.toFixed(2)} ${unit} against a target of ${op === '<=' ? 'no more than' : op === '>=' ? 'at least' : 'about'} ${value} ${unit}`;
  return { graded: true, pass, detail, text: `${challenge.title}: ${detail}` };
}
