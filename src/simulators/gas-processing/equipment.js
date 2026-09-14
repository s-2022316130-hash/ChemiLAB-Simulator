/**
 * 05 — NATURAL GAS PROCESSING PLANT — equipment information.
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
  [TAGS.inletSeparator]: {
    tag: TAGS.inletSeparator, name: 'Inlet three-phase separator', type: 'Horizontal vessel with an inlet device, a weir and a boot',
    purpose: 'Takes out everything that will separate on its own: condensate, free water and any solids the flowline brought with it.',
    howItWorks: 'The stream is slowed and given time. An inlet device turns the momentum into a gentle flow rather than a jet, the gas leaves the top through a mist extractor, the hydrocarbon liquid runs over a weir, and the denser water collects in a boot beneath it. Nothing is added and no energy is put in — it is a flash and a settling time.',
    whyUsed: 'It is by a wide margin the cheapest separation on the plant. Every kilogram of liquid that leaves here is a kilogram that does not have to be dealt with by an amine contactor, a glycol contactor or a cryogenic column, all of which cost far more per kilogram.',
    inputs: ['Wellhead gas with condensate and water', 'Occasionally hydrate inhibitor from the flowline'],
    outputs: ['Gas to the treating train', 'Condensate to the stabiliser', 'Produced water to treatment'],
    operatingVariables: ['Operating pressure and temperature', 'Liquid levels on both interfaces', 'Residence time'],
    designVariables: ['Vessel diameter and length', 'Inlet device type', 'Mist extractor', 'Boot size for the water cut'],
    misoperation: [
      'Losing the interface level control sends water into the amine unit or gas into the condensate line, and both are bad in their own way.',
      'Running it hotter than it needs to be leaves condensate in the gas that then has to be removed somewhere more expensive.',
      'Slugging from the flowline overwhelms the residence time, which is what a slug catcher upstream is for.'
    ],
    theory: 'What is liquid at the inlet conditions is decided by the flash, and how much of it actually settles is decided by residence time against Stokes settling. The first is thermodynamics and the second is geometry, and a separator that fails usually fails on the second.',
    equations: [{
      what: 'Rachford–Rice',
      equation: 'Σ zᵢ(Kᵢ − 1) / (1 + β(Kᵢ − 1)) = 0',
      why: 'It is the flash that says how much liquid there is to settle in the first place.',
      inputs: ['Feed composition', 'Pressure and temperature'],
      units: 'β dimensionless',
      interpretation: 'The vapour fraction at the inlet is usually above 0.95 on a gas well, but the two or three per cent that is liquid carries most of the C5 and heavier in the stream.'
    }],
    practice: 'On a field with slugging flowlines the inlet device is a finger-type slug catcher rather than a vessel internal, and it is sized on the slug volume a pigging run produces rather than on the steady flow.',
    safety: ['High-pressure hydrocarbon with hydrogen sulphide: a leak here is immediately dangerous to life', 'Level instrument failure is the most common cause of carryover', 'Drain the water boot to a closed system, never to atmosphere'],
    troubleshooting: [
      { symptom: 'Water carrying over to the amine unit', cause: 'Interface level lost, or the boot undersized for a rising water cut', action: 'Check the interface before blaming the amine unit for foaming.' },
      { symptom: 'Gas in the condensate line', cause: 'Liquid level too low', action: 'Check the level transmitter against the sight glass.' },
      { symptom: 'Erratic levels', cause: 'Slugging from the flowline', action: 'This is a flowline problem, not a vessel problem.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.amineContactor]: {
    tag: TAGS.amineContactor, name: 'Amine contactor', type: 'Trayed absorber, gas up and lean amine down',
    purpose: 'Takes the hydrogen sulphide out of the gas to four parts per million, and deliberately leaves most of the carbon dioxide behind.',
    howItWorks: 'Gas enters at the bottom and lean amine at the top, and they meet on twenty or so trays. Hydrogen sulphide reacts with the amine almost instantly — it is a proton transfer and nothing more. Carbon dioxide has to hydrate first, which is slow, so on a tray sized for the contact time a fast reaction needs, most of the carbon dioxide simply goes past.',
    whyUsed: 'Every pipeline in the world has a hydrogen sulphide specification and it is always tight, because the gas is lethal at low concentration and corrosive at any. The carbon dioxide specification is loose by comparison, and removing carbon dioxide that did not need removing costs reboiler steam for nothing.',
    inputs: ['Sour gas from the inlet separator', 'Lean amine from the regenerator'],
    outputs: ['Sweet gas to dehydration', 'Rich amine to the regenerator'],
    operatingVariables: ['Amine circulation', 'Lean loading and lean temperature', 'Gas rate', 'Pressure'],
    designVariables: ['Number of trays and their spacing', 'Amine type and strength', 'Diameter for the gas load'],
    misoperation: [
      'Foaming is the classic failure: the solution froths, gas short-circuits the trays, and every instrument on the unit reads normal while the treated gas goes off specification.',
      'A hot lean amine raises the equilibrium floor exponentially, and no amount of circulation gets below a floor.',
      'Circulating far more than the acid gas load needs costs reboiler steam and takes out carbon dioxide the specification never asked for.'
    ],
    theory: 'The Kremser relation says what fraction of the available driving force a column of N stages uses, given an absorption factor of L over m times V. Above an absorption factor of two, more trays buy almost nothing; below one, no number of trays will finish the job. The selectivity of this amine is entirely a matter of the two components having very different values of m.',
    equations: [
      {
        what: 'Absorption factor and Kremser',
        equation: 'A = L / (m·V)        φ = (A^(N+1) − A) / (A^(N+1) − 1)',
        why: 'It is the whole design of the column in one expression, and it is the same expression the glycol contactor and the demethaniser use.',
        inputs: ['Liquid and vapour rates', 'Equilibrium slope', 'Theoretical stages'],
        units: 'dimensionless',
        interpretation: 'The absorption factor for hydrogen sulphide here runs into the hundreds; for carbon dioxide it is below one. Two components, one column, opposite answers.'
      },
      {
        what: 'The floor the lean amine sets',
        equation: 'y_out = y_in − φ·(y_in − y*)        y* ∝ lean loading · exp((T − 40)/18)',
        why: 'A contactor can approach equilibrium with the solvent it is fed and it cannot pass it, so the stripper decides what the contactor can achieve.',
        inputs: ['Lean loading', 'Lean amine temperature'],
        units: 'mole fraction',
        interpretation: 'If the treated gas is off specification and the absorption factor is large, the problem is upstream in the regenerator, not here.'
      }
    ],
    practice: 'Contactors are run a few degrees above the gas so that hydrocarbon does not condense into the amine — condensed hydrocarbon is the single most common cause of foaming, and a foaming unit is the hardest fault on a gas plant to diagnose from the panel.',
    safety: ['Sour gas at pressure: fixed hydrogen sulphide detection and escape sets are not optional', 'Amine is an irritant and hot amine burns', 'Never open a rich amine line without draining and purging: it releases hydrogen sulphide as it depressurises'],
    troubleshooting: [
      { symptom: 'Treated gas off specification with everything else normal', cause: 'Foaming, or a hot lean amine', action: 'Check the lean temperature first, then look for hydrocarbon in the amine.' },
      { symptom: 'Carbon dioxide removal higher than usual', cause: 'Circulation above what the load needs', action: 'This costs money. Reduce circulation and watch the rich loading.' },
      { symptom: 'Differential pressure rising across the trays', cause: 'Foaming or fouling', action: 'Antifoam is a treatment, not a cure; find the hydrocarbon.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.amineRegenerator]: {
    tag: TAGS.amineRegenerator, name: 'Amine regenerator', type: 'Stripping column with a reboiler and an overhead condenser',
    purpose: 'Boils the acid gas back out of the rich amine so the solution can go round again, and in doing so decides how clean the contactor can make the gas.',
    howItWorks: 'Rich amine enters near the top and falls against steam raised in the reboiler. Heat reverses the reaction, the acid gas leaves overhead with a lot of water vapour, the water is condensed and returned as reflux, and the lean solution leaves the bottom.',
    whyUsed: 'Amine is far too expensive to use once. The whole unit is a loop, and this is the part of the loop that costs money to run.',
    inputs: ['Rich amine from the lean/rich exchanger', 'Reboiler heat'],
    outputs: ['Lean amine back to the contactor', 'Acid gas to the flare or a sulphur plant'],
    operatingVariables: ['Reboiler duty', 'Lean loading achieved', 'Reflux rate', 'Bottom temperature'],
    designVariables: ['Number of stages', 'Reboiler type and duty', 'Overhead condenser duty', 'Reclaimer'],
    misoperation: [
      'Running the reboiler too hard degrades the amine and wastes steam; running it too soft leaves a high lean loading, which the contactor then cannot get below.',
      'Above about 127 °C in the reboiler, methyldiethanolamine begins to degrade into products that are corrosive and cannot be stripped out.',
      'Losing the overhead condenser sends amine out with the acid gas, which is expensive and, at a flare, unpleasant.'
    ],
    theory: 'Most of the duty is not the heat of reaction. It is the stripping steam, and stripping steam is set by circulation rather than by acid gas load — which is why a unit circulating twice what it needs uses nearly twice the steam to remove the same amount of acid gas.',
    equations: [{
      what: 'Reboiler duty',
      equation: 'Q = n_acid·ΔH_reaction + m_solution·c_p·ΔT_approach + steam·λ',
      why: 'It separates what the chemistry costs from what the circulation costs, and the second is usually much larger.',
      inputs: ['Acid gas absorbed', 'Circulation', 'Lean/rich exchanger approach'],
      units: 'kW',
      interpretation: 'A thousand to twelve hundred British thermal units per gallon circulated is the usual rule, and this model reproduces it — which is a useful check that the terms are the right size.'
    }],
    practice: 'The lean/rich exchanger is what makes the whole loop affordable: it recovers most of the sensible heat, and the approach it achieves goes straight into the reboiler duty. A fouled one is expensive long before anyone notices it.',
    safety: ['The overhead is concentrated hydrogen sulphide at low pressure — the most dangerous stream on the plant', 'Hot amine burns and the reboiler operates near the degradation limit', 'A reclaimer handles degradation products that are more corrosive than the amine'],
    troubleshooting: [
      { symptom: 'Lean loading higher than design', cause: 'Reboiler duty short, or a fouled lean/rich exchanger', action: 'Check the approach on the exchanger before adding steam.' },
      { symptom: 'Amine losses rising', cause: 'Overhead condenser duty, or degradation', action: 'Check the reboiler temperature against the degradation limit.' },
      { symptom: 'Corrosion in the rich line', cause: 'Rich loading above the limit, or degradation products', action: 'Both are circulation problems in opposite directions. Measure the loading.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.leanRichExchanger]: {
    tag: TAGS.leanRichExchanger, name: 'Lean/rich amine exchanger', type: 'Plate or shell-and-tube exchanger, amine both sides',
    purpose: 'Heats the rich amine on its way to the regenerator with the lean amine on its way back, and by doing so removes most of the sensible heat from the reboiler duty.',
    howItWorks: 'Two streams of the same fluid at the same rate flow counter-currently. The approach it achieves — how many degrees short of the other stream each one leaves — is what decides how much heat the reboiler still has to supply and how much the lean cooler still has to remove.',
    whyUsed: 'Without it the reboiler would have to heat the whole circulation from contactor temperature to stripping temperature every pass, and the cooler would have to take all of it back out. It is the single largest energy saving on an amine unit.',
    inputs: ['Rich amine from the contactor', 'Lean amine from the regenerator'],
    outputs: ['Warm rich amine to the regenerator', 'Cooled lean amine to the lean cooler'],
    operatingVariables: ['Approach temperature', 'Fouling resistance', 'Differential pressure'],
    designVariables: ['Area', 'Plate or tube arrangement', 'Materials for rich amine service'],
    misoperation: [
      'Fouling raises the approach quietly: the reboiler takes up the slack and nobody notices until the steam bill is read.',
      'Flashing rich amine inside the exchanger erodes it and is a known failure mode of the rich side.',
      'Bypassing it to control the regenerator feed temperature throws away the saving it exists for.'
    ],
    theory: 'A balanced counter-current exchanger with equal flow and equal specific heat has the same approach at both ends, so the approach is a single number and it maps directly onto reboiler duty: every degree of approach is a fixed amount of extra steam per cubic metre circulated.',
    equations: [{
      what: 'Heat not recovered',
      equation: 'Q = ṁ·c_p·ΔT_approach',
      why: 'It converts the exchanger performance directly into reboiler duty, which is the number that matters.',
      inputs: ['Circulation', 'Approach'],
      units: 'kW',
      interpretation: 'On a 320 m³/h unit, every degree of approach is about a third of a megawatt on the reboiler.'
    }],
    practice: 'Plate exchangers are usual because they reach a close approach in a small area, and they are also the ones that foul and that flash on the rich side. Welded plate designs are a compromise between the two.',
    safety: ['Rich amine contains dissolved hydrogen sulphide and releases it if it flashes', 'Hot amine burns', 'Isolate and drain both sides before opening'],
    troubleshooting: [
      { symptom: 'Reboiler duty rising with no process change', cause: 'Exchanger fouling', action: 'Compare the approach against the commissioning value.' },
      { symptom: 'Noise and vibration in the rich line', cause: 'Rich amine flashing across the exchanger', action: 'Check the pressure profile; this damages the exchanger quickly.' },
      { symptom: 'Lean amine arriving hot at the contactor', cause: 'Lean cooler duty, downstream of here', action: 'Check the cooler before the exchanger.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.aminePump]: {
    tag: TAGS.aminePump, name: 'Amine circulation pump', type: 'Multistage centrifugal pump with a hydraulic turbine recovery unit',
    purpose: 'Returns the lean amine from the regenerator, which is near atmospheric, to the contactor, which is at full gas pressure.',
    howItWorks: 'A multistage pump raises the pressure by sixty bar or more. On larger units, a hydraulic turbine on the rich side recovers part of that energy as the rich amine lets down, which on a big plant is worth having.',
    whyUsed: 'The contactor has to be at gas pressure and the regenerator has to be near atmospheric, so the solution crosses that difference twice every pass. This is the crossing that costs power.',
    inputs: ['Lean amine from the lean cooler', 'Motor power'],
    outputs: ['Lean amine at contactor pressure'],
    operatingVariables: ['Circulation rate', 'Discharge pressure', 'Suction conditions'],
    designVariables: ['Number of stages', 'Net positive suction head available', 'Whether a recovery turbine is fitted'],
    misoperation: [
      'Cavitating this pump is easy, because the suction is hot amine close to its bubble point, and it destroys the impellers quickly.',
      'Circulation is the single most expensive setting on an amine unit, and it is usually left where it was commissioned.',
      'Running with a partially closed discharge valve wastes the head the pump just produced.'
    ],
    theory: 'Pump power is the volumetric flow times the pressure rise divided by efficiency, so it scales directly with circulation — as does the reboiler duty. Circulation is charged twice.',
    equations: [{
      what: 'Pump power',
      equation: 'P = Q·Δp / η',
      why: 'It is the smaller half of what circulation costs, and it scales the same way the larger half does.',
      inputs: ['Circulation', 'Pressure rise'],
      units: 'kW',
      interpretation: 'Sixty bar across 320 m³/h is a little over six hundred kilowatts of hydraulic work before efficiency.'
    }],
    practice: 'Hydraulic power recovery turbines on the rich let-down are standard above a few hundred cubic metres an hour and recover a third or more of the pump duty, which pays back quickly at a plant that runs continuously.',
    safety: ['Hot amine under high pressure', 'Mechanical seal failure releases amine containing hydrogen sulphide', 'Never run against a closed discharge'],
    troubleshooting: [
      { symptom: 'Pump losing head', cause: 'Cavitation or impeller wear', action: 'Check the suction temperature against the bubble point first.' },
      { symptom: 'Seal leaking', cause: 'Amine attacks some seal materials, and degradation products attack more', action: 'Check the amine analysis, not just the seal.' },
      { symptom: 'Flow lower than the set point', cause: 'Discharge valve position or a blocked strainer', action: 'Look at the differential across the strainer.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.glycolContactor]: {
    tag: TAGS.glycolContactor, name: 'Glycol contactor', type: 'Trayed or structured-packing absorber, gas up and lean glycol down',
    purpose: 'Dries the gas to a water dew point low enough that nothing condenses or freezes anywhere downstream.',
    howItWorks: 'Gas enters at the bottom and lean triethylene glycol at the top. Glycol holds water far more tightly than an ideal solution would — the activity coefficient is around a half — so a glycol that is one per cent water by mass still leaves the gas very dry indeed.',
    whyUsed: 'Water and light hydrocarbon form hydrates, which are ice-like solids that block a pipeline or an exchanger completely and are very difficult to remove. Every water specification in the gas industry exists because of hydrates rather than because of the water itself.',
    inputs: ['Sweet gas from the amine contactor', 'Lean glycol from the regenerator'],
    outputs: ['Dry gas to the cold section', 'Rich glycol to the regenerator'],
    operatingVariables: ['Glycol circulation', 'Lean purity', 'Contactor temperature and pressure'],
    designVariables: ['Trays or packing height', 'Circulation rate per unit of water removed', 'Diameter for the gas load'],
    misoperation: [
      'Adding circulation to fix a dew point almost never works: the floor is set by the lean purity, and circulation only decides how close the column gets to a floor it cannot pass.',
      'Running the contactor hot puts far more water into the gas to begin with, because water content rises steeply with temperature.',
      'Carrying hydrocarbon into the glycol foams the column and burns in the reboiler.'
    ],
    theory: 'It is the same Kremser calculation as the amine contactor, with a different equilibrium slope. What is different is where the limit sits: on an amine unit the absorption factor is huge and the lean loading is the constraint; here the absorption factor is single figures and both terms matter.',
    equations: [{
      what: 'Glycol equilibrium',
      equation: 'y*_w = γ_w · x_w · p_sat(T) / P        ln γ_w = A(1 − x_w)²',
      why: 'It is the floor the contactor can approach, and it moves with lean purity rather than with anything the column does.',
      inputs: ['Lean glycol purity', 'Contactor temperature and pressure'],
      units: 'mole fraction',
      interpretation: 'Raising lean purity from 99.0 to 99.9 per cent moves the achievable dew point by thirty degrees, which no amount of extra circulation would have done.'
    }],
    practice: 'Circulation is quoted in gallons of glycol per pound of water removed, and two to four is the usual range. Below two the trays do not wet; above four the reboiler is being run for nothing.',
    safety: ['High-pressure gas', 'Hot glycol burns and hot glycol vapour is an irritant', 'A glycol unit ahead of a cryogenic plant is a safety-critical unit, not a utility'],
    troubleshooting: [
      { symptom: 'Dew point rising with circulation normal', cause: 'Lean purity, which is a regenerator problem', action: 'Measure the lean glycol water content before touching the pump.' },
      { symptom: 'Glycol losses high', cause: 'Carryover from a flooded or foaming contactor', action: 'Check the gas rate against the design and look for hydrocarbon in the glycol.' },
      { symptom: 'Ice forming downstream', cause: 'The dew point is above the coldest temperature downstream', action: 'This is a design conversation, not an operating one: glycol may not be able to dry far enough for the plant behind it.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.glycolRegenerator]: {
    tag: TAGS.glycolRegenerator, name: 'Glycol regenerator', type: 'Reboiled still column with a stripping gas column',
    purpose: 'Boils the water back out of the rich glycol, and in doing so sets the dew point the contactor is able to reach.',
    howItWorks: 'Rich glycol is heated to around 200 °C, which is as hot as triethylene glycol can be taken before it starts to break down. Water boils off overhead. Since that alone only reaches about 98.5 per cent purity, higher purities need stripping gas blown through the reboiler or a vacuum, which is what lets a glycol unit feed a cold plant at all.',
    whyUsed: 'Lean purity is the floor of the whole dehydration unit. Everything the contactor achieves is measured from here.',
    inputs: ['Rich glycol from the contactor', 'Reboiler heat', 'Stripping gas for high purity'],
    outputs: ['Lean glycol to the contactor', 'Water vapour and hydrocarbon to the vent or an incinerator'],
    operatingVariables: ['Reboiler temperature', 'Lean purity achieved', 'Stripping gas rate'],
    designVariables: ['Reboiler duty', 'Still column packing', 'Whether stripping gas or vacuum is fitted', 'Flash separator upstream'],
    misoperation: [
      'Above about 204 °C glycol degrades, and the degradation products are acidic and corrosive.',
      'Skipping the flash separator sends dissolved hydrocarbon into the still, where it burns and carries glycol out with it.',
      'Venting the overhead untreated is a significant emission of hydrocarbon as well as water.'
    ],
    theory: 'The purity a simple reboiler can reach is set by the boiling point of the glycol/water mixture at the degradation limit. Getting past it requires lowering the partial pressure of water rather than raising the temperature, which is exactly what stripping gas and vacuum both do.',
    equations: [{
      what: 'Why stripping gas is needed',
      equation: 'x_water at equilibrium is set by p_water / P_total at the reboiler temperature',
      why: 'It says that the route to a drier glycol is a lower partial pressure, not a higher temperature — and the temperature is already at its limit.',
      inputs: ['Reboiler temperature', 'Stripping gas rate'],
      units: 'mass fraction',
      interpretation: 'A modest flow of dry gas through the reboiler takes a plain 98.5 per cent unit to 99.5 or beyond, which is worth thirty degrees of dew point.'
    }],
    practice: 'The overhead from a glycol still is routinely flared or incinerated rather than vented, because it carries benzene and toluene picked up in the contactor, and those are regulated separately from the methane.',
    safety: ['Hot glycol at 200 °C', 'The still overhead carries hydrocarbon and aromatics', 'Fired reboilers on glycol units are a common ignition source and are sited accordingly'],
    troubleshooting: [
      { symptom: 'Lean purity below design', cause: 'Reboiler temperature, or stripping gas lost', action: 'Check the stripping gas first; it is worth more purity than the last few degrees of temperature.' },
      { symptom: 'Glycol dark and acidic', cause: 'Thermal degradation, usually from a hot spot in a fired reboiler', action: 'Check the fire tube skin temperature, not just the bulk.' },
      { symptom: 'Glycol losses high', cause: 'Carryover from the still, usually from hydrocarbon in the feed', action: 'Check the flash separator.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.coldBox]: {
    tag: TAGS.coldBox, name: 'Gas/gas cold box', type: 'Brazed aluminium plate-fin exchanger',
    purpose: 'Cools the dry feed gas against the cold residue gas coming back from the demethaniser, before the expander does the rest.',
    howItWorks: 'Plate-fin aluminium blocks give an enormous surface area in a small volume and can reach approaches of a few degrees, which is what makes cryogenic recovery practical at all. The feed gives up heat to the residue, so the plant recovers most of its own cold rather than making it.',
    whyUsed: 'The expander can only produce so much cooling from the pressure available. Pre-cooling the feed against the residue multiplies that, and it costs nothing but exchanger area.',
    inputs: ['Dry gas from the glycol contactor', 'Cold residue gas from the demethaniser overhead'],
    outputs: ['Chilled feed gas to the expander', 'Warmed residue gas to the compressor'],
    operatingVariables: ['Outlet temperature', 'Approach at the cold end', 'Duty'],
    designVariables: ['Number of passes and streams', 'Approach temperature', 'Aluminium core size'],
    misoperation: [
      'Any water at all freezes inside the core and blocks it, and thawing a plate-fin block is a multi-day operation.',
      'Thermal shock cracks the brazed joints, so rate-of-change limits on warm-up and cool-down are real constraints and not advice.',
      'Mercury in the feed attacks aluminium catastrophically, which is why a mercury removal bed is fitted ahead of one.'
    ],
    theory: 'It can only take the feed to the residue temperature plus the approach. Everything colder than that has to come from the expander or from external refrigeration, which is why the expander outlet temperature and the cold box outlet are tied to each other.',
    equations: [{
      what: 'Duty and its limit',
      equation: 'Q = ṅ·c_p·ΔT        T_feed,out ≥ T_residue,in + approach',
      why: 'The first says what the exchanger does; the second says what it cannot do however large it is.',
      inputs: ['Gas rate', 'Temperatures'],
      units: 'kW',
      interpretation: 'If the process needs a colder feed than that limit, the answer is a propane chiller, not a bigger cold box.'
    }],
    practice: 'The whole cold section — exchanger, separator and column top — usually sits inside one insulated box packed with perlite, which is where the name comes from and why nothing inside it can be inspected without a shutdown.',
    safety: ['Cryogenic burns from any exposed cold surface', 'Aluminium fails suddenly rather than gradually', 'Mercury exposure during maintenance on an old core'],
    troubleshooting: [
      { symptom: 'Approach widening over weeks', cause: 'Partial blockage, usually from ice or from carbon dioxide freezing', action: 'Check the dew point of the feed gas; this is the classic symptom.' },
      { symptom: 'Pressure drop rising', cause: 'Blockage in one pass', action: 'Plan a controlled warm-up rather than pushing through it.' },
      { symptom: 'Cold end temperature not reached', cause: 'Residue flow lower than design, or the expander not producing its cooling', action: 'Check the expander outlet before the exchanger.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.expander]: {
    tag: TAGS.expander, name: 'Turboexpander', type: 'Radial inflow expander directly coupled to a booster compressor',
    purpose: 'Makes the cold that condenses the liquids, and recovers some of the energy of the pressure drop while doing it.',
    howItWorks: 'The gas drives a radial wheel and leaves at a lower pressure and a much lower temperature, because work has been taken out of it. The shaft drives a compressor wheel on the same casing, which gives the residue gas the first part of its recompression for nothing.',
    whyUsed: 'A valve across the same pressure drop cools by the Joule–Thomson effect alone, which is a fraction of the isentropic cooling and returns no work. On any plant recovering ethane, the difference between the two is the difference between a business and a hobby.',
    inputs: ['Chilled gas from the cold box'],
    outputs: ['Cold two-phase stream to the cold separator', 'Shaft power to the booster compressor'],
    operatingVariables: ['Inlet temperature', 'Pressure ratio', 'Speed', 'Isentropic efficiency'],
    designVariables: ['Wheel diameter and speed', 'Nozzle arrangement', 'Bearing type', 'Whether a Joule–Thomson bypass is fitted'],
    misoperation: [
      'Liquid at the inlet in any quantity damages the wheel: the machine is designed for a small amount of condensation through it, not for a slug.',
      'Tripping it drops the plant into Joule–Thomson mode instantly, and the liquids production falls with the temperature.',
      'Running well off the design pressure ratio drops the efficiency and therefore the cooling, with nothing on the panel obviously wrong.'
    ],
    theory: 'An isentropic expansion cools by the full temperature ratio the pressure ratio implies; a real machine reaches seventy-five to eighty-five per cent of it. A Joule–Thomson valve is isenthalpic, and for a lean natural gas that is around half a degree per bar. On a forty bar drop that is the difference between twenty degrees of cooling and fifty.',
    equations: [
      {
        what: 'Isentropic expansion',
        equation: 'T₂ₛ = T₁ (P₂/P₁)^((k−1)/k)        ΔT = η(T₁ − T₂ₛ)',
        why: 'It is where the cold comes from, and the efficiency is the difference between a machine and a hole.',
        inputs: ['Inlet temperature', 'Pressure ratio', 'Heat capacity ratio'],
        units: 'K',
        interpretation: 'Every point of isentropic efficiency is worth roughly half a degree at the cold end, and half a degree is worth real ethane.'
      },
      {
        what: 'Power recovered',
        equation: 'W = ṅ·c_p·(T₁ − T₂)',
        why: 'The cold and the power are the same thing measured twice.',
        inputs: ['Gas rate', 'Temperature drop'],
        units: 'kW',
        interpretation: 'A few megawatts on a mid-size plant, which is a useful fraction of the residue compressor and never all of it.'
      }
    ],
    practice: 'The expander and its booster compressor run on the same shaft at tens of thousands of revolutions a minute on magnetic or gas bearings, and the whole assembly is small enough to lift by hand relative to what it does.',
    safety: ['Very high rotational speed: the trip system and the overspeed protection are safety systems', 'Cryogenic surfaces', 'A liquid slug can destroy the wheel in seconds'],
    troubleshooting: [
      { symptom: 'Outlet temperature warmer than expected', cause: 'Efficiency down, or the pressure ratio off design', action: 'Compare the actual drop against the isentropic one; the ratio of the two is the efficiency.' },
      { symptom: 'Vibration rising', cause: 'Liquid carryover or bearing wear', action: 'Trip and inspect. This machine does not tolerate being run through a problem.' },
      { symptom: 'Liquids production fallen with the expander running', cause: 'Cold box duty, upstream of here', action: 'Check the expander inlet temperature before the machine.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.coldSeparator]: {
    tag: TAGS.coldSeparator, name: 'Cold separator', type: 'Vertical vessel inside the cold box',
    purpose: 'Separates the two-phase stream leaving the expander into the vapour that goes overhead and the liquid that feeds the demethaniser.',
    howItWorks: 'A simple vertical knockout with a mist extractor, operating at the coldest point in the plant. Nothing about it is complicated; everything about it is cold.',
    whyUsed: 'The expander produces a two-phase stream and the column needs a liquid feed. This is where the flash that the whole cold section exists to produce is actually separated.',
    inputs: ['Two-phase stream from the expander'],
    outputs: ['Cold vapour to the demethaniser top', 'Cold liquid to the demethaniser feed'],
    operatingVariables: ['Temperature and pressure', 'Level', 'Vapour fraction'],
    designVariables: ['Diameter for the vapour load', 'Mist extractor', 'Insulation'],
    misoperation: [
      'Losing level sends vapour into the column feed and upsets the profile.',
      'Carryover of liquid into the overhead takes product straight out with the residue gas.',
      'Any ice in the feed collects here first, and the level instrument is usually the first thing to notice.'
    ],
    theory: 'The vapour fraction here is the flash at the expander outlet, and it is the single number that decides how much ethane the plant can recover. Everything the column does afterwards is a correction to it.',
    equations: [{
      what: 'The flash that matters',
      equation: 'Σ zᵢ(Kᵢ − 1) / (1 + β(Kᵢ − 1)) = 0 at the expander outlet',
      why: 'It is the recovery, before the column has done anything at all.',
      inputs: ['Dry gas composition', 'Expander outlet temperature and pressure'],
      units: 'β dimensionless',
      interpretation: 'Every degree colder moves β, and ethane moves with it faster than anything heavier because its K-value is changing fastest there.'
    }],
    practice: 'On most modern designs this vessel is not separate at all — it is the top section of the demethaniser, with the expander discharging directly into it, which saves a vessel and a cold line.',
    safety: ['Cryogenic liquid', 'Depressurising a cold vessel is a controlled operation with a rate limit', 'Nitrogen purging before any entry, and the asphyxiation hazard that carries'],
    troubleshooting: [
      { symptom: 'Level rising with no change upstream', cause: 'Colder feed, or a restriction on the liquid draw', action: 'Check the expander outlet temperature first.' },
      { symptom: 'Liquid in the overhead', cause: 'Vapour load above design, or a damaged mist extractor', action: 'Check the gas rate against the design.' },
      { symptom: 'Erratic level indication', cause: 'Ice on the instrument connections', action: 'A dew point problem upstream, not an instrument problem.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.demethaniser]: {
    tag: TAGS.demethaniser, name: 'Demethaniser', type: 'Cryogenic stripping column with a side and bottom reboiler',
    purpose: 'Takes the methane back out of the liquid so the product is ethane and heavier, with a vapour pressure a storage tank can hold.',
    howItWorks: 'The cold liquid falls against vapour raised by reboilers that use the warm inlet gas as their heat source — so the column is heated by the stream it is helping to cool. Methane, being far more volatile than ethane at these temperatures, is stripped out and leaves overhead with the residue gas.',
    whyUsed: 'Methane dissolved in a liquid product is vapour pressure, and vapour pressure is what a specification on a liquefied product is written about. It is also simply methane that has been paid for twice.',
    inputs: ['Cold liquid and vapour from the cold separator', 'Reboiler heat from the warm inlet gas'],
    outputs: ['Residue gas overhead', 'Natural gas liquids from the bottom'],
    operatingVariables: ['Boil-up ratio', 'Column pressure', 'Bottom temperature', 'Methane content of the bottoms'],
    designVariables: ['Number of stages', 'Operating pressure', 'Reboiler arrangement', 'Whether reflux is used'],
    misoperation: [
      'Over-stripping to chase a very clean bottoms product takes ethane overhead with the methane, and ethane is the product.',
      'Running the column too high in pressure brings the relative volatility down and makes the whole separation harder.',
      'Carbon dioxide freezes out in the upper section of a deep column, which is a design constraint that limits how cold the top can run.'
    ],
    theory: 'It is Kremser again, with the absorption factor inverted into a stripping factor. The stripping factor for methane is very large and for ethane is well below one, and the gap between them is what makes the separation work with a modest number of stages and no reflux.',
    equations: [{
      what: 'Kremser stripping',
      equation: 'S = K·V/L        removed = (S^(N+1) − S) / (S^(N+1) − 1)',
      why: 'It is the same relation as the absorbers upstream with the factor turned over, which is worth seeing written down.',
      inputs: ['K-values at the bottom conditions', 'Boil-up ratio', 'Stages'],
      units: 'dimensionless',
      interpretation: 'Methane has a stripping factor in the tens and ethane one around a tenth. That ratio is the separation.'
    }],
    practice: 'The reboilers take their heat from the warm inlet gas rather than from steam, which is what makes the plant close its own energy loop: the column is heated by the stream it is cooling.',
    safety: ['Cryogenic service throughout', 'Carbon dioxide freezing is an operational hazard as well as a design constraint', 'Relief from a cold column has to be designed for the cold metal temperature, not the process temperature'],
    troubleshooting: [
      { symptom: 'Methane in the product above specification', cause: 'Boil-up too low, or the column pressure too high', action: 'Raise the boil-up first; it is the faster lever.' },
      { symptom: 'Ethane recovery falling with the cold end normal', cause: 'Over-stripping', action: 'Check the boil-up ratio; more is not better past a point.' },
      { symptom: 'Pressure drop rising in the upper section', cause: 'Carbon dioxide freezing', action: 'This is a composition limit, not a fouling problem.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.residueCompressor]: {
    tag: TAGS.residueCompressor, name: 'Residue gas compressor', type: 'Centrifugal compressor, gas turbine or electric motor driven',
    purpose: 'Puts back the pressure the expander threw away, so the sales gas can enter the pipeline.',
    howItWorks: 'A centrifugal machine takes the residue gas from demethaniser pressure to pipeline pressure. The booster wheel on the expander shaft has already done part of it; this machine does the rest, and it is usually the largest single power consumer on the plant.',
    whyUsed: 'The pipeline is at seventy bar and the column is at twenty. That difference was created deliberately in order to make the plant cold, and it has to be undone before anything can be sold.',
    inputs: ['Residue gas from the demethaniser via the cold box', 'Driver power'],
    outputs: ['Sales gas at pipeline pressure'],
    operatingVariables: ['Suction and discharge pressure', 'Throughput', 'Speed', 'Discharge temperature'],
    designVariables: ['Number of stages and intercooling', 'Driver type and rating', 'Surge margin'],
    misoperation: [
      'Operating near surge damages the machine quickly; the anti-surge recycle exists to prevent that and costs power whenever it opens.',
      'Dropping the expander discharge pressure to chase recovery makes this machine bigger faster than it makes the recovery better.',
      'A high discharge temperature limits how much can be done in one stage and is what sets the intercooling.'
    ],
    theory: 'Compression work rises with the logarithm of the pressure ratio and linearly with suction temperature, which is why intercooling between stages is worth the exchangers and why a cold suction is worth having.',
    equations: [{
      what: 'Polytropic compression work',
      equation: 'W = (ṅ Z R T₁ / η)·k/(k−1)·[(P₂/P₁)^((k−1)/k) − 1]',
      why: 'It is what the liquids cost in energy, and the number that decides whether deeper recovery is worth doing at all.',
      inputs: ['Residue flow', 'Suction temperature', 'Pressure ratio'],
      units: 'kW',
      interpretation: 'The expander returns a few megawatts of this and never all of it. The gap is the plant\'s standing cost for making itself cold.'
    }],
    practice: 'Gas turbine drivers are common because fuel gas is available on site and the exhaust heat can drive the amine reboiler, which turns two separate energy problems into one reasonably efficient system.',
    safety: ['High-pressure hydrocarbon and a very high speed rotor', 'Never defeat the anti-surge control', 'Hot discharge piping'],
    troubleshooting: [
      { symptom: 'Power higher than expected', cause: 'More residue gas than design — usually because the cold end is warm and less condensed', action: 'Check the expander outlet temperature.' },
      { symptom: 'Surging on load change', cause: 'Operating point left of the surge line', action: 'Review the control response; repeated surge destroys the rotor.' },
      { symptom: 'Discharge temperature high', cause: 'Intercooler duty or a high compression ratio in one stage', action: 'Check the cooler before the machine.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.stabiliser]: {
    tag: TAGS.stabiliser, name: 'Condensate stabiliser', type: 'Reboiled stripping column',
    purpose: 'Takes the light ends out of the condensate from the inlet separator so it can be stored at atmospheric pressure without flashing.',
    howItWorks: 'The condensate is heated and the lighter components boil off overhead, leaving a bottoms product with a vapour pressure low enough to put in a tank. The overhead vapour is usually recompressed back into the gas stream rather than flared.',
    whyUsed: 'Condensate straight from a separator at sixty bar will boil vigorously when it reaches a tank at atmospheric pressure. Stabilising it turns a hazard into a product.',
    inputs: ['Condensate and produced water from the inlet separator', 'Reboiler heat'],
    outputs: ['Stabilised condensate to storage', 'Light ends back to the gas', 'Water to treatment'],
    operatingVariables: ['Reboiler duty', 'Column pressure', 'Bottoms vapour pressure'],
    designVariables: ['Number of stages', 'Operating pressure', 'Whether reflux is used'],
    misoperation: [
      'Under-stabilising leaves a product that vents in the tank, which is both a loss and an emission.',
      'Over-stabilising boils off components that were worth more as liquid.',
      'Water in the feed causes slugging and corrosion in the bottom of the column.'
    ],
    theory: 'It is a stripping column sized on the vapour pressure specification of the bottoms rather than on a component recovery, which makes it a simpler design problem than most towers on the plant.',
    equations: [{
      what: 'Reid vapour pressure specification',
      equation: 'the bottoms must not exceed the tank design pressure at the storage temperature',
      why: 'It is what the whole column is sized on, and it is a safety specification before it is a quality one.',
      inputs: ['Bottoms composition', 'Storage temperature'],
      units: 'kPa',
      interpretation: 'A summer specification is tighter than a winter one for the same tank, which is why the column set point moves with the season.'
    }],
    practice: 'On small plants the stabiliser is replaced by a simple two- or three-stage flash, which is cheaper and loses more of the light ends. Which is right depends entirely on what condensate is worth locally.',
    safety: ['The overhead is a light hydrocarbon vapour at low pressure', 'Hot bottoms product going to a tank', 'Water slugs into a hot column cause violent boiling'],
    troubleshooting: [
      { symptom: 'Tank venting', cause: 'Bottoms vapour pressure above the specification', action: 'Raise the reboiler duty and check the bottoms temperature.' },
      { symptom: 'Liquid product yield falling', cause: 'Over-stabilising', action: 'Back off the reboiler; the specification is a limit, not a target.' },
      { symptom: 'Corrosion at the bottom', cause: 'Water and acid gas together', action: 'Check the separator interface upstream.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.nglStorage]: {
    tag: TAGS.nglStorage, name: 'Natural gas liquids storage', type: 'Pressurised bullets or spheres',
    purpose: 'Holds the liquid product under enough pressure to keep it liquid at ambient temperature until it is loaded out.',
    howItWorks: 'A mixed natural gas liquid is a blend of ethane through pentane, and its vapour pressure at summer temperature is what decides the design pressure of the vessel. Ethane-rich product needs far more pressure than a propane-plus one.',
    whyUsed: 'The product is worth more shipped than flared, and it is only shippable as a liquid. Everything about the storage follows from that.',
    inputs: ['Natural gas liquids from the demethaniser'],
    outputs: ['Product to pipeline, rail or road'],
    operatingVariables: ['Level', 'Pressure', 'Product composition and therefore vapour pressure'],
    designVariables: ['Design pressure for the expected composition', 'Vessel type and number', 'Relief and blowdown arrangement'],
    misoperation: [
      'Methane that got past the demethaniser raises the vapour pressure sharply and can take a vessel to its relief setting.',
      'Hydrogen sulphide that got past the amine unit concentrates here, and a liquid product has its own sulphur specification.',
      'Filling above the design level leaves no vapour space for thermal expansion, which is how these vessels fail.'
    ],
    theory: 'The vapour pressure of a mixture follows the composition, so the storage pressure is a direct readout of how well the demethaniser is doing its job. A tank creeping up in pressure is a column letting methane through.',
    equations: [{
      what: 'Bubble point of the stored product',
      equation: 'Σ Kᵢ xᵢ = 1 at the storage temperature',
      why: 'It sets the design pressure of the vessel and the specification on the column upstream.',
      inputs: ['Product composition', 'Storage temperature'],
      units: 'bar',
      interpretation: 'One per cent of methane in the product is worth several bar of storage pressure, which is why the specification is written so tightly.'
    }],
    practice: 'Ethane-rich product is usually sent straight out by pipeline rather than stored, precisely because storing it needs pressure vessels that are expensive at any useful volume.',
    safety: ['Large inventory of pressurised liquefied hydrocarbon: this is the highest-consequence vessel on the plant', 'Boiling liquid expanding vapour explosion is the scenario the fire protection is designed for', 'Hydrogen sulphide in the liquid phase'],
    troubleshooting: [
      { symptom: 'Storage pressure rising', cause: 'Methane in the product', action: 'Check the demethaniser bottoms analysis, not the tank.' },
      { symptom: 'Product failing the sulphur specification', cause: 'Hydrogen sulphide past the amine unit concentrating in the liquid', action: 'The amine unit is usually sized by this rather than by the sales gas.' },
      { symptom: 'Relief valve lifting on a hot day', cause: 'Composition heavier in light ends than design', action: 'Review the product specification against the vessel design pressure.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.flare]: {
    tag: TAGS.flare, name: 'Acid gas flare', type: 'Elevated flare with a pilot and steam assist',
    purpose: 'Destroys the acid gas from the amine regenerator and any relief or blowdown from the plant.',
    howItWorks: 'Gas is burned at the top of a stack high enough that the radiation at ground level is tolerable. Steam or air assist gives a smokeless flame. Hydrogen sulphide burns to sulphur dioxide, which is the whole reason a flare is acceptable here at all.',
    whyUsed: 'Acid gas cannot be vented — hydrogen sulphide is lethal at a few hundred parts per million. On a large plant it goes to a sulphur recovery unit instead and the flare is only for relief; on a small one, burning it is the whole answer.',
    inputs: ['Acid gas from the amine regenerator', 'Relief and blowdown from the plant', 'Pilot fuel and assist steam'],
    outputs: ['Combustion products to atmosphere'],
    operatingVariables: ['Flow', 'Pilot status', 'Assist rate', 'Purge gas'],
    designVariables: ['Stack height for the radiation limit', 'Tip size for the relief case', 'Assist type', 'Knockout drum'],
    misoperation: [
      'Losing the pilot releases unburned hydrogen sulphide at height, which is a serious event.',
      'Too little purge lets air into the header, which is an explosion in a pipe.',
      'Liquid to the flare causes burning rain, which is why there is a knockout drum.'
    ],
    theory: 'Stack height is set by thermal radiation at grade for the largest relief case, and the sulphur dioxide ground-level concentration is set by plume dispersion. Both are design calculations that fix the flare long before the plant is built.',
    equations: [{
      what: 'Radiation at grade',
      equation: 'K = τ·F·Q / (4π·r²)',
      why: 'It fixes the height of the stack and the size of the exclusion area around it.',
      inputs: ['Heat release', 'Distance', 'Fraction radiated'],
      units: 'kW/m²',
      interpretation: 'The usual limits are around 4.7 kW/m² where people might be for a short time and 1.6 kW/m² for continuous work.'
    }],
    practice: 'Anywhere sulphur emissions are regulated, the acid gas goes to a Claus sulphur recovery unit and is sold as solid sulphur, and the flare reverts to being an emergency device.',
    safety: ['Hydrogen sulphide in the header at lethal concentration', 'Thermal radiation during a relief event', 'Never enter the exclusion zone without checking the flare status'],
    troubleshooting: [
      { symptom: 'Smoking flare', cause: 'Assist steam or air short', action: 'Check the assist control; a smoking flare is a reportable emission.' },
      { symptom: 'Pilot repeatedly failing', cause: 'Wind, or a pilot gas supply problem', action: 'Treat as urgent: an unlit acid gas flare is a release.' },
      { symptom: 'Continuous flow with no relief event', cause: 'A leaking relief valve somewhere on the plant', action: 'Find it. Continuous flaring is both a loss and a permit breach.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.mcc]: {
    tag: TAGS.mcc, name: 'Motor control centre', type: 'Switchgear and variable-speed drives in a pressurised building',
    purpose: 'Starts, protects and controls every motor on the plant, and records what each one drew while it did it.',
    howItWorks: 'One cubicle per drive with isolation, protection and, on the large machines, a variable-speed drive. The residue compressor is the largest consumer by a wide margin, and the amine circulation pump is the one that runs continuously whatever else is happening.',
    whyUsed: 'A gas plant is a large electrical load with a small number of very large consumers, and the way those are started and protected determines what the site supply has to be.',
    inputs: ['Incoming supply or on-site generation', 'Start and stop commands', 'Speed set points'],
    outputs: ['Power to each drive', 'Current, speed and torque back to the control system'],
    operatingVariables: ['Motor currents', 'Speed set points', 'Total site demand'],
    designVariables: ['Installed power per drive', 'Area classification and the equipment rating it requires', 'Starting method for the large machines'],
    misoperation: [
      'Direct-on-line starting of a large compressor motor can take the site supply down with it.',
      'Defeating an interlock to restart a tripped machine risks restarting into the fault that tripped it.',
      'A pressurised electrical building loses its protection the moment a door is left open.'
    ],
    theory: 'Net site power is the compressor demand less what the expander recovers, and that difference is the honest cost of the liquids the plant makes. Watching it against the liquids production is the simplest economic instrument on the plant.',
    equations: [{
      what: 'Net shaft power',
      equation: 'P_net = P_compressor − P_expander',
      why: 'It is the energy price of the pressure the plant threw away to make itself cold.',
      inputs: ['Compressor demand', 'Expander recovery'],
      units: 'kW',
      interpretation: 'Divide it by the liquids production and you have the number that decides whether to run in recovery or rejection mode this week.'
    }],
    practice: 'Electrical buildings on a gas plant are pressurised with clean air and sited outside the hazardous area, and both of those are safety systems rather than conveniences.',
    safety: ['Arc flash: the correct procedure and protection for any work on live switchgear', 'Building pressurisation is a hazardous-area protection measure', 'Isolate and lock off before any work on a drive'],
    troubleshooting: [
      { symptom: 'Compressor current higher than usual', cause: 'More residue gas than design, usually a warm cold end', action: 'Check the expander outlet temperature before the machine.' },
      { symptom: 'Voltage dip on starting a large motor', cause: 'Starting method or supply impedance', action: 'A site supply problem, not a motor one.' },
      { symptom: 'Building pressurisation alarm', cause: 'Door left open or fan failure', action: 'Treat as a hazardous-area breach and restore before continuing work.' }
    ]
  }
};

export default EQUIPMENT;
