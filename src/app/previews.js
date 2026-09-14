/**
 * Miniature process diagrams, one per simulator, drawn for the gallery tiles.
 *
 * Each of these is the actual shape of the unit behind it, not an abstract
 * decoration: a settling basin really is a rectangle with a sloped floor, a
 * rotary dryer really is an inclined drum with a cyclone on the end, and a gas
 * plant really is three towers with a machine between the last two. The point
 * is that someone who knows the subject recognises the unit before reading the
 * title, and someone who does not has seen its shape once before they open it.
 *
 * They are line art rather than illustration, in the tile's own colour, and the
 * `pv-flow` path is the one that marches on hover — the same visual grammar the
 * flowsheet uses for a live stream, so the language is consistent from the
 * first screen to the last.
 *
 * Nothing here is a process value. These are shapes.
 */

const wrap = (body, w = 220, h = 120) =>
  `<svg class="preview" viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false">${body}</svg>`;

/** 01 — coagulation, flocculation, settling, filtration, disinfection. */
const waterTreatment = () => wrap(`
  <path class="pv-dim" d="M6 96h208"/>
  <!-- rapid mix and flocculator: two basins with paddle shafts -->
  <rect class="pv-line" x="14" y="52" width="34" height="44"/>
  <path class="pv-fill" d="M16 68h30v26H16Z"/>
  <path class="pv-line" d="M31 44v34M22 62h18M22 72h18"/>
  <rect class="pv-line" x="56" y="58" width="40" height="38"/>
  <path class="pv-fill" d="M58 70h36v24H58Z"/>
  <path class="pv-line" d="M70 50v36M82 50v36M64 68h12M76 68h12"/>
  <!-- clarifier: rectangular basin with a sloped floor -->
  <path class="pv-line" d="M104 58h52v22l-26 16-26-16Z"/>
  <path class="pv-fill" d="M106 68h48v11l-24 14-24-14Z"/>
  <!-- filter: media bed in a box -->
  <rect class="pv-line" x="164" y="60" width="30" height="36"/>
  <path class="pv-line" d="M166 74h26M166 80h26M166 86h26" opacity=".55"/>
  <!-- clearwell and dosing -->
  <path class="pv-line" d="M200 66h12v30h-12Z"/>
  <circle class="pv-line" cx="31" cy="30" r="7"/>
  <path class="pv-line" d="M31 37v7"/>
  <path class="pv-flow" d="M6 88h8M48 76h8M96 76h8M156 78h8M194 80h6"/>
`);

/** 02 — convective drying in an inclined rotary drum with cyclone and fan. */
const industrialDryer = () => wrap(`
  <path class="pv-dim" d="M6 100h208"/>
  <!-- feed hopper -->
  <path class="pv-line" d="M14 30h26v16l-13 12-13-12Z"/>
  <path class="pv-fill" d="M16 32h22v13l-11 10-11-10Z"/>
  <!-- inclined drum on trunnion piers -->
  <path class="pv-line" d="M34 62 132 48"/>
  <path class="pv-line" d="M34 86 132 72"/>
  <path class="pv-line" d="M34 62v24M132 48v24"/>
  <path class="pv-fill" d="M34 62 132 48v24L34 86Z"/>
  <path class="pv-line" d="M58 58.5v24M86 54.5v24M110 51v24" opacity=".5"/>
  <path class="pv-line" d="M52 90h16v10H52ZM104 86h16v14h-16Z"/>
  <!-- cyclone: barrel over a cone -->
  <path class="pv-line" d="M146 34h26v20l-13 22-13-22Z"/>
  <path class="pv-line" d="M159 34V22"/>
  <!-- air heater and fan -->
  <circle class="pv-line" cx="196" cy="60" r="12"/>
  <path class="pv-line" d="m189 67 14-14"/>
  <path class="pv-line" d="M196 72v20h-12"/>
  <path class="pv-flow" d="M40 74h12M132 60h14M172 44h10M196 34v14"/>
`);

/** 03 — ammonia synthesis loop, urea reactor, prilling tower. */
const fertilizer = () => wrap(`
  <path class="pv-dim" d="M6 104h208"/>
  <!-- compressor train on a baseplate -->
  <rect class="pv-line" x="12" y="66" width="44" height="14" rx="7"/>
  <path class="pv-line" d="M12 82h50v5H12Z"/>
  <path class="pv-line" d="M26 66v14M40 66v14" opacity=".5"/>
  <!-- synthesis converter with its recycle loop -->
  <rect class="pv-line" x="70" y="28" width="22" height="60" rx="11"/>
  <path class="pv-fill" d="M72 42h18v44H72Z"/>
  <path class="pv-line" d="M70 44h22M70 58h22M70 72h22" opacity=".55"/>
  <path class="pv-line" d="M81 28V16h40v14"/>
  <path class="pv-line" d="M92 60h18v28H92Z"/>
  <!-- urea reactor -->
  <rect class="pv-line" x="122" y="36" width="20" height="52" rx="10"/>
  <path class="pv-fill" d="M124 50h16v36h-16Z"/>
  <!-- prilling tower: the tall one -->
  <path class="pv-line" d="M160 88V26h30v62"/>
  <path class="pv-line" d="M160 26h30M166 34h18"/>
  <path class="pv-line" d="M164 88h22v10h-22Z"/>
  <circle class="pv-line" cx="170" cy="52" r="1.6"/><circle class="pv-line" cx="179" cy="62" r="1.6"/>
  <circle class="pv-line" cx="174" cy="72" r="1.6"/><circle class="pv-line" cx="183" cy="46" r="1.6"/>
  <path class="pv-flow" d="M56 74h14M92 44h30M142 62h18M121 16h-40"/>
`);

