/**
 * heroFilm.js for the single-file build: the poster without the film.
 *
 * The one-file copy inlines every asset as base64, and the film would make it
 * several times its size for the sake of a background. Opened from a USB stick
 * the hero shows the plant's first frame with its labels, as it does for
 * anyone who has asked for reduced motion. scripts/build-single-file.mjs swaps
 * this module in.
 */
import posterSm from '../../assets/hero/gas-plant@sm.jpg?url';

export const FILM = {
  large: { poster: posterSm },
  small: { poster: posterSm }
};

export const loadTrack = () => import('../../assets/hero/gas-plant.anchors.json').then(m => m.default);
