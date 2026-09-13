/**
 * 01 — WATER TREATMENT PLANT — equipment information.
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
  [TAGS.intakePump]: {
    tag: TAGS.intakePump, name: 'Raw water intake pumps', type: 'Centrifugal pump, duty and standby',
    purpose: 'Lifts raw water from the river intake into the head of the works and sets the flow every downstream unit is sized against.',
    howItWorks: 'Water passes a coarse screen into a wet well. An impeller adds velocity head to the water, and the volute converts that velocity into pressure, which carries the flow through the rapid mix and on down the train. The duty pump runs continuously; the standby starts on low discharge pressure or on duty failure.',
    whyUsed: 'The whole plant is a constant-flow process. Coagulant dose, detention time, overflow rate and filtration rate are all expressed per unit of flow, so a steady, measured intake flow is what makes every other setting mean anything.',
    inputs: ['Screened river water', 'Recovered washwater supernatant returned from WR-101', 'Electrical supply from MCC-101'],
    outputs: ['Raw water to the rapid mix basin at the set flow'],
    operatingVariables: ['Flow set point', 'Discharge pressure', 'Duty/standby selection', 'Motor current'],
    designVariables: ['Rated flow and head', 'Impeller diameter', 'Pump and motor efficiency', 'NPSH available at the wet well'],
    misoperation: [
      'Running above the rated flow pushes every unit past its design loading at once: overflow rate rises, detention time falls and filtration rate rises together.',
      'Running the wet well too low risks cavitation, which erodes the impeller and makes the delivered flow unsteady.',
      'Stopping the intake stops the works. Nothing downstream has a calculable state, so the model reports no process values rather than the last ones.'
    ],
    theory: 'Hydraulic power delivered to the water is the product of density, gravity, volumetric flow and head. Shaft power is that divided by the pump efficiency, which is why a pump run far from its best efficiency point costs more energy for the same water.',
    equations: [{
      what: 'Pump shaft power',
      equation: 'P = ρ · g · Q · H / η',
      why: 'Pumping is usually the largest single energy demand in a water treatment works, so the head chosen at design time is paid for every hour of operation.',
      inputs: ['Flow Q', 'Head H', 'Efficiency η'],
      units: 'P in W, Q in m³/s, H in m',
      interpretation: 'At the base case the intake accounts for roughly a fifth of the plant shaft power, and the high lift pumps most of the rest.'
    }],
    practice: 'Intake pumps are almost always installed with at least one standby, because a water treatment works that stops has no product and no storage to fall back on beyond the clearwell. Variable speed drives are common so the flow can follow demand without throttling.',
    safety: ['Isolate and lock off before opening any casing', 'Confined space procedures apply to the wet well', 'Guard rotating couplings', 'Screened intakes must be cleaned on a routine, not when the flow falls'],
    troubleshooting: [
      { symptom: 'Flow falls while the pump keeps running', cause: 'Blocked intake screen or a partly closed discharge valve', action: 'Check the screen differential and the valve position before assuming a pump fault.' },
      { symptom: 'Pump trips repeatedly', cause: 'Motor overload, blocked impeller or low wet well level', action: 'Read the trip code at the MCC, check the wet well level, then inspect the impeller.' },
      { symptom: 'Delivered flow is unsteady and the pump is noisy', cause: 'Cavitation from insufficient NPSH', action: 'Raise the wet well level or reduce the flow until the suction condition recovers.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.coagDosing]: {
    tag: TAGS.coagDosing, name: 'Coagulant dosing skid', type: 'Bulk storage, day tank and metering pumps',
    purpose: 'Delivers a measured, flow-paced dose of aluminium sulphate into the rapid mix so the colloids in the raw water can be destabilised.',
    howItWorks: 'Liquid alum is held in bulk and transferred to a day tank. A metering pump draws from the day tank and injects into the rapid mix at a rate paced to the raw water flow, so the dose in mg/L stays constant when the flow changes.',
    whyUsed: 'Clay and organic colloids carry a negative surface charge and repel each other, so they will never collide and grow on their own. Alum hydrolyses to positively charged species and to an aluminium hydroxide precipitate, which neutralises that charge and sweeps particles into a settleable floc.',
    inputs: ['Bulk liquid alum, 48 % w/w', 'Raw water flow signal for pacing'],
    outputs: ['Alum solution to the rapid mix basin', 'Consumption in kg/h reported to the operator'],
    operatingVariables: ['Dose in mg/L', 'Stroke and speed of the metering pump', 'Day tank level', 'Solution strength'],
    designVariables: ['Bulk storage days of stock', 'Metering pump turndown', 'Injection point and mixing energy at the point of injection', 'Materials of construction, as alum solution is corrosive'],
    misoperation: [
      'Underdosing leaves the colloids charged. The floc never grows, the clarifier passes carry-over and the filter is asked to do work it cannot do.',
      'Overdosing past about 1.4 times the optimum restabilises the particles with the opposite charge, so removal falls again while sludge production and acid load keep rising.',
      'Dosing without checking alkalinity can exhaust the carbonate buffer and collapse the pH out of the coagulation band.'
    ],
    theory: 'Alum is an acid salt. In water it hydrolyses, consuming alkalinity and releasing carbon dioxide, and precipitates aluminium hydroxide. Aluminium hydroxide has a solubility minimum between roughly pH 6.0 and 7.8, which is why the coagulation pH matters as much as the dose itself.',
    equations: [{
      what: 'Alum reaction with natural alkalinity',
      equation: 'Al₂(SO₄)₃·14H₂O + 3Ca(HCO₃)₂ → 2Al(OH)₃↓ + 3CaSO₄ + 6CO₂ + 14H₂O',
      why: 'It tells you three things at once: how much alkalinity a dose destroys, how much sludge it creates and how far the pH will move.',
      inputs: ['Alum dose', 'Raw alkalinity'],
      units: 'mg/L per mg/L of alum',
      interpretation: 'Each mg/L of alum consumes 0.505 mg/L of alkalinity as CaCO₃, forms 0.263 mg/L of aluminium hydroxide and releases 0.444 mg/L of CO₂.'
    }],
    practice: 'The dose is set by jar test, not by correlation. A plant runs jar tests whenever the raw water changes character, and the operator uses the settled turbidity from the jars rather than any formula. The correlation in this model stands in for that test.',
    safety: ['Alum solution is acidic and corrosive: eye protection and gloves for any sampling', 'Never mix alum with hypochlorite; the reaction releases chlorine gas', 'Bunded storage sized for the largest vessel', 'Emergency eyewash at the dosing point'],
    troubleshooting: [
      { symptom: 'Settled turbidity rises with no change in raw water', cause: 'Metering pump losing prime, an air-locked suction or a blocked injection quill', action: 'Check the day tank level and confirm the actual delivered volume against the pump setting.' },
      { symptom: 'Coagulation pH falls faster than expected', cause: 'Low raw alkalinity for the dose being applied', action: 'Check alkalinity; add lime or soda ash rather than cutting the dose if turbidity needs it.' },
      { symptom: 'Removal falls as the dose is increased', cause: 'Restabilisation from overdosing', action: 'Jar test around and below the current dose. The optimum is often lower than it looks.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.rapidMix]: {
    tag: TAGS.rapidMix, name: 'Rapid mix basin', type: 'Back-mixed basin with a high speed impeller',
    purpose: 'Disperses the coagulant through the whole flow within seconds, before the hydrolysis reactions have finished.',
    howItWorks: 'A high speed impeller drives an intense velocity gradient through a small basin. The coagulant is injected into that zone and is distributed across the flow almost immediately, so every parcel of water sees the same dose.',
    whyUsed: 'Alum hydrolysis is complete in well under a second. Coagulant that has not reached the colloids by then has already precipitated as bulk hydroxide and is wasted. Only violent, immediate mixing gets the chemical to the particles in time.',
    inputs: ['Raw water at the plant flow', 'Alum solution from CH-101'],
    outputs: ['Uniformly dosed water to the flocculation basin'],
    operatingVariables: ['Velocity gradient G', 'Detention time', 'Impeller speed and power draw'],
    designVariables: ['Basin volume, set by flow and detention time', 'Impeller type and diameter', 'Installed motor power', 'Injection point relative to the impeller'],
    misoperation: [
      'Too low a gradient leaves the dose unevenly distributed, so part of the flow is underdosed and part is overdosed at the same time.',
      'Excessive gradient or an over-long detention time simply burns energy: dispersion was complete long before.',
      'Injecting the coagulant away from the impeller wastes chemical no matter how much power is installed.'
    ],
    theory: 'Camp and Stein defined the root-mean-square velocity gradient of a stirred volume from the power dissipated in it. G quantifies how hard the fluid is being sheared, which sets how often suspended particles are brought into contact.',
    equations: [{
      what: 'Velocity gradient and the power to achieve it',
      equation: 'G = √( P / (µ · V) )        P = G² · µ · V',
      why: 'It converts a mixing intensity you can specify into a motor size you have to buy, and it makes the temperature dependence explicit.',
      inputs: ['Power P', 'Viscosity µ', 'Volume V'],
      units: 'G in 1/s, P in W, µ in Pa·s, V in m³',
      interpretation: 'Rapid mix runs at 600 to 1000 1/s for 10 to 60 s. Because P scales with G², doubling the gradient costs four times the power.'
    }],
    practice: 'Many modern plants have replaced the stirred basin with an in-line static mixer or a mechanical flash mixer in the pipe, which reaches a far higher gradient for a fraction of a second and uses less energy overall.',
    safety: ['Isolate the drive before entering the basin', 'Confined space entry procedures apply', 'Guard the shaft coupling', 'Do not run the impeller with the basin drained'],
    troubleshooting: [
      { symptom: 'Floc quality poor despite a correct dose', cause: 'Insufficient gradient or injection too far from the impeller', action: 'Confirm the impeller speed and power draw, then check where the coagulant actually enters.' },
      { symptom: 'High power draw with no quality benefit', cause: 'Gradient set well above what dispersion needs', action: 'Reduce speed towards the design gradient and watch settled turbidity for any change.' },
      { symptom: 'Vibration at the drive', cause: 'Damaged impeller or shaft misalignment', action: 'Stop, isolate and inspect. A shed blade will also change the effective gradient.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.floc]: {
    tag: TAGS.floc, name: 'Flocculation basin', type: 'Three-stage tapered paddle flocculator',
    purpose: 'Grows the destabilised particles into floc large and dense enough to settle out in the clarifier.',
    howItWorks: 'Water passes slowly through three cells in series. Paddles turn gently, bringing particles into repeated contact so they collide and stick. The paddles get smaller from cell to cell, so the gradient tapers: energetic early on when the particles are tiny, gentle later when the floc is large and fragile.',
    whyUsed: 'Charge neutralisation only makes collisions productive; it does not make them happen. Flocculation supplies the time and the gentle shear that turns destabilised colloids into a settleable solid. Without it the clarifier receives particles that will never settle.',
    inputs: ['Dosed water from the rapid mix'],
    outputs: ['Flocculated water to the sedimentation basin'],
    operatingVariables: ['Velocity gradient in each stage', 'Total flocculation time', 'Camp number Gt', 'Visual floc appearance at the outlet'],
    designVariables: ['Basin volume and number of stages', 'Paddle area and tip speed', 'Taper ratio between first and last stage', 'Transfer port design between cells'],
    misoperation: [
      'Too little Gt gives too few collisions and the floc stays small, so the clarifier cannot capture it.',
      'Too much gradient shears floc that has already formed, and past about 70 1/s alum floc breaks faster than it grows.',
      'Running the cells at one uniform high gradient destroys in the last cell what the first cell built.'
    ],
    theory: 'Flocculation is a rate process. The collision frequency between particles rises with the velocity gradient and with the volume fraction of solids, while floc breakage rises more steeply with gradient still. The product Gt captures the total collision opportunity offered, which is why two basins with the same Gt behave similarly and why the tapered arrangement outperforms a single stage at the same average.',
    equations: [{
      what: 'Camp number',
      equation: 'Gt = G · t',
      why: 'It is the single dimensionless group that tells you whether a flocculation basin offers enough contact opportunity.',
      inputs: ['Gradient G', 'Detention time t'],
      units: 'dimensionless',
      interpretation: 'Design range is 2×10⁴ to 1.2×10⁵. The same Gt reached by gentle mixing for longer produces a stronger floc than hard mixing briefly.'
    }],
    practice: 'Operators judge flocculation by eye as much as by instrument: a good floc at the outlet of the last cell looks like visible, discrete pin-head particles that settle quickly in a sample jar. Hydraulic flocculators with baffled channels and no moving parts are common on smaller works.',
    safety: ['Isolate each drive before entering a cell', 'Walkway handrails must be in place before working over an open basin', 'Confined space entry for cell inspection', 'Beware slippery surfaces around open basins'],
    troubleshooting: [
      { symptom: 'Floc is small and will not settle in a jar', cause: 'Insufficient Gt, or coagulation upstream has failed', action: 'Check the dose and coagulation pH first, then the flocculator gradient and detention time.' },
      { symptom: 'Floc looks good in the first cell and poor at the outlet', cause: 'Gradient in the later stages too high, shearing the floc apart', action: 'Reduce the speed of the last stage and re-establish the taper.' },
      { symptom: 'Short-circuiting visible as flow streaming along one wall', cause: 'Damaged baffle or transfer port', action: 'Inspect the cell walls and transfer openings; hydraulic short-circuiting costs far more than it looks.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.clarifier]: {
    tag: TAGS.clarifier, name: 'Sedimentation basin', type: 'Rectangular horizontal flow clarifier with launders',
    purpose: 'Removes the bulk of the floc by gravity so the filters receive a load they can handle.',
    howItWorks: 'Flocculated water enters through a diffuser wall that spreads it across the full cross-section. It then travels slowly along the basin while floc settles to the floor and is scraped into a hopper for withdrawal. Clarified water leaves over saw-tooth weirs into launders at the outlet end.',
    whyUsed: 'Filters are expensive and have a finite capacity for solids. Taking 80 to 95 per cent of the load out by gravity first is what makes the filter run long enough to be practical, and it costs almost nothing to run.',
    inputs: ['Flocculated water from FL-101'],
    outputs: ['Settled water to the filter gallery', 'Thickened sludge to SL-101'],
    operatingVariables: ['Surface overflow rate', 'Detention time', 'Sludge withdrawal rate', 'Settled water turbidity'],
    designVariables: ['Surface area, which sets the overflow rate', 'Side water depth', 'Length to width ratio and baffling', 'Weir loading rate', 'Sludge hopper and scraper design'],
    misoperation: [
      'Raising the overflow rate above the floc settling velocity lets floc leave with the clarified water no matter how deep the basin is.',
      'Withdrawing too little sludge lets the blanket build until it is swept over the weirs.',
      'Short-circuiting, from wind, density currents or a damaged baffle, wastes most of the basin volume and shows up as high settled turbidity at an unchanged overflow rate.'
    ],
    theory: 'In the ideal basin of Hazen and Camp, a particle is captured if its settling velocity exceeds the overflow rate, and depth is irrelevant. Real basins are not plug flow, so removal is modelled here with a tanks-in-series form that never reaches 100 per cent and that degrades as the hydraulic performance degrades.',
    equations: [
      {
        what: 'Surface overflow rate',
        equation: 'vo = Q / A',
        why: 'It is the critical settling velocity of the basin: the slowest particle that can still be captured.',
        inputs: ['Flow Q', 'Surface area A'],
        units: 'm/h',
        interpretation: 'Conventional design sits between 1 and 2.5 m/h. Note that it depends on area, not on volume.'
      },
      {
        what: 'Removal in a non-ideal basin',
        equation: 'R = 1 − ( 1 + vs / (n · vo) )^(−n)',
        why: 'It separates two different failures: floc that settles too slowly, and a basin that is hydraulically poor.',
        inputs: ['Settling velocity vs', 'Overflow rate vo', 'Equivalent cells n'],
        units: 'dimensionless',
        interpretation: 'Falling n at an unchanged overflow rate is the signature of short-circuiting.'
      }
    ],
    practice: 'Many plants have replaced or upgraded rectangular basins with plate or tube settlers, which multiply the effective settling area within the same footprint and allow much higher nominal overflow rates.',
    safety: ['Handrails and edge protection around all open water', 'Life rings at accessible points', 'Lock off the scraper drive before entry', 'Confined space procedures for hopper inspection'],
    troubleshooting: [
      { symptom: 'Settled turbidity high, floc looks good upstream', cause: 'Overflow rate too high, or short-circuiting in the basin', action: 'Compare against the design overflow rate; if it is within range, look for a hydraulic fault.' },
      { symptom: 'Floc visible rising and leaving over the weirs', cause: 'Sludge blanket too deep or gas from a septic blanket', action: 'Increase the sludge withdrawal rate and check when the hopper was last drawn down.' },
      { symptom: 'Uneven flow across the weirs', cause: 'Basin out of level, or a blocked launder', action: 'Check weir levels; uneven weir loading is a common and easily corrected cause of poor performance.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.sludge]: {
    tag: TAGS.sludge, name: 'Sludge sump', type: 'Collection sump with transfer pump',
    purpose: 'Receives clarifier underflow and washwater sludge and transfers it off site for thickening and disposal.',
    howItWorks: 'Sludge scraped into the clarifier hopper is drawn down to the sump on a timed or level-controlled cycle, joined by the solids settled out in the washwater recovery basin. A transfer pump moves the combined stream to thickening.',
    whyUsed: 'Everything the plant removes from the water has to leave as a solid stream. Sludge handling is the part of the works that closes the solids balance, and it is a real operating cost rather than an afterthought.',
    inputs: ['Clarifier underflow', 'Settled solids from the washwater recovery basin'],
    outputs: ['Combined sludge to thickening and dewatering'],
    operatingVariables: ['Withdrawal frequency and duration', 'Sump level', 'Sludge solids concentration'],
    designVariables: ['Sump volume', 'Pump type suitable for solids', 'Pipework sized to avoid settling in the line'],
    misoperation: [
      'Withdrawing too often dilutes the sludge and sends water to thickening instead of solids, which costs recovery.',
      'Withdrawing too rarely lets the blanket rise in the clarifier until floc carries over.',
      'Letting sludge stand in the sump turns it septic, which releases gas and can float solids back.'
    ],
    theory: 'Sludge volume follows directly from the mass of solids removed and the concentration it is withdrawn at. Alum sludge is gelatinous and thickens poorly, so the withdrawn concentration is usually around 1 per cent by weight.',
    equations: [{
      what: 'Sludge volume from the solids removed',
      equation: 'Q_sludge = mass of solids captured / sludge solids concentration',
      why: 'It converts the removal efficiency into a real volume the site has to handle and dispose of.',
      inputs: ['Solids captured in kg/h', 'Sludge concentration in kg/m³'],
      units: 'm³/h',
      interpretation: 'At 1 per cent solids the underflow is typically a few tenths of a per cent of plant flow, and it is one of the two losses in the water recovery.'
    }],
    practice: 'Alum sludge is usually thickened then dewatered on plate presses or drying beds. Disposal cost is why the coagulant dose is an economic decision and not only a quality one.',
    safety: ['Confined space entry for sump cleaning', 'Sludge can be septic: test the atmosphere before entry', 'Wash-down facilities at the sump', 'Slip hazard around sludge spillage'],
    troubleshooting: [
      { symptom: 'Sludge line blocks repeatedly', cause: 'Velocity too low in the line, letting solids settle out', action: 'Increase the withdrawal rate rather than the duration, and check for a partly closed valve.' },
      { symptom: 'Sludge is much thinner than expected', cause: 'Drawing down for too long, so water follows the solids', action: 'Shorten the withdrawal and monitor the clarifier blanket depth instead of the clock.' },
      { symptom: 'Gassing and floating solids in the clarifier', cause: 'Sludge held too long and turning septic', action: 'Increase withdrawal frequency to shorten the residence time of the blanket.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.filters]: {
    tag: TAGS.filters, name: 'Rapid gravity filter gallery', type: 'Four-cell single medium sand filters',
    purpose: 'Removes the floc the clarifier could not settle, and delivers the finished water turbidity the whole disinfection credit depends on.',
    howItWorks: 'Settled water flows down through a bed of graded sand under gravity. Particles are captured on the grains throughout the depth of the bed, not just on the surface. As solids accumulate the headloss rises; when it reaches the terminal value the cell is taken off line and backwashed with air scour followed by clean water.',
    whyUsed: 'It is the final particulate barrier and the last chance to remove the protozoan cysts that chlorine cannot reliably inactivate. Regulatory removal credit for conventional treatment depends on the filtered turbidity actually achieved, which makes this unit the pivot of the whole plant.',
    inputs: ['Settled water from CL-101', 'Backwash water from BW-101', 'Scour air from B-101'],
    outputs: ['Filtered water to the chlorine contact tank', 'Spent backwash water to WR-101'],
    operatingVariables: ['Filtration rate', 'Headloss across the bed', 'Run length', 'Filtrate turbidity, continuously monitored'],
    designVariables: ['Media effective size, uniformity and depth', 'Number of cells, so one can wash while the others run', 'Terminal headloss available', 'Underdrain and wash trough design'],
    misoperation: [
      'Raising the filtration rate reduces capture and raises headloss at the same time, shortening the run and worsening the filtrate together.',
      'Running past breakthrough pushes solids into the clearwell, and the turbidity credit is lost at the moment it is most needed.',
      'Washing too gently leaves solids behind and forms mudballs, which raise clean-bed headloss permanently.',
      'Returning a filter to service at full rate immediately after a wash releases a turbidity spike; a slow-start ramp avoids it.'
    ],
    theory: 'Depth filtration is a first-order capture process, not a sieve: the concentration falls exponentially with depth at a rate set by the filter coefficient. The coefficient itself depends on how well the particles were conditioned upstream, which is why a filter cannot repair failed coagulation.',
    equations: [
      {
        what: 'Iwasaki depth filtration',
        equation: 'C / C₀ = exp( −λ · L )',
        why: 'It shows that filtrate quality is exponential in bed depth and in the filter coefficient, so small changes in conditioning have large effects.',
        inputs: ['Filter coefficient λ', 'Bed depth L'],
        units: 'λ in 1/m, L in m',
        interpretation: 'If the floc index falls, λ falls with it and the turbidity goes straight through the bed.'
      },
      {
        what: 'Clean-bed headloss',
        equation: 'h/L = 150 · µ · (1−ε)² · v / ( ρ · g · ε³ · (φ·d)² )',
        why: 'It sets how much of the available head the filter starts with, and it is proportional to viscosity.',
        inputs: ['Viscosity µ', 'Porosity ε', 'Rate v', 'Grain size d'],
        units: 'm per m of bed',
        interpretation: 'The same filter starts dirtier in winter than in summer, purely because cold water is more viscous.'
      }
    ],
    practice: 'Dual media beds of anthracite over sand are now more common than single medium sand: the coarse top layer stores solids in depth and gives much longer runs at the same filtrate quality. Continuous filtrate turbidity monitoring on each individual cell is standard, because an average across a gallery hides a single failing filter.',
    safety: ['Handrails around open filter boxes', 'Never enter a filter box without isolating the wash valves', 'Backwash at full rate can overflow the troughs if the sequence is interrupted', 'Slip hazard on wet gallery floors'],
    troubleshooting: [
      { symptom: 'Filtrate turbidity high from the start of the run', cause: 'Poor coagulation upstream, so the floc is not filterable', action: 'Check the dose and coagulation pH. Nothing done at the filter will fix this.' },
      { symptom: 'Headloss rises much faster than usual', cause: 'Higher solids load from the clarifier, or a partly blinded bed', action: 'Check the settled turbidity first; if it is normal, suspect mudballs and inspect the media.' },
      { symptom: 'Turbidity spike shortly after return to service', cause: 'Ripening after backwash', action: 'Use a slow-start ramp and filter to waste until the filtrate settles.' },
      { symptom: 'Media visible in the wash troughs', cause: 'Backwash rate too high for the water temperature', action: 'Reduce the wash rate; media expansion rises as the water gets colder.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.washRecovery]: {
    tag: TAGS.washRecovery, name: 'Washwater recovery basin', type: 'Settling basin with supernatant return',
    purpose: 'Recovers the water used to backwash the filters instead of discharging it, and keeps the solids it carries out of the plant.',
    howItWorks: 'Spent backwash water is held long enough for the solids to settle. The clear supernatant is returned at a controlled rate to the plant inlet, and the settled solids are drawn to the sludge sump.',
    whyUsed: 'Backwashing consumes two to three per cent of production. Returning it lifts recovery to near 99 per cent and removes a discharge that would otherwise need a consent. The catch is that it is a recycle, so it feeds back into the load the plant has to treat.',
    inputs: ['Spent backwash water from F-101'],
    outputs: ['Supernatant returned to the plant inlet', 'Settled solids to the sludge sump'],
    operatingVariables: ['Return flow rate', 'Settling time before return', 'Supernatant quality'],
    designVariables: ['Basin volume relative to one filter wash', 'Return rate as a fraction of plant flow', 'Solids capture efficiency'],
    misoperation: [
      'Returning the washwater too quickly sends the solids straight back to the head of the works, where they simply arrive again at the clarifier.',
      'Returning at too high a rate slugs the plant: a sudden return spike changes the inlet turbidity and the effective dose at the same time.',
      'Some pathogens concentrate in backwash water, which is why the recycle is regulated and why the return is deliberately slow and steady.'
    ],
    theory: 'The recycle makes the plant a closed loop. Plant flow, inlet solids and backwash production each depend on one another, so the balance has to be solved iteratively rather than in a single pass. This is what the fixed-point solver in the model is doing.',
    equations: [{
      what: 'Recycle balance at the plant inlet',
      equation: 'Q_in = Q_raw + Q_return        TSS_in = (Q_raw·TSS_raw + Q_return·TSS_return) / Q_in',
      why: 'It is the reason a change at the filters eventually changes the load on the clarifier, and why the balance needs iteration to close.',
      inputs: ['Raw flow and solids', 'Return flow and solids'],
      units: 'm³/h and mg/L',
      interpretation: 'At the base case the return is under two per cent of the plant flow, so the loop converges quickly, but it is a real loop.'
    }],
    practice: 'Regulators generally require the return to be spread evenly across the day and limited to a small fraction of plant flow, and many plants monitor the return for pathogen indicators before it re-enters the works.',
    safety: ['Edge protection around the open basin', 'Treat spent backwash as potentially pathogen bearing', 'Confined space procedures for cleaning'],
    troubleshooting: [
      { symptom: 'Inlet turbidity rises in steps through the day', cause: 'Washwater returned in slugs rather than continuously', action: 'Spread the return evenly; a steady small return is far easier for the plant to absorb.' },
      { symptom: 'Supernatant is visibly turbid', cause: 'Insufficient settling time before return', action: 'Lengthen the hold time or reduce the return rate.' },
      { symptom: 'Clarifier load rising with no change in raw water', cause: 'Solids recirculating on the recycle rather than leaving as sludge', action: 'Check that the recovery basin is actually drawing solids down to the sludge sump.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.backwashTank]: {
    tag: TAGS.backwashTank, name: 'Backwash water tank', type: 'Elevated storage tank',
    purpose: 'Holds enough filtered water at sufficient head to wash one filter cell at full rate without disturbing the rest of the plant.',
    howItWorks: 'Filtered water is stored in an elevated tank. When a wash is called, the stored volume is released at a high rate through the filter underdrain for a few minutes, fluidising and cleaning the bed.',
    whyUsed: 'A wash needs a very high instantaneous flow, several times the plant flow, for a short time. Taking that straight from the plant would upset every other unit, so it is stored beforehand and released in one burst.',
    inputs: ['Filtered water from the clearwell'],
    outputs: ['Backwash water to the filter being washed'],
    operatingVariables: ['Tank level', 'Wash rate and duration', 'Available head at the filter'],
    designVariables: ['Stored volume, usually enough for at least one full wash with margin', 'Elevation, which sets the available head', 'Refill rate between washes'],
    misoperation: [
      'Starting a wash with the tank low gives a wash that begins at full rate and fades, leaving the bed only partly cleaned.',
      'Washing at too high a rate for cold water over-expands the bed and carries media into the troughs.',
      'Refilling too aggressively between washes takes production away from the product stream in a lump.'
    ],
    theory: 'Backwash fluidises the bed. The upward velocity must exceed the settling velocity of the grains enough to expand the bed by 20 to 30 per cent, but not so much that the grains are carried out. Since water viscosity rises as it cools, the same volumetric rate expands the bed more in winter.',
    equations: [{
      what: 'Backwash water used per run',
      equation: 'V_wash = v_bw · t_bw · A_filter',
      why: 'It is what turns a wash frequency into a recovery figure, and it is one of the two water losses in the plant.',
      inputs: ['Wash rate', 'Wash duration', 'Filter area'],
      units: 'm³ per wash',
      interpretation: 'At 37 m/h for 10 minutes each square metre of filter uses about 6 m³ of water per wash.'
    }],
    practice: 'Some plants use dedicated backwash pumps drawing directly from the clearwell rather than an elevated tank. The tank is simpler and fails safe, but takes the head room and the structure.',
    safety: ['Fall protection for tank access and roof work', 'Confined space entry for internal inspection', 'Elevated structure: check for corrosion at supports', 'Do not isolate the tank while a wash is in progress'],
    troubleshooting: [
      { symptom: 'Wash starts strongly and fades', cause: 'Tank level too low at the start of the wash', action: 'Confirm the refill completed before the wash was called.' },
      { symptom: 'Media appearing in the wash troughs', cause: 'Wash rate too high for the water temperature', action: 'Reduce the rate; check the expansion achieved rather than the nominal setting.' },
      { symptom: 'Bed still dirty after a full wash', cause: 'Insufficient rate, short duration or air scour not working', action: 'Check the air scour first; air does most of the work of breaking the deposits loose.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.backwashPump]: {
    tag: TAGS.backwashPump, name: 'Backwash pump', type: 'Centrifugal pump, intermittent duty',
    purpose: 'Delivers the high instantaneous flow needed to fluidise a filter bed, and refills the backwash tank between washes.',
    howItWorks: 'The pump runs only during a wash sequence, drawing filtered water and delivering it at several times the plant flow for a few minutes through the filter underdrain.',
    whyUsed: 'The wash rate is far above anything the plant produces continuously. Its energy shows as a small time-averaged figure only because it runs for minutes out of every day-long filter run.',
    inputs: ['Filtered water', 'Electrical supply from MCC-101'],
    outputs: ['Backwash flow to the filter under wash'],
    operatingVariables: ['Wash rate', 'Run duration', 'Discharge pressure'],
    designVariables: ['Rated flow at the required wash rate', 'Head to overcome the underdrain and the expanded bed', 'Soft start, to avoid a hydraulic shock on the media'],
    misoperation: [
      'Starting at full flow shocks the bed and can disturb the gravel support layers under the media.',
      'Running the pump with a filter valve part closed raises the pressure without raising the wash rate.',
      'Frequent starts from short runs cause motor heating; the wash sequence should complete once started.'
    ],
    theory: 'The same shaft power relationship applies as for any pump. The distinction is duty cycle: the average power consumed is the instantaneous power scaled by the fraction of time the pump actually runs, which is why it barely registers in the plant energy balance.',
    equations: [{
      what: 'Time-averaged power of an intermittent machine',
      equation: 'P_avg = P_instantaneous · (t_run / t_cycle)',
      why: 'It explains why a pump rated far above the plant flow contributes so little to the energy total.',
      inputs: ['Instantaneous power', 'Wash duration', 'Filter run length'],
      units: 'kW',
      interpretation: 'Ten minutes of washing in a 37-hour run is under half a per cent of the time.'
    }],
    practice: 'A soft start or a ramped valve opening is normal practice, both to protect the media support and to avoid a pressure surge in the wash main.',
    safety: ['Isolate and lock off before any work', 'The wash main sees surge pressure: check restraints', 'Guard rotating parts', 'Confirm the filter is off line before starting a wash'],
    troubleshooting: [
      { symptom: 'Wash rate below set point at full pump speed', cause: 'Valve not fully open or underdrain partly blocked', action: 'Check valve position and the differential across the underdrain.' },
      { symptom: 'Gravel displacement found during inspection', cause: 'Wash started too abruptly', action: 'Fit or repair the soft start and re-level the support gravel.' },
      { symptom: 'Pump trips on start', cause: 'Motor overload from starting against a closed valve', action: 'Confirm the valve sequence opens before the pump starts.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.blower]: {
    tag: TAGS.blower, name: 'Air scour blower', type: 'Positive displacement blower, intermittent duty',
    purpose: 'Supplies low pressure air to agitate the filter bed at the start of a wash, breaking deposits off the grains.',
    howItWorks: 'Air is delivered through the underdrain and rises through the bed, scrubbing grain against grain. This mechanical action dislodges the attached solids so that the water wash that follows can carry them away.',
    whyUsed: 'Water alone fluidises the bed but does not scrub it. Without air scour, deposits stay bound to the grains and gradually form mudballs that permanently raise the clean-bed headloss and shorten every future run.',
    inputs: ['Ambient air', 'Electrical supply from MCC-101'],
    outputs: ['Scour air to the filter under wash'],
    operatingVariables: ['Air rate per unit of filter area', 'Scour duration', 'Discharge pressure'],
    designVariables: ['Air rate, typically 50 to 60 m³ per m² per hour', 'Discharge pressure to overcome the water depth plus losses', 'Silencing and pulsation damping'],
    misoperation: [
      'Air and full water wash together can float media out of the bed; the usual sequence is air first, then water.',
      'Too short a scour leaves deposits bound to the grains and lets mudballs form over successive runs.',
      'Running the blower against a closed valve overheats it quickly.'
    ],
    theory: 'Blower power follows from the volumetric flow and the pressure rise, divided by efficiency. The required pressure is set mainly by the depth of water above the diffusers, since the air has to displace that head to enter the bed.',
    equations: [{
      what: 'Blower shaft power',
      equation: 'P = Q_air · Δp / η',
      why: 'It shows that scour air is cheap: the pressure needed is only a metre or two of water, so the power is small.',
      inputs: ['Air flow', 'Pressure rise', 'Efficiency'],
      units: 'P in W, Q in m³/s, Δp in Pa',
      interpretation: 'The time-averaged blower power is a fraction of a kilowatt, yet skipping the scour costs run length on every filter.'
    }],
    practice: 'Combined air and water wash at a reduced water rate is used on dual media beds, but the sequence and rates have to be set carefully to avoid media loss.',
    safety: ['Hot surfaces on the blower casing and discharge', 'Hearing protection: positive displacement blowers are loud', 'Pressure relief must be proved before starting', 'Never start against a closed discharge'],
    troubleshooting: [
      { symptom: 'Bed poorly cleaned despite a full water wash', cause: 'Air scour not operating or air rate too low', action: 'Check the blower runs in the sequence and confirm the discharge pressure.' },
      { symptom: 'Uneven bubbling across the filter surface', cause: 'Partly blocked air distribution laterals', action: 'Inspect and clear the underdrain air laterals.' },
      { symptom: 'Blower overheating', cause: 'Running against a restriction or a failed relief valve', action: 'Stop, check the discharge path and prove the relief before restarting.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.chlorineDosing]: {
    tag: TAGS.chlorineDosing, name: 'Chlorine dosing skid', type: 'Sodium hypochlorite storage and metering pumps',
    purpose: 'Applies free chlorine to the filtered water at the head of the contact tank to inactivate pathogens and to leave a residual for the distribution system.',
    howItWorks: 'Sodium hypochlorite solution is metered into the filtered water in proportion to flow. Part of the dose is consumed immediately by the chlorine demand of the water; what remains is the free residual that does the disinfection work.',
    whyUsed: 'Filtration removes particles but does not sterilise. Chlorine inactivates bacteria and viruses efficiently, and a residual carried into the network protects against recontamination all the way to the customer.',
    inputs: ['Sodium hypochlorite, 12 per cent available chlorine', 'Filtered water flow signal for pacing'],
    outputs: ['Dosed water to the chlorine contact tank'],
    operatingVariables: ['Applied dose', 'Measured free residual', 'Chlorine demand of the water', 'Solution strength, which decays in storage'],
    designVariables: ['Storage volume and turnover, since hypochlorite degrades', 'Metering pump turndown', 'Injection and mixing arrangement', 'Residual analyser location'],
    misoperation: [
      'Dosing below the demand leaves no free residual at all, so CT is zero and no inactivation credit can be claimed however long the contact tank is.',
      'Overdosing raises taste and odour complaints and increases disinfection by-product formation.',
      'Trusting a nameplate strength on old stock overstates the dose actually applied; hypochlorite loses strength with time and temperature.'
    ],
    theory: 'Chlorine demand is the part of the dose consumed by organics, ammonia and reduced species. Only the free residual left afterwards contributes to disinfection, and inactivation depends on the product of that residual and the contact time achieved.',
    equations: [{
      what: 'Chlorine residual',
      equation: 'C = applied dose − chlorine demand',
      why: 'Disinfection is driven by what is left, not by what was added, which is why the dose alone tells you nothing.',
      inputs: ['Applied dose', 'Demand'],
      units: 'mg/L',
      interpretation: 'Better coagulation removes organic matter and lowers the demand, so good treatment upstream reduces the chlorine needed downstream.'
    }],
    practice: 'Gas chlorine is still used on large works but hypochlorite has displaced it on most sites for safety reasons. On-site electrochlorination avoids bulk delivery of either.',
    safety: ['Never mix hypochlorite with acid or with alum: chlorine gas is released', 'Strong oxidiser: full face protection when handling', 'Store away from heat and sunlight to limit decay', 'Bunded storage and emergency shower at the skid'],
    troubleshooting: [
      { symptom: 'Residual falls with no change in dose', cause: 'Hypochlorite has lost strength in storage, or the demand has risen', action: 'Check the stock age and test the solution strength before increasing the dose.' },
      { symptom: 'No residual at all despite dosing', cause: 'Demand exceeds the dose, or the metering pump has lost prime', action: 'Confirm actual delivery, then compare the dose against the measured demand.' },
      { symptom: 'Taste and odour complaints', cause: 'Dose higher than needed, or chloramine formation with ammonia present', action: 'Review the residual target and test for ammonia in the filtered water.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.contactTank]: {
    tag: TAGS.contactTank, name: 'Chlorine contact tank', type: 'Baffled serpentine contact basin',
    purpose: 'Provides the contact time over which the free chlorine residual acts, so that a defined CT and therefore a defined log inactivation is achieved.',
    howItWorks: 'Dosed water follows a long serpentine path between baffles. The baffles force the flow to travel the full length of the tank rather than cutting across it, so the time the earliest arriving water spends in contact is close to the nominal detention time.',
    whyUsed: 'Inactivation depends on how long the chlorine is actually in contact with the organisms. An unbaffled tank of the same volume can deliver less than a third of its nominal time to the fastest flow path, and it is the fastest path that determines safety.',
    inputs: ['Filtered water dosed with chlorine'],
    outputs: ['Disinfected water to the clearwell'],
    operatingVariables: ['Nominal detention time', 'Free chlorine residual', 'Water temperature and pH', 'Achieved CT against the required CT'],
    designVariables: ['Tank volume at the design flow', 'Number and arrangement of baffles', 'Baffling factor t₁₀/T achieved', 'Inlet and outlet arrangement'],
    misoperation: [
      'A damaged or missing baffle drops the baffling factor and silently removes most of the effective contact time.',
      'Raising plant flow shortens the detention time proportionally, and the CT falls with it.',
      'Assuming the nominal detention time is the contact time overstates the disinfection actually achieved.'
    ],
    theory: 'The regulatory convention uses t₁₀, the time by which the first 10 per cent of the water has passed, not the mean residence time. The ratio t₁₀/T is the baffling factor, from about 0.1 for an unbaffled tank to 0.7 for a well baffled serpentine and near 1.0 for pipeline contact.',
    equations: [
      {
        what: 'Achieved CT',
        equation: 'CT = C · t₁₀        t₁₀ = τ · (t₁₀/T)',
        why: 'It is the quantity regulators and designers work in, and it makes the hydraulic quality of the tank part of the safety calculation.',
        inputs: ['Residual C', 'Detention time τ', 'Baffling factor'],
        units: 'mg·min/L',
        interpretation: 'Doubling the residual and halving the time gives the same CT, but the residual also has to survive to the customer.'
      },
      {
        what: 'Required CT',
        equation: 'CT_req = 112 · (pH/7)^2.7 · 2^(−(T−10)/10) · C^0.15',
        why: 'It shows that cold water and high pH both make disinfection markedly harder.',
        inputs: ['pH', 'Temperature', 'Residual'],
        units: 'mg·min/L for 3-log Giardia',
        interpretation: 'The required CT roughly doubles for every 10 °C the water cools, which is why winter is the design case.'
      }
    ],
    practice: 'Tracer testing is the accepted way to establish the real baffling factor of an existing tank, and it frequently shows the assumed design value to be optimistic.',
    safety: ['Edge protection and life rings around open water', 'Confined space entry for baffle inspection', 'Chlorinated water: ventilation at covered tanks', 'Never assume contact time without a tracer test'],
    troubleshooting: [
      { symptom: 'Log inactivation below target despite a good residual', cause: 'Short-circuiting, so the effective contact time is far below nominal', action: 'Check the baffles and consider a tracer test; the volume is not the problem.' },
      { symptom: 'CT falls in winter at unchanged settings', cause: 'Required CT rises as the water cools', action: 'Raise the residual or the contact time seasonally; this is expected, not a fault.' },
      { symptom: 'Residual lower at the outlet than expected', cause: 'Continuing demand within the tank', action: 'Measure residual at inlet and outlet and allow for the decay when setting the dose.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.clearwell]: {
    tag: TAGS.clearwell, name: 'Clearwell', type: 'Covered treated water storage',
    purpose: 'Stores finished water, balances the difference between production and demand, and supplies the backwash system.',
    howItWorks: 'Disinfected water collects in a covered reinforced concrete basin. The high lift pumps draw from it to supply the distribution network, and filtered water is also drawn from here to refill the backwash tank.',
    whyUsed: 'Production is steady while demand is not. The clearwell absorbs that mismatch, lets the treatment train run at a constant rate, and provides the contact volume and the wash water the plant needs for itself.',
    inputs: ['Disinfected water from CT-101'],
    outputs: ['Finished water to the high lift pumps', 'Filtered water to the backwash tank'],
    operatingVariables: ['Level', 'Free chlorine residual leaving the works', 'Turnover time'],
    designVariables: ['Storage volume against demand variation', 'Covered construction to prevent contamination and light entry', 'Inlet and outlet arrangement to avoid a stagnant zone'],
    misoperation: [
      'Allowing the level to sit high for long periods lets the residual decay before the water reaches the customer.',
      'A poorly arranged inlet and outlet leaves a dead zone that never turns over, whatever the nominal retention.',
      'Taking backwash water without allowing for it in the balance overstates the water available for supply.'
    ],
    theory: 'The clearwell contributes to the contact volume, but only the fraction of it that genuinely turns over counts. Chlorine decays with time, so long storage trades disinfection contact against residual delivered.',
    equations: [{
      what: 'Net production after the plant supplies itself',
      equation: 'Q_product = Q_in − Q_sludge − Q_backwash',
      why: 'It makes explicit that a treatment works consumes part of its own output.',
      inputs: ['Plant flow', 'Sludge withdrawal', 'Backwash usage'],
      units: 'm³/h',
      interpretation: 'Recovery in a conventional works is usually 95 to 99 per cent, and the losses are the clarifier underflow and the unrecovered washwater.'
    }],
    practice: 'Clearwells are always covered and vented through screened, filtered vents. An uncovered treated water reservoir reintroduces exactly the contamination the plant has just removed.',
    safety: ['Confined space entry, with atmosphere testing', 'Covered structure: check vent screens for integrity', 'Never enter without full isolation and a permit', 'Hatch security to prevent deliberate contamination'],
    troubleshooting: [
      { symptom: 'Residual leaving the works is below target', cause: 'Long storage time allowing decay, or a dead zone', action: 'Check the turnover and the inlet arrangement before raising the chlorine dose.' },
      { symptom: 'Level falling despite normal production', cause: 'Demand above production, or backwash drawing more than allowed', action: 'Check the wash frequency; short filter runs consume disproportionate storage.' },
      { symptom: 'Turbidity detected in the clearwell', cause: 'Filter breakthrough upstream', action: 'Treat as a serious event: isolate, identify the filter and check the turbidity trend on each cell.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.highLiftPump]: {
    tag: TAGS.highLiftPump, name: 'High lift pumps', type: 'Centrifugal pumps, multiple duty with standby',
    purpose: 'Delivers finished water from the clearwell into the distribution network at the pressure the network requires.',
    howItWorks: 'Several pumps draw from the clearwell in parallel. The number running, or their speed, follows network demand and pressure. This is the largest single energy consumer on the works.',
    whyUsed: 'Treatment produces water at atmospheric pressure; the network needs it at tens of metres of head. All of that head, and the energy behind it, is added here.',
    inputs: ['Finished water from the clearwell', 'Electrical supply from MCC-101'],
    outputs: ['Finished water to distribution at network pressure'],
    operatingVariables: ['Number of pumps running or speed', 'Discharge pressure', 'Flow to network', 'Specific energy per cubic metre delivered'],
    designVariables: ['Rated head, set by the network and the highest point served', 'Number of duty units for turndown', 'Variable speed drives', 'Surge protection on the rising main'],
    misoperation: [
      'Throttling to control flow wastes the head across a valve; on a variable speed set the speed should be reduced instead.',
      'Stopping a pump abruptly on a long rising main can cause surge severe enough to burst pipework.',
      'Running a single pump far from its best efficiency point raises the specific energy for no benefit.'
    ],
    theory: 'The same shaft power relationship applies, but at a head several times that of the intake, so this unit dominates the plant energy balance. Specific energy per cubic metre is the figure by which the whole works is judged.',
    equations: [{
      what: 'Specific energy of the works',
      equation: 'e = total shaft power / product flow',
      why: 'It is the standard benchmark for a treatment works and is dominated by pumping rather than by treatment.',
      inputs: ['Total power', 'Product flow'],
      units: 'kWh/m³',
      interpretation: 'A conventional works sits around 0.15 to 0.4 kWh/m³, and the high lift pumps are usually three quarters of it.'
    }],
    practice: 'Variable speed drives and pressure-managed distribution are the standard route to reducing pumping energy, and pump scheduling against a tariff is common on large works.',
    safety: ['Surge protection must be proved before commissioning', 'Isolate and lock off for any work', 'High pressure discharge pipework: check restraints and supports', 'Guard rotating couplings'],
    troubleshooting: [
      { symptom: 'Specific energy rising over time', cause: 'Impeller wear or a pump running off its best efficiency point', action: 'Compare the duty point against the pump curve before assuming a network problem.' },
      { symptom: 'Pressure surge on stopping', cause: 'Inadequate or failed surge protection', action: 'Check the surge vessel charge and the non-return valve closure characteristics.' },
      { symptom: 'Pumps cycling frequently', cause: 'Control band too narrow for the demand pattern', action: 'Widen the control band or move to variable speed operation.' }
    ]
  },
  // -------------------------------------------------------------------------
  [TAGS.mcc]: {
    tag: TAGS.mcc, name: 'Motor control centre', type: 'Electrical switchgear and motor starters',
    purpose: 'Distributes power to every driven unit on the works and carries the protection, starting and status signalling for each motor.',
    howItWorks: 'Incoming supply is distributed through switchgear to individual starter cubicles, one per motor. Each cubicle provides isolation, short-circuit protection, overload protection and the contactor or drive that starts the machine, and reports its running and tripped status to the control system.',
    whyUsed: 'It is where a trip is diagnosed. The plant status the operator sees, and every fault indication in this simulator, originates as a signal from a starter here.',
    inputs: ['Incoming electrical supply', 'Start and stop commands from the control system'],
    outputs: ['Power to pumps, mixers, blowers and dosing equipment', 'Run, trip and current status signals'],
    operatingVariables: ['Total connected load', 'Individual motor currents', 'Trip and alarm status'],
    designVariables: ['Incoming supply rating and standby generation', 'Protection settings per motor', 'Form of separation between cubicles', 'Variable speed drive provision'],
    misoperation: [
      'Resetting a trip without finding its cause usually results in the same trip, and sometimes in damage.',
      'Overload settings raised to stop nuisance trips remove the protection the motor depends on.',
      'Working on a starter without proving dead is the most common cause of serious injury on a treatment works.'
    ],
    theory: 'Total plant power is the sum of every driven unit. Dividing it by the product flow gives specific energy, which is the figure that connects the electrical side of the works to the process decisions made upstream.',
    equations: [{
      what: 'Total plant shaft power',
      equation: 'P_total = ΣP_pumps + P_mixing + P_flocculation + P_blower',
      why: 'It is what ties an operating decision, such as a higher mixing gradient, to an electricity bill.',
      inputs: ['Each driven unit'],
      units: 'kW',
      interpretation: 'Mixing and flocculation are a small fraction of the total; pumping dominates.'
    }],
    practice: 'Standby generation sized for the essential loads is normal on a water treatment works, because a loss of supply means a loss of supply to customers.',
    safety: ['Prove dead before touching any conductor', 'Arc flash risk: correct personal protective equipment for switching', 'Lock off and tag any circuit being worked on', 'Never defeat an interlock'],
    troubleshooting: [
      { symptom: 'Motor trips repeatedly on overload', cause: 'Mechanical load higher than rated, or a failing motor', action: 'Read the trip current and investigate the driven machine before resetting again.' },
      { symptom: 'Status shows running but the machine is stopped', cause: 'Failed auxiliary contact or broken coupling', action: 'Confirm at the machine; a status signal is not proof of flow.' },
      { symptom: 'Whole section dead', cause: 'Upstream protection operated', action: 'Establish why the upstream device operated before re-energising anything.' }
    ]
  }
};

export default EQUIPMENT;
