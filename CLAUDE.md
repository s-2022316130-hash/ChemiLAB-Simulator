# Working rules for ChemiLAB Simulator

Read `docs/ARCHITECTURE.md` before changing anything under `src/`.

## Hard rules

- The UI layer must never invent or derive a process value. Any number on screen comes
  from a simulation engine or from a value tagged `KIND.REF` (educational reference value).
- Fields that have not been calculated render as an em dash via `shared/format.js`.
  Do not substitute zeros, sample data, or "typical" values to make a panel look full.
- `Result.converged` is true only when the solver actually met its tolerance. Status
  lifecycle is READY → CALCULATING → CONVERGING → COMPLETE | WARNING | ERROR.
- A failed or invalid run clears the prior result (`runtime.js` already does this).
  Never reintroduce stale-result behaviour.
- Validation messages state the engineering reason for rejection. Do not silently clamp.
- Every simulator implements the full contract in `src/simulation/contract.js`.
  Physics never crosses simulator folders; shared code goes in `shared/` or `simulation/`.
- 3D streams animate only when the engine reports flow > 0.
- Separate loops: the solver runs on demand, rendering runs on the shared rAF loop in
  `shared/animation.js`. Do not rebuild DOM per frame.

## Build order

01 water-treatment → 02 industrial-dryer → 03 fertilizer → 04 paint → 05 gas-processing.
Do not start the next simulator until the current one is functionally complete
(engine, plant, flowsheet, equipment info, tour, scenarios, challenges, assumptions).

## Adding a simulator

1. Write `engine.js` against the contract, with `inputSpec`, `assumptions`, `equations`.
2. Write `plant.js` composing `scene/geometry.js` primitives; declare camera presets.
3. Write `flowsheet.js` with node tags that match the 3D equipment tags exactly —
   selection sync depends on shared tags.
4. Write `equipment.js`, `tour.js`, `scenarios.js`.
5. Point `index.js` at them and flip the registry `state` to `complete`.
