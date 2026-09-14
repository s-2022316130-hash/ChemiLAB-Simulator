/**
 * The gallery backdrops.
 *
 * Each tile in the library carries a wide industrial still behind its text. The
 * stills are not stock photography — they are renders of the five plants the
 * tiles actually open, taken by tools/backdrops.js through the same three.js
 * scene, reflection probe and tone mapping the simulator uses. So the vessels
 * behind "Water Treatment Plant" are that plant's vessels, and a plant that
 * gets rebuilt is re-photographed rather than drifting away from a picture
 * nobody can update.
 *
 * Two sizes exist and the right one is chosen here, in script, rather than by
 * handing the browser a `srcset`. That is not a preference: the one-file build
 * inlines these as `data:` URIs, and a data URI cannot go in a srcset — the
 * comma after `;base64` is the attribute's own separator, so the browser reads
 * one image as two malformed candidates. Choosing once, up front, also means a
 * phone never starts a download of the 1600-wide file at all.
 */
import waterWide from '../../assets/plant-bg/water-treatment.webp';
import waterSmall from '../../assets/plant-bg/water-treatment@sm.webp';
import dryerWide from '../../assets/plant-bg/industrial-dryer.webp';
import dryerSmall from '../../assets/plant-bg/industrial-dryer@sm.webp';
import fertWide from '../../assets/plant-bg/fertilizer.webp';
import fertSmall from '../../assets/plant-bg/fertilizer@sm.webp';
import paintWide from '../../assets/plant-bg/paint.webp';
import paintSmall from '../../assets/plant-bg/paint@sm.webp';
import gasWide from '../../assets/plant-bg/gas-processing.webp';
import gasSmall from '../../assets/plant-bg/gas-processing@sm.webp';

const BACKDROPS = {
  'water-treatment': { wide: waterWide, small: waterSmall },
  'industrial-dryer': { wide: dryerWide, small: dryerSmall },
  'fertilizer': { wide: fertWide, small: fertSmall },
  'paint': { wide: paintWide, small: paintSmall },
  'gas-processing': { wide: gasWide, small: gasSmall }
};

/**
 * Which file this device should be given. Read once per tile rather than
 * watched: a window that crosses the threshold mid-session keeps the image it
 * already has, which costs nothing and is invisible under a 20 % scrim —
 * re-fetching a second copy of the same picture to fix that would not be.
 */
export function backdropFor(id) {
  const set = BACKDROPS[id];
  if (!set) return null;
  const small = matchMedia('(max-width:640px)').matches;
  return small ? set.small : set.wide;
}
