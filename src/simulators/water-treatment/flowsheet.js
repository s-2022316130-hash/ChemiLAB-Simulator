/**
 * 01 — WATER TREATMENT PLANT — process flow diagram.
 *
 * A declarative spec only. This module computes nothing: node state and every
 * stream label arrive from engine.getEquipmentState() and engine.getStreams()
 * through view2d.applyState().
 *
 * Node tags and edge ids are imported from engine.js rather than retyped, so
 * the flowsheet node, the 3D group's userData.tag and the engine's own key are
 * one string by construction. Selection sync depends on that.
 *
 * Layout mirrors the plot plan in plant.js: process train left to right across
 * the middle, chemical dosing and backwash services above, residuals below.
 */
import { TAGS, STREAMS } from './engine.js';

// Rows: services above, the treatment train through the middle, residuals below.
const ROW = { service: 120, train: 270, residual: 440 };

export const FLOWSHEET = {
  width: 1110,
  height: 560,
  nodes: [
    // ---- treatment train ---------------------------------------------------
    { tag: TAGS.intakePump, type: 'pump', label: 'Intake pumps', x: 70, y: ROW.train },
    { tag: TAGS.rapidMix, type: 'mixer', label: 'Rapid mix', x: 190, y: ROW.train },
    { tag: TAGS.floc, type: 'mixer', label: 'Flocculation', x: 320, y: ROW.train },
    { tag: TAGS.clarifier, type: 'clarifier', label: 'Sedimentation', x: 460, y: ROW.train },
    { tag: TAGS.filters, type: 'filter', label: 'Rapid sand filters', x: 610, y: ROW.train },
    { tag: TAGS.contactTank, type: 'tank', label: 'Contact tank', x: 760, y: ROW.train },
    { tag: TAGS.clearwell, type: 'tank', label: 'Clearwell', x: 890, y: ROW.train },
    { tag: TAGS.highLiftPump, type: 'pump', label: 'High lift pumps', x: 1020, y: ROW.train },
    // ---- chemical dosing and backwash services -----------------------------
    { tag: TAGS.coagDosing, type: 'tank', label: 'Alum dosing', x: 190, y: ROW.service },
    { tag: TAGS.blower, type: 'blower', label: 'Air scour blower', x: 490, y: ROW.service },
    { tag: TAGS.backwashPump, type: 'pump', label: 'Backwash pump', x: 610, y: ROW.service },
    { tag: TAGS.backwashTank, type: 'tank', label: 'Backwash tank', x: 700, y: ROW.service },
    { tag: TAGS.chlorineDosing, type: 'tank', label: 'Chlorine dosing', x: 830, y: ROW.service },
    // ---- residuals and electrical ------------------------------------------
    { tag: TAGS.sludge, type: 'tank', label: 'Sludge sump', x: 460, y: ROW.residual },
    { tag: TAGS.washRecovery, type: 'tank', label: 'Washwater recovery', x: 610, y: ROW.residual },
    { tag: TAGS.mcc, type: 'block', label: 'Motor control centre', x: 1020, y: ROW.residual }
  ],
  // Edge ids are engine stream ids. An edge only shows flow when the engine has
  // reported a non-zero flow for that exact stream; otherwise its label is an em dash.
  edges: [
    {
      id: STREAMS.raw, from: TAGS.intakePump, to: TAGS.rapidMix, phase: 'liquid',
      points: [[96, 270], [140, 270], [164, 270]]
    },
    {
      id: STREAMS.coagulant, from: TAGS.coagDosing, to: TAGS.rapidMix, phase: 'liquid',
      points: [[190, 146], [190, 200], [190, 246]]
    },
    {
      id: STREAMS.mixed, from: TAGS.rapidMix, to: TAGS.floc, phase: 'liquid',
      points: [[216, 270], [262, 270], [294, 270]]
    },
    {
      id: STREAMS.flocculated, from: TAGS.floc, to: TAGS.clarifier, phase: 'slurry',
      points: [[346, 270], [396, 270], [437, 270]]
    },
    {
      id: STREAMS.settled, from: TAGS.clarifier, to: TAGS.filters, phase: 'liquid',
      points: [[483, 270], [540, 270], [591, 270]]
    },
    {
      id: STREAMS.sludge, from: TAGS.clarifier, to: TAGS.sludge, phase: 'slurry',
      points: [[460, 293], [460, 360], [460, 421]]
    },
    {
      id: STREAMS.filtrate, from: TAGS.filters, to: TAGS.contactTank, phase: 'liquid',
      points: [[629, 270], [686, 270], [739, 270]]
    },
    {
      // Runs back through P-102, which sits in the backwash supply line.
      id: STREAMS.backwashSupply, from: TAGS.backwashTank, to: TAGS.filters, phase: 'liquid',
      points: [[679, 120], [624, 120], [610, 136], [610, 251]]
    },
    {
      id: STREAMS.backwashWaste, from: TAGS.filters, to: TAGS.washRecovery, phase: 'slurry',
      points: [[599, 291], [558, 350], [595, 421]]
    },
    {
      // Recovered supernatant returns the long way round, under the residuals row.
      id: STREAMS.recovered, from: TAGS.washRecovery, to: TAGS.intakePump, phase: 'liquid',
      points: [[610, 459], [500, 512], [200, 512], [70, 470], [70, 285]]
    },
    {
      id: STREAMS.chlorine, from: TAGS.chlorineDosing, to: TAGS.contactTank, phase: 'liquid',
      points: [[826, 146], [798, 200], [770, 250]]
    },
    {
      id: STREAMS.disinfected, from: TAGS.contactTank, to: TAGS.clearwell, phase: 'liquid',
      points: [[781, 270], [832, 270], [869, 270]]
    },
    {
      id: STREAMS.product, from: TAGS.clearwell, to: TAGS.highLiftPump, phase: 'liquid',
      points: [[911, 270], [960, 270], [1005, 270]]
    },
    {
      id: STREAMS.airScour, from: TAGS.blower, to: TAGS.filters, phase: 'air',
      points: [[490, 135], [490, 205], [583, 257]]
    }
  ]
};

export default FLOWSHEET;
