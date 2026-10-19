/**
 * The overview's film: unit 05, the natural gas plant, rendered by
 * tools/heroVideo.js from the simulator's own three.js scene running at its
 * base case (`npm run hero-film` re-renders it).
 *
 * Two sizes. A phone is handed the small one and never the large; anyone who
 * has asked for reduced motion or reduced data gets the poster only, which is
 * the film's own first frame, so nothing changes when it would have started.
 *
 * The track says where each labelled unit is in the picture, ten times a
 * second over the loop, so the labels on the overview ride on the units as the
 * camera drifts. It is loaded with the film, not before it.
 *
 * The single-file build replaces this module with heroFilm.still.js: base64
 * video would make the one-file copy several times its size for a background.
 */
import webmLg from '../../assets/hero/gas-plant.webm?url';
import mp4Lg from '../../assets/hero/gas-plant.mp4?url';
import posterLg from '../../assets/hero/gas-plant.jpg?url';
import webmSm from '../../assets/hero/gas-plant@sm.webm?url';
import mp4Sm from '../../assets/hero/gas-plant@sm.mp4?url';
import posterSm from '../../assets/hero/gas-plant@sm.jpg?url';

export const FILM = {
  large: { webm: webmLg, mp4: mp4Lg, poster: posterLg },
  small: { webm: webmSm, mp4: mp4Sm, poster: posterSm }
};

export const loadTrack = () => import('../../assets/hero/gas-plant.anchors.json').then(m => m.default);
