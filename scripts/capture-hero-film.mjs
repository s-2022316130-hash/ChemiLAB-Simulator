/**
 * Serve tools/hero-video.html, keep the frames it posts, and encode the film.
 *
 * The plant can only be rendered by a GPU, so the frames are drawn in a
 * browser (tools/heroVideo.js) and this side does the rest: a dev server with
 * one extra endpoint that accepts `POST /__hero/<name>`, writes frames into
 * .cache/hero-film/, and — when the page posts done.json — runs ffmpeg to make
 * the loop and its encodings in assets/hero/:
 *
 *   gas-plant.mp4 / .webm        the film at 1600 × 900, H.264 for Safari, VP9 for the rest
 *   gas-plant@sm.mp4 / .webm     960 × 540, for phones, which never get the large one
 *   gas-plant.jpg / @sm.jpg      the first frame, shown before the film plays and
 *                                instead of it under reduced motion
 *   gas-plant.anchors.json       where each labelled unit is, ten times a second
 *
 * It is a background under a shade, so it is encoded as one: rendered at
 * 1920 × 1080 and delivered at 1600 × 900, lightly denoised (the concrete's
 * texture is most of the bitrate and none of the picture), at a quality that
 * keeps the large H.264 file near two megabytes.
 *
 * The loop: the page renders `blend` seconds past the end of the camera's
 * path, and that tail is cross-faded over the opening, so the last frame runs
 * straight into the first.
 *
 * Needs ffmpeg with libx264 and libvpx-vp9, on the PATH or named by $FFMPEG.
 * `--encode-only` re-encodes from the frames already in .cache/hero-film/.
 *
 * A development tool: the endpoint exists only on the server started here.
 */
import { createServer } from 'vite';
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const frames = join(root, '.cache', 'hero-film');
const outDir = join(root, 'assets', 'hero');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const PORT = 5198;
const SAFE = /^(frame-\d{4}\.jpg|still-\d\.jpg|anchors\.json|done\.json)$/;

function hasFfmpeg() {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-version'], { encoding: 'utf8' });
  return r.status === 0;
}
function ff(args, label) {
  process.stdout.write(`  ${label} … `);
  const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) { console.log('failed'); throw new Error(r.stderr || `${label} failed`); }
  console.log('done');
}
const kb = p => `${Math.round(statSync(p).size / 1024)} KB`;

/**
 * The label track as the page wants it: ten samples a second rather than
 * thirty (the hero interpolates between them), positions as integers in
 * ten-thousandths of the frame, and -1 for a unit that is out of the picture.
 */
const TRACK_FPS = 10;
function compactTrack(raw) {
  const step = Math.round(raw.fps / TRACK_FPS);
  const tags = {};
  for (const [tag, samples] of Object.entries(raw.tags)) {
    const flat = [];
    for (let i = 0; i < samples.length; i += step) {
      const [x, y, on] = samples[i];
      flat.push(on ? Math.round(x * 10000) : -1, on ? Math.round(y * 10000) : -1);
    }
    tags[tag] = flat;
  }
  return { fps: TRACK_FPS, frames: Math.ceil(raw.frames / step), width: raw.width, height: raw.height, tags };
}

