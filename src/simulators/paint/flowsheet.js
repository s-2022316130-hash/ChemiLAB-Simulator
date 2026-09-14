/**
 * 04 — PAINT MANUFACTURING PLANT — process flow diagram.
 *
 * A declarative spec only. This module computes nothing: node state and every
 * stream label arrive from engine.getEquipmentState() and engine.getStreams()
 * through view2d.applyState().
 *
 * Node tags and edge ids are imported from engine.js rather than retyped, so the
 * flowsheet node, the 3D group's userData.tag and the engine's own key are one
 * string by construction.
 *
 * The diagram is laid out as the batch runs rather than as the plant stands:
 * raw materials down the left, the grind across the middle, the let-down and
 * the finishing to the right. The two routes out of the disperser — through the
 * bead mill or straight past it — are drawn as two lines, and only the one the
 * operator chose ever carries flow.
 */
import { TAGS, STREAMS } from './engine.js';

const ROW = { top: 84, main: 252, low: 420, base: 548 };

export const FLOWSHEET = {
  width: 1200,
  height: 600,
  nodes: [
    // ---- raw materials ------------------------------------------------------
    { tag: TAGS.resinTank, type: 'tank', label: 'Resin storage', x: 84, y: ROW.top },
    { tag: TAGS.solventTank, type: 'tank', label: 'Solvent storage', x: 84, y: ROW.main },
    { tag: TAGS.additiveSkid, type: 'tank', label: 'Additive skid', x: 84, y: ROW.low },
    { tag: TAGS.bagDump, type: 'vessel', label: 'Pigment bag dump', x: 272, y: ROW.top },
    { tag: TAGS.dustCollector, type: 'filter', label: 'Dust collector', x: 452, y: ROW.top },
    // ---- grind --------------------------------------------------------------
    { tag: TAGS.disperser, type: 'mixer', label: 'High-speed disperser', x: 272, y: ROW.main },
    { tag: TAGS.chiller, type: 'exchanger', label: 'Jacket chiller', x: 272, y: ROW.low },
    { tag: TAGS.beadMill, type: 'dryer', label: 'Bead mill', x: 470, y: ROW.main },
    // ---- let-down and finishing --------------------------------------------
    { tag: TAGS.letdownTank, type: 'mixer', label: 'Let-down tank', x: 668, y: ROW.main },
    { tag: TAGS.transferPump, type: 'pump', label: 'Transfer pump', x: 824, y: ROW.main },
    { tag: TAGS.filter, type: 'filter', label: 'Bag filter', x: 946, y: ROW.main },
    { tag: TAGS.fillingLine, type: 'block', label: 'Filling line', x: 1090, y: ROW.main },
    { tag: TAGS.qualityLab, type: 'instrument', label: 'Quality control', x: 1090, y: ROW.low },
    { tag: TAGS.mcc, type: 'block', label: 'Motor control centre', x: 84, y: ROW.base }
  ],
  // Edge ids are engine stream ids. An edge only shows flow when the engine has
  // reported a non-zero flow for that exact stream; otherwise its label is an em dash.
  edges: [
    {
      id: STREAMS.resinToMill, from: TAGS.resinTank, to: TAGS.disperser, phase: 'liquid',
      points: [[104, ROW.top], [168, ROW.top], [190, 150], [250, 232]]
    },
    {
      id: STREAMS.solventToMill, from: TAGS.solventTank, to: TAGS.disperser, phase: 'liquid',
      points: [[104, ROW.main], [170, ROW.main], [254, ROW.main]]
    },
    {
      id: STREAMS.pigmentFeed, from: TAGS.bagDump, to: TAGS.disperser, phase: 'solid',
      points: [[272, ROW.top + 26], [272, 170], [272, ROW.main - 20]]
    },
    {
      // Bag dumping raises dust, and the dust collector is why the operator can
      // stand next to it.
      id: STREAMS.dustToCollector, from: TAGS.bagDump, to: TAGS.dustCollector, phase: 'air',
      points: [[290, ROW.top - 16], [360, 48], [436, ROW.top - 14]]
    },
    {
      id: STREAMS.solventVapour, from: TAGS.disperser, to: TAGS.dustCollector, phase: 'gas',
      points: [[292, ROW.main - 16], [390, 190], [452, ROW.top + 22]]
    },
    {
      id: STREAMS.coolingWater, from: TAGS.chiller, to: TAGS.disperser, phase: 'liquid',
      points: [[272, ROW.low - 18], [272, 340], [272, ROW.main + 20]]
    },
    {
      // Through the bead mill.
      id: STREAMS.millBaseToMill, from: TAGS.disperser, to: TAGS.beadMill, phase: 'slurry',
      points: [[290, ROW.main - 8], [380, ROW.main - 22], [444, ROW.main - 10]]
    },
    {
      id: STREAMS.milledBase, from: TAGS.beadMill, to: TAGS.letdownTank, phase: 'slurry',
      points: [[498, ROW.main - 6], [580, ROW.main - 20], [652, ROW.main - 12]]
    },
    {
      // Or straight past it, when no passes were called for.
      id: STREAMS.millBaseDirect, from: TAGS.disperser, to: TAGS.letdownTank, phase: 'slurry',
      points: [[288, ROW.main + 16], [400, 330], [560, 322], [656, ROW.main + 16]]
    },
    {
      id: STREAMS.resinLetdown, from: TAGS.resinTank, to: TAGS.letdownTank, phase: 'liquid',
      points: [[104, ROW.top - 14], [420, 34], [640, 60], [668, ROW.main - 20]]
    },
    {
      id: STREAMS.solventLetdown, from: TAGS.solventTank, to: TAGS.letdownTank, phase: 'liquid',
      points: [[96, ROW.main + 18], [300, 388], [520, 376], [660, ROW.main + 20]]
    },
    {
      id: STREAMS.additives, from: TAGS.additiveSkid, to: TAGS.letdownTank, phase: 'liquid',
      points: [[104, ROW.low], [360, 470], [600, 430], [672, ROW.main + 20]]
    },
    {
      id: STREAMS.finishedPaint, from: TAGS.letdownTank, to: TAGS.transferPump, phase: 'liquid',
      points: [[684, ROW.main], [750, ROW.main], [810, ROW.main]]
    },
    {
      id: STREAMS.pumpedPaint, from: TAGS.transferPump, to: TAGS.filter, phase: 'liquid',
      points: [[838, ROW.main], [890, ROW.main], [928, ROW.main]]
    },
    {
      id: STREAMS.filteredPaint, from: TAGS.filter, to: TAGS.fillingLine, phase: 'liquid',
      points: [[964, ROW.main], [1020, ROW.main], [1068, ROW.main]]
    },
    {
      // Filled product leaves the diagram for the warehouse.
      id: STREAMS.packedProduct, from: TAGS.fillingLine, to: TAGS.fillingLine, phase: 'solid',
      points: [[1112, ROW.main], [1150, ROW.main], [1180, ROW.main]]
    }
  ]
};

export default FLOWSHEET;
