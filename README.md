# ChemiLAB Simulator

**Chemical engineering virtual plant — an interactive industrial simulation laboratory.**

Five process units in one application. Change an operating condition, solve the balances,
and watch the same solved state appear in the 3D plant, the flowsheet, the results rail
and the equations behind them.

**▶ [Open the simulator](https://s-2022316130-hash.github.io/ChemiLAB-Simulator/)**

> **Status: complete.** All five process models are implemented, verified and live.
> Every number on screen is computed by a simulation engine or explicitly labelled as an
> educational reference value. Nothing is filled in to make a panel look busy.

---

## The five units

| # | Unit | What it teaches |
|---|---|---|
| 01 | **Water Treatment Plant** | Coagulation chemistry, flocculation energy, settling, filtration and the CT disinfection credit |
| 02 | **Industrial Dryer** | Psychrometrics, the constant- and falling-rate periods, and which of three limits is binding |
| 03 | **Ammonia–Urea Fertilizer Plant** | Two coupled recycle loops, and why overall conversion follows recovery rather than the reactor |
| 04 | **Paint Manufacturing Plant** | A batch process: the critical pigment volume concentration, and why dispersion is not mixing |
| 05 | **Natural Gas Processing Plant** | A sequence of pipeline specifications, and cold bought with a pressure drop that has to be paid back |

Routes: `#/`, `#/simulators`, `#/simulators/water-treatment`, and so on.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # static site in dist/
npm run build:single # the same site as one self-contained .html file
npm run preview      # serve the production build
npm run verify       # structural and behavioural checks on all five engines
```

Node 18 or newer.

## One file, no server

`npm run build:single` writes `dist/chemilab-simulator.html`: every module, all the
CSS and all five engines inlined into a single ~1.3 MB file with nothing left to
fetch. Double-click it and it runs — no install, no server, no network. Email it,
put it on a USB stick, drop it in a shared folder or hand it to a class.

It is a separate build rather than the normal one with the pieces glued together,
for two reasons. The lazily loaded simulator chunks are collapsed back in, because
the code splitting exists to keep three.js out of the first paint and with one file
there is nothing left to defer. And the bundle is emitted as a classic script rather
than a module, because a browser refuses to run a module script from a `file://`
URL — which is exactly where this build is meant to be opened.

The one thing it still reaches for is the Google Fonts stylesheet. Online that gives
the intended type; offline the font stacks fall back to the system UI font and
nothing else changes.

## What `npm run verify` checks

For every simulator, without a browser:

- every equipment tag has a flowsheet node and a complete information card, and every
  stream has an edge — in both directions, so nothing is orphaned either way;
- no flowsheet nodes overlap and none fall off the canvas;
- the full engine contract is implemented, the base case converges, and the equipment and
  stream state cover every tag and every stream;
- no calculated field leaks a value before a run, and no challenge grades an empty result;
- the tagged-unit, fault, challenge and tour-step counts the overview page shows still
  match what each simulator actually has;
- the neighbourhood of the base case — every input at ±20 % and ±40 % — still solves;
- twenty thousand random operating points per engine throw nothing, report no non-finite
  value, and never report a result without convergence.

Pass `FUZZ=200000` for a longer run, or a simulator id to check one:
`node scripts/verify.mjs gas-processing`.

## What the application does

- **3D plant** — a three.js scene per unit built from a shared industrial geometry library,
  lit by image-based lighting from a reflection probe, with ACES tone mapping, bloom and a
  selection outline. Quality is measured rather than assumed: a governor watches how long a
  frame's work actually takes and moves multisampling, render scale, shadow resolution and
  the bloom pass to hold the frame rate. Static geometry is fused into one mesh per material
  as it enters the scene, which is what makes several hundred parts affordable on an
  integrated GPU.
- **2D flowsheet** — ISA-style SVG symbols with live stream values, direction arrows,
  marching dashes on flowing lines, and pan and zoom. Selection is two-way with the 3D plant.
- **Simulation runtime** — an engine contract, a status lifecycle, superseded-run protection,
  and fixed-point and bisection solvers that report convergence honestly.
- **Operator controls** — generated from each engine's input specification, with validation
  messages that give the engineering reason for a rejection rather than clamping silently.
- **Results rail** — KPI cards, process results, mass and energy balances with their closure
  errors, quality against specification, solver diagnostics and a step-by-step calculation
  trace with the substitutions written out.
- **Information layer** — an equipment card per tagged item, equations with units and
  interpretation, a guided tour that puts the numbers each step is about on screen live, and
  model assumptions tagged by provenance.
- **Scenarios** — base, normal, optimisation and fault modes, six faults per unit with the
  symptoms an operator would actually see, and graded challenges.
- **Cases** — save, load, duplicate and export as JSON, with a model-version check.
- **Engineering HUD** — selecting a unit pins a technical plate to the 3D view with its
  tag, name, operating state and the readings the engine reported for it. The flowsheet
  dims everything else at the same time, so "where is this" is answered by both views.
- **Themes** — dark by default, because a control room is a dark room; light is a second,
  deliberately designed environment rather than an inversion. The plant is lit by the same
  design tokens as the interface, so the two cannot drift apart.
- **Phones** — below 900 px the workspace becomes four screens with bottom navigation, a
  floating run action and a bottom sheet for equipment detail; the flowsheet pans and
  zooms, and the renderer caps its pixel ratio and starts a tier down. Between 901 and
  1180 px the views take the full width with the controls and the results rail side by
  side under them. A flowsheet-only mode covers machines with no WebGL at all.

## Layout

```
src/
  main.js
  app/         shell, hash router, simulator registry, page renderers
  simulation/  engine contract, status lifecycle, solver, runtime, scenarios
  scene/       renderer, environment and lighting, geometry library, materials,
               captions, stream tracers, cameras
  flowsheet/   ISA symbols, SVG flowsheet with pan, zoom and two-way selection
  information/ equipment cards, guided tour, assumptions, glossary
  ui/          controls, results, scenario panel, case bar, mode switch, workspace
  shared/      design tokens, units, formatting, validation, store, persistence,
               animation, theme, icons
  simulators/  one folder per unit — physics never crosses between them
scripts/       verification harness
docs/          architecture notes and the Simulator 01 work list
```

## Rules the codebase holds to

1. The interface never computes a process value. Every number comes from a simulation
   engine or from a value explicitly labelled as an educational reference value.
2. Anything not yet calculated renders as an em dash. No filler numbers.
3. `converged: true` only when the solver met its tolerance.
4. An invalid or failed run clears the previous result rather than leaving stale numbers,
   and `ERROR` is reserved for a model that could not produce a valid answer — a plant that
   runs and makes off-specification product has produced one, and says so as a warning.
5. Streams animate only when the engine reports a non-zero flow.
6. Validation explains the engineering reason for a rejection. Nothing is silently clamped.
7. Engines stay independent — no physics is shared between simulators.
8. Every correlation and reference value is declared in the model's assumptions, with its
   provenance: first principles, engineering correlation, educational approximation or
   reference value.

This is a teaching tool. It is not a validated commercial process simulator and must not
be used for plant design.

## Publishing on GitHub Pages

1. Open **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Push to `main`, or run the **Deploy to GitHub Pages** workflow manually.

The build uses relative asset paths, so it works at `https://<user>.github.io/<repo>/`
without extra configuration.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/SIMULATOR-01.md`](docs/SIMULATOR-01.md)
and [`CLAUDE.md`](CLAUDE.md).

## Licence

MIT. See [LICENSE](LICENSE).
