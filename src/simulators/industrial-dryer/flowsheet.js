/**
 * 02 — INDUSTRIAL DRYER — process flow diagram.
 *
 * A declarative spec only. This module computes nothing: node state and every
 * stream label arrive from engine.getEquipmentState() and engine.getStreams()
 * through view2d.applyState().
 *
 * Node tags and edge ids are imported from engine.js rather than retyped, so the
 * flowsheet node, the 3D group's userData.tag and the engine's own key are one
 * string by construction. Selection sync depends on that.
 *
 * Layout mirrors the plot plan in plant.js: solids left to right across the
 * middle, the air supply train above the feed end, and the gas cleaning train
 * above the discharge end.
 *
 * Two streams enter the plant from off the diagram — ambient air at the supply
 * fan and fuel at the heater. They are drawn as inlet stubs on the unit that
 * receives them, which is why their `from` and `to` are the same tag.
 */
import { TAGS, STREAMS } from './engine.js';

const ROW = { service: 140, train: 320, electrical: 480 };

export const FLOWSHEET = {
  width: 1130,
  height: 580,
  nodes: [
    // ---- drying air supply --------------------------------------------------
    { tag: TAGS.supplyFan, type: 'blower', label: 'Supply air fan', x: 110, y: ROW.service },
    { tag: TAGS.heater, type: 'heater', label: 'Air heater', x: 250, y: ROW.service },
    // ---- solids train -------------------------------------------------------
    { tag: TAGS.feedHopper, type: 'tank', label: 'Wet feed hopper', x: 110, y: ROW.train },
    { tag: TAGS.feedScrew, type: 'block', label: 'Feed screw', x: 250, y: ROW.train },
    { tag: TAGS.drum, type: 'dryer', label: 'Rotary drum dryer', x: 430, y: ROW.train },
    { tag: TAGS.productScrew, type: 'block', label: 'Product screw', x: 620, y: ROW.train },
    { tag: TAGS.cooler, type: 'exchanger', label: 'Product cooler', x: 770, y: ROW.train },
    { tag: TAGS.productBin, type: 'tank', label: 'Product bin', x: 910, y: ROW.train },
    // ---- gas cleaning -------------------------------------------------------
    { tag: TAGS.cyclone, type: 'clarifier', label: 'Cyclone', x: 620, y: ROW.service },
    { tag: TAGS.bagFilter, type: 'filter', label: 'Bag filter', x: 770, y: ROW.service },
    { tag: TAGS.exhaustFan, type: 'blower', label: 'Exhaust fan', x: 900, y: ROW.service },
    { tag: TAGS.stack, type: 'column', label: 'Stack', x: 1020, y: ROW.service },
    // ---- electrical ---------------------------------------------------------
    { tag: TAGS.mcc, type: 'block', label: 'Motor control centre', x: 1020, y: ROW.electrical }
  ],
  // Edge ids are engine stream ids. An edge only shows flow when the engine has
  // reported a non-zero flow for that exact stream; otherwise its label is an em dash.
  edges: [
    {
      id: STREAMS.wetFeed, from: TAGS.feedHopper, to: TAGS.feedScrew, phase: 'solid',
      points: [[130, 320], [185, 320], [228, 320]]
    },
    {
      id: STREAMS.feedToDrum, from: TAGS.feedScrew, to: TAGS.drum, phase: 'solid',
      points: [[272, 320], [345, 320], [404, 320]]
    },
    {
      // Air drawn in from atmosphere at the fan inlet.
      id: STREAMS.ambientAir, from: TAGS.supplyFan, to: TAGS.supplyFan, phase: 'air',
      points: [[40, 140], [68, 140], [96, 140]]
    },
    {
      id: STREAMS.fanDischarge, from: TAGS.supplyFan, to: TAGS.heater, phase: 'air',
      points: [[124, 140], [180, 140], [234, 140]]
    },
    {
      // Fuel gas from the off-plot supply.
      id: STREAMS.fuel, from: TAGS.heater, to: TAGS.heater, phase: 'gas',
      points: [[250, 58], [250, 92], [250, 124]]
    },
    {
      id: STREAMS.hotAir, from: TAGS.heater, to: TAGS.drum, phase: 'gas',
      points: [[266, 140], [340, 162], [400, 250], [425, 304]]
    },
    {
      id: STREAMS.drumExhaust, from: TAGS.drum, to: TAGS.cyclone, phase: 'gas',
      points: [[456, 306], [520, 230], [575, 170], [598, 150]]
    },
    {
      id: STREAMS.cycloneFines, from: TAGS.cyclone, to: TAGS.productScrew, phase: 'solid',
      points: [[620, 164], [620, 235], [620, 302]]
    },
    {
      id: STREAMS.cycloneGas, from: TAGS.cyclone, to: TAGS.bagFilter, phase: 'gas',
      points: [[642, 140], [698, 140], [752, 140]]
    },
    {
      id: STREAMS.filterFines, from: TAGS.bagFilter, to: TAGS.productScrew, phase: 'solid',
      points: [[770, 162], [730, 250], [650, 308]]
    },
    {
      id: STREAMS.cleanExhaust, from: TAGS.bagFilter, to: TAGS.exhaustFan, phase: 'gas',
      points: [[788, 140], [838, 140], [886, 140]]
    },
    {
      id: STREAMS.stackGas, from: TAGS.exhaustFan, to: TAGS.stack, phase: 'gas',
      points: [[914, 140], [962, 140], [1008, 140]]
    },
    {
      id: STREAMS.driedProduct, from: TAGS.drum, to: TAGS.productScrew, phase: 'solid',
      points: [[456, 320], [528, 320], [598, 320]]
    },
    {
      id: STREAMS.productToCooler, from: TAGS.productScrew, to: TAGS.cooler, phase: 'solid',
      points: [[642, 320], [698, 320], [754, 320]]
    },
    {
      id: STREAMS.coolProduct, from: TAGS.cooler, to: TAGS.productBin, phase: 'solid',
      points: [[786, 320], [838, 320], [890, 320]]
    }
  ]
};

export default FLOWSHEET;
