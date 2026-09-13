# ChemiLAB Simulator

**Chemical engineering virtual plant — an interactive industrial simulation laboratory.**

Five process units in one application. Change an operating condition, solve the balances,
and watch the same solved state appear in the 3D plant, the flowsheet, the results rail
and the equations behind them.

> **Status: platform release.** The shared framework is built and working. No process model
> is implemented yet, so every simulator route shows an honest placeholder instead of a
> dashboard of invented numbers. Simulator 01 is next.

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
npm run preview    # serve the production build
```

Node 18 or newer.

## Publishing on GitHub Pages

1. Open **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Push to `main`, or run the **Deploy to GitHub Pages** workflow manually.

The build uses relative asset paths, so it works at `https://<user>.github.io/<repo>/`
without extra configuration.

## Simulators

| # | Unit | State |
|---|---|---|
| 01 | Water Treatment Plant | Framework ready, model pending |
| 02 | Industrial Dryer | Planned |
| 03 | Ammonia–Urea Fertilizer Plant | Planned |
| 04 | Paint Manufacturing Plant | Planned |
| 05 | Natural Gas Processing Plant | Planned |

Routes: `#/`, `#/simulators`, `#/simulators/water-treatment`, and so on.

## What the platform already does

- **3D plant renderer** — three.js scene with an industrial geometry library (vessels,
  columns, pumps, blowers, exchangers, pipe runs, valves, platforms, stairs, frames,
  instruments, cabinets), picking, hover, selection and camera presets.
- **2D flowsheet** — ISA-style SVG symbols with stream labels, two-way selection sync
  against the 3D plant.
- **Simulation runtime** — engine contract, status lifecycle, superseded-run protection,
  fixed-point and bisection solvers that report convergence honestly.
- **Operator controls** — generated from each engine's input specification, with
  validation messages that give the engineering reason for a rejection.
- **Results rail** — KPIs, process results, mass and energy balance, quality, solver
  information and a step-by-step calculation trace.
- **Information layer** — equipment cards, equations with units and interpretation,
  guided tour, model assumptions tagged by provenance.
- **Scenarios** — base, normal, optimisation and fault modes, plus graded challenges.
- **Cases** — save, load, duplicate and export as JSON, with a model-version check.
- **Fallbacks and performance** — one shared animation loop, instanced stream tracers,
  adaptive quality, and a flowsheet-only mode when WebGL is unavailable.

## Layout

```
src/
  main.js
  app/         shell, hash router, simulator registry, page renderers
  simulation/  engine contract, status lifecycle, solver, runtime, scenarios
  scene/       three.js renderer, geometry library, stream tracers, cameras
  flowsheet/   ISA symbols, SVG flowsheet with two-way selection
  information/ equipment cards, guided tour, assumptions, glossary
  ui/          controls, results, scenario panel, case bar, mode switch, workspace
  shared/      units, formatting, validation, store, persistence, animation, theme
  simulators/  one folder per unit — physics never crosses between them
docs/          architecture notes and the Simulator 01 work list
```

## Rules the codebase holds to

1. The interface never computes a process value. Every number comes from a simulation
   engine or from a value explicitly labelled as an educational reference value.
2. Anything not yet calculated renders as an em dash. No filler numbers.
3. `converged: true` only when the solver met its tolerance.
4. An invalid or failed run clears the previous result rather than leaving stale numbers.
5. Streams animate only when the engine reports a non-zero flow.
6. Engines stay independent — no physics is shared between simulators.
7. One simulator is finished before the next is started.

This is a teaching tool. It is not a validated commercial process simulator and must not
be used for plant design.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/SIMULATOR-01.md`](docs/SIMULATOR-01.md)
and [`CLAUDE.md`](CLAUDE.md).

## Licence

MIT. See [LICENSE](LICENSE).
