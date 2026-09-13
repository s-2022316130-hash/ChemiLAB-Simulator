/**
 * 03 — AMMONIA–UREA FERTILIZER PLANT — equipment information.
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
  [TAGS.makeupComp]: {
    tag: TAGS.makeupComp, name: 'Syngas makeup compressor', type: 'Multi-stage centrifugal compressor, steam turbine driven',
    purpose: 'Raises the synthesis gas from the pressure it leaves the reforming section at to the pressure the ammonia loop runs at.',
    howItWorks: 'Several centrifugal stages in series, with intercooling between them and a knockout drum to drop out the water that condenses as the gas cools. The final stage discharges into the loop just upstream of the converter.',
    whyUsed: 'The ammonia reaction loses moles, so its equilibrium improves with pressure. Every bar of loop pressure is bought here, and this machine is usually the single largest power consumer on an ammonia plant.',
    inputs: ['Synthesis gas from the reforming and purification section', 'Steam to the turbine driver'],
    outputs: ['Compressed makeup gas to the synthesis loop', 'Condensate from the intercoolers'],
    operatingVariables: ['Suction and discharge pressure', 'Throughput', 'Speed', 'Stage temperatures'],
    designVariables: ['Number of stages and the ratio across each', 'Intercooler duty', 'Surge margin', 'Driver type and rating'],
    misoperation: [
      'Operating near surge damages the machine quickly; the anti-surge recycle exists to stop that and costs power whenever it opens.',
      'Carrying water or liquid into a stage will destroy the impeller.',
      'Running the loop at a lower pressure than design to save power costs conversion faster than it saves anything.'
    ],
    theory: 'Compression work rises with the logarithm of the pressure ratio, so the last few bar are much cheaper than the first. It also rises with suction temperature, which is why intercooling between stages is worth the exchangers it takes.',
    equations: [{
      what: 'Compression work',
      equation: 'W = n · R · T · ln(P₂/P₁) / η',
      why: 'It sets the driver size, and it shows why intercooling between stages is worth having.',
      inputs: ['Molar flow', 'Suction temperature', 'Pressure ratio', 'Efficiency'],
      units: 'W',
      interpretation: 'This is the isothermal work, the honest lower bound. A real machine sits above it, and the gap is what the efficiency figure represents.'
    }],
    practice: 'Ammonia plants drive the big machines with steam turbines rather than motors, using steam raised from the reforming and synthesis heat. That is what makes the plant a coherent energy system rather than a large electricity consumer.',
    safety: ['Hydrogen at pressure: any leak is a fire before it is anything else', 'Never defeat the anti-surge control', 'Hot casings and lines between stages', 'Lock off before any work on the driver'],
    troubleshooting: [
      { symptom: 'Discharge pressure falling at constant speed', cause: 'Fouled or damaged impeller, or a leaking recycle valve', action: 'Check the anti-surge valve position before assuming machine damage.' },
      { symptom: 'Rising stage temperatures', cause: 'Intercooler fouling', action: 'Check cooling water side before the gas side.' },
      { symptom: 'Surge on load change', cause: 'Operating point moved left of the surge line', action: 'Review the control response; repeated surge will destroy the rotor.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.recycleComp]: {
    tag: TAGS.recycleComp, name: 'Synthesis loop recycle compressor', type: 'Single-stage centrifugal circulator',
    purpose: 'Makes up the pressure the gas loses going round the loop, so the unconverted hydrogen and nitrogen can be sent back to the converter.',
    howItWorks: 'The gas leaving the separator is still close to loop pressure — it has only lost what friction and the exchangers took. This machine restores that difference, typically a few per cent of the absolute pressure, at a very large volumetric flow.',
    whyUsed: 'It is what makes the loop a loop. Per-pass conversion is only around a fifth, so without recycle four fifths of the feed would leave unreacted. This machine is the difference between a plant and a once-through experiment.',
    inputs: ['Gas from the ammonia separator', 'Driver power'],
    outputs: ['Recycle gas to the converter inlet'],
    operatingVariables: ['Recycle flow', 'Differential pressure', 'Recycle to makeup ratio'],
    designVariables: ['Volumetric capacity at loop pressure', 'Differential head', 'Often mounted on the same shaft as the makeup machine'],
    misoperation: [
      'Losing the recycle drops the plant to a fraction of its output immediately, and everything downstream of it follows.',
      'Running a lower recycle rate raises the per-pass conversion and lowers the total production, which is a trap worth understanding.',
      'The differential is small, so the machine is sensitive to any added resistance in the loop.'
    ],
    theory: 'The recycle ratio is what converts a poor per-pass conversion into a good overall one. The relation is the same one that governs the urea loop: overall conversion is per-pass divided by one minus the unconverted fraction times the recovery.',
    equations: [{
      what: 'Overall conversion with recycle',
      equation: 'X_overall = X_pass / ( 1 − (1 − X_pass) · recovery )',
      why: 'It is why a converter that manages a fifth of its feed can sit in a plant that converts nearly all of it.',
      inputs: ['Per-pass conversion', 'Recovery'],
      units: 'dimensionless',
      interpretation: 'Recovery matters far more than per-pass conversion. That is worth remembering before spending money on catalyst.'
    }],
    practice: 'On most modern plants this wheel sits on the same shaft as the makeup compressor, driven by the same turbine, which saves a machine and a driver.',
    safety: ['Hydrogen at full loop pressure', 'Very large volumetric flow: a seal failure vents quickly', 'Guard the coupling', 'Isolate and purge before opening'],
    troubleshooting: [
      { symptom: 'Production down, per-pass conversion up', cause: 'Recycle rate has fallen', action: 'Check the machine and the loop resistance. Higher per-pass conversion with lower output is the signature.' },
      { symptom: 'Loop differential rising', cause: 'Resistance added somewhere in the loop, often an exchanger fouling', action: 'Survey the pressure profile round the loop rather than replacing the machine.' },
      { symptom: 'Seal gas consumption rising', cause: 'Seal wear', action: 'Trend it; a dry gas seal usually gives warning before it fails.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.converter]: {
    tag: TAGS.converter, name: 'Ammonia synthesis converter', type: 'Multi-bed catalytic reactor with interbed quench',
    purpose: 'Converts part of the hydrogen and nitrogen passing through it into ammonia over a promoted iron catalyst.',
    howItWorks: 'Gas passes down through several beds of catalyst. The reaction gives out heat, so the gas gets hotter as it goes and the equilibrium gets worse; cold quench gas is injected between beds to pull the temperature back down before the next one. The result is a saw-tooth temperature profile that keeps each bed closer to its best operating line than one deep bed ever could.',
    whyUsed: 'It is the reaction the whole plant exists for. Everything upstream prepares gas for it, and everything downstream separates and uses what it makes.',
    inputs: ['Mixed makeup and recycle gas at loop pressure'],
    outputs: ['Converter effluent carrying roughly 15 to 18 per cent ammonia'],
    operatingVariables: ['Bed temperatures', 'Loop pressure', 'Space velocity', 'Catalyst activity', 'Outlet ammonia'],
    designVariables: ['Catalyst volume and bed arrangement', 'Quench distribution', 'Pressure shell design', 'Internal insulation between the catalyst and the shell'],
    misoperation: [
      'Running hot raises the rate and lowers the attainable yield at the same time, and above about 520 °C the catalyst sinters and the damage is permanent.',
      'Running cold is safe for the catalyst and useless for the plant: the rate falls away and the converter cannot approach the equilibrium it is offered.',
      'Oxygen compounds in the feed poison the catalyst; that is what the purification section upstream exists to prevent.'
    ],
    theory: 'The reaction is exothermic and loses moles, so equilibrium prefers cold and high pressure, while the rate prefers hot. There is an optimum temperature at every conversion, and the locus of those optima is what the bed and quench arrangement is designed to follow.',
    equations: [
      {
        what: 'Equilibrium constant',
        equation: 'Kp = p_NH₃ / ( p_N₂^0.5 · p_H₂^1.5 )',
        why: 'It is the ceiling the converter is working against, and it moves with temperature.',
        inputs: ['Partial pressures', 'Temperature'],
        units: 'atm⁻¹',
        interpretation: 'Inerts lower every partial pressure at once, which is why the purge rate turns up in a conversion calculation.'
      },
      {
        what: 'Approach to equilibrium',
        equation: 'X_pass = η · X_eq',
        why: 'It separates what thermodynamics allows from what the catalyst and the residence time actually deliver.',
        inputs: ['Catalyst activity', 'Space velocity', 'Temperature'],
        units: 'dimensionless',
        interpretation: 'Catalyst ageing shows here first. The target does not move; the gap to it widens.'
      }
    ],
    practice: 'Radial-flow converters have largely replaced axial ones on new plants, because they give the same conversion at a far lower pressure drop, and pressure drop round the loop is paid for by the recycle compressor every hour.',
    safety: ['High-pressure hydrogen at temperature', 'Catalyst is pyrophoric when reduced: it must be passivated before the vessel is opened', 'Nitriding of the shell is a long-term integrity concern', 'Entry only under a full confined-space permit after passivation'],
    troubleshooting: [
      { symptom: 'Outlet ammonia falling, temperatures normal', cause: 'Catalyst activity down, or inerts up in the loop', action: 'Compare the approach to equilibrium against the equilibrium itself. If only the approach moved, it is the catalyst.' },
      { symptom: 'Bed temperatures rising and drifting', cause: 'Quench distribution failing', action: 'Check the quench valves and the interbed distributors.' },
      { symptom: 'Sudden loss of activity', cause: 'Poisoning, usually by an oxygen compound breakthrough', action: 'Check the purification section upstream; recovery may be partial.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.wasteHeatBoiler]: {
    tag: TAGS.wasteHeatBoiler, name: 'Synthesis waste-heat boiler', type: 'Fire-tube boiler on the converter effluent',
    purpose: 'Takes the heat the synthesis reaction gave out and turns it into high-pressure steam, while cooling the effluent on its way to the separator.',
    howItWorks: 'Hot converter effluent passes through tubes surrounded by boiling water. The gas gives up its sensible heat and the water boils, raising steam that goes to the turbines driving the compressors.',
    whyUsed: 'The synthesis reaction is strongly exothermic. Without recovery that heat would have to be thrown away to cooling water, and the plant would then have to buy the steam its compressors need from somewhere else.',
    inputs: ['Hot converter effluent', 'Boiler feedwater'],
    outputs: ['Cooled effluent to the chiller', 'High-pressure steam to the turbines'],
    operatingVariables: ['Gas inlet and outlet temperature', 'Steam generation rate', 'Drum level'],
    designVariables: ['Surface area', 'Steam pressure', 'Tube material for hydrogen at temperature', 'Circulation arrangement'],
    misoperation: [
      'Losing drum level uncovers tubes and they fail quickly.',
      'Poor feedwater chemistry scales the water side and the tube metal temperature climbs out of range.',
      'Bypassing the boiler to save time on a start-up throws away the heat and then leaves the turbines short of steam.'
    ],
    theory: 'The duty available is the heat of reaction times the extent of reaction. It is why the converter and the boiler are always sized together, and why a converter making less ammonia also leaves the plant short of steam.',
    equations: [{
      what: 'Heat released by the reaction',
      equation: 'Q = ΔH_rxn · (moles of nitrogen reacted)',
      why: 'It links the conversion directly to the steam the plant has available to drive itself with.',
      inputs: ['Heat of reaction', 'Extent of reaction'],
      units: 'kW',
      interpretation: 'At 92.4 kJ per mole of nitrogen, a plant of this size raises tens of tonnes of steam an hour from synthesis heat alone.'
    }],
    practice: 'Hydrogen at temperature attacks ordinary steel, so the tubes and the shell are in materials chosen for that, and the metal temperatures are watched closely.',
    safety: ['High-pressure steam', 'Hydrogen on the tube side', 'Drum level is a safety-critical measurement', 'Relief protection on both sides'],
    troubleshooting: [
      { symptom: 'Steam generation down', cause: 'Conversion down, or the boiler fouling', action: 'Check the converter outlet ammonia first; the boiler usually reflects what the converter did.' },
      { symptom: 'Gas outlet temperature rising', cause: 'Fouling on the gas side', action: 'Trend the approach temperature rather than the absolute value.' },
      { symptom: 'Drum level unstable', cause: 'Feedwater control or swell on a load change', action: 'Check the three-element control before the level instrument.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.chiller]: {
    tag: TAGS.chiller, name: 'Refrigerated ammonia chiller', type: 'Kettle exchanger against evaporating ammonia refrigerant',
    purpose: 'Cools the loop gas far enough that the ammonia in it condenses and can be separated.',
    howItWorks: 'Loop gas passes through tubes surrounded by liquid ammonia refrigerant boiling at low pressure. The refrigerant vapour goes to the refrigeration compressor and the cycle repeats. The plant uses its own product as its refrigerant, which is neat and also means a refrigeration failure and a product problem arrive together.',
    whyUsed: 'Cooling water can only take the gas to ambient, and at ambient far too much ammonia stays in the vapour. Refrigeration is what makes the separation good enough for the loop to work.',
    inputs: ['Cooled loop gas from the waste-heat boiler and water coolers', 'Liquid ammonia refrigerant'],
    outputs: ['Chilled gas and condensed ammonia to the separator', 'Refrigerant vapour to the refrigeration compressor'],
    operatingVariables: ['Outlet temperature', 'Refrigerant pressure', 'Refrigeration duty'],
    designVariables: ['Surface area', 'Refrigerant evaporating temperature', 'Number of refrigeration levels'],
    misoperation: [
      'Running warmer to save refrigeration power leaves more ammonia in the recycle, which the loop then has to carry round again.',
      'Running colder than the design costs compressor power quickly, since the refrigeration duty rises steeply as the level drops.',
      'Losing refrigeration stops ammonia recovery and the loop fills with product.'
    ],
    theory: 'How much ammonia stays in the gas is a vapour pressure question, not a heat transfer one. The exchanger only has to reach the temperature; the temperature then decides the split.',
    equations: [{
      what: 'Ammonia left in the vapour',
      equation: 'y_NH₃ = p_sat,NH₃(T) / P_loop',
      why: 'It shows the two handles that exist — how cold, and at what pressure — and that nothing else changes the answer.',
      inputs: ['Separator temperature', 'Loop pressure'],
      units: 'mole fraction',
      interpretation: 'Because it is a ratio, a higher loop pressure recovers more ammonia at the same temperature. The two decisions are linked.'
    }],
    practice: 'Large plants use two or three refrigeration levels rather than one, so most of the duty is removed at a warmer and cheaper level and only the last part at the coldest.',
    safety: ['Large ammonia inventory: toxic and an asphyxiant', 'Gas detection and breathing apparatus at the refrigeration section', 'Relief protection on the refrigerant side', 'Cold burns from the refrigerant lines'],
    troubleshooting: [
      { symptom: 'Ammonia in the recycle rising', cause: 'Chiller not reaching temperature', action: 'Check the refrigerant level and the compressor before the exchanger.' },
      { symptom: 'Refrigeration power up at the same temperature', cause: 'Fouling, or non-condensables in the refrigerant', action: 'Purge the refrigeration system and check the approach temperature.' },
      { symptom: 'Liquid carryover to the compressor', cause: 'Level control on the kettle', action: 'A refrigeration compressor will not tolerate liquid; trip protection must be proved.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.separator]: {
    tag: TAGS.separator, name: 'Ammonia separator', type: 'High-pressure vertical knockout vessel',
    purpose: 'Separates the condensed liquid ammonia from the gas that goes back round the loop.',
    howItWorks: 'Chilled two-phase flow enters and slows. Liquid ammonia drops to the bottom and is let down to storage; the gas leaves the top carrying ammonia at exactly its saturation concentration for the vessel conditions.',
    whyUsed: 'It is the point at which product leaves the loop. Everything the separator fails to condense goes round again, which raises the recycle rate for the same production.',
    inputs: ['Chilled loop gas with condensed ammonia'],
    outputs: ['Liquid ammonia to storage', 'Gas to the recycle compressor and the purge'],
    operatingVariables: ['Temperature', 'Pressure', 'Liquid level', 'Ammonia left in the vapour'],
    designVariables: ['Vessel diameter for the settling velocity', 'Liquid holdup for level control', 'Demister arrangement', 'High-pressure design'],
    misoperation: [
      'A high level carries liquid into the recycle compressor, which will not survive it.',
      'A low level breaks the liquid seal and blows high-pressure gas into the let-down system.',
      'Expecting better recovery from a bigger vessel misunderstands the problem: it is the temperature that sets the split, not the residence time.'
    ],
    theory: 'This vessel performs a flash at its own conditions. The vapour leaves saturated, so the separation is decided entirely by temperature and pressure and not at all by how long anything sits in the vessel.',
    equations: [{
      what: 'Saturation split',
      equation: 'y_NH₃,vapour = p_sat(T) / P        liquid = total NH₃ − vapour NH₃',
      why: 'It gives the recovery directly from two measurements that are already on the panel.',
      inputs: ['Temperature', 'Pressure', 'Ammonia entering'],
      units: 'kmol/h',
      interpretation: 'At 180 bar and −5 °C about two per cent of the gas leaving is still ammonia.'
    }],
    practice: 'Some loops place the separator before the recycle compressor and some after; the arrangement changes which machine sees the ammonia and is one of the real differences between loop designs.',
    safety: ['High-pressure liquid ammonia: a leak flashes and is immediately dangerous', 'Level is safety critical in both directions', 'Gas detection around the vessel', 'Relief to a safe location'],
    troubleshooting: [
      { symptom: 'Liquid carryover to the compressor', cause: 'High level or a failed demister', action: 'Trip on high level must be proved; inspect the demister at the next opportunity.' },
      { symptom: 'Recovery lower than expected', cause: 'Warmer than intended, or the pressure has dropped', action: 'Check both; the split depends on their ratio.' },
      { symptom: 'Level swinging', cause: 'Let-down valve sizing or two-phase flow at the inlet', action: 'Check the inlet device before re-tuning the level controller.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.purgeRecovery]: {
    tag: TAGS.purgeRecovery, name: 'Purge gas hydrogen recovery', type: 'Membrane or cryogenic recovery unit',
    purpose: 'Recovers hydrogen from the purge stream so it can go back to the loop instead of being burned.',
    howItWorks: 'The purge is first scrubbed with water to take out the ammonia it carries, then passed to a membrane or cryogenic unit where hydrogen is separated from the methane and argon. The hydrogen returns to the compressor suction and the rest goes to fuel.',
    whyUsed: 'The purge is the only way inerts leave the loop, but it takes hydrogen and nitrogen with them. Recovering the hydrogen makes the inert control much cheaper, and on a large plant it pays for itself quickly.',
    inputs: ['Purge gas from the separator', 'Scrubbing water'],
    outputs: ['Recovered hydrogen to the compressor suction', 'Inert-rich fuel gas', 'Ammonia solution from the scrubber'],
    operatingVariables: ['Purge rate', 'Loop inert level', 'Hydrogen recovery', 'Membrane differential'],
    designVariables: ['Recovery target', 'Membrane area or cold-box duty', 'Pretreatment to protect the membranes'],
    misoperation: [
      'Cutting the purge to save hydrogen raises the loop inert level, which costs partial pressure and therefore conversion. It is a trade rather than a saving.',
      'Letting ammonia through to the membranes damages them.',
      'Purging far more than needed wastes hydrogen that recovery cannot fully get back.'
    ],
    theory: 'The inert balance is the whole story: at steady state, inerts in with the makeup equal inerts out with the purge. That one equation fixes the relationship between purge rate and loop inert level.',
    equations: [{
      what: 'Inert balance',
      equation: 'F_makeup · y_inert,makeup = F_purge · y_inert,loop',
      why: 'It is what determines the inert level in the loop, and it contains nothing about the converter at all.',
      inputs: ['Makeup rate and inert content', 'Purge rate'],
      units: 'kmol/h',
      interpretation: 'Halving the purge roughly doubles the loop inerts. Cleaner makeup gas is the other way to solve the same problem.'
    }],
    practice: 'Membrane units are now standard because they are simple and have no rotating parts; cryogenic recovery gives a purer hydrogen product and is used where nitrogen recovery is wanted too.',
    safety: ['Hydrogen-rich gas throughout', 'Ammonia in the scrubber section', 'Membranes fail progressively rather than suddenly, so trend the recovery', 'Fuel gas header integrity'],
    troubleshooting: [
      { symptom: 'Loop inerts rising at an unchanged purge rate', cause: 'Makeup gas carrying more inerts than usual', action: 'Check the reforming and purification section; the loop is reporting an upstream change.' },
      { symptom: 'Hydrogen recovery falling', cause: 'Membrane fouling or ammonia breakthrough from the scrubber', action: 'Check the scrubber before the membranes.' },
      { symptom: 'Production down with everything else normal', cause: 'Inert level has crept up over weeks', action: 'Trend the inert level rather than looking at today alone.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.ammoniaStorage]: {
    tag: TAGS.ammoniaStorage, name: 'Liquid ammonia storage', type: 'Pressure sphere',
    purpose: 'Holds liquid ammonia between the synthesis loop and the urea plant, so neither has to follow the other minute by minute.',
    howItWorks: 'Ammonia is held as a liquid under its own vapour pressure in a sphere. Boil-off is drawn back to the refrigeration system rather than vented.',
    whyUsed: 'The two halves of the plant are different processes with different upsets. Storage between them means a wobble in the loop does not immediately become a wobble in the urea reactor, and ammonia can be sold if urea production is down.',
    inputs: ['Liquid ammonia from the separator'],
    outputs: ['Ammonia to the urea plant', 'Ammonia to sales or road loading', 'Boil-off vapour to refrigeration'],
    operatingVariables: ['Level', 'Pressure', 'Temperature', 'Boil-off rate'],
    designVariables: ['Capacity in hours of production', 'Pressure or refrigerated storage', 'Bunding and vapour containment', 'Relief and flare arrangement'],
    misoperation: [
      'Overfilling removes the vapour space that keeps the pressure stable.',
      'Venting boil-off instead of recovering it is both a loss and an environmental event.',
      'Ammonia is toxic: a release at ground level travels and does not disperse as quickly as people expect.'
    ],
    theory: 'A pressure sphere sits at the vapour pressure of its contents, so its pressure is a direct reading of its temperature. Heat leaking in raises both, and the boil-off taken away is what holds them steady.',
    equations: [{
      what: 'Storage pressure',
      equation: 'P = p_sat,NH₃(T_storage)',
      why: 'It means the pressure gauge is really a thermometer, and a rising pressure is heat coming in.',
      inputs: ['Storage temperature'],
      units: 'bar',
      interpretation: 'Ammonia at ambient sits near 8 bar, which is why atmospheric storage has to be refrigerated to −33 °C instead.'
    }],
    practice: 'Large inventories are held refrigerated at atmospheric pressure rather than under pressure, because the consequence of a failure is very much smaller. Spheres are used for the smaller working inventories.',
    safety: ['Ammonia is toxic at low concentration and an asphyxiant at high', 'Water deluge and gas detection around storage', 'Breathing apparatus available and people trained in it', 'Never approach a suspected leak from downwind'],
    troubleshooting: [
      { symptom: 'Pressure rising', cause: 'Heat ingress, or boil-off recovery not keeping up', action: 'Check the refrigeration return before venting anything.' },
      { symptom: 'Level falling with no export', cause: 'Leak, or an open drain', action: 'Treat as a leak until proved otherwise.' },
      { symptom: 'Water in the ammonia', cause: 'Carryover from the scrubber section', action: 'Check the ammonia specification; the urea plant is sensitive to water.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.co2Comp]: {
    tag: TAGS.co2Comp, name: 'Carbon dioxide compressor', type: 'Multi-stage centrifugal compressor with intercooling',
    purpose: 'Raises carbon dioxide from the low pressure it leaves the removal section at to urea reactor pressure.',
    howItWorks: 'Four or more stages with intercooling and moisture knockout between them. A small amount of air is usually injected for passivation, which keeps an oxide layer on the stainless steel downstream and is what stops the reactor corroding.',
    whyUsed: 'Carbon dioxide arrives at close to atmospheric pressure and the urea reactor runs at around 150 bar. That whole pressure rise happens here.',
    inputs: ['Carbon dioxide from the removal section', 'Passivation air', 'Driver power'],
    outputs: ['Compressed carbon dioxide to the urea reactor'],
    operatingVariables: ['Suction and discharge pressure', 'Throughput', 'Passivation air rate', 'Stage temperatures'],
    designVariables: ['Number of stages', 'Materials for wet carbon dioxide, which is corrosive', 'Intercooler and knockout arrangement'],
    misoperation: [
      'Losing the passivation air lets the reactor liner corrode, and the damage is expensive and slow to find.',
      'Carrying water forward corrodes the machine itself.',
      'Too much passivation air puts inerts into the urea section where they have to be vented.'
    ],
    theory: 'Wet carbon dioxide forms carbonic acid, so the wet stages are the corrosive ones and the design is driven by materials as much as by thermodynamics.',
    equations: [{
      what: 'Feed ratio set here',
      equation: 'N/C = ammonia fed / carbon dioxide fed',
      why: 'This machine sets the denominator of the most important ratio in the urea plant.',
      inputs: ['Carbon dioxide rate', 'Ammonia rate'],
      units: 'mol/mol',
      interpretation: 'Changing the carbon dioxide rate changes the N/C ratio just as surely as changing the ammonia rate does.'
    }],
    practice: 'Carbon dioxide compression is one of the larger power consumers in a urea plant, and is another machine usually driven by steam rather than a motor.',
    safety: ['Carbon dioxide is an asphyxiant and collects in low places', 'Wet carbon dioxide is corrosive', 'Passivation air must be proved before the reactor is fed', 'Gas detection at low level around the machine'],
    troubleshooting: [
      { symptom: 'Reactor corrosion found at inspection', cause: 'Passivation air lost or intermittent over a long period', action: 'Check the air injection measurement and its reliability history.' },
      { symptom: 'Discharge temperature high', cause: 'Intercooler fouling', action: 'Check the cooling water side first.' },
      { symptom: 'N/C ratio drifting', cause: 'Carbon dioxide rate moving with upstream conditions', action: 'Ratio control should pace this machine against the ammonia feed.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.ureaReactor]: {
    tag: TAGS.ureaReactor, name: 'Urea synthesis reactor', type: 'High-pressure trayed reactor, stainless or titanium lined',
    purpose: 'Reacts ammonia and carbon dioxide to ammonium carbamate and then dehydrates the carbamate to urea.',
    howItWorks: 'Two reactions in one vessel. Carbamate forms almost instantly and gives out heat. It then loses water to become urea, which is slow and takes heat back, so the reactor needs both residence time and the heat the first reaction provided. Trays stop the liquid back-mixing so the composition moves steadily up the vessel.',
    whyUsed: 'It is where the fertilizer is actually made. Everything upstream of it prepares the two feeds, and everything downstream separates what did not react and finishes what did.',
    inputs: ['Liquid ammonia', 'Compressed carbon dioxide', 'Recycled carbamate solution'],
    outputs: ['Reactor effluent: urea, water, unconverted carbamate and excess ammonia'],
    operatingVariables: ['Temperature', 'Pressure', 'N/C ratio', 'Water to carbon dioxide ratio', 'Residence time', 'Conversion'],
    designVariables: ['Volume for the residence time', 'Tray arrangement', 'Liner material', 'Pressure and temperature rating'],
    misoperation: [
      'Below an N/C ratio of about three the conversion falls away steeply; the excess ammonia is what drives the dehydration forward.',
      'Above about 195 °C the biuret formation and the corrosion rate both rise faster than the conversion does.',
      'Water returning with the recycle inhibits the reaction it is a product of, which is why the recovery section matters as much as the reactor.',
      'Losing passivation lets the liner corrode, and a liner leak in a 150 bar vessel is a serious event.'
    ],
    theory: 'The first reaction is fast and exothermic and effectively goes to completion. The second is slow, endothermic and equilibrium limited, and it is inhibited by the water it produces. That is why conversion has an optimum temperature rather than rising with it, and why excess ammonia helps.',
    equations: [
      {
        what: 'The two steps',
        equation: '2NH₃ + CO₂ → NH₂COONH₄        NH₂COONH₄ ⇌ NH₂CONH₂ + H₂O',
        why: 'Separating them explains everything else: what the heat balance does, why water hurts, and why residence time matters.',
        inputs: ['Ammonia and carbon dioxide'],
        units: 'mol/mol',
        interpretation: 'The first step supplies the heat the second one needs, which is why the reactor is close to adiabatic.'
      },
      {
        what: 'Equilibrium conversion',
        equation: 'X_eq = f( N/C , H₂O/C , T )',
        why: 'It is the ceiling for one pass, and all three variables in it are things an operator can move.',
        inputs: ['N/C ratio', 'Water ratio', 'Temperature'],
        units: 'fraction of carbon dioxide',
        interpretation: 'Around 60 per cent at normal conditions, which sounds poor until the recycle is taken into account.'
      }
    ],
    practice: 'Stripping processes pass the reactor effluent countercurrent to carbon dioxide or ammonia at full pressure, which decomposes most of the carbamate without letting the pressure down. That is what made total-recycle urea plants economic.',
    safety: ['150 bar with ammonia and carbamate: leaks are both toxic and highly corrosive', 'Liner integrity monitoring is safety critical', 'Passivation air must be proved before feeding', 'Entry only after a full decontamination'],
    troubleshooting: [
      { symptom: 'Conversion down, feeds and temperature normal', cause: 'Water returning with the recycle', action: 'Check the water to carbon dioxide ratio; the fault is usually in the recovery section.' },
      { symptom: 'Conversion falls as temperature is raised', cause: 'Past the optimum', action: 'The optimum is a peak, not a limit. Come back down.' },
      { symptom: 'Biuret rising', cause: 'Temperature or residence too high, or the evaporator running hard', action: 'Check the evaporator first; most biuret is formed there rather than here.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.stripper]: {
    tag: TAGS.stripper, name: 'High-pressure carbamate stripper', type: 'Falling-film stripper at reactor pressure',
    purpose: 'Decomposes the unconverted carbamate in the reactor effluent and drives it off as gas, without letting the pressure down.',
    howItWorks: 'The effluent runs as a thin film down heated tubes while stripping gas passes up. The carbamate decomposes back to ammonia and carbon dioxide, which leave with the gas, and the urea solution carries on down.',
    whyUsed: 'It is the single piece of equipment that makes a modern urea plant what it is. Recovering the carbamate at full pressure means it can be condensed and returned without recompression, which is what lifted overall conversion above ninety per cent economically.',
    inputs: ['Reactor effluent', 'Stripping gas', 'Heating steam'],
    outputs: ['Stripped urea solution', 'Carbamate gas to the condenser'],
    operatingVariables: ['Bottom temperature', 'Stripping efficiency', 'Steam rate', 'Pressure'],
    designVariables: ['Tube length and the film distributor', 'Material, usually titanium or a high-grade duplex', 'Steam pressure'],
    misoperation: [
      'Too hot and the urea hydrolyses back to carbamate and biuret forms.',
      'Too cool and the stripping is incomplete, so carbamate goes down to the low-pressure section where recovering it costs much more.',
      'Poor film distribution leaves dry patches that corrode and foul.'
    ],
    theory: 'Carbamate decomposition is favoured by heat and by a low partial pressure of its products, which is exactly what a stripping gas provides. The stripper is therefore a decomposition and a separation at once.',
    equations: [{
      what: 'What the stripper contributes',
      equation: 'recovery = carbamate returned / carbamate leaving the reactor',
      why: 'It is the recovery term in the recycle relation, and therefore what sets the overall conversion ceiling.',
      inputs: ['Stripping efficiency', 'Downstream recovery'],
      units: 'fraction',
      interpretation: 'A few points of recovery are worth far more than the same number of points of per-pass conversion.'
    }],
    practice: 'Carbon dioxide stripping and ammonia stripping are the two established routes, and which one a plant uses is the main thing that distinguishes the major urea process licensors from each other.',
    safety: ['High-pressure ammonia and carbamate', 'Carbamate is extremely corrosive: material substitution is never acceptable', 'Steam side relief protection', 'Decontamination before entry'],
    troubleshooting: [
      { symptom: 'Low-pressure section overloaded', cause: 'Stripping efficiency down, so carbamate is going downstream', action: 'Check the stripper bottom temperature and the steam supply.' },
      { symptom: 'Biuret rising', cause: 'Stripper running too hot', action: 'Check the temperature profile; the top of the range is not a target.' },
      { symptom: 'Tube corrosion at inspection', cause: 'Poor film distribution or lost passivation', action: 'Inspect the distributor and review the passivation air record.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.carbamateCondenser]: {
    tag: TAGS.carbamateCondenser, name: 'Carbamate condenser', type: 'High-pressure condenser raising low-pressure steam',
    purpose: 'Condenses the gas from the stripper back to a carbamate solution and returns it to the reactor.',
    howItWorks: 'Ammonia and carbon dioxide from the stripper recombine to carbamate, giving out heat as they do. That heat is recovered as low-pressure steam, and the carbamate solution flows back to the reactor.',
    whyUsed: 'It closes the urea loop. Without it the stripper would simply be moving material from one place to another; with it, the unconverted feed goes back to the reactor at pressure and gets another chance.',
    inputs: ['Carbamate gas from the stripper', 'Boiler feedwater'],
    outputs: ['Carbamate solution to the reactor', 'Low-pressure steam'],
    operatingVariables: ['Condensing temperature', 'Water content of the returned solution', 'Steam raised'],
    designVariables: ['Surface area', 'Steam pressure, which sets the condensing temperature', 'Materials for carbamate service'],
    misoperation: [
      'Returning more water than necessary inhibits the reactor, so how much water goes back matters as much as how much carbamate does.',
      'Condensing too cold makes the solution difficult to handle and can deposit solids.',
      'Losing this condenser drops overall conversion immediately, whatever the reactor is doing.'
    ],
    theory: 'Carbamate formation is exothermic, so the condenser is a heat source rather than a heat sink. Recovering that heat as steam is part of what makes the process energy efficient.',
    equations: [{
      what: 'Water carried back to the reactor',
      equation: 'H₂O/C in the reactor ≈ f( recovery, condensing conditions )',
      why: 'It is the term that limits the urea loop, and it comes from here rather than from the reactor.',
      inputs: ['Recovery', 'Condenser conditions'],
      units: 'mol/mol',
      interpretation: 'Better recovery returns more carbamate and more water with it. The optimum is not at the maximum.'
    }],
    practice: 'Modern designs combine the condenser and part of the reaction volume in one vessel, so the carbamate begins converting to urea while it is still condensing.',
    safety: ['Carbamate at high pressure: corrosive and toxic', 'Steam side relief', 'Never substitute materials in carbamate service', 'Decontaminate before entry'],
    troubleshooting: [
      { symptom: 'Overall conversion down, per-pass steady', cause: 'Recovery has fallen', action: 'The gap between the two figures is the diagnosis. Look here rather than at the reactor.' },
      { symptom: 'Reactor water ratio up', cause: 'Condenser returning a wetter solution', action: 'Check the condensing temperature and the low-pressure section balance.' },
      { symptom: 'Steam generation down', cause: 'Less carbamate condensing, so less heat released', action: 'Usually a symptom of a stripper problem rather than a condenser one.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.evaporator]: {
    tag: TAGS.evaporator, name: 'Urea evaporation section', type: 'Two-stage falling-film vacuum evaporator',
    purpose: 'Concentrates the urea solution to a melt dry enough to prill.',
    howItWorks: 'The solution is heated under vacuum in two stages, the second at a deeper vacuum than the first, until it is a melt of around 99.7 per cent urea. The vacuum keeps the temperature down, which matters because urea decomposes if it is held hot.',
    whyUsed: 'Prilling needs a melt, not a solution. Water left in the melt ends up in the prill, where it causes caking, so almost all of it has to come out here.',
    inputs: ['Urea solution from the recovery section', 'Heating steam', 'Vacuum'],
    outputs: ['Urea melt to the prilling tower', 'Process condensate'],
    operatingVariables: ['Melt concentration', 'Stage temperatures and vacuum', 'Biuret formation', 'Residence time'],
    designVariables: ['Number of stages and the vacuum in each', 'Falling-film tube design to keep residence short', 'Materials for hot urea'],
    misoperation: [
      'Pushing the concentration higher than needed costs biuret directly, because biuret forms where urea is hot and concentrated and that is precisely what this unit does.',
      'Losing vacuum raises the temperature for the same duty, and the biuret goes up with it.',
      'Leaving too much water gives soft prills that cake in storage.'
    ],
    theory: 'Biuret forms when two urea molecules condense and give off ammonia. The rate rises with temperature and with time at temperature, so a short residence at the lowest workable temperature is the whole design aim.',
    equations: [{
      what: 'Where the biuret comes from',
      equation: 'biuret ∝ f(melt concentration) · (residence)^n · f(temperature)',
      why: 'It puts the biuret problem in the evaporator rather than in the reactor, which is where people usually look first.',
      inputs: ['Melt concentration', 'Residence', 'Temperature'],
      units: 'wt %',
      interpretation: 'Every extra tenth of a per cent of concentration is paid for in biuret. The specification decides how far it is worth going.'
    }],
    practice: 'Granulation plants can work from a weaker melt than prilling plants can, which is one of the reasons granulation has largely displaced prilling on new capacity.',
    safety: ['Hot urea melt causes severe burns and solidifies on contact', 'Vacuum system: implosion risk on a vessel not rated for it', 'Ammonia released by decomposition in the vapour', 'Trace heating on every melt line'],
    troubleshooting: [
      { symptom: 'Biuret above specification', cause: 'Too hot, too concentrated, or too long', action: 'Check the vacuum before the steam. Losing vacuum raises the temperature without anyone changing a setting.' },
      { symptom: 'Melt too weak', cause: 'Vacuum or steam short', action: 'Weak melt shows up as prill moisture and caking downstream.' },
      { symptom: 'Melt line blocked', cause: 'Trace heating failure', action: 'Urea solidifies at 133 °C; any cold spot on a melt line will block.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.prillTower]: {
    tag: TAGS.prillTower, name: 'Urea prilling tower', type: 'Natural or induced draught prilling tower',
    purpose: 'Turns the urea melt into solid spherical prills by letting droplets freeze as they fall through rising air.',
    howItWorks: 'The melt is sprayed from a rotating bucket or a shower head at the top. The droplets fall and air is drawn up past them; each droplet cools, freezes and continues cooling before it lands on the conveyor at the base.',
    whyUsed: 'Fertilizer has to be a free-flowing solid that can be stored, bagged and spread. Prilling is the simplest way to get there from a melt, and the tower is the most visible thing on the site because the height is the process.',
    inputs: ['Urea melt', 'Ambient air drawn up the tower'],
    outputs: ['Solid prills to the product bin', 'Air with entrained dust to the scrubber'],
    operatingVariables: ['Air temperature and flow', 'Melt temperature', 'Prill size', 'Product moisture and temperature'],
    designVariables: ['Free-fall height', 'Bucket speed, which sets the droplet size', 'Tower diameter for the air velocity', 'Dust scrubbing on the exhaust'],
    misoperation: [
      'If a prill lands before it has frozen it flattens and the product cakes; that is what the height is for.',
      'Larger droplets need a taller tower, so the bucket speed and the tower height are linked.',
      'On a hot day the freezing time lengthens and a tower that is adequate in winter can be short in summer.'
    ],
    theory: 'The controlling step is removing the latent heat of fusion from a falling droplet. The time that takes, multiplied by the terminal velocity, is the height the tower must provide. None of it is chemistry.',
    equations: [{
      what: 'Freezing time and the height it needs',
      equation: 't = ρ·λ_f·d / ( 6·h·(T_melt − T_air) )        H ≈ u_terminal · t',
      why: 'It turns a heat transfer problem directly into a civil engineering one.',
      inputs: ['Prill diameter and density', 'Latent heat of fusion', 'Air temperature'],
      units: 'seconds and metres',
      interpretation: 'Doubling the prill diameter roughly doubles the freezing time, so prill size is a tower height decision.'
    }],
    practice: 'Fluid-bed granulation has largely replaced prilling on new plants: it makes a larger, harder product that handles better, and it does not need a sixty-metre tower or emit prill dust.',
    safety: ['Fall protection at the head of the tower', 'Hot melt lines all the way up', 'Confined space at the base and in the ducting', 'Urea dust in the exhaust is an environmental and a housekeeping issue'],
    troubleshooting: [
      { symptom: 'Product caking in storage', cause: 'Prills landing soft, or moisture too high', action: 'Check the air temperature and the melt concentration together; either can do it.' },
      { symptom: 'Quality worse in summer', cause: 'Warmer air lengthens the freezing time', action: 'Expected. Reduce the prill size or accept a lower rate in hot weather.' },
      { symptom: 'Dust emission rising', cause: 'Fines from broken prills, or scrubber performance', action: 'Check the bucket condition; damaged buckets make satellites and fines.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.productBin]: {
    tag: TAGS.productBin, name: 'Prilled product bin', type: 'Hoppered storage bin with on-line quality measurement',
    purpose: 'Holds the finished prills and is where the product is measured against the specification it is sold on.',
    howItWorks: 'Cooled prills are conveyed in, held, and drawn off to bagging or bulk loading. Nitrogen content, biuret and moisture are measured here, on line or by sampling.',
    whyUsed: 'It decouples a continuous plant from intermittent despatch, and it is the point at which the plant finds out whether everything upstream added up.',
    inputs: ['Prills from the tower'],
    outputs: ['Product to bagging or bulk despatch'],
    operatingVariables: ['Level', 'Nitrogen content', 'Biuret', 'Moisture', 'Product temperature'],
    designVariables: ['Capacity in hours of production', 'Humidity control, since urea is hygroscopic', 'Hopper angle for a free-flowing but caking-prone solid'],
    misoperation: [
      'Storing warm product lets moisture migrate and condense on the bin roof, then drip back onto the prills.',
      'An unsealed bin lets urea pick moisture straight out of humid air.',
      'Blending off-specification material rather than fixing the cause moves the problem into the bag.'
    ],
    theory: 'Pure urea is 46.65 per cent nitrogen by weight. Everything else in the product displaces nitrogen, so the specification is really a limit on how much biuret and water are allowed to be present.',
    equations: [{
      what: 'Nitrogen content of the product',
      equation: 'N wt % = urea purity · 46.65 % + biuret · 40.8 %',
      why: 'It is the number the product is sold on and the one every upstream decision is finally judged by.',
      inputs: ['Urea purity', 'Biuret', 'Moisture'],
      units: 'wt %',
      interpretation: 'A 46.0 per cent specification leaves about one and a half per cent for everything that is not urea.'
    }],
    practice: 'Prills are usually coated with an anti-caking agent before bagging, and bulk storage is kept below the critical relative humidity of urea, which is lower than most people expect.',
    safety: ['Confined space entry', 'Never enter to clear a bridge from below', 'Urea dust is an irritant and a housekeeping hazard', 'Hot product if the tower is underperforming'],
    troubleshooting: [
      { symptom: 'Nitrogen below specification', cause: 'Biuret and moisture together using up the margin', action: 'Check both; each on its own may look acceptable while the sum is not.' },
      { symptom: 'Caking in the bin', cause: 'Moisture, warmth, or no anti-caking treatment', action: 'Check the prill moisture and the product temperature before blaming storage.' },
      { symptom: 'Product picking up weight in store', cause: 'Humidity above the critical relative humidity of urea', action: 'Seal the store; urea will take water out of the air on its own.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.mcc]: {
    tag: TAGS.mcc, name: 'Motor control centre', type: 'Electrical switchgear, motor starters and variable speed drives',
    purpose: 'Distributes power to the driven equipment and carries the protection, starting and status signalling for each machine.',
    howItWorks: 'Incoming supply is distributed to individual starter and drive cubicles. Each provides isolation, short-circuit and overload protection, and the contactor or drive that runs the machine, reporting status back to the control system.',
    whyUsed: 'It is where a trip is diagnosed. On this plant the largest machines are steam turbine driven rather than electric, so the electrical load is modest next to the thermal one — which is itself worth noticing.',
    inputs: ['Incoming electrical supply', 'Start and stop commands from the control system'],
    outputs: ['Power to pumps, fans, conveyors and the smaller compressors', 'Run, trip and current status signals'],
    operatingVariables: ['Total connected load', 'Individual motor currents', 'Trip and alarm status'],
    designVariables: ['Incoming rating and standby generation', 'Protection settings per motor', 'Segregation between cubicles', 'Drive provision and harmonic mitigation'],
    misoperation: [
      'Resetting a trip without finding the cause usually produces the same trip, and sometimes damage.',
      'Raising an overload setting to stop nuisance trips removes the protection the motor depends on.',
      'Working on a starter without proving dead is the most common cause of serious injury on a plant like this.'
    ],
    theory: 'An ammonia plant is a thermal machine with an electrical supporting cast. The compressors that dominate the energy balance are driven by steam the process itself raises, which is why specific energy is quoted in gigajoules of gas per tonne rather than in kilowatt hours.',
    equations: [{
      what: 'Shaft power against the plant energy balance',
      equation: 'P_total = ΣP_compressors + P_refrigeration + P_auxiliaries',
      why: 'It puts the electrical demand next to the process heat and shows which one is worth optimising.',
      inputs: ['Each driven unit'],
      units: 'kW',
      interpretation: 'Refrigeration and compression together are almost all of it. The conveyors and fans barely register.'
    }],
    practice: 'Standby generation sized for the essential loads is standard, because an ammonia plant losing power has to be brought to a safe state quickly and that itself needs power.',
    safety: ['Prove dead before touching any conductor', 'Arc flash risk: correct protective equipment for switching', 'Lock off and tag any circuit being worked on', 'Never defeat an interlock'],
    troubleshooting: [
      { symptom: 'Motor trips repeatedly on overload', cause: 'Mechanical load higher than rated, or a failing motor', action: 'Read the trip current and investigate the driven machine before resetting again.' },
      { symptom: 'Status shows running but the machine is stopped', cause: 'Failed auxiliary contact or broken coupling', action: 'Confirm at the machine; a status signal is not proof of rotation.' },
      { symptom: 'Whole section dead', cause: 'Upstream protection operated', action: 'Establish why before re-energising anything.' }
    ]
  }
};

export default EQUIPMENT;