/** Make the loop once, losslessly enough, then encode every delivery from it. */
function encode(meta) {
  const { fps, seconds, blend } = meta;
  const T = Math.round(seconds * fps), X = Math.round(blend * fps);
  const count = readdirSync(frames).filter(n => /^frame-\d{4}\.jpg$/.test(n)).length;
  if (count < T + X) throw new Error(`need ${T + X} frames in .cache/hero-film/, found ${count}`);
  mkdirSync(outDir, { recursive: true });
  const loop = join(frames, 'loop.mkv');
  console.log('\nencoding');
  ff(['-framerate', String(fps), '-i', join(frames, 'frame-%04d.jpg'), '-filter_complex',
    `[0:v]split=2[a][b];` +
    `[a]trim=start_frame=${T}:end_frame=${T + X},setpts=PTS-STARTPTS[tail];` +
    `[b]trim=start_frame=0:end_frame=${T},setpts=PTS-STARTPTS[body];` +
    `[tail][body]xfade=transition=fade:duration=${blend}:offset=0,format=yuv420p[loop]`,
    '-map', '[loop]', '-c:v', 'libx264', '-preset', 'fast', '-crf', '12', loop], 'loop');

  const out = n => join(outDir, n);
  const vf = scale => ['-vf', `hqdn3d=1.2:1.2:5:5,scale=${scale}:flags=lanczos`];
  const h264 = (crf, scale) => [...vf(scale),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', '-an'];
  const vp9 = (crf, scale) => [...vf(scale),
    '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(crf), '-row-mt', '1', '-tile-columns', '2',
    '-deadline', 'good', '-cpu-used', '3', '-an'];
  for (const n of readdirSync(outDir)) rmSync(join(outDir, n));
  ff(['-i', loop, ...h264(28, '1600:900'), out('gas-plant.mp4')], 'gas-plant.mp4');
  ff(['-i', loop, ...vp9(40, '1600:900'), out('gas-plant.webm')], 'gas-plant.webm');
  ff(['-i', loop, ...h264(29, '960:540'), out('gas-plant@sm.mp4')], 'gas-plant@sm.mp4');
  ff(['-i', loop, ...vp9(42, '960:540'), out('gas-plant@sm.webm')], 'gas-plant@sm.webm');
  // The poster is the film's own first frame, so nothing changes when it starts.
  ff(['-i', loop, '-frames:v', '1', '-vf', 'scale=1600:900:flags=lanczos', '-q:v', '4', out('gas-plant.jpg')], 'gas-plant.jpg');
  ff(['-i', loop, '-frames:v', '1', '-vf', 'scale=960:540:flags=lanczos', '-q:v', '5', out('gas-plant@sm.jpg')], 'gas-plant@sm.jpg');
  writeFileSync(out('gas-plant.anchors.json'), JSON.stringify(compactTrack(JSON.parse(readFileSync(join(frames, 'anchors.json'), 'utf8')))));

  console.log('\nwritten to assets/hero/');
  for (const n of readdirSync(outDir).sort()) console.log(`  ${n.padEnd(28)} ${kb(out(n))}`);
}

if (process.argv.includes('--encode-only')) {
  encode(JSON.parse(readFileSync(join(frames, 'done.json'), 'utf8')));
  process.exit(0);
}

if (!hasFfmpeg()) console.warn(`\n  ffmpeg not found (looked for "${FFMPEG}"). Frames will be kept in .cache/hero-film/;\n  install ffmpeg or set FFMPEG, then run with --encode-only.\n`);
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });

const receiver = {
  name: 'chemilab-hero-film-receiver',
  configureServer(server) {
    server.middlewares.use('/__hero', (req, res, next) => {
      if (req.method !== 'POST') return next();
      const name = decodeURIComponent(req.url.replace(/^\//, '').split('?')[0]);
      if (!SAFE.test(name)) { res.statusCode = 400; return res.end(`refusing to write "${name}"`); }
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        const file = join(frames, name);
        writeFileSync(file, Buffer.concat(chunks));
        res.statusCode = 200;
        res.end('ok');
        if (name.startsWith('still-')) console.log(`  wrote .cache/hero-film/${name}`);
        if (name === 'done.json') {
          try {
            if (hasFfmpeg()) encode(JSON.parse(readFileSync(file, 'utf8')));
            else console.warn('\n  frames are in .cache/hero-film/ — encode them with --encode-only once ffmpeg is available');
          } catch (err) { console.error(`\nencoding failed: ${err.message}`); }
          setTimeout(() => process.exit(0), 200);
        }
      });
    });
  }
};

const server = await createServer({
  root, base: '/', configFile: false, logLevel: 'warn',
  server: { port: PORT, strictPort: true },
  plugins: [receiver]
});
await server.listen();
console.log('\nhero film capture ready');
console.log(`  open   http://localhost:${PORT}/tools/hero-video.html`);
console.log(`  stills http://localhost:${PORT}/tools/hero-video.html?still   (composition check, no encode)`);
console.log('  frames go to .cache/hero-film/, the film to assets/hero/ — this exits when it is written\n');
if (!existsSync(join(root, 'tools', 'hero-video.html'))) console.warn('  tools/hero-video.html is missing');
