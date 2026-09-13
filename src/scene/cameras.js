// Camera presets are declared by each plant module, not hard-coded here.
export const PRESET_ORDER = ['overview', 'feed', 'main', 'separation', 'utilities', 'products', 'control'];
export const PRESET_LABEL = {
  overview: 'Overview', feed: 'Feed', main: 'Main process', separation: 'Separation',
  utilities: 'Utilities', products: 'Products', control: 'Control room'
};
export function createCameraPresets(view, presets) {
  return {
    list: () => Object.keys(presets).sort((a, b) => PRESET_ORDER.indexOf(a) - PRESET_ORDER.indexOf(b))
      .map(id => ({ id, label: PRESET_LABEL[id] || presets[id].label || id })),
    go(id) { const p = presets[id]; if (p) view.flyTo(p.pos, p.target); }
  };
}
