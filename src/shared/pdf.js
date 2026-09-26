/**
 * A small PDF writer: pages with JPEG images, text in the standard fonts, and
 * ruled lines — exactly what a plant sheet and its data appendix need, and no
 * more.
 *
 * Written here rather than pulled in as a library for two reasons. The app
 * has to work as one self-contained HTML file with no network, so a PDF
 * library would be a few hundred kilobytes inlined into every copy for the
 * sake of one button. And what is needed is small: PDF 1.4, the base-14 fonts
 * (which every reader has, so nothing is embedded), JPEG images stored as they
 * are, and uncompressed content streams. That is a few objects and a
 * cross-reference table.
 *
 * Coordinates are in points with the origin at the top-left, like everything
 * else on screen; the writer turns them the right way up for PDF, whose origin
 * is at the bottom-left.
 *
 * Text is encoded as WinAnsi, the encoding the standard fonts use. Characters
 * outside it — subscript digits, Greek letters, a few mathematical signs — are
 * written as their nearest plain equivalent rather than dropped, so "CO₂"
 * prints as "CO2" and not as "CO".
 */

const SANS = 'Helvetica, Arial, "Liberation Sans", sans-serif';
const FONTS = {
  regular: { key: 'F1', base: 'Helvetica', style: 'normal', weight: 400, family: SANS },
  bold: { key: 'F2', base: 'Helvetica-Bold', style: 'normal', weight: 700, family: SANS },
  mono: { key: 'F3', base: 'Courier', style: 'normal', weight: 400, family: '"Courier New", Courier, "Liberation Mono", monospace' },
  italic: { key: 'F4', base: 'Helvetica-Oblique', style: 'italic', weight: 400, family: SANS }
};

/** WinAnsi codes for the characters in 0x80–0x9F that differ from Latin-1. */
const WIN = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89,
  'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95,
  '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f
};
/** Plain equivalents for characters WinAnsi cannot carry. */
const PLAIN = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
  '⁰': '0', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  'α': 'alpha', 'β': 'beta', 'γ': 'gamma', 'δ': 'delta', 'Δ': 'delta ', 'ε': 'epsilon', 'η': 'eta',
  'θ': 'theta', 'λ': 'lambda', 'μ': 'µ', 'ν': 'nu', 'π': 'pi', 'ρ': 'rho', 'σ': 'sigma', 'Σ': 'sum ',
  'τ': 'tau', 'φ': 'phi', 'ω': 'omega',
  '−': '-', '≤': '<=', '≥': '>=', '≈': '~', '→': '->', '←': '<-', '∙': '·', '√': 'sqrt',
  ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' '
};

/** A string as WinAnsi bytes. */
function encode(str) {
  const out = [];
  for (const ch of String(str).normalize('NFC')) {
    const sub = PLAIN[ch];
    if (sub !== undefined && sub !== ch) { for (const c of sub) out.push(...codeOf(c)); continue; }
    out.push(...codeOf(ch));
  }
  return out;
}
function codeOf(ch) {
  const c = ch.codePointAt(0);
  if (c >= 0x20 && c <= 0x7e) return [c];
  if (c >= 0xa0 && c <= 0xff) return [c];
  if (WIN[ch] !== undefined) return [WIN[ch]];
  return [0x3f];   // '?' — nothing on the sheets should reach here
}
/** A PDF string literal, with the bytes that need escaping escaped. */
function literal(str) {
  let s = '(';
  for (const b of encode(str)) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) s += `\\${String.fromCharCode(b)}`;
    else if (b < 0x20 || b > 0x7e) s += `\\${b.toString(8).padStart(3, '0')}`;
    else s += String.fromCharCode(b);
  }
  return `${s})`;
}

const measureCtx = (() => {
  let ctx = null;
  return () => (ctx ||= document.createElement('canvas').getContext('2d'));
})();

/**
 * Width of a string in points, in one of the standard fonts. Measured on a
 * canvas with a metric-compatible face (Arial and Liberation Sans share
 * Helvetica's widths), which is what lets columns right-align and long cells
 * be cut to fit without shipping a font metrics table.
 */
export function measure(str, size, font = 'regular') {
  const f = FONTS[font] || FONTS.regular;
  const ctx = measureCtx();
  ctx.font = `${f.style} ${f.weight} ${size}px ${f.family}`;
  return ctx.measureText(String(str)).width;
}

/** Cut a string with an ellipsis to fit a width in points. */
export function fitText(str, size, font, max) {
  let s = String(str);
  if (measure(s, size, font) <= max) return s;
  while (s.length > 1 && measure(`${s}…`, size, font) > max) s = s.slice(0, -1);
  return `${s}…`;
}

