# Architecture

## Layer boundaries

| Layer | Owns | Must not |
|---|---|---|
| `simulation/` | physics, balances, solver, status, scenarios | touch the DOM or three.js |
| `scene/` | 3D geometry, picking, camera, tracers | compute process values |
| `flowsheet/` | SVG symbols, PFD, labels | compute process values |
| `information/` | equipment text, equations, tour, assumptions | hold state |
| `ui/` | panels, controls, results, cases | derive numbers |
| `shared/` | units, format, store, validation, persistence, animation | know about any single process |

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

## Solver honesty

`solver.js` returns `{converged, iterations, residual, history}`. `runtime.js` maps that
to the status lifecycle and discards superseded runs with a token counter, so a slow run
can never overwrite a newer one.

## Performance

One `requestAnimationFrame` loop for the whole app (`shared/animation.js`). Stream tracers
are `InstancedMesh`; a quality governor lowers tracer count when frame rate drops.
`webglAvailable()` gates the 3D view and the workspace falls back to the flowsheet alone.
