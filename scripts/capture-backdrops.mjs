/**
 * Serve tools/backdrops.html and write what it posts back.
 *
 * A plant can only be photographed by a GPU, so the render happens in a browser
 * and this side of it does nothing but take delivery: a dev server with one
 * extra endpoint that accepts `POST /__backdrop/<name>.webp` and writes the
 * body into assets/plant-bg/.
 *
 * It is a development tool. The endpoint exists only on the dev server started
 * here, never in `npm run dev` and never in anything built.
 */
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'assets', 'plant-bg');
mkdirSync(outDir, { recursive: true });

const PORT = 5199;
// Written filenames come from the URL, so the URL is not allowed to name a path.
const SAFE = /^[a-z0-9@-]+\.webp$/;

const receiver = {
  name: 'chemilab-backdrop-receiver',
  configureServer(server) {
    server.middlewares.use('/__backdrop', (req, res, next) => {
      if (req.method !== 'POST') return next();
      const name = decodeURIComponent(req.url.replace(/^\//, '').split('?')[0]);
      if (!SAFE.test(name)) {
        res.statusCode = 400;
        return res.end(`refusing to write "${name}"`);
      }
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        const buf = Buffer.concat(chunks);
        writeFileSync(join(outDir, name), buf);
        console.log(`  wrote assets/plant-bg/${name}  ${Math.round(buf.length / 1024)} KB`);
        res.statusCode = 200;
        res.end('ok');
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

console.log(`\nbackdrop capture ready`);
console.log(`  open  http://localhost:${PORT}/tools/backdrops.html`);
console.log(`  light http://localhost:${PORT}/tools/backdrops.html?theme=light`);
console.log(`  writing into assets/plant-bg/ — ctrl-c when the page says done\n`);
