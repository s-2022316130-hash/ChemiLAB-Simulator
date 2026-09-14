/**
 * 05 — NATURAL GAS PROCESSING PLANT — process flow diagram.
 *
 * A declarative spec only. This module computes nothing: node state and every
 * stream label arrive from engine.getEquipmentState() and engine.getStreams()
 * through view2d.applyState().
 *
 * Node tags and edge ids are imported from engine.js rather than retyped, so the
 * flowsheet node, the 3D group's userData.tag and the engine's own key are one
 * string by construction.
 *
 * The gas runs straight across the middle in the order it is treated, and each
 * treating section hangs its regeneration loop above the line and its pumping
 * below it. Drawn any other way, a gas plant looks like sixteen unrelated
 * vessels instead of one train with three loops in it.
 */
import { TAGS, STREAMS } from './engine.js';

const ROW = { top: 84, main: 266, low: 442, base: 556 };

export const FLOWSHEET = {
  width: 1230,
  height: 610,
  nodes: [
    // ---- the gas, left to right --------------------------------------------
    { tag: TAGS.inletSeparator, type: 'vessel', label: 'Inlet separator', x: 92, y: ROW.main },
    { tag: TAGS.amineContactor, type: 'column', label: 'Amine contactor', x: 252, y: ROW.main },
    { tag: TAGS.glycolContactor, type: 'column', label: 'Glycol contactor', x: 424, y: ROW.main },
    { tag: TAGS.coldBox, type: 'exchanger', label: 'Gas/gas cold box', x: 580, y: ROW.main },
    { tag: TAGS.expander, type: 'compressor', label: 'Turboexpander', x: 704, y: ROW.main },
    { tag: TAGS.coldSeparator, type: 'vessel', label: 'Cold separator', x: 824, y: ROW.main },
    { tag: TAGS.demethaniser, type: 'column', label: 'Demethaniser', x: 964, y: ROW.main },
    // ---- regeneration, above the line ---------------------------------------
    { tag: TAGS.flare, type: 'block', label: 'Acid gas flare', x: 96, y: ROW.top },
    { tag: TAGS.amineRegenerator, type: 'column', label: 'Amine regenerator', x: 252, y: ROW.top },
    { tag: TAGS.glycolRegenerator, type: 'column', label: 'Glycol regenerator', x: 424, y: ROW.top },
    { tag: TAGS.residueCompressor, type: 'compressor', label: 'Residue compressor', x: 1132, y: 128 },
    // ---- pumping and product, below the line --------------------------------
    { tag: TAGS.stabiliser, type: 'column', label: 'Condensate stabiliser', x: 96, y: ROW.low },
    { tag: TAGS.leanRichExchanger, type: 'exchanger', label: 'Lean/rich exchanger', x: 252, y: ROW.low },
    { tag: TAGS.aminePump, type: 'pump', label: 'Amine circulation pump', x: 366, y: ROW.low },
    { tag: TAGS.nglStorage, type: 'tank', label: 'NGL storage', x: 1132, y: 424 },
    { tag: TAGS.mcc, type: 'block', label: 'Motor control centre', x: 580, y: ROW.base }
  ],
  // Edge ids are engine stream ids. An edge only shows flow when the engine has
  // reported a non-zero flow for that exact stream; otherwise its label is an em dash.
  edges: [
    {
      // Gas arrives from the field, off the diagram.
      id: STREAMS.wellheadFeed, from: TAGS.inletSeparator, to: TAGS.inletSeparator, phase: 'gas',
      points: [[10, ROW.main], [44, ROW.main], [76, ROW.main]]
    },
    {
      id: STREAMS.separatedGas, from: TAGS.inletSeparator, to: TAGS.amineContactor, phase: 'gas',
      points: [[108, ROW.main], [170, ROW.main], [238, ROW.main]]
    },
    {
      id: STREAMS.condensate, from: TAGS.inletSeparator, to: TAGS.stabiliser, phase: 'liquid',
      points: [[92, ROW.main + 26], [92, 360], [96, ROW.low - 36]]
    },
    {
      id: STREAMS.producedWater, from: TAGS.inletSeparator, to: TAGS.stabiliser, phase: 'liquid',
      points: [[76, ROW.main + 22], [56, 350], [80, ROW.low - 34]]
    },
    {
      id: STREAMS.sweetGas, from: TAGS.amineContactor, to: TAGS.glycolContactor, phase: 'gas',
      points: [[266, ROW.main - 20], [340, 236], [410, ROW.main - 20]]
    },
    {
      // The amine loop closes above and below the contactor.
      id: STREAMS.richAmine, from: TAGS.amineContactor, to: TAGS.leanRichExchanger, phase: 'liquid',
      points: [[252, ROW.main + 34], [252, 380], [252, ROW.low - 18]]
    },
    {
      id: STREAMS.leanAmine, from: TAGS.aminePump, to: TAGS.amineContactor, phase: 'liquid',
      points: [[366, ROW.low - 16], [330, 400], [286, 330], [268, ROW.main + 30]]
    },
    {
      id: STREAMS.acidGas, from: TAGS.amineRegenerator, to: TAGS.flare, phase: 'gas',
      points: [[236, ROW.top - 20], [170, 58], [112, ROW.top - 18]]
    },
    {
      id: STREAMS.dryGas, from: TAGS.glycolContactor, to: TAGS.coldBox, phase: 'gas',
      points: [[438, ROW.main - 18], [510, 240], [564, ROW.main - 14]]
    },
    {
      id: STREAMS.richGlycol, from: TAGS.glycolContactor, to: TAGS.glycolRegenerator, phase: 'liquid',
      points: [[410, ROW.main - 30], [386, 200], [408, ROW.top + 34]]
    },
    {
      id: STREAMS.leanGlycol, from: TAGS.glycolRegenerator, to: TAGS.glycolContactor, phase: 'liquid',
      points: [[440, ROW.top + 34], [462, 200], [438, ROW.main - 30]]
    },
    {
      id: STREAMS.regenVapour, from: TAGS.glycolRegenerator, to: TAGS.glycolRegenerator, phase: 'steam',
      points: [[424, ROW.top - 36], [424, 30], [424, 12]]
    },
    {
      id: STREAMS.chilledGas, from: TAGS.coldBox, to: TAGS.expander, phase: 'gas',
      points: [[596, ROW.main], [648, ROW.main], [688, ROW.main]]
    },
    {
      id: STREAMS.expanderOutlet, from: TAGS.expander, to: TAGS.coldSeparator, phase: 'gas',
      points: [[720, ROW.main], [768, ROW.main], [808, ROW.main]]
    },
    {
      id: STREAMS.coldLiquid, from: TAGS.coldSeparator, to: TAGS.demethaniser, phase: 'liquid',
      points: [[838, ROW.main + 18], [896, 320], [952, ROW.main + 24]]
    },
    {
      id: STREAMS.residueGas, from: TAGS.demethaniser, to: TAGS.residueCompressor, phase: 'gas',
      points: [[964, ROW.main - 36], [1010, 200], [1116, 152]]
    },
    {
      id: STREAMS.nglProduct, from: TAGS.demethaniser, to: TAGS.nglStorage, phase: 'liquid',
      points: [[978, ROW.main + 32], [1050, 380], [1112, ROW.low - 26]]
    },
    {
      id: STREAMS.salesGas, from: TAGS.residueCompressor, to: TAGS.residueCompressor, phase: 'gas',
      points: [[1148, 114], [1190, 92], [1216, 74]]
    }
  ]
};

export default FLOWSHEET;
