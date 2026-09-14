# Architecture

## Layer boundaries

| Layer | Owns | Must not |
|---|---|---|
| `simulation/` | physics, balances, solver, status, scenarios | touch the DOM or three.js |
| `scene/` | 3D geometry, picking, camera, lighting, tracers | compute process values |
| `flowsheet/` | SVG symbols, PFD, labels | compute process values |
| `information/` | equipment text, equations, tour, assumptions | hold state |
| `ui/` | panels, controls, results, cases | derive numbers |
| `shared/` | units, format, store, validation, persistence, animation, theme | know about any single process |

## Engine contract (`src/simulation/contract.js`)

```
id, modelVersion, inputSpec, assumptions, equations
validate(inputs)                -> {ok, errors}
getInitialState(inputs)         -> Result with all calculated fields null
run(inputs, {scenario, faults}) -> Result
getDiagnostics(result)          -> Message[]
getEquipmentState(result)       -> { tag: {state, alarm, values{}} }
getStreams(result)              -> Stream[]  ({id, flow, phase, label, velocity?})
getSteps(result)                -> CalcStep[] for "show calculation"
```

`KIND` tags every displayed quantity with its provenance: user input, calculated,
first-principles, correlation, educational approximation, reference value.

## State

One `createStore` per workspace, holding
`inputs, errors, messages, status, result, selection, hover, level, scenario, faults, tourStep`.
Panels subscribe to the keys they care about (`subKeys`) and patch only their own DOM.
There is no global singleton state, so two workspaces could coexist.

## 3D ↔ 2D synchronisation

Both views are subscribers to `selection`, and both write clicks back to the same key.
They never call each other. Equipment tags are the shared identity: the 3D group's
`userData.tag` and the flowsheet node's `tag` must be identical strings.

Result fan-out on every `result`/`status` change:

```
result → engine.getEquipmentState() ┐
                                    ├→ flowsheet.applyState()
result → engine.getStreams()       ─┼→ streams.update()   (3D tracers)
                                    └→ plant.applyState() (equipment visuals)
```

When status is not COMPLETE or WARNING, the flowsheet is cleared and tracers stop.

## The five engines

Each simulator is one folder under `src/simulators/` and shares nothing with the others
but the contract, the solver and the shared utilities. What each one is actually built
around is worth knowing before changing it:

| Unit | Solved rather than assumed | The idea it exists to teach |
|---|---|---|
| 01 water-treatment | Carbonate-buffer pH after alum addition | Coagulant dose is a stoichiometric demand on alkalinity, not a recipe |
| 02 industrial-dryer | Coupled moisture and enthalpy balance, by bisection | Three limits — heat, time, and what the air can still hold — and which one binds |
| 03 fertilizer | Two recycle loops, by successive substitution | Overall conversion follows recovery, not what the reactor manages per pass |
| 04 paint | Batch temperature against a viscosity that depends on it | Λ = PVC/CPVC decides the film; dispersion needs stress, not mixing |
| 05 gas-processing | Rachford–Rice at every flash, and a bubble point | A sequence of specifications; three towers, one Kremser relation |

Simulators 03, 04 and 05 each re-use one relation in several places on purpose — the
recycle relation, the Krieger–Dougherty viscosity, and Kremser's absorption factor
respectively — and the tour text for each says so. That repetition is the teaching.

## Verification

`npm run verify` runs `scripts/verify.mjs` against every engine with no browser involved.
It checks the identity between engine, flowsheet and equipment cards in both directions,
the flowsheet geometry, the full contract, that no calculated field leaks a value before a
run, that the neighbourhood of the base case still solves, and then fuzzes twenty thousand
random operating points per engine looking for anything thrown, any non-finite value
reported, and any result reported without convergence.

A high proportion of random points failing is expected and is not a defect: most random
combinations of nineteen independent operating variables do not describe an operable
plant. What matters is that every failure is a stated physical reason with a message that
says what to change.

## Solver honesty

`solver.js` returns `{converged, iterations, residual, history}`. `runtime.js` maps that
to the status lifecycle and discards superseded runs with a token counter, so a slow run
can never overwrite a newer one.