const rgb = c => {
  if (Array.isArray(c)) return c;
  const m = String(c || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(m)) return [1, 3, 5].map(i => parseInt(m.slice(i, i + 2), 16) / 255);
  if (/^#[0-9a-f]{3}$/i.test(m)) return [1, 2, 3].map(i => parseInt(m[i] + m[i], 16) / 255);
  const n = m.match(/[\d.]+/g);
  return n && n.length >= 3 ? n.slice(0, 3).map(v => Math.min(1, Number(v) / 255)) : [0, 0, 0];
};
const num = v => (Math.round(v * 1000) / 1000).toString();

export function createPdf({ title = '', author = '', subject = '', keywords = '', creator = 'ChemiLAB Simulator' } = {}) {
  const pages = [];

  function page(width, height) {
    const ops = [];
    const images = [];
    const Y = y => height - y;
    const p = {
      width, height,
      /** A JPEG (as bytes) placed at x, y with width w and height h, in points. */
      image(bytes, pxW, pxH, x, y, w, h) {
        const name = `Im${images.length + 1}`;
        images.push({ name, bytes, pxW, pxH });
        ops.push(`q ${num(w)} 0 0 ${num(h)} ${num(x)} ${num(Y(y + h))} cm /${name} Do Q`);
      },
      text(str, x, y, { size = 10, font = 'regular', color = '#000000', align = 'left' } = {}) {
        const f = FONTS[font] || FONTS.regular;
        const dx = align === 'right' ? measure(str, size, font) : align === 'center' ? measure(str, size, font) / 2 : 0;
        const [r, g, b] = rgb(color);
        ops.push(`BT ${num(r)} ${num(g)} ${num(b)} rg /${f.key} ${num(size)} Tf ${num(x - dx)} ${num(Y(y))} Td ${literal(str)} Tj ET`);
      },
      line(x1, y1, x2, y2, { width = 0.5, color = '#000000' } = {}) {
        const [r, g, b] = rgb(color);
        ops.push(`${num(r)} ${num(g)} ${num(b)} RG ${num(width)} w ${num(x1)} ${num(Y(y1))} m ${num(x2)} ${num(Y(y2))} l S`);
      },
      rect(x, y, w, h, { fill = null, stroke = null, width = 0.5 } = {}) {
        if (fill) { const [r, g, b] = rgb(fill); ops.push(`${num(r)} ${num(g)} ${num(b)} rg ${num(x)} ${num(Y(y + h))} ${num(w)} ${num(h)} re f`); }
        if (stroke) { const [r, g, b] = rgb(stroke); ops.push(`${num(r)} ${num(g)} ${num(b)} RG ${num(width)} w ${num(x)} ${num(Y(y + h))} ${num(w)} ${num(h)} re S`); }
      },
      _ops: ops, _images: images
    };
    pages.push(p);
    return p;
  }

  function toBlob() {
    const enc = new TextEncoder();
    const chunks = [];
    const offsets = [];
    let length = 0;
    const push = data => { const bytes = typeof data === 'string' ? enc.encode(data) : data; chunks.push(bytes); length += bytes.length; };
    let next = 1;
    const reserve = () => next++;
    const writeObj = (id, body) => { offsets[id] = length; push(`${id} 0 obj\n`); for (const b of [].concat(body)) push(b); push('\nendobj\n'); };

    push('%PDF-1.4\n');
    push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));   // marks the file as binary

    const catalogId = reserve(), pagesId = reserve(), infoId = reserve();
    const fontIds = {};
    for (const f of Object.values(FONTS)) fontIds[f.key] = reserve();
    const pageIds = pages.map(() => ({ page: reserve(), content: reserve(), images: [] }));
    pages.forEach((p, i) => { pageIds[i].images = p._images.map(() => reserve()); });

    writeObj(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
    writeObj(pagesId, `<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map(x => `${x.page} 0 R`).join(' ')}] >>`);
    const d = new Date(), pad = n => String(n).padStart(2, '0');
    const date = `D:${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    writeObj(infoId, `<< /Title ${literal(title)} /Author ${literal(author)} /Subject ${literal(subject)} /Keywords ${literal(keywords)} /Creator ${literal(creator)} /Producer ${literal('ChemiLAB Simulator')} /CreationDate (${date}) >>`);
    for (const f of Object.values(FONTS)) {
      writeObj(fontIds[f.key], `<< /Type /Font /Subtype /Type1 /BaseFont /${f.base} /Encoding /WinAnsiEncoding >>`);
    }
    const fontDict = Object.values(FONTS).map(f => `/${f.key} ${fontIds[f.key]} 0 R`).join(' ');

    pages.forEach((p, i) => {
      const ids = pageIds[i];
      const xobj = p._images.map((im, k) => `/${im.name} ${ids.images[k]} 0 R`).join(' ');
      writeObj(ids.page, `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${num(p.width)} ${num(p.height)}] /Resources << /Font << ${fontDict} >> /XObject << ${xobj} >> >> /Contents ${ids.content} 0 R >>`);
      const content = p._ops.join('\n');
      writeObj(ids.content, [`<< /Length ${enc.encode(content).length} >>\nstream\n`, content, '\nendstream']);
      p._images.forEach((im, k) => {
        writeObj(ids.images[k], [
          `<< /Type /XObject /Subtype /Image /Width ${im.pxW} /Height ${im.pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>\nstream\n`,
          im.bytes, '\nendstream'
        ]);
      });
    });

    const xref = length;
    let table = `xref\n0 ${next}\n0000000000 65535 f \n`;
    for (let id = 1; id < next; id++) table += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
    push(table);
    push(`trailer\n<< /Size ${next} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(chunks, { type: 'application/pdf' });
  }

  return { page, toBlob, get pageCount() { return pages.length; } };
}

/** Paper sizes, landscape, in points. */
export const PAPER = {
  a4: { label: 'A4', w: 841.89, h: 595.28 },
  a3: { label: 'A3', w: 1190.55, h: 841.89 },
  letter: { label: 'US Letter', w: 792, h: 612 }
};
