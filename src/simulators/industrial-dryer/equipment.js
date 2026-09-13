/**
 * 02 — INDUSTRIAL DRYER — equipment information.
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
  [TAGS.feedHopper]: {
    tag: TAGS.feedHopper, name: 'Wet feed hopper', type: 'Hoppered storage bin with level measurement',
    purpose: 'Buffers the wet feed between whatever produces it and the dryer, so the drum sees a steady rate rather than whatever arrives.',
    howItWorks: 'Wet material is tipped or conveyed into the bin and discharges through a pyramidal hopper onto the feed screw. The hopper walls are steep enough that the material slides rather than bridges across the outlet.',
    whyUsed: 'A dryer is a steady-state machine. Every setting on it — dose of heat, air flow, residence time — is expressed per unit of feed, so a surging feed rate makes all of them wrong at once. The hopper turns an intermittent supply into a continuous one.',
    inputs: ['Wet solids from upstream handling'],
    outputs: ['Wet solids to the feed screw at a controlled rate'],
    operatingVariables: ['Level', 'Feed moisture', 'Feed temperature', 'Discharge rate'],
    designVariables: ['Live capacity in minutes of feed', 'Hopper wall angle against the material\'s angle of repose', 'Outlet size against the largest lump', 'Wall finish and any flow aids'],
    misoperation: [
      'Letting the level run low lets the discharge rate wander, and the drum sees a feed surge followed by a starve.',
      'A wet, cohesive feed will bridge over the outlet and the dryer runs empty while the bin still shows material.',
      'Filling with material far wetter than design changes the whole heat load downstream without any setting being touched.'
    ],
    theory: 'Discharge from a hopper is governed by the material\'s flow function and the wall friction angle, not by the head of material above the outlet. That is why a bin that is nearly full can still stop discharging.',
    equations: [{
      what: 'Dry basis moisture content',
      equation: 'X = mass of water / mass of bone-dry solid        F_dry = F_wet / (1 + X)',
      why: 'Every balance in the dryer is written on the bone-dry solid, because that is the one quantity that does not change as the material dries.',
      inputs: ['Wet feed rate', 'Moisture content'],
      units: 'kg water per kg bone-dry solid',
      interpretation: 'A wet-basis 20 % is a dry-basis 0.25 kg/kg. Confusing the two is the most common error in a drying calculation.'
    }],
    practice: 'Live-bottom bins, vibrating dischargers or air cannons are common where the feed is cohesive. A loss-in-weight system under the bin measures the rate actually delivered rather than assuming it.',
    safety: ['Confined space entry for cleaning, with the discharge isolated', 'Never enter a bin to clear a bridge from below — the material can collapse without warning', 'Guard the discharge opening', 'Dust exposure on tipping'],
    troubleshooting: [
      { symptom: 'Dryer feed rate falls while the bin shows material', cause: 'Bridging or rat-holing over the outlet', action: 'Do not poke from below. Use the flow aids, and review the hopper angle against the feed moisture.' },
      { symptom: 'Product moisture swings with no setting changed', cause: 'Feed rate surging as the level changes', action: 'Hold a steadier level and check the discharge device is rate-controlled rather than level-controlled.' },
      { symptom: 'Heat load higher than expected', cause: 'Feed wetter than design', action: 'Measure the feed moisture. The dryer cannot tell you what it was given, only what it managed to do with it.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.feedScrew]: {
    tag: TAGS.feedScrew, name: 'Wet feed screw conveyor', type: 'Enclosed screw conveyor, variable speed',
    purpose: 'Meters the wet feed into the drum at a measured rate and seals the feed end against air leaking in.',
    howItWorks: 'A helical flight turning inside an enclosed trough drags material along. The volumetric rate is set by the pitch, the diameter and the speed, so a variable speed drive gives direct control of the feed rate.',
    whyUsed: 'It does two jobs at once: it sets the rate that every other calculation depends on, and it forms a plug of material that keeps cold air from being drawn into the feed breeching by the induced draught.',
    inputs: ['Wet solids from the hopper', 'Electrical supply from MCC-201'],
    outputs: ['Wet solids into the drum feed breeching'],
    operatingVariables: ['Screw speed', 'Delivered rate', 'Motor current'],
    designVariables: ['Screw diameter and pitch', 'Trough loading, usually 30 to 45 per cent', 'Drive torque for a sticky feed', 'Length, which sets how much torque the shaft has to carry'],
    misoperation: [
      'Overfilling the trough raises the torque sharply and can twist the shaft.',
      'Running a wet, sticky feed too slowly lets it build on the flights until the screw is conveying nothing.',
      'Losing the material seal lets cold air into the feed end, which cools the gas before it ever reaches the solids.'
    ],
    theory: 'Throughput is the product of the swept volume per revolution, the speed, the trough loading and the bulk density. Because it is volumetric, a change in bulk density changes the mass rate even with the speed unchanged.',
    equations: [{
      what: 'Screw conveyor throughput',
      equation: 'F = (π/4)·(D² − d²)·p·N·φ·ρ_bulk',
      why: 'It is why the feed rate is set in volume and measured in mass, and why a change in the material changes the calibration.',
      inputs: ['Screw and shaft diameter', 'Pitch', 'Speed', 'Trough loading', 'Bulk density'],
      units: 'kg/h',
      interpretation: 'Two feeds at the same speed give different mass rates if their bulk densities differ, which is exactly what happens when the feed moisture changes.'
    }],
    practice: 'Loss-in-weight feeders or a weigh belt are used wherever the mass rate actually matters, because a screw on its own is a volumetric device pretending to be a mass one.',
    safety: ['Never open an inspection cover on a running screw', 'Lock off before clearing a blockage', 'Guard the drive coupling', 'The trough is a confined space'],
    troubleshooting: [
      { symptom: 'Delivered rate below the set point', cause: 'Material building on the flights, or bulk density lower than calibrated', action: 'Check the flights for build-up and re-check the calibration against the current feed.' },
      { symptom: 'High motor current', cause: 'Overfilled trough or a foreign object', action: 'Stop, isolate, and inspect before restarting. Do not raise the overload setting.' },
      { symptom: 'Gas temperature at the drum inlet lower than the heater outlet', cause: 'Air in-leakage at the feed end', action: 'Check the material seal at the screw discharge and the breeching seals.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.supplyFan]: {
    tag: TAGS.supplyFan, name: 'Drying air supply fan', type: 'Centrifugal fan, variable speed',
    purpose: 'Draws ambient air and delivers it to the heater at the flow the drying duty requires.',
    howItWorks: 'A centrifugal impeller adds velocity to the air and the scroll casing converts it to pressure, enough to push the air through the heater, the drum, the cyclone and the bag filter with the exhaust fan.',
    whyUsed: 'Air is the carrier for both the heat going in and the moisture coming out. Its flow is one of the two main handles an operator has on a dryer, the other being its temperature.',
    inputs: ['Ambient air at whatever temperature and humidity the day provides', 'Electrical supply from MCC-201'],
    outputs: ['Air to the heater at the set flow'],
    operatingVariables: ['Air flow', 'Fan speed', 'Ambient temperature and humidity', 'Discharge pressure'],
    designVariables: ['Rated volumetric flow and static pressure', 'Impeller type', 'Variable speed drive', 'Margin for a fouled bag filter'],
    misoperation: [
      'Too little air and there is not enough heat capacity to carry the duty, so the exhaust saturates and drying stops.',
      'Too much air and the drum entrains product as dust, while the gas drag shortens the residence time at the same moment.',
      'Throttling with a damper instead of the speed drive wastes the head across the damper.'
    ],
    theory: 'Fans are volumetric machines, so the mass flow they deliver falls as the air gets hotter or less dense. The shaft power is the product of the volumetric flow and the pressure rise, divided by the efficiency.',
    equations: [{
      what: 'Fan shaft power',
      equation: 'P = Q · Δp / η',
      why: 'It shows that the fan power depends on the system resistance as much as on the flow, which is why a blinded bag filter costs electricity as well as throughput.',
      inputs: ['Volumetric flow', 'System pressure drop', 'Efficiency'],
      units: 'P in W, Q in m³/s, Δp in Pa',
      interpretation: 'A dryer usually runs slightly below atmospheric pressure so dust leaks in rather than out, which is why the exhaust fan does most of the work.'
    }],
    practice: 'Most direct dryers run under induced draught, with the supply fan sized for a fraction of the total resistance and the exhaust fan holding the system negative.',
    safety: ['Isolate and lock off before opening the casing', 'Guard the inlet', 'Hearing protection near the fan', 'Never start against a fully closed damper on a large fan'],
    troubleshooting: [
      { symptom: 'Air flow below set point at full speed', cause: 'System resistance risen, usually a blinding bag filter', action: 'Check the pressure drop across the filter before assuming a fan fault.' },
      { symptom: 'Flow varies through the day at a fixed speed', cause: 'Ambient temperature changing the air density', action: 'Expected on a volumetric machine. Control on mass flow if the duty is tight.' },
      { symptom: 'Vibration', cause: 'Dust build-up on the impeller, or bearing wear', action: 'Stop and inspect the impeller for uneven deposits.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.heater]: {
    tag: TAGS.heater, name: 'Direct-fired air heater', type: 'In-line burner with combustion chamber',
    purpose: 'Raises the drying air to the inlet temperature, which is the largest single handle on how much water the dryer can evaporate.',
    howItWorks: 'Fuel is burned in a chamber through which the supply air passes. The combustion products mix straight into the drying air, so essentially all the fuel energy ends up in the gas stream rather than being lost across a heat exchanger surface.',
    whyUsed: 'Heating the air does not change how much water it already carries; it changes how much more it can carry, and it supplies the latent heat the evaporation needs. Direct firing is used because it is efficient and can reach the high inlet temperatures that a wet feed needs.',
    inputs: ['Air from the supply fan', 'Fuel gas'],
    outputs: ['Hot drying air to the drum inlet'],
    operatingVariables: ['Outlet air temperature', 'Fuel rate', 'Excess air', 'Heater efficiency'],
    designVariables: ['Turndown ratio', 'Combustion chamber residence time for complete burnout', 'Refractory lining', 'Flame safeguard and purge sequence'],
    misoperation: [
      'Running a higher inlet temperature than the product can take will degrade or scorch it once the material passes the critical moisture and loses its evaporative cooling.',
      'Too low a temperature and the dryer is simply heat-limited: it will not reach the target moisture however long the drum is.',
      'Incomplete combustion puts unburnt fuel and soot into the product as well as up the stack.'
    ],
    theory: 'The heat needed is the air mass flow times its humid heat times the temperature rise. Because the humid heat depends on the humidity ratio, damp ambient air is very slightly more expensive to heat, though the effect is small compared with the temperature rise itself.',
    equations: [{
      what: 'Heater duty',
      equation: 'Q = G · c_s · (T_in − T_amb) / η        c_s = 1.005 + 1.88·Y',
      why: 'It converts an inlet temperature set point into a fuel bill, and shows that both the flow and the temperature rise are paid for.',
      inputs: ['Air flow', 'Humidity ratio', 'Temperature rise', 'Heater efficiency'],
      units: 'kJ/h',
      interpretation: 'Doubling the air flow at the same temperature doubles the fuel, but does not double the evaporation, which is why more air is not automatically better.'
    }],
    practice: 'Indirect heating through a heat exchanger is used where the product must not touch combustion products, at the cost of a lower achievable temperature and a real efficiency penalty.',
    safety: ['Flame safeguard and purge interlocks must never be defeated', 'Prove the air flow before admitting fuel', 'Hot surfaces and refractory', 'Gas detection at the fuel train'],
    troubleshooting: [
      { symptom: 'Cannot reach the inlet temperature set point', cause: 'Fuel supply pressure low, or air flow higher than the burner is rated for', action: 'Check the fuel pressure and compare the air flow against the burner rating.' },
      { symptom: 'Product scorched or discoloured', cause: 'Inlet temperature too high for the material once it is past the critical moisture', action: 'Lower the inlet temperature and lengthen the residence time instead.' },
      { symptom: 'Soot in the product', cause: 'Incomplete combustion from insufficient excess air', action: 'Check the air-to-fuel ratio and the burner condition.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.drum]: {
    tag: TAGS.drum, name: 'Rotary drum dryer', type: 'Direct-heat co-current rotary dryer with lifting flights',
    purpose: 'Brings the wet solids and the hot gas into contact for long enough, and with enough surface exposed, to evaporate the water.',
    howItWorks: 'The drum is a slightly inclined cylinder turning slowly on trunnions. Lifting flights pick the solids up and cascade them through the gas stream as a curtain, which is where nearly all the heat transfer happens. The slope and rotation convey the solids along, while the gas flows the same way and drags them slightly faster.',
    whyUsed: 'It handles almost anything — sticky, lumpy, abrasive, variable — which is why it is still the workhorse of industrial drying despite being neither the most efficient nor the most compact option.',
    inputs: ['Wet solids from the feed screw', 'Hot air from the heater'],
    outputs: ['Dried product to the product screw', 'Moist exhaust gas and entrained dust to the cyclone'],
    operatingVariables: ['Rotational speed', 'Residence time', 'Drum loading', 'Product moisture', 'Product temperature'],
    designVariables: ['Length and diameter, and the ratio between them', 'Slope', 'Flight pattern and number', 'Holdup, usually 8 to 15 per cent of the volume'],
    misoperation: [
      'Running too fast shortens the residence time, and the falling-rate period is the part that suffers first.',
      'Overloading the drum makes the solids roll rather than cascade, so the curtain the gas has to pass through thins and the heat transfer falls.',
      'Too much gas drag in co-current flow blows the solids through before they can dry, and past a point the correlation gives no residence time at all.',
      'Running well past the target wastes fuel twice: once on the fuel itself, and again on product mass that was sold as water.'
    ],
    theory: 'Two independent things have to be satisfied. The drum has to transfer enough heat, which the volumetric coefficient and the log-mean temperature difference decide. And it has to give the solids enough time, which the slope, the speed and the gas drag decide. Whichever is short is what limits the dryer, and they call for opposite corrections.',
    equations: [
      {
        what: 'Residence time',
        equation: 'τ = 0.23·L / (S·N^0.9·D) − 0.6·B·L·G/F        B = 5·Dp^(−0.5)',
        why: 'It turns the mechanical settings into the time the solids actually get.',
        inputs: ['Length, slope, speed, diameter', 'Gas and solids mass velocities', 'Particle size'],
        units: 'minutes',
        interpretation: 'The first term is the conveying action; the second is the gas drag, which in co-current flow always subtracts.'
      },
      {
        what: 'Volumetric heat transfer',
        equation: 'Q = Ua · V · ΔT_lm        Ua = 237 · G^0.67 / D',
        why: 'A rotary dryer is sized on volume, because the contact area of a cascading curtain of solids cannot be measured.',
        inputs: ['Gas mass velocity', 'Drum volume', 'Log-mean temperature difference'],
        units: 'W',
        interpretation: 'More gas raises the coefficient and shortens the residence time at the same time. The two pull against each other, which is why there is an optimum rather than a direction.'
      },
      {
        what: 'Drying kinetics',
        equation: 'Constant rate: X = X₀ − N_c·t        Falling rate: X = X_e + (X_c − X_e)·exp(−N_c·t/(X_c − X_e))',
        why: 'Above the critical moisture the surface stays wet and the rate is flat; below it the rate falls with the free moisture left.',
        inputs: ['Constant drying rate', 'Critical and equilibrium moisture', 'Time'],
        units: 'kg water per kg dry solid',
        interpretation: 'The last few points of moisture take disproportionately long, which is why tightening a moisture specification costs far more than it appears to.'
      }
    ],
    practice: 'Counter-current arrangements give a hotter product and a better thermal efficiency but risk overheating a heat-sensitive material; co-current puts the hottest gas onto the wettest solids, where evaporative cooling protects them.',
    safety: ['Lock off the drive before entering the drum', 'The drum is a confined space with a hot, oxygen-depleted atmosphere after shutdown', 'Guard the girth gear and pinion', 'Hot shell surfaces along the whole length'],
    troubleshooting: [
      { symptom: 'Product wetter than target, exhaust still hot and dry', cause: 'Residence time too short: the solids are passing through before the falling-rate period finishes', action: 'Slow the drum or reduce the gas drag. Adding heat will not help if the time is the constraint.' },
      { symptom: 'Product wetter than target, exhaust cool and humid', cause: 'Heat limited, or the air is approaching saturation', action: 'Raise the inlet temperature or the air flow. Check the exhaust relative humidity to tell the two apart.' },
      { symptom: 'Product too hot', cause: 'Solids past the critical moisture early, so there is no evaporative cooling for the rest of the drum', action: 'Lower the inlet temperature; the drum is longer than this duty needs.' },
      { symptom: 'Heavy dust carryover', cause: 'Gas velocity approaching the particle terminal velocity', action: 'Reduce the air flow or accept the loss. Fine material always goes first.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.cyclone]: {
    tag: TAGS.cyclone, name: 'Product recovery cyclone', type: 'Reverse-flow tangential entry cyclone',
    purpose: 'Recovers the bulk of the product entrained in the exhaust gas, before the bag filter has to deal with it.',
    howItWorks: 'Gas enters tangentially into the barrel and spirals down the cone. The particles, being denser, are thrown to the wall and fall out of the bottom, while the gas reverses and leaves up the vortex finder in the middle.',
    whyUsed: 'It has no moving parts, tolerates hot and abrasive dust, and takes the bulk load off the bag filter. The filter is a polishing device; asking it to carry the whole dust load blinds it quickly.',
    inputs: ['Dust-laden exhaust gas from the drum'],
    outputs: ['Recovered product to the product screw', 'Partly cleaned gas to the bag filter'],
    operatingVariables: ['Inlet velocity', 'Pressure drop', 'Collection efficiency', 'Dust discharge'],
    designVariables: ['Body diameter, which sets the cut size', 'Inlet velocity, typically 15 to 25 m/s', 'Barrel and cone proportions', 'Dust valve arrangement'],
    misoperation: [
      'Running below the design inlet velocity collapses the efficiency, because the separating force depends on the square of the velocity.',
      'A leaking or open dust valve lets gas be drawn up through the dust outlet and the collected material is re-entrained.',
      'Letting the dust hopper fill to the cone floods the separation zone.'
    ],
    theory: 'Separation depends on the centrifugal force on a particle against the drag of the inward gas flow. The cut size falls as the body diameter falls and as the inlet velocity rises, which is why several small cyclones in parallel outperform one large one on the same duty.',
    equations: [{
      what: 'Cut size and the velocity dependence',
      equation: 'd₅₀ ∝ √( µ · D / (ρ_p · v_in) )',
      why: 'It shows that efficiency is bought with velocity and with small bodies, and both are paid for in pressure drop.',
      inputs: ['Gas viscosity', 'Body diameter', 'Particle density', 'Inlet velocity'],
      units: 'm',
      interpretation: 'Halving the throughput through a fixed cyclone does not halve the dust it lets through — it makes it markedly worse.'
    }],
    practice: 'Multicyclones are used where the dust is fine. The dust valve, usually a rotary airlock or a flap, is as important as the cyclone body: most poor cyclone performance is actually an air in-leakage problem.',
    safety: ['Hot surfaces', 'Confined space entry for internal inspection', 'Dust explosion risk with combustible product: check the venting arrangement', 'Isolate before opening the dust outlet'],
    troubleshooting: [
      { symptom: 'Bag filter loading up quickly', cause: 'Cyclone efficiency down, so the filter is carrying the bulk load', action: 'Check the inlet velocity and the dust valve before blaming the filter.' },
      { symptom: 'Collected dust rate low but stack dust high', cause: 'Air being drawn in at the dust outlet and re-entraining the catch', action: 'Check the rotary valve seals.' },
      { symptom: 'Pressure drop risen', cause: 'Build-up in the barrel or a partly blocked vortex finder', action: 'Inspect internally at the next shutdown.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.bagFilter]: {
    tag: TAGS.bagFilter, name: 'Pulse-jet bag filter', type: 'Reverse-pulse fabric filter',
    purpose: 'Removes the fine dust the cyclone could not, so the gas leaving the stack meets its emission limit.',
    howItWorks: 'Gas passes through fabric bags, leaving the dust on the outside as a cake. That cake does most of the filtering. Periodically a pulse of compressed air snaps each bag and the cake falls into the hopper.',
    whyUsed: 'It is the last barrier before atmosphere, and on a product-recovery duty it is also the last chance to get saleable material back. Stack dust limits are legal limits, not targets.',
    inputs: ['Partly cleaned gas from the cyclone', 'Compressed air for the cleaning pulses'],
    outputs: ['Recovered fines to the product screw', 'Clean gas to the exhaust fan'],
    operatingVariables: ['Pressure drop across the bags', 'Air-to-cloth ratio', 'Pulse frequency', 'Outlet dust concentration'],
    designVariables: ['Cloth area, which sets the air-to-cloth ratio', 'Fabric type and its temperature rating', 'Pulse pressure and interval', 'Hopper and discharge arrangement'],
    misoperation: [
      'Cleaning too often strips the cake that is doing the filtering, so emissions rise and the bags wear out faster.',
      'Cleaning too rarely lets the pressure drop climb until the fan cannot pull the design flow.',
      'Running the gas below its dew point blinds the bags with condensed moisture, and on a dryer that is a real risk whenever the exhaust humidity is high and the day is cold.',
      'Exceeding the fabric temperature rating destroys the bags quickly and silently.'
    ],
    theory: 'The pressure drop is the sum of a fabric resistance and a cake resistance, and the cake term grows with the dust collected per unit area. The air-to-cloth ratio is the superficial velocity through the fabric and is the main design parameter.',
    equations: [{
      what: 'Filter pressure drop',
      equation: 'Δp = K₁·v + K₂·w·v        w = dust collected per unit cloth area',
      why: 'It explains why the drop climbs between cleans and why a higher air-to-cloth ratio costs disproportionately.',
      inputs: ['Face velocity', 'Dust loading per unit area'],
      units: 'Pa',
      interpretation: 'Everything the cyclone fails to collect arrives here, so poor cyclone performance shows up as a rising filter pressure drop first.'
    }],
    practice: 'On a dryer the exhaust is warm and humid, so the filter is usually insulated and often trace-heated, and the start-up sequence brings it above the dew point before gas is admitted.',
    safety: ['Dust explosion risk: check the explosion venting and any inerting', 'Compressed air stored at pressure in the receiver', 'Confined space entry for bag changes', 'Never enter with the pulse system live'],
    troubleshooting: [
      { symptom: 'Stack dust above limit', cause: 'A split bag, or cleaning so aggressive that the cake never establishes', action: 'Isolate compartments to find the split bag; review the pulse interval.' },
      { symptom: 'Pressure drop rising and not recovering after a pulse', cause: 'Blinding, usually from condensation or from a hygroscopic dust', action: 'Check the gas temperature against the dew point of the exhaust.' },
      { symptom: 'Bags failing early', cause: 'Over-temperature, abrasion at the cage, or over-frequent pulsing', action: 'Check the fabric rating against the actual exhaust temperature.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.exhaustFan]: {
    tag: TAGS.exhaustFan, name: 'Induced draught exhaust fan', type: 'Centrifugal fan on the clean gas side',
    purpose: 'Pulls the gas through the whole train and holds the dryer below atmospheric pressure so dust leaks in rather than out.',
    howItWorks: 'Sited after the bag filter so it handles clean gas rather than abrasive dust, it provides most of the system pressure. Its speed sets the draught the whole plant runs at.',
    whyUsed: 'A dryer at positive pressure puffs hot dusty gas out of every seal. Running the system negative is the standard way to contain it, and it is the exhaust fan that does that.',
    inputs: ['Clean gas from the bag filter', 'Electrical supply from MCC-201'],
    outputs: ['Gas to the stack'],
    operatingVariables: ['Speed', 'System pressure drop', 'Draught at the drum', 'Motor current'],
    designVariables: ['Rated flow at the exhaust temperature and density', 'Static pressure with a dirty filter', 'Variable speed drive', 'Materials for a humid, warm gas'],
    misoperation: [
      'Too little draught and the dryer goes positive, so dust and hot gas escape at the seals.',
      'Too much draught pulls cold air in through every leak, which cools the gas and wastes fuel.',
      'Sizing on clean-filter resistance leaves nothing in hand when the bags load up.'
    ],
    theory: 'The fan handles gas at the exhaust temperature, so its volumetric duty is much larger than the same mass would be at ambient. That is why the exhaust fan is usually the bigger of the two.',
    equations: [{
      what: 'Volumetric duty at temperature',
      equation: 'Q = m · R · T / (P · M)        P_shaft = Q · Δp / η',
      why: 'The same mass of gas occupies far more volume hot than cold, and the fan is sized on volume.',
      inputs: ['Mass flow', 'Exhaust temperature', 'Pressure drop'],
      units: 'm³/s and W',
      interpretation: 'A hotter exhaust means a bigger fan and more electricity, on top of the fuel already wasted heating it.'
    }],
    practice: 'Inlet guide vanes or a variable speed drive control the draught. A draught measurement at the drum feed end is the usual control point, held slightly negative.',
    safety: ['Isolate and lock off before opening', 'Guard the drive', 'Hearing protection', 'Do not run without the filter in service — the fan is not built for dust'],
    troubleshooting: [
      { symptom: 'Dust escaping at the drum seals', cause: 'Insufficient draught', action: 'Check the draught at the feed end and raise the fan speed.' },
      { symptom: 'Gas temperature falling along the train', cause: 'Cold air in-leakage from excessive draught or poor seals', action: 'Reduce the draught to the minimum that holds the system negative, then find the leaks.' },
      { symptom: 'Fan cannot hold flow', cause: 'Filter blinding', action: 'Check the filter differential first; the fan is usually the symptom rather than the cause.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.stack]: {
    tag: TAGS.stack, name: 'Exhaust stack', type: 'Self-supporting steel stack with monitoring',
    purpose: 'Discharges the cleaned exhaust at a height that disperses it, and carries the monitoring that proves the plant is within its limits.',
    howItWorks: 'Gas from the exhaust fan rises up the stack and leaves at height. Monitoring points in the stack measure dust, temperature and, where required, other components on a continuous basis.',
    whyUsed: 'It is where the plant is measured. Everything the cyclone and the bag filter failed to collect is counted here, and the result is a matter of regulatory record rather than internal opinion.',
    inputs: ['Cleaned gas from the exhaust fan'],
    outputs: ['Exhaust to atmosphere'],
    operatingVariables: ['Exhaust temperature', 'Dust concentration', 'Relative humidity of the exhaust', 'Volumetric flow'],
    designVariables: ['Height for dispersion', 'Exit velocity, usually 15 to 20 m/s to avoid downwash', 'Sampling ports at a straight-run location', 'Materials for a humid acidic condensate'],
    misoperation: [
      'A visible plume is usually condensed water rather than dust, but it is what the neighbours report.',
      'A low exit velocity lets the plume wash down the outside of the stack instead of rising.',
      'Sampling too close to a bend gives a number that means nothing.'
    ],
    theory: 'Dust concentration is the mass rate of dust divided by the volumetric gas rate, so the same mass of dust reads as a lower concentration in a larger gas flow. That is worth remembering before congratulating a plant on a low reading.',
    equations: [{
      what: 'Dust concentration',
      equation: 'c = dust mass rate / volumetric gas flow',
      why: 'It is the number the limit is written against, and it depends on the gas flow as well as on the dust.',
      inputs: ['Dust to stack', 'Exhaust volumetric flow'],
      units: 'mg/m³',
      interpretation: 'Raising the air flow reduces the concentration while increasing the total mass emitted. Limits are usually written to close that loophole by correcting to a reference condition.'
    }],
    practice: 'Continuous emission monitoring is normal on anything of significant size, with the data logged and reported to the regulator directly.',
    safety: ['Fall protection for any stack access', 'Hot surfaces at the base', 'Lightning protection and aircraft warning lighting where required', 'Sampling ports are a working-at-height task'],
    troubleshooting: [
      { symptom: 'Visible plume', cause: 'Water vapour condensing as the exhaust cools, usually harmless', action: 'Check the dust monitor before assuming it is an emission. A humid exhaust on a cold day will always plume.' },
      { symptom: 'Dust reading rising slowly', cause: 'Bag wear', action: 'Trend it against the filter differential; a rising reading with a falling drop points at a split bag.' },
      { symptom: 'Condensate corrosion at the base', cause: 'Exhaust cooling below its dew point in the stack', action: 'Insulate, or run a higher exhaust temperature in cold weather.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.productScrew]: {
    tag: TAGS.productScrew, name: 'Product screw conveyor', type: 'Enclosed screw conveyor',
    purpose: 'Collects the dried product from the drum together with the fines recovered by the cyclone and the bag filter, and carries them to the cooler.',
    howItWorks: 'The drum discharge, the cyclone dust valve and the bag filter hopper all drop into the same enclosed trough, which conveys the combined stream onward.',
    whyUsed: 'The fines recovered from the gas are product, not waste. Bringing them back into the main stream here is what makes the difference between a 99 per cent recovery and a 97 per cent one.',
    inputs: ['Dried product from the drum', 'Recovered fines from the cyclone', 'Recovered fines from the bag filter'],
    outputs: ['Combined product to the cooler'],
    operatingVariables: ['Throughput', 'Product moisture', 'Product temperature', 'Motor current'],
    designVariables: ['Capacity for the combined stream', 'Materials for a hot abrasive product', 'Sealing against air in-leakage', 'Inlet spacing so the drops do not interfere'],
    misoperation: [
      'Returning fines faster than the main stream can absorb them makes the product inconsistent in size.',
      'Poor sealing lets air into a system that is running under draught, upsetting the gas balance.',
      'A hot product in an enclosed screw is a dust explosion hazard if the material is combustible.'
    ],
    theory: 'Nothing is added or removed here: it is a collection point. The value in it is that the solids balance closes, and the recovery figure the plant reports is the sum of what all three sources deliver.',
    equations: [{
      what: 'Product recovery',
      equation: 'recovery = (drum product + cyclone catch + filter catch) / solids fed',
      why: 'It is the figure the plant is judged on commercially, and it only closes if all three streams are counted.',
      inputs: ['Drum discharge', 'Cyclone and filter catches', 'Solids fed'],
      units: 'per cent',
      interpretation: 'The shortfall is whatever left by the stack, and that is both a loss and an emission.'
    }],
    practice: 'Rotary airlocks under the cyclone and the filter hopper are what keep the gas side and the solids side separate while still letting the dust through.',
    safety: ['Lock off before opening any cover', 'Hot product: burn risk at the drum discharge', 'Dust explosion risk for combustible product', 'Confined space'],
    troubleshooting: [
      { symptom: 'Recovery below expectation', cause: 'A dust valve not discharging, so the catch is sitting in a hopper', action: 'Check both rotary valves are turning and discharging.' },
      { symptom: 'Product size distribution inconsistent', cause: 'Fines returned in slugs rather than continuously', action: 'Check the pulse and discharge timing on the filter hopper.' },
      { symptom: 'Draught upset at the drum', cause: 'Air in-leakage through a screw inlet seal', action: 'Check the seals at all three inlet spouts.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.cooler]: {
    tag: TAGS.cooler, name: 'Rotary product cooler', type: 'Direct-contact rotary cooler with ambient air',
    purpose: 'Brings the product down from the drum discharge temperature to something that can be stored and handled.',
    howItWorks: 'A smaller rotating drum cascades the hot product through a counter-current stream of ambient air. The product gives up its sensible heat to the air, which is then vented.',
    whyUsed: 'Product leaving a dryer can be near the gas temperature. Storing it hot risks caking, degradation, and in a silo it is a fire risk. It also continues to lose the last of its moisture into a closed space, which then condenses on the walls.',
    inputs: ['Hot dried product from the product screw', 'Ambient cooling air'],
    outputs: ['Cooled product to the bin', 'Warm vent air'],
    operatingVariables: ['Inlet and outlet product temperature', 'Cooling air flow', 'Residence time'],
    designVariables: ['Volume for the cooling duty', 'Air-to-product ratio', 'Approach temperature to ambient', 'Whether the vent air needs its own dust collection'],
    misoperation: [
      'Insufficient cooling sends hot product to storage, where it cakes and can self-heat.',
      'Too much cooling air entrains fines and creates a second dust duty to deal with.',
      'On a humid day the cooling air can put moisture back into a product that was just dried.'
    ],
    theory: 'The duty is the product mass rate times its specific heat times the temperature drop. The outlet temperature cannot reach ambient: there is always an approach, set by the size of the cooler and the air flow.',
    equations: [{
      what: 'Cooler duty',
      equation: 'Q = F · (c_ps + X·c_pw) · (T_in − T_out)',
      why: 'It sizes the cooler and tells you how much cooling air the duty needs.',
      inputs: ['Product rate and moisture', 'Temperature drop'],
      units: 'kJ/h',
      interpretation: 'The hotter the dryer ran, the more the cooler has to take out, so an over-hot dryer costs twice.'
    }],
    practice: 'Fluid-bed coolers are common where the product suits them, and combined dryer-coolers put both duties in one shell with the cooling section at the discharge end.',
    safety: ['Lock off the drive before entry', 'Hot product at the inlet', 'Confined space', 'Dust explosion risk on the vent'],
    troubleshooting: [
      { symptom: 'Product still hot at the bin', cause: 'Cooling air flow low, or the product arriving hotter than design', action: 'Check the drum discharge temperature first; the cooler may be sized correctly for a duty that has changed.' },
      { symptom: 'Product moisture higher at the bin than at the drum', cause: 'Humid cooling air re-wetting the product', action: 'Expected on a damp day with a hygroscopic product. Consider dehumidified or heated cooling air.' },
      { symptom: 'Dust from the cooler vent', cause: 'Cooling air flow above design, entraining fines', action: 'Reduce the air flow to what the duty needs.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.productBin]: {
    tag: TAGS.productBin, name: 'Dried product bin', type: 'Hoppered storage bin with level and moisture monitoring',
    purpose: 'Holds the finished product and is where the plant\'s output is measured against its specification.',
    howItWorks: 'Cooled product is conveyed in at the top and discharges through a hopper to packing or bulk loading. Level and, on a well-instrumented plant, on-line moisture are measured here.',
    whyUsed: 'It decouples the dryer from whatever takes the product away, and it is the point at which the plant finds out whether it made specification or not.',
    inputs: ['Cooled product from the cooler'],
    outputs: ['Product to packing or dispatch'],
    operatingVariables: ['Level', 'Product moisture against specification', 'Product temperature'],
    designVariables: ['Capacity in hours of production', 'Hopper angle for the dried material, which flows differently from the wet feed', 'Whether it needs to be sealed against ambient humidity'],
    misoperation: [
      'Storing product above its specification moisture lets it cake and, with an organic material, lets it spoil.',
      'Storing it hot allows moisture to migrate and condense on the bin roof, then drip back onto the product.',
      'An unsealed bin lets a hygroscopic product pick moisture back up from the air it is stored in.'
    ],
    theory: 'Moisture is usually specified on a wet basis commercially and worked in dry basis technically, so the same product carries two different numbers. Converting between them is where disputes start.',
    equations: [{
      what: 'Wet basis from dry basis',
      equation: 'w = X / (1 + X)        X = w / (1 − w)',
      why: 'The specification is almost always wet basis, and the calculation is almost always dry basis.',
      inputs: ['Dry basis moisture'],
      units: 'fraction or per cent',
      interpretation: 'A dry-basis 0.05 kg/kg is a wet-basis 4.8 per cent. The gap widens quickly as the material gets wetter.'
    }],
    practice: 'On-line near-infrared moisture measurement at the bin inlet is common, and it is what allows the dryer to be controlled on product moisture rather than on exhaust temperature.',
    safety: ['Confined space entry', 'Never enter to clear a bridge from below', 'Dust explosion risk on filling', 'Hot product if the cooler is underperforming'],
    troubleshooting: [
      { symptom: 'Moisture at the bin above the drum reading', cause: 'Re-absorption from humid cooling or storage air', action: 'Check the cooler vent air and whether the bin is sealed.' },
      { symptom: 'Caking in the bin', cause: 'Product stored hot, or above its specification moisture', action: 'Check the cooler outlet temperature and the moisture trend together.' },
      { symptom: 'Discharge stops with material in the bin', cause: 'Bridging, often worse with a warmer or damper product', action: 'Review the hopper angle against the product as it is actually being made.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.mcc]: {
    tag: TAGS.mcc, name: 'Motor control centre', type: 'Electrical switchgear, motor starters and drives',
    purpose: 'Distributes power to every driven unit and carries the protection, starting and status signalling for each one.',
    howItWorks: 'Incoming supply is distributed to individual starter and drive cubicles, one per motor. Each provides isolation, short-circuit and overload protection, and the contactor or variable speed drive that runs the machine, reporting its status back to the control system.',
    whyUsed: 'It is where a trip is diagnosed, and on this plant it is also where the variable speed drives on the fans and the drum live, which are the main handles on the process.',
    inputs: ['Incoming electrical supply', 'Start and stop commands from the control system'],
    outputs: ['Power to the fans, drum drive, screws and cooler', 'Run, trip and current status signals'],
    operatingVariables: ['Total connected load', 'Individual motor currents', 'Drive speed references', 'Trip and alarm status'],
    designVariables: ['Incoming supply rating', 'Protection settings per motor', 'Variable speed drive provision and harmonic mitigation', 'Segregation between cubicles'],
    misoperation: [
      'Resetting a trip without finding the cause usually produces the same trip, and sometimes damage.',
      'Raising an overload setting to stop nuisance trips removes the protection the motor depends on.',
      'Working on a starter without proving dead is the most common cause of serious injury on a plant like this.'
    ],
    theory: 'The electrical load here is small next to the heater duty, which is thermal. That contrast is the point: a dryer is a fuel machine with an electrical supporting cast, and the specific energy figure is dominated by the burner rather than by the motors.',
    equations: [{
      what: 'Electrical against thermal demand',
      equation: 'P_electrical = ΣP_fans + P_drum + P_conveyors        SEC = Q_heater / W',
      why: 'It puts the two energy streams side by side and shows which one is worth optimising.',
      inputs: ['Each driven unit', 'Heater duty', 'Evaporation rate'],
      units: 'kW and kJ per kg water',
      interpretation: 'The fans and the drum together are typically a few per cent of the heater duty. Chasing motor efficiency on a dryer is chasing the wrong number.'
    }],
    practice: 'Variable speed drives on both fans and on the drum are now standard, because they turn what used to be fixed design decisions into things the operator can trade against each other in real time.',
    safety: ['Prove dead before touching any conductor', 'Arc flash risk: correct protective equipment for switching', 'Lock off and tag any circuit being worked on', 'Never defeat an interlock, especially the burner ones'],
    troubleshooting: [
      { symptom: 'Drum drive trips on overload', cause: 'Drum overloaded with material, or a bearing failing', action: 'Check the drum loading before resetting. A drum full of wet material is a very high starting torque.' },
      { symptom: 'Status shows running but the machine is stopped', cause: 'Failed auxiliary contact or a broken coupling', action: 'Confirm at the machine. A status signal is not proof of rotation.' },
      { symptom: 'Drive tripping on overvoltage during deceleration', cause: 'Regenerated energy with no braking provision', action: 'Lengthen the deceleration ramp or fit a braking resistor.' }
    ]
  }
};

export default EQUIPMENT;
