/**
 * 03 — AMMONIA–UREA FERTILIZER PLANT — process flow diagram.
 *
 * A declarative spec only. This module computes nothing: node state and every
 * stream label arrive from engine.getEquipmentState() and engine.getStreams()
 * through view2d.applyState().
 *
 * Node tags and edge ids are imported from engine.js rather than retyped, so the
 * flowsheet node, the 3D group's userData.tag and the engine's own key are one
 * string by construction.
 *
 * The diagram is laid out as the two loops it is: the ammonia loop closes back
 * on itself along the top through the recycle compressor, and the urea loop
 * closes through the stripper and the carbamate condenser. Both are drawn as
 * loops rather than straightened out, because the recycle is the point.
 */
import { TAGS, STREAMS } from './engine.js';

const ROW = { above: 70, main: 200, below: 350, finishing: 490 };

export const FLOWSHEET = {
  width: 1260,
  height: 600,
  nodes: [
    // ---- ammonia loop -------------------------------------------------------
    { tag: TAGS.makeupComp, type: 'compressor', label: 'Syngas compressor', x: 90, y: ROW.main },
    { tag: TAGS.converter, type: 'reactor', label: 'Ammonia converter', x: 230, y: ROW.main },
    { tag: TAGS.wasteHeatBoiler, type: 'exchanger', label: 'Waste-heat boiler', x: 360, y: ROW.main },
    { tag: TAGS.chiller, type: 'exchanger', label: 'Ammonia chiller', x: 480, y: ROW.main },
    { tag: TAGS.separator, type: 'vessel', label: 'Ammonia separator', x: 600, y: ROW.main },
    { tag: TAGS.recycleComp, type: 'compressor', label: 'Recycle compressor', x: 330, y: ROW.above },
    { tag: TAGS.purgeRecovery, type: 'vessel', label: 'Purge recovery', x: 600, y: ROW.below },
    { tag: TAGS.ammoniaStorage, type: 'tank', label: 'Ammonia storage', x: 740, y: ROW.below },
    // ---- urea synthesis -----------------------------------------------------
    { tag: TAGS.co2Comp, type: 'compressor', label: 'CO₂ compressor', x: 740, y: ROW.above },
    { tag: TAGS.ureaReactor, type: 'reactor', label: 'Urea reactor', x: 880, y: ROW.main },
    { tag: TAGS.stripper, type: 'column', label: 'HP stripper', x: 1010, y: ROW.main },
    { tag: TAGS.carbamateCondenser, type: 'exchanger', label: 'Carbamate condenser', x: 1010, y: ROW.above },
    { tag: TAGS.evaporator, type: 'exchanger', label: 'Evaporator', x: 1150, y: ROW.main },
    // ---- finishing ----------------------------------------------------------
    { tag: TAGS.prillTower, type: 'column', label: 'Prilling tower', x: 1150, y: ROW.below },
    { tag: TAGS.productBin, type: 'tank', label: 'Product bin', x: 1150, y: ROW.finishing },
    { tag: TAGS.mcc, type: 'block', label: 'Motor control centre', x: 90, y: ROW.finishing }
  ],
  // Edge ids are engine stream ids. An edge only shows flow when the engine has
  // reported a non-zero flow for that exact stream; otherwise its label is an em dash.
  edges: [
    {
      // Makeup gas arrives from the reforming section, off the diagram.
      id: STREAMS.makeupSyngas, from: TAGS.makeupComp, to: TAGS.makeupComp, phase: 'gas',
      points: [[20, 200], [50, 200], [76, 200]]
    },
    {
      id: STREAMS.compressedSyngas, from: TAGS.makeupComp, to: TAGS.converter, phase: 'gas',
      points: [[104, 200], [155, 200], [214, 200]]
    },
    {
      // The recycle rejoins the makeup at the converter inlet.
      id: STREAMS.converterFeed, from: TAGS.recycleComp, to: TAGS.converter, phase: 'gas',
      points: [[316, 70], [200, 70], [190, 110], [212, 178]]
    },
    {
      id: STREAMS.converterEffluent, from: TAGS.converter, to: TAGS.wasteHeatBoiler, phase: 'gas',
      points: [[246, 200], [300, 200], [344, 200]]
    },
    {
      id: STREAMS.cooledEffluent, from: TAGS.wasteHeatBoiler, to: TAGS.chiller, phase: 'gas',
      points: [[376, 200], [428, 200], [464, 200]]
    },
    {
      id: STREAMS.chilledEffluent, from: TAGS.chiller, to: TAGS.separator, phase: 'gas',
      points: [[496, 200], [548, 200], [586, 200]]
    },
    {
      // The loop closes here: gas off the separator goes back to the compressor.
      id: STREAMS.recycleGas, from: TAGS.separator, to: TAGS.recycleComp, phase: 'gas',
      points: [[600, 176], [600, 70], [480, 70], [344, 70]]
    },
    {
      id: STREAMS.purgeGas, from: TAGS.separator, to: TAGS.purgeRecovery, phase: 'gas',
      points: [[615, 218], [640, 270], [615, 332]]
    },
    {
      // Recovered hydrogen returns to the front of the loop.
      id: STREAMS.recoveredHydrogen, from: TAGS.purgeRecovery, to: TAGS.makeupComp, phase: 'gas',
      points: [[578, 362], [300, 420], [110, 380], [90, 216]]
    },
    {
      id: STREAMS.liquidAmmonia, from: TAGS.separator, to: TAGS.ammoniaStorage, phase: 'liquid',
      points: [[622, 214], [690, 260], [722, 334]]
    },
    {
      id: STREAMS.ammoniaToUrea, from: TAGS.ammoniaStorage, to: TAGS.ureaReactor, phase: 'liquid',
      points: [[760, 340], [840, 300], [868, 220]]
    },
    {
      // Carbon dioxide arrives from the reforming section, off the diagram.
      id: STREAMS.co2Feed, from: TAGS.co2Comp, to: TAGS.co2Comp, phase: 'gas',
      points: [[672, 70], [700, 70], [726, 70]]
    },
    {
      id: STREAMS.compressedCo2, from: TAGS.co2Comp, to: TAGS.ureaReactor, phase: 'gas',
      points: [[754, 70], [846, 104], [872, 176]]
    },
    {
      id: STREAMS.reactorEffluent, from: TAGS.ureaReactor, to: TAGS.stripper, phase: 'liquid',
      points: [[896, 200], [948, 200], [996, 200]]
    },
    {
      // The urea loop closes through the carbamate condenser and back into the
      // reactor, so the route runs deliberately through V-303 rather than past it.
      id: STREAMS.carbamateRecycle, from: TAGS.stripper, to: TAGS.ureaReactor, phase: 'slurry',
      points: [[1010, 176], [1010, 120], [1010, 70], [946, 62], [898, 120], [890, 176]]
    },
    {
      id: STREAMS.ureaSolution, from: TAGS.stripper, to: TAGS.evaporator, phase: 'liquid',
      points: [[1024, 200], [1084, 200], [1134, 200]]
    },
    {
      id: STREAMS.ureaMelt, from: TAGS.evaporator, to: TAGS.prillTower, phase: 'liquid',
      points: [[1150, 218], [1150, 276], [1150, 314]]
    },
    {
      id: STREAMS.prilledProduct, from: TAGS.prillTower, to: TAGS.productBin, phase: 'solid',
      points: [[1150, 386], [1150, 440], [1150, 470]]
    }
  ]
};

export default FLOWSHEET;
