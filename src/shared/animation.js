// One shared rAF loop. Rendering/animation is decoupled from the solver.
const tasks = new Set();
let running = false, last = 0;
function frame(t) {
  const dt = Math.min((t - last) / 1000, 0.1); last = t;
  for (const fn of tasks) fn(dt, t / 1000);
  if (tasks.size) requestAnimationFrame(frame); else running = false;
}
export function onFrame(fn) {
  tasks.add(fn);
  if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
  return () => tasks.delete(fn);
}
// Adaptive quality: drops tracer density when frame time degrades.
export function createQualityGovernor({ target = 45 } = {}) {
  let fps = 60, quality = 1;
  const off = onFrame(dt => {
    if (dt > 0) fps += ((1 / dt) - fps) * 0.05;
    if (fps < target && quality > 0.35) quality -= 0.01;
    else if (fps > target + 12 && quality < 1) quality += 0.005;
  });
  return { get fps() { return fps; }, get quality() { return quality; }, dispose: off };
}
