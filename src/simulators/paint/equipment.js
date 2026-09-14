/**
 * 04 — PAINT MANUFACTURING PLANT — equipment information.
 *
 * One complete card per tagged item. The card schema is documented in
 * information/equipmentCard.js: an incomplete entry is deliberately better
 * shown as "documentation pending" than filled in with plausible text.
 *
 * Live values are not held here. The card is handed engine.getEquipmentState()
 * values by the workspace at render time.
 */
import { TAGS } from './engine.js';

export const EQUIPMENT = {
  // -------------------------------------------------------------------------
  [TAGS.resinTank]: {
    tag: TAGS.resinTank, name: 'Resin storage tank', type: 'Vertical cylindrical tank, nitrogen blanketed, jacketed for winter',
    purpose: 'Holds the binder — the resin solution that becomes the continuous phase of the dried film, and the only thing in the tin that actually sticks to the wall.',
    howItWorks: 'The resin arrives already dissolved in solvent, typically at around sixty per cent solids, because a solid alkyd or acrylic at room temperature is a brittle glass rather than something that can be pumped. The tank is blanketed with nitrogen to keep oxygen off an unsaturated resin, and trace heated so it stays pumpable in a cold store.',
    whyUsed: 'Separating the binder charge between the mill base and the let-down is one of the two levers the operator has over the grind. A tank that can meter accurately into both is what makes that possible.',
    inputs: ['Resin solution from the supplier or from the resin plant', 'Nitrogen blanket'],
    outputs: ['Resin to the mill base', 'Resin to the let-down'],
    operatingVariables: ['Charge weight to each vessel', 'Temperature', 'Blanket pressure'],
    designVariables: ['Capacity and turnover', 'Jacket or trace heating duty', 'Metering accuracy of the load cells'],
    misoperation: [
      'Charging the whole resin to the mill base leaves nothing to let down with and makes a grind that cannot be corrected afterwards.',
      'Letting an unsaturated resin see air over a long storage time skins the surface and puts gel particles into the next batch.',
      'A cold resin is a far more viscous resin, and a batch made up cold will draw more power and grind differently.'
    ],
    theory: 'The viscosity of a polymer solution rises very steeply with concentration — far faster than linearly — because the chains begin to overlap and entangle. That is why a modest change in resin solids makes a large change to the mill base, and why high-solids paints are difficult rather than merely expensive.',
    equations: [{
      what: 'Vehicle viscosity against polymer concentration',
      equation: 'µ = µ_solvent · exp(α · c^1.4)',
      why: 'It is what decides whether a mill base is workable, and it is the reason the two mill base shares matter so much.',
      inputs: ['Polymer concentration in the vehicle', 'Solvent viscosity'],
      units: 'Pa·s',
      interpretation: 'Exponential, not proportional. Halving the polymer concentration does not halve the viscosity; it collapses it.'
    }],
    practice: 'Most paint plants buy resin rather than making it, and the specification they buy on is solids, viscosity and acid value. A change of resin supplier is treated as a reformulation even when the paper specification is identical.',
    safety: ['Flammable solvent: bonded and earthed, no unclassified equipment', 'Nitrogen blanket means the tank headspace is an asphyxiant', 'Confined space entry procedures for any internal work'],
    troubleshooting: [
      { symptom: 'Batch draws more power than usual from the start', cause: 'Cold resin, so a more viscous mill base', action: 'Check the tank temperature before touching the recipe.' },
      { symptom: 'Gel particles appearing on the grind gauge', cause: 'Skinned resin from a long storage under a lost blanket', action: 'Check the blanket pressure and strain the resin charge.' },
      { symptom: 'Viscosity drifting batch to batch', cause: 'Resin solids varying between deliveries', action: 'Check the certificate of analysis against the last one before adjusting the thinners.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.solventTank]: {
    tag: TAGS.solventTank, name: 'Solvent storage tank', type: 'Vertical cylindrical tank, bunded, vapour recovery on the vent',
    purpose: 'Holds the solvent blend that makes everything pumpable and then leaves. It is the largest single item in the recipe by volume and the whole of the number on the tin marked VOC.',
    howItWorks: 'A blend rather than a single liquid, chosen for its evaporation rate as much as for what it dissolves: a fast fraction to set the film quickly, a slow tail to keep it open long enough to level. It is metered to the mill base and to the let-down separately.',
    whyUsed: 'Nothing in a solvent-borne paint can be dispersed, pumped, filtered or applied at the concentration the dried film needs. The solvent exists to make the process possible and is then given back to the atmosphere, which is exactly why it is regulated.',
    inputs: ['Solvent blend delivery', 'Recovered solvent from the vapour system'],
    outputs: ['Solvent to the mill base', 'Solvent to the let-down'],
    operatingVariables: ['Charge weight to each vessel', 'Blend composition', 'Tank temperature'],
    designVariables: ['Capacity and bunding', 'Vapour recovery or carbon bed on the vent', 'Flash point of the blend held'],
    misoperation: [
      'Putting too much solvent in the mill base is the most common way to ruin a grind. It makes the charge easier to handle and impossible to disperse.',
      'Adding thinners quickly at the let-down shocks the resin off the pigment and flocculates a grind that was perfectly good.',
      'Correcting a heavy batch with extra solvent takes the volume solids and the film build with it.'
    ],
    theory: 'Solvent is not one thing. The blend has an evaporation profile, and the paint film sees all of it in sequence: the fast fraction sets the surface, the slow fraction governs how long the film stays open to level and release air. Changing a blend for cost almost always changes the appearance.',
    equations: [{
      what: 'Volatile organic content',
      equation: 'VOC = mass of organic volatiles per litre of paint',
      why: 'It is regulated per litre of product, not per kilogram of solvent bought, so raising the volume solids is the only real route down.',
      inputs: ['Volume solids', 'Resin solids', 'Solvent density'],
      units: 'g/L',
      interpretation: 'Some of the solvent arrives dissolved in the resin and was never a separate decision. That share is fixed until the resin is.'
    }],
    practice: 'Vapour recovery on the vent pays for itself on a large plant and is required in most jurisdictions. The recovered solvent is usually good enough to go back into the same blend.',
    safety: ['Flammable liquid store: bunded, earthed, classified area', 'Vapour is heavier than air and collects at low level', 'Static from splash filling is a real ignition source; fill from the bottom'],
    troubleshooting: [
      { symptom: 'Batches consistently thin against the recipe', cause: 'Metering drift or a wetter solvent blend', action: 'Check the calibration of the meter against a weighed charge.' },
      { symptom: 'Poor levelling on an unchanged recipe', cause: 'Blend short of its slow tail', action: 'Check the delivery specification, not the thickener.' },
      { symptom: 'Solvent smell around the tank farm', cause: 'Vent bed saturated or a failed seal', action: 'Treat as a leak until proven otherwise.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.additiveSkid]: {
    tag: TAGS.additiveSkid, name: 'Additive dosing skid', type: 'Small-volume metering skid with load cells',
    purpose: 'Meters the things that are a fraction of a per cent of the batch and decide how it behaves: rheology modifier, dispersant, defoamer, driers, and the tinting colourant.',
    howItWorks: 'Each additive is dosed by weight into the let-down under agitation. The rheology modifier is the one this model tracks, because it does most of the work: at a few tenths of a per cent it can multiply the low-shear viscosity several times over while barely touching the viscosity at brush shear.',
    whyUsed: 'A paint has to be two different liquids at once — heavy at rest so it does not sag, thin under a brush so it can be applied, and heavy again immediately afterwards so it stays where it was put. No base formulation does that on its own.',
    inputs: ['Rheology modifier', 'Tinting colourant', 'Dispersant, defoamer and driers'],
    outputs: ['Metered additives to the let-down tank'],
    operatingVariables: ['Dose of each additive', 'Order and rate of addition', 'Mixing time after each'],
    designVariables: ['Metering resolution at very small doses', 'Number of separate additive lines', 'Whether any additive needs pre-dilution'],
    misoperation: [
      'Over-dosing the rheology modifier makes a paint that will not level and reads far too heavy on the Stormer.',
      'Under-dosing it makes a paint that sags on a vertical surface at any useful film thickness.',
      'Adding a thickener before the pigment is properly wetted can lock in a flocculated structure that no amount of later work will undo.'
    ],
    theory: 'Sag and levelling pull in opposite directions, and they are the same property seen at different times. What stops a film running down a wall is a yield stress, and a yield stress is exactly what stops a brush mark flowing out. Every rheology decision in a paint is a position on that trade.',
    equations: [{
      what: 'Sag against levelling',
      equation: 'h_sag = τ_y / (ρ·g)        τ_level = 3·µ·λ⁴ / (16·π⁴·σ·h³)',
      why: 'They are the two consequences of the same structure, which is why the additive dose is a compromise rather than an optimum.',
      inputs: ['Yield stress', 'Low-shear viscosity', 'Film thickness'],
      units: 'h in m, τ_level in s',
      interpretation: 'Levelling time goes as the inverse cube of thickness. A thin coat of the same paint levels far more slowly than a thick one.'
    }],
    practice: 'Associative thickeners are the modern choice because their effect is shear-dependent in a useful way: the network they build breaks under a brush and rebuilds within seconds of the brush leaving.',
    safety: ['Some defoamers and driers are irritants or sensitisers; handle with the stated protection', 'Cobalt driers are under regulatory pressure and are being replaced', 'Small doses mean big consequences: double-check before charging'],
    troubleshooting: [
      { symptom: 'Paint sags on a vertical panel', cause: 'Yield stress too low for the film applied', action: 'Check the modifier dose against the recipe before blaming the applicator.' },
      { symptom: 'Brush marks still visible when dry', cause: 'Too much modifier, or the film applied too thinly', action: 'Check both: levelling is far more sensitive to thickness than to viscosity.' },
      { symptom: 'Colour drifting between batches', cause: 'Colourant dose or dispersion varying', action: 'Check the colourant metering and the let-down agitation time.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.bagDump]: {
    tag: TAGS.bagDump, name: 'Pigment bag dump station', type: 'Bag slitting hood with integral dust extraction and a vacuum eductor',
    purpose: 'Gets the pigment into the disperser without putting it into the operator, and without letting it pick up air on the way.',
    howItWorks: 'Bags are slit into a hooded hopper held under slight negative pressure by the dust collector. The powder falls or is drawn by a vacuum eductor into the vortex of the disperser, where the moving vehicle wets it immediately. Adding into the vortex rather than onto a still surface is what stops lumps forming.',
    whyUsed: 'Titanium dioxide is supplied as a fine powder in twenty-five kilogram bags or a one tonne bulk bag, and a plant charges well over a tonne of it per batch. Doing that by hand into an open vessel is neither safe nor reproducible.',
    inputs: ['Titanium dioxide', 'Extender pigment', 'Extraction air'],
    outputs: ['Pigment to the disperser vortex', 'Dust to the collector'],
    operatingVariables: ['Charge rate', 'Extraction air flow', 'Order of pigment addition'],
    designVariables: ['Hood face velocity', 'Eductor capacity', 'Whether bulk bags or sacks are handled'],
    misoperation: [
      'Charging faster than the vortex can wet the powder makes lumps, and a lump is a much harder thing to disperse than an agglomerate.',
      'Charging onto a stationary surface, or with the blade too deep, floats the pigment rather than drawing it in.',
      'Damp pigment from a poorly kept store sets into agglomerates that will not break at the stress a disperser can produce.'
    ],
    theory: 'A dry pigment agglomerate is held together by van der Waals forces across the contacts between primary particles, and by any solid bridges that moisture has left behind. The first job is wetting: displacing the air at the surface with vehicle. Only then can the blade pull the agglomerate apart.',
    equations: [{
      what: 'Wetting drives the first stage',
      equation: 'W_adhesion = γ_L (1 + cos θ)',
      why: 'If the vehicle does not wet the pigment surface, dispersion never starts, however much stress is applied afterwards.',
      inputs: ['Surface tension of the vehicle', 'Contact angle on the pigment'],
      units: 'J/m²',
      interpretation: 'This is what a wetting dispersant buys, and why one is worth more than extra horsepower on a difficult pigment.'
    }],
    practice: 'Most modern titanium dioxide grades are surface treated with alumina and silica, which makes them easier to wet and far more durable in the film — and a little harder to disperse than the untreated pigment they replaced.',
    safety: ['Respirable dust: extraction must be proven before charging', 'Bag slitting produces a dust cloud at face height', 'Never reach into a vessel with the blade turning, for any reason'],
    troubleshooting: [
      { symptom: 'Lumps on the grind gauge that will not clear', cause: 'Charged faster than the vortex could wet', action: 'Slow the addition and check the blade depth.' },
      { symptom: 'Dust escaping the hood', cause: 'Extraction fan or filter cleaning fault', action: 'Stop charging until the extraction is proven.' },
      { symptom: 'Grind stalls several points low with everything else normal', cause: 'Damp pigment', action: 'Check the store, and the age of the stock.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.dustCollector]: {
    tag: TAGS.dustCollector, name: 'Dust collector', type: 'Reverse-jet cartridge filter with an explosion vent',
    purpose: 'Takes the air drawn off the bag dump and the disperser hood, keeps the pigment, and lets clean air out.',
    howItWorks: 'Dust-laden air passes through pleated cartridges from outside to inside. A pulse of compressed air fired down each cartridge in turn knocks the collected layer off, and it falls into a hopper for return to a batch. The vent on the top is sized to relieve a dust explosion safely.',
    whyUsed: 'Pigment is expensive and the exposure limits on respirable dust are low. The collector is what makes the bag dump a workplace and returns most of what it catches to the process.',
    inputs: ['Dust-laden air from the bag dump and the disperser hood', 'Pulse air'],
    outputs: ['Clean air to atmosphere', 'Collected pigment to the hopper'],
    operatingVariables: ['Pressure drop across the cartridges', 'Pulse frequency', 'Air flow'],
    designVariables: ['Air-to-cloth ratio', 'Cartridge media and finish', 'Explosion vent area and the location it relieves to'],
    misoperation: [
      'Letting the pressure drop climb starves the hood of extraction long before the filter actually blinds.',
      'Pulsing too often wears the media and pushes fine dust through it.',
      'Collecting solvent-laden air and pigment dust in the same filter is a deliberate design decision, not an accident, and it is why the explosion vent is there.'
    ],
    theory: 'A cartridge filter does not work by sieving. The cake of collected dust is the filter; the media is only what holds it. That is why efficiency improves as the pressure drop rises, and why cleaning too aggressively makes the emission worse rather than better.',
    equations: [{
      what: 'Air-to-cloth ratio',
      equation: 'A/C = volumetric air flow / filter area',
      why: 'It is the one number that decides whether a collector will work, and the one most often specified too high to save capital.',
      inputs: ['Extraction air flow', 'Installed filter area'],
      units: 'm³/min per m²',
      interpretation: 'Below about one metre per minute a cartridge collector on fine pigment behaves; much above it, it blinds.'
    }],
    practice: 'Collected pigment is returned to a batch of the same colour rather than discarded, which on a white plant is straightforward and on a tinting plant needs housekeeping discipline.',
    safety: ['Fine pigment dust in air is an explosion hazard; the vent must relieve to a safe place', 'Never open the dirty side with the fan running', 'Compressed air at pulse pressure will injure'],
    troubleshooting: [
      { symptom: 'Pressure drop rising steadily', cause: 'Cartridges blinding, often with solvent-damp dust', action: 'Check the pulse system before replacing media.' },
      { symptom: 'Visible emission from the stack', cause: 'Split cartridge or a failed seal', action: 'Stop and find it; a visible emission of pigment is a failed containment.' },
      { symptom: 'Poor hood capture at the bag dump', cause: 'Fan performance or a partially closed damper', action: 'Measure the face velocity rather than judging by eye.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.disperser]: {
    tag: TAGS.disperser, name: 'High-speed disperser', type: 'Jacketed vessel with a sawtooth disc on a variable-speed hydraulic lift',
    purpose: 'Breaks the pigment agglomerates apart and wets their surfaces with vehicle. This is where the grind is made, and nothing downstream can improve on what leaves here.',
    howItWorks: 'A toothed disc on a vertical shaft turns fast enough to throw the mill base outwards, drawing material down the centre and up the walls in a torus — the doughnut an operator looks for. The high shear is not in the bulk of that flow but in the thin zone at the blade edge, and that is where the agglomerates are broken.',
    whyUsed: 'It is the cheapest way to put a very large amount of energy into a small volume of viscous fluid, and for most architectural paints it is the only grinding step needed.',
    inputs: ['Pigment from the bag dump', 'Resin and solvent charged to the mill base', 'Cooling water to the jacket'],
    outputs: ['Dispersed mill base', 'Solvent vapour to the hood'],
    operatingVariables: ['Blade speed and therefore tip speed', 'Dispersion time', 'Blade height above the floor', 'Mill base consistency'],
    designVariables: ['Blade diameter against tank diameter, usually one to three', 'Installed power, around forty kilowatts per cubic metre', 'Jacket area', 'Whether the blade is on a lift'],
    misoperation: [
      'Running on a mill base that is too thin is the classic failure: the blade cuts a hole and spins in it, and no dispersion happens at all.',
      'Running without cooling on a long dispersion drives the batch towards the solvent flash point over an open vessel with a spark source in it.',
      'Setting the blade too high aerates the batch; too low and the doughnut never forms.',
      'Grinding for longer than the energy curve is still giving anything is simply heating the batch.'
    ],
    theory: 'Dispersion is not mixing. Breaking an agglomerate requires a hydrodynamic stress larger than the force holding it together, and that stress is the product of the shear rate and the viscosity that carries it. A thin mill base has a high shear rate and nothing to transmit it with. Once the threshold is passed, how far the grind goes depends on the energy delivered per kilogram, which is why time and speed can be traded against each other and viscosity cannot be traded for either.',
    equations: [
      {
        what: 'Tip speed and power',
        equation: 'u = π·D·N        P = Np·ρ·N³·D⁵ + K·µ·N²·D³',
        why: 'Tip speed is what the equipment is rated on and what the operator sets; power is what the batch receives and what the motor has to find.',
        inputs: ['Blade diameter', 'Speed', 'Mill base density and viscosity'],
        units: 'u in m/s, P in W',
        interpretation: 'Twenty to twenty-five metres a second is the usual window. Power goes as the fifth power of diameter, so one blade size up is not a small change.'
      },
      {
        what: 'Stress threshold and specific energy',
        equation: 'σ = µ(γ̇)·γ̇        d = d_∞ + (d_0 − d_∞)·exp(−k·E)',
        why: 'The first decides whether anything is dispersing; the second decides how far it gets.',
        inputs: ['Mill base viscosity', 'Shear rate', 'Specific energy'],
        units: 'σ in Pa, E in J/kg',
        interpretation: 'Two different questions. Check the stress ratio before spending any more time on the batch.'
      }
    ],
    practice: 'Operators judge a mill base by eye, looking for the doughnut and a surface that just cracks rather than splashing. That judgement is a viscosity measurement, and it is a good one.',
    safety: ['Open vessel with flammable solvent and a high-speed rotating blade: the classification of this area is not a formality', 'The blade continues to turn after the drive is stopped', 'Hot batch and hot vessel walls on a long dispersion', 'Never charge, sample or scrape with the blade running'],
    troubleshooting: [
      { symptom: 'Blade spinning in a hole with no flow around it', cause: 'Mill base too thin, or the blade set too high', action: 'Lower the blade first; if that does not work the mill base needs less solvent.' },
      { symptom: 'Grind not improving with time', cause: 'Stress below the cohesive strength of the agglomerates', action: 'Check the stress ratio. More time cannot fix a threshold problem.' },
      { symptom: 'Motor tripping on load', cause: 'Mill base far too heavy for the installed power', action: 'Do not simply slow the blade — check the mill base recipe.' },
      { symptom: 'Batch running hot', cause: 'Cooling lost, or a long dispersion in a small jacket', action: 'Check the jacket flow; a hot batch loses solvent and thickens as it runs.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.chiller]: {
    tag: TAGS.chiller, name: 'Jacket chiller', type: 'Packaged glycol chiller with a circulating pump set',
    purpose: 'Takes the shaft power back out of the batch. Everything the disperser motor draws ends up as heat in the mill base, and the jacket is the only way out.',
    howItWorks: 'Chilled glycol circulates through the vessel jacket at a set temperature. The heat removed is the jacket area times the overall coefficient times the difference between the batch and the coolant, so it rises as the batch heats up and the batch settles where the two balance.',
    whyUsed: 'A forty kilowatt disperser running for half an hour puts twenty kilowatt-hours into a couple of tonnes of solvent-borne material. Without cooling that is a forty degree rise, and the solvent flash point is not far above it.',
    inputs: ['Chilled glycol', 'Electrical power to the compressor'],
    outputs: ['Warm glycol to the chiller', 'Heat rejected to atmosphere'],
    operatingVariables: ['Coolant set temperature', 'Circulation rate', 'Batch temperature achieved'],
    designVariables: ['Chiller duty against the installed disperser power', 'Jacket area and configuration', 'Glycol concentration and therefore the lowest usable temperature'],
    misoperation: [
      'Setting the coolant too cold does not help much and risks chilling the vessel wall enough to shock the resin out of solution against it.',
      'Losing circulation without losing the drive lets the batch run away, and the temperature is not on any instrument the operator is watching.',
      'A dirty jacket loses far more duty than people expect, and it fails slowly enough not to be noticed.'
    ],
    theory: 'The batch is a lumped thermal capacity with a first-order response: it approaches a steady temperature exponentially with a time constant equal to the mass times the specific heat over the jacket UA. On a short dispersion the batch never gets near that steady value, which is why the same plant can be fine at thirty minutes and dangerous at ninety.',
    equations: [{
      what: 'Batch temperature response',
      equation: 'm·c_p·dT/dt = P − UA·(T − T_j)        T(t) = T_∞ + (T_0 − T_∞)·exp(−t/τ)',
      why: 'It says both where the batch is heading and how fast, and the second matters more than the first on a short run.',
      inputs: ['Shaft power', 'Jacket UA', 'Batch mass and specific heat'],
      units: '°C',
      interpretation: 'Doubling the dispersion time does not double the temperature rise, because the batch is already part way to equilibrium.'
    }],
    practice: 'Most plants set the coolant around fifteen to twenty degrees rather than as cold as the chiller will go, and control the batch by limiting the dispersion time instead.',
    safety: ['Glycol is a contaminant: a jacket leak into a batch is a lost batch and a reportable one', 'Refrigerant under pressure', 'The batch temperature is a safety parameter on a solvent-borne plant, not a quality one'],
    troubleshooting: [
      { symptom: 'Batch hotter than usual on the same recipe', cause: 'Jacket fouling or low circulation', action: 'Compare the glycol return temperature with its usual value.' },
      { symptom: 'Chiller short-cycling', cause: 'Duty far larger than the load', action: 'Check the set point before the machine.' },
      { symptom: 'Vessel wall coated with a hard skin', cause: 'Coolant too cold, shocking the resin out against the wall', action: 'Raise the set point and clean the wall.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.beadMill]: {
    tag: TAGS.beadMill, name: 'Horizontal bead mill', type: 'Closed horizontal chamber with a pinned rotor and a media separator',
    purpose: 'Takes the grind below what a disperser can reach, for the products that need it.',
    howItWorks: 'The chamber is filled to around eighty per cent with small ceramic beads. A pinned rotor keeps them in motion, and mill base is pumped through. The energy goes into collisions between beads rather than into bulk shear, so the stress delivered to a particle caught between two of them is very much higher than anything a blade can produce. A screen or a centrifugal separator keeps the beads in the mill.',
    whyUsed: 'A disperser separates agglomerates and wets them; it does not reduce a primary particle and it stops earning its energy below a few microns. Where the product genuinely needs a finer grind — an automotive finish, a printing ink, a strong tint — a media mill is the only way there.',
    inputs: ['Mill base from the disperser', 'Cooling water to the chamber jacket'],
    outputs: ['Milled base to the let-down', 'Heat to the jacket'],
    operatingVariables: ['Number of passes or residence time', 'Throughput', 'Rotor speed and therefore power draw', 'Bead loading'],
    designVariables: ['Chamber volume', 'Bead size and density', 'Separator type', 'Installed power'],
    misoperation: [
      'Worn and rounded beads draw the same power and grind far less, and nothing on the panel says so.',
      'Running too fast a throughput gives each parcel too little residence time and simply heats it.',
      'Over-milling is real: past a point the energy goes into heat and into wearing the beads, not into the product.',
      'A blocked separator screen packs the mill and stops it hard.'
    ],
    theory: 'A media mill is an energy machine: what comes out depends on the specific energy put in, largely regardless of how it was arranged. That is why passes, residence time and power are interchangeable within limits, and why the useful measure is kilowatt-hours per tonne rather than time.',
    equations: [{
      what: 'Specific energy through the mill',
      equation: 'E = P · t_residence / m        d = d_∞ + (d_in − d_∞)·exp(−k·E)',
      why: 'It is the only variable that matters, and it lets two very different mills be compared honestly.',
      inputs: ['Mill power draw', 'Throughput', 'Batch mass'],
      units: 'J/kg',
      interpretation: 'Doubling the passes doubles the energy, and the grind responds exponentially — so the second pass buys much less than the first.'
    }],
    practice: 'Bead size is matched to the feed: large beads for a coarse feed because they carry more energy per collision, small beads for a fine one because there are far more contacts. Running the wrong size is a common and expensive mistake.',
    safety: ['Closed system under pump pressure containing flammable solvent', 'Beads are under pressure when the chamber is opened; follow the depressurising procedure', 'Very high internal temperatures if the flow stops with the rotor turning'],
    troubleshooting: [
      { symptom: 'Grind barely improving over the disperser', cause: 'Worn beads, or too few in the chamber', action: 'Check the bead charge and its size distribution before adding passes.' },
      { symptom: 'Mill outlet temperature climbing', cause: 'Throughput too low or cooling lost', action: 'Raise the flow before reducing the speed.' },
      { symptom: 'Pressure rising at the inlet', cause: 'Separator screen blinding', action: 'Stop and clean; a packed mill damages the rotor.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.letdownTank]: {
    tag: TAGS.letdownTank, name: 'Let-down tank', type: 'Jacketed vessel with a low-shear anchor or paddle agitator',
    purpose: 'Takes the mill base to the final formulation: the rest of the resin, the rest of the solvent, and the additives. This is where the paint becomes the product.',
    howItWorks: 'A slow agitator — not a disperser — folds the additions in without putting high shear into a grind that is already made. The order and the rate matter more than the time: resin first to keep the pigment surface covered, then the solvent, then the additives.',
    whyUsed: 'The grind has to be made at a consistency that will disperse and sold at a consistency that will apply, and those are very different. The let-down is the step between them.',
    inputs: ['Dispersed mill base', 'Let-down resin', 'Let-down solvent', 'Additives'],
    outputs: ['Finished paint to the transfer pump'],
    operatingVariables: ['Order and rate of addition', 'Agitation time', 'Final viscosity check'],
    designVariables: ['Working volume for the whole batch', 'Agitator type and speed', 'Whether it is the same vessel as the disperser or a separate one'],
    misoperation: [
      'Adding thinners too quickly shocks the resin off the pigment and flocculates the grind. The grind gauge will not see it; the gloss will.',
      'Adding a thickener before the batch is homogeneous locks in whatever structure is there at the time.',
      'Correcting viscosity with solvent rather than with the modifier takes the volume solids and the VOC with it.'
    ],
    theory: 'A dispersed pigment is kept apart either by an adsorbed layer of resin or by charge. Flood the system with solvent faster than the resin can re-adsorb and the layer is stripped, the particles find each other, and they form loose flocs. Those flocs are soft enough that a grind gauge blade flattens them, which is why the one instrument that should catch this misses it.',
    equations: [{
      what: 'Stormer viscosity from apparent viscosity',
      equation: 'KU = 50 + 21.12·(ln η_cP − 5.165)',
      why: 'It is the number the specification is written in and the number the laboratory reports, and it is a fit to a conversion table rather than a law.',
      inputs: ['Apparent viscosity at about 200 1/s'],
      units: 'Krebs units',
      interpretation: 'Logarithmic, so the same number of Krebs units means a much bigger viscosity change at the heavy end than at the light end.'
    }],
    practice: 'Many plants disperse and let down in the same vessel, lifting the blade and switching to a slow agitator. It saves a transfer and a clean, at the cost of tying the vessel up for the whole cycle.',
    safety: ['Open additions of flammable solvent to a warm batch', 'Ensure the disperser blade is stopped and locked before any slow-speed work', 'Sampling a hot batch releases vapour at face height'],
    troubleshooting: [
      { symptom: 'Gloss down with the grind gauge reading normally', cause: 'Flocculation from a fast let-down', action: 'Review the addition rate. This is the classic signature.' },
      { symptom: 'Batch heavier than the specification', cause: 'Modifier over-dosed, or solvent short', action: 'Check the charge weights before adding anything.' },
      { symptom: 'Air entrained into the batch', cause: 'Agitator running too fast, or a vortex reaching the blade', action: 'Slow it down; a defoamer is treating the symptom.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.transferPump]: {
    tag: TAGS.transferPump, name: 'Paint transfer pump', type: 'Air-operated double diaphragm pump',
    purpose: 'Moves the finished batch from the let-down tank through the filter to the filling line.',
    howItWorks: 'Compressed air drives two diaphragms alternately. There is no seal to leak, no close clearance to be worn by pigment, and the pump can be run dry, deadheaded and stalled against a closed valve without damage — which on a filling line that stops and starts all day is the whole point.',
    whyUsed: 'Paint is abrasive, shear sensitive and often flammable. A diaphragm pump handles all three: it is gentle, it tolerates solids, and an air motor has no ignition source.',
    inputs: ['Finished paint from the let-down tank', 'Compressed air'],
    outputs: ['Paint to the bag filter and the filling line'],
    operatingVariables: ['Air pressure and therefore flow', 'Discharge pressure against the filter', 'Stroke rate'],
    designVariables: ['Diaphragm material compatible with the solvent blend', 'Flow at the viscosity being pumped', 'Suction lift available'],
    misoperation: [
      'Running at too high a stroke rate on a shear-sensitive paint can shear-thin it in the line and give a misleading viscosity at the filling head.',
      'Letting the pump cavitate on a heavy batch starves the filter and gives a false reading of filter blinding.',
      'The wrong diaphragm elastomer swells in the solvent and fails without warning.'
    ],
    theory: 'A positive displacement pump delivers a volume per stroke almost regardless of the pressure it has to deliver it against, so the flow falls with viscosity only through the filling of the chamber. That is what makes it predictable on a product whose viscosity changes batch to batch.',
    equations: [{
      what: 'Flow from a displacement pump',
      equation: 'Q = V_stroke · n · η_volumetric',
      why: 'The flow follows the stroke rate rather than the head, which is what makes it suitable for a line that stops and starts.',
      inputs: ['Displaced volume', 'Stroke rate'],
      units: 'm³/s',
      interpretation: 'A centrifugal pump on this duty would lose most of its flow as the filter blinds. This one does not.'
    }],
    practice: 'Air consumption is the real running cost of a diaphragm pump, and it is usually underestimated. On a large plant an electrically driven progressive cavity pump is cheaper to run and harder to live with.',
    safety: ['Bond and earth: flowing paint generates static', 'Compressed air at the motor will injure', 'A stalled pump is still pressurised on the discharge side'],
    troubleshooting: [
      { symptom: 'Flow falling on an unchanged setting', cause: 'Filter blinding, or a worn check valve', action: 'Check the filter differential first; it is much more likely.' },
      { symptom: 'Pump running but not delivering', cause: 'Diaphragm failed, or air lock on the suction', action: 'A diaphragm failure shows as paint in the air exhaust.' },
      { symptom: 'Pulsation at the filling head', cause: 'No damper, or one that has lost its charge', action: 'Check the damper pressure against the line pressure.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.filter]: {
    tag: TAGS.filter, name: 'Bag filter', type: 'Single or duplex bag housing with a nominally rated felt bag',
    purpose: 'The last thing between the batch and the tin. It takes out anything that should not be there: a gel particle, a fibre from a bag, a lump that never dispersed.',
    howItWorks: 'Paint passes through a felt bag in a pressure housing. The rating is nominal rather than absolute — a felt bag is a depth filter, so it catches most of what it is rated for and not all. A duplex housing lets one bag be changed while the other is in service.',
    whyUsed: 'A single hard particle in a tin of gloss paint is a visible defect in a finished film and a complaint. Filtration is cheap insurance against a batch being rejected for something that has nothing to do with the formulation.',
    inputs: ['Paint from the transfer pump'],
    outputs: ['Filtered paint to the filling line', 'Retained solids on the bag'],
    operatingVariables: ['Differential pressure across the bag', 'Flow', 'Bag change interval'],
    designVariables: ['Bag rating in microns', 'Filter area against the flow', 'Housing material and seals'],
    misoperation: [
      'Filtering too finely takes out pigment as well as contamination and changes the colour.',
      'Running past the differential limit bursts the bag and puts everything it had collected into the product at once.',
      'Using filtration to hide a bad grind is possible, expensive and obvious in the retained solids.'
    ],
    theory: 'A depth filter collects across the thickness of the medium rather than on its face, so its efficiency improves as it loads and then collapses when it blinds. The differential pressure is the only honest indication of where on that curve it is.',
    equations: [{
      what: 'Filter loading',
      equation: 'ΔP rises as the retained mass accumulates, until the bag blinds',
      why: 'It is the only measurement available, and it is a good one if it is watched rather than merely alarmed on.',
      inputs: ['Flow', 'Solids retained'],
      units: 'bar',
      interpretation: 'A differential that climbs faster than usual says something upstream changed, which is worth knowing before the bag is changed and the evidence discarded.'
    }],
    practice: 'What comes off the bag is worth looking at. Gel particles say resin, fibres say packaging, hard grit says the grind or the previous colour, and each sends the investigation somewhere different.',
    safety: ['Depressurise and drain before opening the housing', 'The bag is soaked in flammable solvent when removed', 'Dispose of used bags as solvent-contaminated waste'],
    troubleshooting: [
      { symptom: 'Differential rising quickly on a normal batch', cause: 'Poor grind, or contamination upstream', action: 'Inspect the retained solids; they identify the source.' },
      { symptom: 'Particles in the filled product', cause: 'Bag burst, or a bypass around a poorly seated seal', action: 'Check the seal seat, not just the bag.' },
      { symptom: 'Colour shift after filtration', cause: 'Rating too fine for the pigment', action: 'Check the bag rating against the specification.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.fillingLine]: {
    tag: TAGS.fillingLine, name: 'Filling line', type: 'Volumetric filler with lidding, labelling and check weighing',
    purpose: 'Puts the batch into tins, seals them, labels them and confirms the weight.',
    howItWorks: 'A volumetric filler dispenses by displacement into each container, which is why the density of the batch matters: the tin is sold by volume and checked by weight, and the two are connected only through the density the formulation produced.',
    whyUsed: 'It is the last operation, and the one most likely to be the bottleneck on a plant that makes many small batches of many colours.',
    inputs: ['Filtered paint', 'Empty containers, lids and labels'],
    outputs: ['Filled and labelled product', 'Reject containers'],
    operatingVariables: ['Fill volume and the check weight it should produce', 'Line speed', 'Container size'],
    designVariables: ['Number of heads', 'Container sizes handled', 'Whether the filling area is a classified zone'],
    misoperation: [
      'Filling on a density different from the one the fill volume was set against gives a product that is correct by volume and fails a weight check, or the reverse.',
      'Filling a batch that has not been given time to release entrained air gives short fills that only appear later.',
      'Changing container size without re-validating the fill is the most common cause of a weights and measures failure.'
    ],
    theory: 'Paint is sold by volume in most markets and checked by weight, so the density is a specification in its own right. It follows directly from the formulation: the volumes of the components are additive and their masses are known, so the density is fixed the moment the recipe is.',
    equations: [{
      what: 'Density from the formulation',
      equation: 'ρ = Σ(m_i) / Σ(V_i)',
      why: 'It links the recipe to the check weight, and a drift in one shows up as a failure in the other.',
      inputs: ['Component masses and volumes'],
      units: 'g/L',
      interpretation: 'A batch that fills heavy is usually a batch with more pigment or less solvent than it should have, and that is worth finding out before it ships.'
    }],
    practice: 'Check weighing every container is normal, and the data is a better process monitor than most laboratory tests: a slow drift in fill weight is visible long before anything else says the formulation has moved.',
    safety: ['Classified area: filling flammable liquid generates static and vapour', 'Bond and earth every container on a large fill', 'Manual handling of full containers'],
    troubleshooting: [
      { symptom: 'Check weights drifting light', cause: 'Entrained air, or a density lower than the fill was set for', action: 'Check the batch density against the recipe before adjusting the filler.' },
      { symptom: 'Inconsistent fills between heads', cause: 'Air in a head, or a worn seal', action: 'Compare the heads individually rather than adjusting the whole line.' },
      { symptom: 'Lids not seating', cause: 'Paint on the rim from an overfill or a splashing fill', action: 'Slow the fill approach; a poorly seated lid is a skinned tin.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.qualityLab]: {
    tag: TAGS.qualityLab, name: 'Quality control laboratory', type: 'Batch release testing: grind gauge, Stormer, gloss meter, contrast card',
    purpose: 'Decides whether the batch ships, is adjusted, or is rejected. Four measurements do most of that work.',
    howItWorks: 'A grind gauge is a steel block with a tapered groove; paint drawn down it shows the point where the largest particles start to break the surface, read on the Hegman scale. A Stormer viscometer turns a paddle at a fixed torque and reports Krebs units. A gloss meter reads specular reflection at sixty degrees. A drawdown over a black and white card, measured with a reflectometer, gives the contrast ratio.',
    whyUsed: 'Every one of these is a proxy for something the customer will experience, and each is fast enough to hold a batch in the vessel while it is done.',
    inputs: ['Batch sample from the let-down tank'],
    outputs: ['Release decision', 'Adjustment instruction back to the plant'],
    operatingVariables: ['Fineness, viscosity, gloss, contrast ratio, density', 'Colour against a standard'],
    designVariables: ['Which tests are release tests and which are monitoring', 'Sampling point and timing', 'Standards and their retention'],
    misoperation: [
      'Trusting the grind gauge alone: it is the one instrument a flocculated batch gets past, because its blade shears the soft flocs flat.',
      'Measuring viscosity at a different temperature from the specification. Viscosity is strongly temperature dependent and the specification means very little without one.',
      'Adjusting a batch on a single reading rather than confirming it.'
    ],
    theory: 'Each test is a proxy and each has a blind spot. Fineness sees hard particles and not soft flocs. Gloss sees the surface and not the bulk. Contrast ratio sees the film at one thickness and not at another. Taken together they are a reasonable picture; taken singly they are each capable of passing a bad batch.',
    equations: [{
      what: 'Hegman fineness',
      equation: 'H = 8 − d / 12.7        d in µm',
      why: 'It converts the depth at which particles first break the surface of the drawdown into the number the specification is written in.',
      inputs: ['Largest particle size'],
      units: 'Hegman units',
      interpretation: 'The scale runs from a hundred microns at zero to nothing at eight, so a single Hegman point is about thirteen microns — a very large step at the coarse end and a very small one at the fine end.'
    }],
    practice: 'Retained samples of every batch are kept for the shelf life of the product. When a complaint arrives two years later, the retain is the only evidence that exists.',
    safety: ['Solvent handling in a laboratory needs the same respect as in the plant', 'Drawdown solvents and cleaning solvents are usually the most volatile in the building'],
    troubleshooting: [
      { symptom: 'Gloss fails with fineness passing', cause: 'Flocculation, or a formulation too close to the critical pigment volume concentration', action: 'Check Λ first, then the let-down procedure.' },
      { symptom: 'Viscosity out of specification on an unchanged recipe', cause: 'Sample temperature, or a thickener dosing error', action: 'Re-measure at the specified temperature before adjusting anything.' },
      { symptom: 'Contrast ratio low with pigment on specification', cause: 'Film applied too thin, or crowded pigment', action: 'Check the drawdown thickness before the recipe.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.mcc]: {
    tag: TAGS.mcc, name: 'Motor control centre', type: 'Flameproof-rated switchgear and variable-speed drives',
    purpose: 'Starts, protects and controls every motor on the plant, and records what each one drew while it did it.',
    howItWorks: 'One cubicle per drive, with isolation, protection and — on the disperser and the bead mill — a variable-speed drive. The drive reports speed, current and torque, which on a disperser is a direct measurement of what is happening in the vessel.',
    whyUsed: 'The disperser is the largest motor on the plant and the one whose load carries the most information. Watching its current over the dispersion is watching the mill base viscosity change.',
    inputs: ['Incoming supply', 'Start and stop commands', 'Speed set points'],
    outputs: ['Power to each drive', 'Current, speed and torque back to the control system'],
    operatingVariables: ['Speed set points', 'Motor currents', 'Energy per batch'],
    designVariables: ['Installed power per drive', 'Area classification and the equipment rating it requires', 'Harmonic filtering on the drives'],
    misoperation: [
      'Resetting a tripped disperser without finding out why it tripped risks doing it again into a damaged drive.',
      'Defeating the interlock between the blade lift and the drive is how people are injured on this equipment.',
      'Running a drive above its rating on a heavy batch shortens its life invisibly.'
    ],
    theory: 'Motor current on a fixed-speed drive is close to proportional to torque, and torque at a fixed speed is close to proportional to the viscosity of what the blade is turning. That makes the ammeter the cheapest rheometer on the plant, and often the most useful.',
    equations: [{
      what: 'Shaft power from the drive',
      equation: 'P = √3 · V · I · cos φ · η',
      why: 'It converts a number the operator can see into the specific energy the batch is receiving.',
      inputs: ['Line voltage and current', 'Power factor', 'Motor efficiency'],
      units: 'W',
      interpretation: 'Dividing that by the mill base mass gives kilojoules per kilogram, which is the number that actually predicts the grind.'
    }],
    practice: 'Plants that log disperser current against batch number find formulation drift long before the laboratory does, because the ammeter sees the mill base and the laboratory sees the finished paint.',
    safety: ['Arc flash: the correct procedure and protection for any work on live switchgear', 'Isolate and lock off before any work on a drive or a blade', 'Area classification governs what may be installed here at all'],
    troubleshooting: [
      { symptom: 'Disperser current higher than usual from the start', cause: 'Mill base heavier than the recipe, or cold', action: 'Check the charge weights and the resin temperature.' },
      { symptom: 'Current falling through the dispersion', cause: 'Normal: the batch is warming and thinning', action: 'Compare the fall against previous batches rather than the absolute value.' },
      { symptom: 'Repeated trips on the same drive', cause: 'Mechanical fault or a genuine overload', action: 'Do not raise the setting. Find the load.' }
    ]
  }
};

export default EQUIPMENT;