## Design system

`shared/tokens.css` holds every colour, elevation, radius, type step and duration in
the application as a semantic token. `shared/theme.css` spends them and introduces no
hex of its own, and `shared/theme.js` is the only way anything outside CSS reads one.
Four consequences:

- **Dark is the foundation.** A control room is a dark room: an instrument is read as a
  luminous mark on a deep ground. Light is a second, deliberately designed environment —
  a laboratory in daylight — with its own contrast decisions, its own shadows and its own
  scene lighting rig, rather than an inversion of the dark one. `data-theme` on `<html>`
  swaps the token values; every component follows without knowing a theme exists. The
  choice is remembered per browser and applied before first paint by an inline script in
  `index.html`.
- **The plant is lit by the same palette as the interface.** The `--scene-*` tokens —
  sky, ground, fog, light intensities, exposure, bloom strength — are read by
  `scene/env.js` at build and again on every theme change.
- **A stream phase is one colour everywhere.** `--stream-*` is read by the flowsheet in
  CSS and by `scene/streams.js` through `token()`, so the plant and the diagram cannot
  drift apart.

`data-sim` carries each simulator's signature hue — aquatic blue, amber, emerald,
magenta, violet — which tints the accent, the rails, the page atmosphere, the rim light
and the sky. It is set before the workspace mounts, because the renderer reads it at
construction. Entering a simulator is meant to feel like entering a different facility
while the system around it stays identical.

## Layout

Three column widths, one component language:

| Width | Layout |
|---|---|
| above 1180 px | three columns — controls, views, results rail |
| 901–1180 px | views full width, controls and rail side by side under them |
| below 900 px | four screens, bottom navigation, floating run action, bottom sheet for equipment |

The phone layout is a CSS decision driven by `data-active` attributes, so nothing is
rebuilt when the window changes size and the WebGL context is never lost — a tab that
unmounted the canvas would have to recompile every shader on the way back.

A perspective camera's field of view is vertical, so a phone held upright sees far less
across than the landscape panel the camera presets were framed for. `renderer.js`
corrects in two places: the field of view opens to 64° (past which a column's verticals
start to bow) and standing further back covers the rest, capped at 2.8×.

## Performance

One `requestAnimationFrame` loop for the whole app (`shared/animation.js`), which
measures two separate things: how long a frame's work took, and how long the browser
waited before asking for the next one. Only the first is a statement about the renderer —
a throttled or occluded tab is handed frames slowly while each one is cheap — so quality
decisions are made on work time and the frame rate is reported only when it is real.

`createQualityGovernor` publishes a continuous `quality` (tracer density) and a
`tier`, and `scene/renderer.js` maps the tier onto multisampling, render scale, shadow
resolution and the bloom pass. Demotions in the first seconds do not count, and a tier
that has failed twice is not tried again, so nothing visibly oscillates.

What keeps the frame cheap:

- **`compact()` in `scene/geometry.js`** fuses the static meshes of each assembly, one
  merged mesh per material, as it enters the scene. A plant composed honestly out of
  primitives arrives as several hundred small meshes — a staircase is one per tread — and
  draw calls, not triangles, are what an integrated GPU runs out of. Named meshes and
  named groups are left alone: that is how a plant module reaches the parts it drives.
- **Shadows are static**, re-rendered on demand and every 0.4 s at full quality. The sun
  does not move and neither does most of the plant. That interval is measured rather than
  chosen: a shadow pass over a plant at 3072² costs a large fraction of a frame, and
  moving it from 0.4 s to 0.25 s took the smoothed frame cost from 4 ms to 36 ms for the
  same picture.
- **Captions are their own scene**, composited after post-processing. Text stays crisp,
  never picks up bloom, and compositing it does not mean walking the plant twice.
- **Transparency is rationed.** It was half the frame budget on the reference machine
  until liquid bodies stopped being double-sided.

Stream tracers are `InstancedMesh`. `webglAvailable()` gates the 3D view and the
workspace falls back to the flowsheet alone.
