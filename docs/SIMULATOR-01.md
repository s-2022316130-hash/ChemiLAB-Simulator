# Simulator 01 — Water Treatment Plant: remaining work

Framework is in place. What is missing is the process model and its assets.

## Engine (`src/simulators/water-treatment/engine.js`)
- [ ] Complete `inputSpec`: flow, turbidity, alkalinity, temperature, pH, coagulant dose,
      rapid-mix G and time, flocculation G and time, basin volume, overflow rate,
      filtration rate, chlorine dose, contact time.
- [ ] Validation: non-positive flow, turbidity out of range, dose vs alkalinity feasibility,
      overflow rate beyond the correlation's validated band, negative contact time.
- [ ] Hydraulics: velocity gradient G = sqrt(P/(µV)), detention time V/Q, overflow rate Q/A.
- [ ] Sedimentation removal correlation vs surface loading rate and floc quality.
- [ ] Filtration: rate, headloss build-up, run length to backwash.
- [ ] Disinfection: chlorine demand, residual, CT and log-inactivation.
- [ ] Mass balance: solids in, sludge out, backwash water, recovery.
- [ ] `getSteps()` trace: feed → dose → G·t → settling → filtration → disinfection → product.
- [ ] Assumptions list with a KIND on every entry.

## Plant (`plant.js`)
- [ ] Intake, rapid mix, flocculator train, clarifier with launders, filter gallery,
      backwash tank, chlorine contact tank, clearwell, pumps, blowers, pipe rack,
      platforms, stairs, handrails, instruments, MCC.
- [ ] Camera presets: overview, feed, main, separation, utilities, products, control.
- [ ] `applyState`: pump running/tripped colour, clarifier liquid level, filter loading.

## Flowsheet (`flowsheet.js`)
- [ ] Nodes with tags matching the 3D tags exactly; stream labels for flow, turbidity, dose.

## Information (`equipment.js`, `tour.js`)
- [ ] Full card for every tagged item; eight tour steps.

## Scenarios (`scenarios.js`)
- [ ] Faults: coagulant underdose, turbidity spike, blocked filter, pump failure,
      short-circuiting, chlorine dosing failure.
- [ ] Challenges: meet finished-water turbidity, hit the CT target, minimise coagulant.

## Done when
Running the base case produces a closed mass balance, the flowsheet and plant show the
same state, every KPI traces back to an equation in the panel, and each fault produces
a diagnosable symptom.
