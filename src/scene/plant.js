/**
 * Plant module contract — each simulator supplies one.
 * build(view) -> { streams, presets, tags[] }
 * applyState(equipmentState, streamState) -> void   // engine data in, visuals out
 * Plants must not compute process values; they only visualise what they are given.
 */
export function assertPlant(p) {
  for (const m of ['build', 'applyState']) if (typeof p[m] !== 'function') throw new Error(`Plant module missing ${m}()`);
  return p;
}
