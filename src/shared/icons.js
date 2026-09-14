/**
 * Line icon set.
 *
 * One stroke weight, one corner treatment, one 24-unit grid — an icon set that
 * is not consistent is worse than no icons at all, because the eye reads the
 * inconsistency before it reads the meaning.
 *
 * Everything here is drawn from process-plant vocabulary rather than from
 * generic interface symbols: the plant icon is a vessel with a column beside
 * it, the diagram icon is a flowsheet node with connections, the results icon
 * is a trend. That is a small thing that makes the product feel like it belongs
 * to its subject.
 *
 * Each export is a path fragment. `icon()` wraps it; the stroke colour is
 * always currentColor, so an icon takes the colour of whatever contains it.
 */
const P = {
  // --- navigation ----------------------------------------------------------
  home: '<path d="M3.6 10.4 12 3.7l8.4 6.7"/><path d="M5.6 9v10.3h12.8V9"/><path d="M9.7 19.3v-5.5h4.6v5.5"/>',
  grid: '<rect x="3.4" y="3.4" width="7" height="7" rx="1.4"/><rect x="13.6" y="3.4" width="7" height="7" rx="1.4"/><rect x="3.4" y="13.6" width="7" height="7" rx="1.4"/><rect x="13.6" y="13.6" width="7" height="7" rx="1.4"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  arrow: '<path d="M5 12h13"/><path d="m12.6 6.2 5.9 5.8-5.9 5.8"/>',
  chevron: '<path d="m9 5.5 6.5 6.5L9 18.5"/>',
  down: '<path d="M12 5.5v13"/><path d="m6.2 12.6 5.8 5.9 5.8-5.9"/>',

  // --- workspace sections --------------------------------------------------
  plant: '<path d="M3.6 20.4h16.8"/><rect x="4.4" y="9" width="5.4" height="11.4" rx="1.2"/><path d="M4.4 12.6h5.4"/><rect x="13.4" y="4.4" width="4.6" height="16" rx="2.3"/><path d="M13.4 9h4.6M13.4 13.4h4.6"/><path d="M9.8 16.2h3.6"/>',
  diagram: '<circle cx="5.2" cy="6.4" r="2.3"/><rect x="14" y="4.1" width="5.8" height="4.6" rx="1.2"/><circle cx="18.8" cy="17.8" r="2.3"/><rect x="4.2" y="15.5" width="5.8" height="4.6" rx="1.2"/><path d="M7.5 6.4H14M17 8.7v6.8M14.5 17.8h1.9M7.1 15.5V8.7"/>',
  sliders: '<path d="M4 7.4h9.5M17.8 7.4H20"/><circle cx="15.6" cy="7.4" r="2.2"/><path d="M4 16.6h3.2M11.5 16.6H20"/><circle cx="9.3" cy="16.6" r="2.2"/>',
  trend: '<path d="M4 4.2v15.6h16"/><path d="m7 15.2 3.4-4.3 2.8 2.3 4.4-6"/><circle cx="10.4" cy="10.9" r="1"/><circle cx="13.2" cy="13.2" r="1"/>',

  // --- actions -------------------------------------------------------------
  play: '<path d="M7.5 5.4 18.6 12 7.5 18.6Z"/>',
  reset: '<path d="M4.6 10.3a7.6 7.6 0 1 1 .5 5.4"/><path d="M3.6 5.4v5.2h5.2"/>',
  spinner: '<path d="M12 4.2a7.8 7.8 0 1 1-7.5 5.6"/>',
  save: '<path d="M5.2 4.6h10.4l3.2 3.2v11.6H5.2Z"/><path d="M8.4 4.6v5h6.2v-5"/><rect x="8" y="13" width="8" height="6.4"/>',
  download: '<path d="M12 3.8v10.6"/><path d="m7.4 10.2 4.6 4.4 4.6-4.4"/><path d="M4.6 17.4v2.8h14.8v-2.8"/>',

  // --- meaning -------------------------------------------------------------
  gauge: '<path d="M4.2 17.6a8.4 8.4 0 1 1 15.6 0"/><path d="m12 17.6 4.1-5.6"/><circle cx="12" cy="17.6" r="1.3"/>',
  layers: '<path d="m12 3.6 8.4 4.4-8.4 4.4-8.4-4.4Z"/><path d="m4.6 12.4 7.4 3.9 7.4-3.9"/><path d="m4.6 16.6 7.4 3.9 7.4-3.9"/>',
  check: '<path d="m5 12.6 4.6 4.6L19 7.4"/>',
  alert: '<path d="M12 4.4 21 19.6H3Z"/><path d="M12 10v4.2"/><circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none"/>',
  info: '<circle cx="12" cy="12" r="8.4"/><path d="M12 11v5.4"/><circle cx="12" cy="7.9" r=".95" fill="currentColor" stroke="none"/>',
  flask: '<path d="M9.6 3.6h4.8"/><path d="M10.6 3.6v6L5.2 18.2a1.7 1.7 0 0 0 1.5 2.6h10.6a1.7 1.7 0 0 0 1.5-2.6L13.4 9.6v-6"/><path d="M7.8 14.6h8.4"/>',
  cube: '<path d="m12 3.4 7.8 4.3v8.6L12 20.6l-7.8-4.3V7.7Z"/><path d="m4.2 7.7 7.8 4.3 7.8-4.3M12 12v8.6"/>',
  book: '<path d="M4.4 4.6h5.2A2.4 2.4 0 0 1 12 7v13a2 2 0 0 0-2-1.8H4.4Z"/><path d="M19.6 4.6h-5.2A2.4 2.4 0 0 0 12 7v13a2 2 0 0 1 2-1.8h5.6Z"/>',
  shield: '<path d="M12 3.6 5 6.2v5.4c0 4.3 2.9 7.3 7 8.8 4.1-1.5 7-4.5 7-8.8V6.2Z"/><path d="m9 12.1 2.2 2.2 4-4.2"/>',
  target: '<circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="3.6"/><path d="M12 1.8v3.4M12 18.8v3.4M1.8 12h3.4M18.8 12h3.4"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.4M12 19.6V22M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2 12h2.4M19.6 12H22M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7"/>',
  moon: '<path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1Z"/>',
  cursor: '<path d="m6.2 4.4 12 6.6-5.2 1.5-1.6 5.3Z"/>'
};

/** An icon as an SVG string, sized by the CSS around it. */
export function icon(name, { size = null } = {}) {
  const d = P[name];
  if (!d) return '';
  const dim = size ? ` width="${size}" height="${size}"` : '';
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"${dim}>${d}</svg>`;
}

export const ICONS = P;
export default icon;
