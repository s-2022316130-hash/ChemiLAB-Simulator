/**
 * Build the whole site into ONE self-contained .html file.
 *
 * `npm run build` produces the normal multi-chunk site for GitHub Pages. This
 * produces a single file that can be emailed, put on a USB stick, handed to a
 * student or opened straight off the disk with no server running at all.
 *
 * Two things make that possible and both matter:
 *
 *  - `inlineDynamicImports` collapses the lazily loaded simulator chunks back
 *    into the bundle. The split build exists to keep three.js out of the first
 *    paint; with one file there is nothing left to defer, so the split is cost
 *    without benefit.
 *  - `format: 'iife'` rather than ESM, because a browser refuses to run a module
 *    script from a file:// URL. A classic script carries no such restriction,
 *    and running from file:// is the entire point of this build.
 *
 * Everything else — the CSS, the pre-paint theme script — is inlined verbatim.
 * The only surviving network reference is the Google Fonts stylesheet, which is
 * deliberately left as a link: online it gives the intended type, offline the
 * font stacks in theme.css fall back to the system UI font and nothing breaks.
 *
 * The result is written into dist/ next to the normal build, which is why the
 * npm script runs `vite build` first: vite empties dist/ on every build, so a
 * single file written before it would quietly disappear.
 */
import { build } from 'vite';
import { readFileSync, writeFileSync, rmSync, readdirSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const staging = join(root, '.single-file-build');
const outFile = join(root, 'dist', 'chemilab-simulator.html');

// A bundle that happens to contain the characters "</script" inside a string
// would close the inline script tag early. Same for "</style" in the CSS.
const forScript = s => s.replace(/<\/script/gi, '<\/script');
const forStyle = s => s.replace(/<\/style/gi, '<\/style');
const kb = n => `${Math.round(n / 1024)} KB`;

rmSync(staging, { recursive: true, force: true });

await build({
  root,
  base: './',
  logLevel: 'warn',
  build: {
    outDir: staging,
    emptyOutDir: true,
    target: 'es2020',
    assetsDir: '.',
    cssCodeSplit: false,
    modulePreload: { polyfill: false },
    reportCompressedSize: false,
    // One deliberate chunk. The warning is about the thing being asked for.
    chunkSizeWarningLimit: 4096,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'bundle.js',
        assetFileNames: 'bundle.[ext]'
      }
    }
  }
});

const built = readdirSync(staging);
const jsName = built.find(f => f.endsWith('.js'));
const cssName = built.find(f => f.endsWith('.css'));
if (!jsName) throw new Error('the single-file build produced no javascript bundle');

const js = readFileSync(join(staging, jsName), 'utf8');
const css = cssName ? readFileSync(join(staging, cssName), 'utf8') : '';

// Start from the built HTML rather than the source, so anything Vite injected
// into it survives into the single file.
let html = readFileSync(join(staging, 'index.html'), 'utf8');

// The bundle is substituted last, through sentinels, so the checks below run on
// a short string. Scanning the finished file instead would fail on Vite's
// preload helper, which legitimately contains the text "bundle.js".
const CSS_SLOT = '/*__CHEMILAB_CSS_SLOT__*/';
const JS_SLOT = '/*__CHEMILAB_JS_SLOT__*/';

const swap = (source, pattern, replacement, what) => {
  const next = source.replace(pattern, replacement);
  if (next === source) throw new Error(`no ${what} reference was found in the built HTML, so nothing was inlined`);
  return next;
};

html = swap(html, /\s*<link[^>]+rel="stylesheet"[^>]*href="[^"]*bundle\.css"[^>]*>/i,
  `\n<style>\n${CSS_SLOT}\n</style>`, 'stylesheet');

// The entry moves to the end of the body rather than being inlined where Vite
// put it. A module script defers until the document has been parsed; a classic
// script does not, so left in the head it would run before #app exists and the
// app would fail on its first line.
html = swap(html, /\s*<script[^>]*src="[^"]*bundle\.js"[^>]*><\/script>/i, '', 'entry script');
if (!/<\/body>/i.test(html)) throw new Error('the built HTML has no </body> to place the bundle before');
html = html.replace(/<\/body>/i, `<script>\n${JS_SLOT}\n</script>\n</body>`);

// Nothing is fetched any more, so a modulepreload Vite may have left behind is
// a dead reference. The font preconnects stay, because they still do something.
html = html.replace(/\s*<link[^>]+rel="modulepreload"[^>]*>/gi, '');

// Self-containment check. Any surviving relative reference is a file that would
// have to travel alongside this one, which defeats the purpose.
for (const m of html.matchAll(/\b(?:src|href)="([^"]*)"/gi)) {
  if (!/^(?:https?:|data:|#|mailto:)/i.test(m[1])) {
    throw new Error(`"${m[1]}" is still referenced, so the file would not be self-contained`);
  }
}

// Replacer functions, so a "$&" or "$1" inside the bundle is not interpreted.
html = html.replace(CSS_SLOT, () => forStyle(css)).replace(JS_SLOT, () => forScript(js));

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, html, 'utf8');
rmSync(staging, { recursive: true, force: true });

console.log(`single file   ${outFile}`);
console.log(`              ${kb(statSync(outFile).size)}   (script ${kb(js.length)}, style ${kb(css.length)})`);
console.log('              open it directly — no server, no install, no network');
