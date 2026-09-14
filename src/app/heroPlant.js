/**
 * The hero's subject: a process plant drawn in elevation.
 *
 * The overview of a process-simulation platform whose first screen shows no
 * process was the largest thing wrong with this page. A headline and two
 * buttons on an empty ground is the shape of a marketing site; a drawing is the
 * shape of the thing itself.
 *
 * So this is a plant, drawn the way a plant is drawn on a general-arrangement
 * sheet: elevation, one ground line, a pipe rack tying the units together,
 * structural steel, and section marks in the margins. Three depth layers — a
 * far skyline, the train itself, and foreground handrail — so it reads as a
 * place rather than as a row of icons.
 *
 * Two rules it holds to:
 *
 *   No numbers. Not one. Everything here is geometry and tags, because the
 *   interface is forbidden from putting a process value on screen that did not
 *   come from an engine, and a hero graphic has no engine behind it. The
 *   annotation leaders point at things and say nothing, which is also how a
 *   drawing marks a detail to be read elsewhere.
 *
 *   No cost. One inline SVG, no script, and the only animation is a dash
 *   offset on four paths — the same marching-dash language the flowsheet uses
 *   for a live stream, so the first thing anyone sees is the grammar the rest
 *   of the application is written in.
 */

const SVG = `
<svg class="heroplant" viewBox="0 52 620 348" role="img"
     aria-label="A process plant drawn in elevation: columns, vessels, a fired heater, a rotary drum and a flare, tied together by a pipe rack.">

  <!-- ---- far skyline: the rest of the site, out of focus ---------------- -->
  <g class="hp-far">
    <path d="M14 330V196h26v134M52 330V236h18v94M80 330v-78h30v78"/>
    <path d="M470 330v-96h22v96M500 330v-62h16v62M524 330v-84h30v84M562 330v-52h20v52"/>
    <circle cx="126" cy="252" r="16"/>
    <path d="M110 330h32v-62h-32z"/>
    <path d="M592 330v-118h14v118"/>
  </g>

  <!-- ---- ground ---------------------------------------------------------- -->
  <path class="hp-ground" d="M0 330h620"/>
  <g class="hp-hatch">
    <path d="M6 330l-6 12M30 330l-6 12M54 330l-6 12M78 330l-6 12M102 330l-6 12M126 330l-6 12
             M150 330l-6 12M174 330l-6 12M198 330l-6 12M222 330l-6 12M246 330l-6 12M270 330l-6 12
             M294 330l-6 12M318 330l-6 12M342 330l-6 12M366 330l-6 12M390 330l-6 12M414 330l-6 12
             M438 330l-6 12M462 330l-6 12M486 330l-6 12M510 330l-6 12M534 330l-6 12M558 330l-6 12
             M582 330l-6 12M606 330l-6 12"/>
  </g>

  <!-- ---- 01  trayed absorber, the tall one ------------------------------- -->
  <g class="hp-unit">
    <path class="hp-body" d="M150 330V132a18 18 0 0 1 18-18h10a18 18 0 0 1 18 18v198z"/>
    <path class="hp-tray" d="M150 158h46M150 186h46M150 214h46M150 242h46M150 270h46M150 298h46"/>
    <path class="hp-line" d="M168 114V92M178 114V92"/>
    <path class="hp-line" d="M196 138h16M196 286h16"/>
    <!-- caged ladder -->
    <path class="hp-thin" d="M142 330V126M146 330V126M142 140h4M142 156h4M142 172h4M142 188h4M142 204h4M142 220h4M142 236h4M142 252h4M142 268h4M142 284h4M142 300h4M142 316h4"/>
    <!-- access platform -->
    <path class="hp-line" d="M132 196h72M132 196v-14M204 196v-14"/>
  </g>

  <!-- ---- 02  horizontal separator on saddles ----------------------------- -->
  <g class="hp-unit">
    <path class="hp-body" d="M238 258h74a18 18 0 0 1 0 44h-74a18 18 0 0 1 0-44z"/>
    <path class="hp-fill" d="M238 288h74a18 18 0 0 0 8-2v14a18 18 0 0 1-8 2h-74a18 18 0 0 1-8-2v-14a18 18 0 0 0 8 2z"/>
    <path class="hp-line" d="M252 330v-28M298 330v-28"/>
    <path class="hp-line" d="M262 258v-16M330 280h18"/>
  </g>

  <!-- ---- 03  fired heater with its stack --------------------------------- -->
  <g class="hp-unit">
    <path class="hp-body" d="M356 330V214h56v116z"/>
    <path class="hp-line" d="M356 238h56"/>
    <path class="hp-flame" d="M374 322q6-18 10 0 4-14 10 0 4-12 8 0z"/>
    <path class="hp-line" d="M396 214V150h12v64"/>
    <path class="hp-thin" d="M396 166h12M396 182h12"/>
  </g>

  <!-- ---- 04  inclined rotary drum ----------------------------------------- -->
  <g class="hp-unit">
    <path class="hp-body" d="M436 236l108-16v34l-108 16z"/>
    <path class="hp-thin" d="M462 232v34M492 228v34M520 224v34"/>
    <path class="hp-line" d="M450 270v60h22v-60M520 258v72h22v-72"/>
  </g>

  <!-- ---- 05  flare, the marker every gas plant has ------------------------ -->
  <g class="hp-unit">
    <path class="hp-line" d="M576 330V96M584 330V96"/>
    <path class="hp-thin" d="M576 120h8M576 152h8M576 184h8M576 216h8M576 248h8M576 280h8M576 312h8"/>
    <path class="hp-flame" d="M572 96q4-26 8-30 6 12 10 2 2 16-6 28z"/>
  </g>

  <!-- ---- pipe rack, tying it together ------------------------------------ -->
  <g class="hp-rack">
    <path d="M20 344h580"/>
    <path class="hp-thin" d="M60 344v-16M120 344v-16M240 344v-16M360 344v-16M480 344v-16M560 344v-16"/>
  </g>

  <!-- ---- the live line: the only thing that moves ------------------------- -->
  <g class="hp-flow">
    <path d="M0 356h150"/>
    <path d="M212 356h120"/>
    <path d="M392 356h80"/>
    <path d="M544 356h76"/>
  </g>
  <g class="hp-arrow">
    <path d="M150 352l10 4-10 4z"/>
    <path d="M332 352l10 4-10 4z"/>
    <path d="M472 352l10 4-10 4z"/>
  </g>

  <!-- ---- drawing furniture: section marks and leaders --------------------- -->
  <g class="hp-mark">
    <path d="M14 380h26M14 380v-8M40 380v-8"/>
    <path d="M580 380h26M580 380v-8M606 380v-8"/>
    <circle cx="173" cy="92" r="9"/>
    <path d="M173 101v10"/>
    <circle cx="584" cy="66" r="9"/>
    <path d="M584 75v10"/>
  </g>
  <g class="hp-tag">
    <text x="173" y="96" text-anchor="middle">1</text>
    <text x="584" y="70" text-anchor="middle">2</text>
  </g>

  <!-- ---- corner ticks: the frame of a drawing sheet ----------------------- -->
  <g class="hp-corner">
    <path d="M4 82V52h30M586 52h30v30M616 370v30h-30M34 400H4v-30"/>
  </g>
</svg>`;

/** The elevation as a live SVG element, parsed once through a template. */
export function heroPlantNode() {
  const t = document.createElement('template');
  t.innerHTML = SVG.trim();
  return t.content.firstElementChild;
}

export default heroPlantNode;