/** 04 — dispersion, bead mill, let-down, filling. */
const paint = () => wrap(`
  <path class="pv-dim" d="M6 100h208"/>
  <!-- disperser: vessel with a sawtooth blade on a shaft -->
  <path class="pv-line" d="M18 44h44v48H18Z"/>
  <path class="pv-fill" d="M20 58h40v32H20Z"/>
  <path class="pv-line" d="M40 26v46"/>
  <path class="pv-line" d="M30 72h20"/>
  <path class="pv-line" d="M30 72q5-5 10 0t10 0" opacity=".7"/>
  <rect class="pv-line" x="32" y="16" width="16" height="10" rx="2"/>
  <!-- bead mill: horizontal chamber with its drive -->
  <rect class="pv-line" x="76" y="56" width="44" height="20" rx="10"/>
  <path class="pv-fill" d="M78 58h40v16H78Z"/>
  <circle class="pv-line" cx="86" cy="66" r="3"/><circle class="pv-line" cx="98" cy="66" r="3"/><circle class="pv-line" cx="110" cy="66" r="3"/>
  <path class="pv-line" d="M76 80h44v6H76Z"/>
  <!-- let-down tank -->
  <path class="pv-line" d="M134 40h38v52h-38Z"/>
  <path class="pv-fill" d="M136 56h34v34h-34Z"/>
  <path class="pv-line" d="M153 30v40M145 70h16"/>
  <!-- filling line: cans on a belt -->
  <path class="pv-line" d="M180 84h34v5h-34Z"/>
  <rect class="pv-line" x="184" y="72" width="8" height="12" rx="1"/>
  <rect class="pv-line" x="196" y="72" width="8" height="12" rx="1"/>
  <rect class="pv-line" x="208" y="72" width="6" height="12" rx="1"/>
  <path class="pv-flow" d="M62 72h14M120 66h14M172 76h8"/>
`);

/** 05 — sweetening, dehydration, cryogenic recovery, recompression. */
const gasProcessing = () => wrap(`
  <path class="pv-dim" d="M6 102h208"/>
  <!-- inlet separator -->
  <rect class="pv-line" x="10" y="54" width="18" height="36" rx="9"/>
  <path class="pv-fill" d="M12 76h14v12H12Z"/>
  <!-- amine contactor and glycol contactor: trayed towers -->
  <rect class="pv-line" x="42" y="22" width="18" height="68" rx="9"/>
  <path class="pv-line" d="M42 36h18M42 48h18M42 60h18M42 72h18" opacity=".55"/>
  <rect class="pv-line" x="74" y="30" width="16" height="60" rx="8"/>
  <path class="pv-line" d="M74 44h16M74 56h16M74 68h16" opacity=".55"/>
  <!-- cold box -->
  <rect class="pv-line" x="104" y="52" width="26" height="30" rx="3"/>
  <path class="pv-line" d="m104 60 8 7-8 7M130 60l-8 7 8 7" opacity=".6"/>
  <!-- turboexpander: the machine that buys the cold -->
  <circle class="pv-line" cx="150" cy="66" r="11"/>
  <path class="pv-line" d="M141 60h18M141 72h18"/>
  <path class="pv-line" d="M150 55V44h16"/>
  <!-- demethaniser -->
  <rect class="pv-line" x="172" y="26" width="18" height="64" rx="9"/>
  <path class="pv-line" d="M172 40h18M172 52h18M172 64h18M172 76h18" opacity=".55"/>
  <path class="pv-fill" d="M174 78h14v10h-14Z"/>
  <!-- residue compressor -->
  <circle class="pv-line" cx="206" cy="36" r="9"/>
  <path class="pv-line" d="m199 32 14-3M199 40l14 3"/>
  <path class="pv-flow" d="M28 64h14M60 40h14M90 62h14M130 66h11M161 62h11M190 34h7"/>
`);

export const PREVIEWS = {
  'water-treatment': waterTreatment,
  'industrial-dryer': industrialDryer,
  'fertilizer': fertilizer,
  'paint': paint,
  'gas-processing': gasProcessing
};

/** The miniature for a simulator, or an empty string when there is not one. */
export const previewFor = id => (PREVIEWS[id] ? PREVIEWS[id]() : '');

/**
 * The miniature as a live SVG element rather than as markup, because it is
 * appended into a tile alongside DOM built by el(). Parsed through a <template>
 * so the SVG namespace is applied by the HTML parser rather than by hand.
 */
export function previewNode(id) {
  const src = PREVIEWS[id]?.();
  if (!src) return null;
  const t = document.createElement('template');
  t.innerHTML = src.trim();
  return t.content.firstElementChild;
}
