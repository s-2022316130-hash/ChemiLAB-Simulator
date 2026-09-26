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
getEquipmentState(result)       -> { tag: {state, alarm, values{}, metrics{}} }
getStreams(result)              -> Stream[]  ({id, flow, phase, label, velocity?})
getSteps(result)                -> CalcStep[] for "show calculation"
```

`KIND` tags every displayed quantity with its provenance: user input, calculated,
first-principles, correlation, educational approximation, reference value.

Three optional channels sit alongside the required ones. All are additive: an engine
that omits one loses that feature, not the run.

`Result.convergence` is a `Trace[]`, one per solver the run used — `{id, label, what,
tol, history, converged, iterations, residual}`. `history` is the residual after each
iteration; `what` is the engine saying what that residual physically measures, because
the solver cannot know. Build one with `trace()` in `solver.js`. Gas processing reports
two, because two flashes at two temperatures are two separate questions and one averaged
number hides whichever was the awkward one.

`metrics` on an equipment entry holds numbers where `values` holds strings. They are not
redundant: `values` is formatted for reading and carries its unit inside the string,
`metrics` is raw and can be scaled, compared and ramped. Parsing a number back out of a
display string would be the UI deriving a process value, so the engine publishes both or
the feature does without.

`engine.colourModes` declares how a plant may be shaded — `{id, label, what, kind,
metric, unit, domain, scale}`. Domains are fixed to the validated range of the model and
never taken from the run: a scale that rescales itself makes every case look identical
and two runs impossible to compare by eye. Engines declare only what they honestly have.
Water treatment is isothermal — one raw-water temperature applies everywhere — so it has
no temperature mode and shades by turbidity on a log ramp instead.

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

`solver.js` returns `{converged, iterations, residual, history}` from both `fixedPoint`
and `bisect`. `runtime.js` maps that to the status lifecycle and discards superseded runs
with a token counter, so a slow run can never overwrite a newer one.

The residual is the verdict; `history` is the working, and the results rail plots it on a
log scale against the tolerance. They answer different questions. Two runs can both say
"converged" and have got there completely differently — the washwater recycle falls to
tolerance in twelve sweeps, the ammonia loop crawls across five hundred and eighty-eight
while the inerts build up against the purge — and only the second is a loop near the edge
of stable. The shape also says which solver ran: successive substitution decays smoothly,
bisection descends in steps.

## Balances

Several balances usually live in one `massBalance` object — a solids balance and a water
balance are two questions asked of the same plant. Each entry carries `family` (the rows
that sum together), `side` (`in` / `out` / `total` / `closure` / `context`), the `phase`
it travels in, and `share`, its fraction of that family’s basis.

`share` is computed in the engine. A row as a fraction of the charge is a process
quantity like any other and the rule has no exception for arithmetic that looks easy.

Every family sums to 100 % on both sides. Getting there meant publishing two terms the
balances had always counted but never shown — washwater that is not recovered, and water
leaving with the stack dust. Both got rows; no total was quietly adjusted to match. A
`context` row is a breakdown of a row above it rather than another term in the sum, and
the rail dims it accordingly.

Closure stays the engine’s own figure. The rail never sums the rows and calls the
difference an error.

## Colour modes

`shared/ramp.js` turns a number the engine reported into a colour and decides
nothing else. `ui/colourMode.js` is the switch and the legend; `scene/materials.js`
`tint()` shades the 3D, `flowsheet/view2d.js` `setNodeTint()` shades the diagram,
and `ui/workspace.js` drives both from one map so the two drawings of one solved
state can never disagree.

The ramp has no green in it. Green already means running here, and a ramp that
borrowed it would say "healthy" halfway up a temperature scale. Status stays on
the flowsheet outline and the lamp while the ramp is only ever a fill, so a hot
unit that has also tripped shows a red ring around a warm body and neither fact
displaces the other.

Tinting the 3D is harder than setting a colour, for three reasons worth knowing
before touching `tint()`:

- The palette is shared. Every vessel points at one `MAT` entry, so the first
  tint on a mesh clones its material and keeps the shared one by reference —
  by reference, so a theme change that rewrites the palette still reaches the
  base the tint is mixed from.
- After that first clone the material is never swapped again, only mutated.
  `highlight()` swaps materials too, and two mechanisms swapping one slot from
  different directions is how a hover ends up permanently amber.
- Named meshes are skipped. A name is how a plant module reaches the parts it
  drives from engine results, and those already carry a meaning of their own.

`compact()` fuses meshes within an equipment group and never across tags, which
is what makes per-unit tinting possible at all. Cost is one clone per mesh on
first use and nothing per frame: measured frame time is unchanged between a
shaded plant and an unshaded one.

A unit with no reading is left unshaded and the legend says so. A compressor the
model gives no temperature is not a cold compressor.

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

### The overview plate

The overview is laid out as a drawing sheet rather than a landing page: the hero is a
plate with a double border, ISO 5457 zone references and centring marks, a title block
of what the library holds, and behind the headline a psychrometric chart
(`app/psychro.js`). The chart is computed, not drawn — Magnus–Tetens saturation
pressure, humidity ratio `w = 0.621945 φ p_s / (P − φ p_s)` and moist-air enthalpy at
101.325 kPa — and carries no state; it is the subject's own drawing used as ground, and
it engraves itself once when the page opens (paths in order, grid first, saturation
last). The home-only ground, grain and brass rules come from `--ground-*`, `--plate*`,
`--brass*` and `--engrave*` tokens under `:root[data-page="home"]`, which the overview
sets on mount and removes on dispose, so no other page inherits them.

Type is Inter for the interface, Source Serif 4 for display on the overview, IBM Plex
Mono for tags and values. All three are bundled from `@fontsource` (OFL 1.1) through
`shared/fonts.css`, limited to the subsets the text uses, so the single-file build opens
with the right faces and no network.

The one exception is the mark in the masthead. `assets/chemilab-logo.svg` carries its
own fixed plate and its own two colours and takes no token at all: the hairline under
the bar already says which plant you are standing in, and a brand that restates it is a
brand that moves.

## Motion

Movement means something changed, where it came from, or where it went. Nothing loops
for decoration and nothing moves that the reader did not cause. Tokens are named by what
the movement is doing — `--ease-enter` settles, `--ease-exit` leaves without lingering,
`--ease-slide` carries a thumb between positions — and the few JavaScript waits read
their durations from the same tokens through `shared/motion.js`, so a wait can never
cut its own animation short.

- **Navigation** fades the old page out (`--dur-exit`) before the next is built, then
  the workspace assembles in reading order: controls, plant, results. Not a View
  Transition: opening a simulator builds its scene synchronously in 0.6–1.9 s, and a
  View Transition would hold the old frame frozen for exactly that long.
- **Theme** *is* a View Transition — `setTheme` is synchronous — revealed as a circle
  from the toggle, so the plant and the interface change in one stroke. A sequence
  number stops a cancelled transition's clean-up removing the marker of the one that
  replaced it.
- **Indicators slide.** The detail level, the masthead nav and the phone tab bar each
  draw one thumb that travels, positioned from custom properties the JS sets. Each
  waits one frame before enabling its transition, or every page load would open with
  it sliding in from the left.
- **Results animate only on a new answer.** The rail redraws for other reasons too,
  and "fresh" means *not yet painted*, not *first drawn*: a result arriving sets
  `dirty` false straight afterwards, which redraws in the same task before anything
  reaches the screen. A reading whose *displayed* value changed pulses once. It never
  counts up — sweeping digits from old to new would show values no engine computed.
- **Colour modes glide** over 0.52 s in both views: `tint()` takes a strength and the
  renderer blends on its existing ticker; the flowsheet fill uses `--dur-4` to match.

### Reduced motion

Asking for less motion is asking for less *movement*. Under the preference things stop
travelling, lifting, zooming and looping, and go on fading and changing colour — which
is not movement, and is how a change stays visible instead of just having happened.
The block is last in `theme.css` because a later `@keyframes` of the same name wins, so
it swaps each travelling keyframe for a fade only while the preference is set. The 3D
camera stops its idle orbit and cuts to presets instead of flying.

This replaced a rule that zeroed every duration in the file. That was safe, and it also
meant anyone with Windows' "Show animations" turned off — common on low-power and
virtual machines — saw no transitions anywhere, with nothing to say one was intended.
Do not put it back.

## Live library tiles

Each tile on the overview shows its plant actually running — built by the same plant
module the workspace uses, run by the same engine at its base case, so a stream that
flows on a tile is one the model reports flow in. `app/liveTiles.js` owns the tiles and
never imports three.js; `scene/previewStage.js` is loaded only when the library nears
the viewport.

- **One renderer for all five.** Five would compile every shader and upload every
  material five times and hold five GPU contexts. Each plant has its own scene and
  camera; the shared renderer draws it into a corner of one drawing buffer and the frame
  is copied into the tile's own 2D canvas, so each tile keeps its place in its layer
  stack, under the scrims that protect its text.
- **A small view shim, not the workspace renderer.** Plant modules only ever call
  `view.add`, `view.addEquipment` and `view.onTick`; framing uses `getEquipment` and
  `listEquipment`. The shim implements exactly that.
- **One view per plant module at a time.** Each plant module keeps a single
  module-level `live` reference for `applyState`. The overview and a workspace are never
  mounted together, and leaving the overview disposes every preview and hands the GPU
  context back before the workspace asks for its own.
- **Scheduled, not drawn every frame.** Measured on a slow machine, one plant costs 4–12
  ms to draw and all five about 35 ms — more than a whole 30 fps frame. The stage caps
  tile work at 7 ms in any frame and about 30 % of the main thread overall, sets each
  tile's rate from what drawing it actually costs, and gives the hovered tile the full
  30 fps. A fast machine sees no difference; a slow one gets a lower tile rate and a page
  that still scrolls.
- Framing matches the stills behind the tiles (`tools/backdrops.js`), so a tile going
  live reads as the photograph starting to move. Under reduced motion the tiles stay
  still and a plant runs only while its tile is hovered or focused.

## Plant sheet export

The **Export** button in the 3D panel header composes one image of one part of the
plant: a title block, the 3D picture with callouts in the margins and leader lines to
each unit, the live flowsheet with the same part ringed on it, the run's headline
figures, a legend, and a line at the foot saying where the numbers came from.
`ui/exportDialog.js` is the dialog; `ui/exportSheet.js` draws the sheet; the preview is
the same drawing at a third of the size.

- **Parts** are the plant's own camera presets, reframed for the sheet's 1.9 : 1 picture
  — at or above the renderer's reference aspect, so its field-of-view widening never
  kicks in and the framing lands exactly — plus the current view and the selected unit.
- `renderer.snapshot({width, height, pose})` renders from any pose, copies the frame out
  before the drawing buffer is overwritten, projects a point on each unit's body to
  image pixels, and restores everything in the same task.
- **A part calls out only its own units.** Labelling everything in the picture put a
  dozen leaders across the plant and buried the ones that mattered. A sheet of the whole
  view has no subject and names every unit, split between the margins at the median unit
  rather than the picture's centre so neither margin is crushed.
- **Readings are the engine's formatted `values`**, as the HUD shows them. With no run,
  units are named and not measured, and the sheet says so.
- The flowsheet SVG is cloned and every `var(--token)` in it replaced with the value in
  use, because an SVG drawn as an image sees none of the page's stylesheet. The dash on a
  flowing line is the one CSS-only style that matters, and it is written onto the clone.

### Formats and options

| Option | Choices |
|---|---|
| Format | **PNG** image, or **PDF** document |
| Size | PNG: standard 2400 × 1800 or high 4800 × 3600. PDF: A4, A3 or US Letter, landscape |
| Sheet colours | **Match the app** (theme in force), or **White paper** for printing |
| Include | callouts, readings on callouts, flow diagram, legend, **data appendix** |
| Sheet details | title, prepared by, notes |

- **A PDF sheet is composed to the paper's proportions.** `composeSheet({ aspect })`
  keeps the height at 1800 and widens the sheet, so the picture and lower band grow with
  it and page 1 is filled edge to edge rather than letterboxed. It is rasterised at a
  little over 300 dpi and placed as a JPEG.
- **White paper is the light theme's palette, read from the stylesheet.**
  `sheetPalette('white', simId)` resolves tokens on a hidden probe carrying
  `data-theme="light"` and the simulator — so no second palette exists — re-declares
  the two root aliases (`--accent`, `--accent-deep`) that would otherwise inherit the
  dark values, and sets the ground to white. The 3D picture keeps its on-screen lighting.
- **Details are the exporter's, not the model's.** A title replaces the plant name in
  the title block (the plant is still named on the line under it); "prepared by" is a
  title-block field and the PDF's Author; notes fill whatever room the headline panel
  has left and appear in full in the appendix.
- **The data appendix** (`ui/exportAppendix.js`) carries what a picture cannot: the
  run (status, convergence, iterations, residual, solve time, each convergence trace,
  balance closures, case, faults), every reading the engine reported for the units on
  the sheet, every stream, and the notes. It is laid out once as drawing operations in
  points and drawn by either backend — onto the canvas under a PNG's sheet, or into PDF
  pages as real text — so the two formats cannot disagree. Tables repeat their header on
  a new page, a unit split by a page break is named again "(continued)", and the last
  three rows of a table never strand on a page of their own.
- **The PDF writer is `shared/pdf.js`**, not a library: the app ships as one offline
  HTML file, and what is needed is small — PDF 1.4, the base-14 fonts (nothing embedded),
  JPEG images stored as they are, uncompressed content streams and a cross-reference
  table. Text is WinAnsi; characters outside it are written as their nearest plain
  equivalent (`CO₂` → `CO2`, `−` → `-`) rather than dropped. Columns are measured
  with Helvetica-compatible metrics so right alignment and cell fitting hold in any
  reader.
- **The file is described before it is made.** The dialog shows the page strip (every
  page of the output as a thumbnail, each viewable at full preview size), the file type,
  pixel size or paper and dpi, page count, and the run's status. Format, size, paper,
  colours, the appendix choice (remembered per format — on for PDF, off for PNG) and the
  preparer's name are remembered in this browser only.
- **Device limits are applied up front.** A canvas past a browser's pixel cap draws
  nothing — on iOS Safari about 16.7 MP — so on a touch device the export scale is capped
  under it and the summary says "the most this device can draw" instead of the download
  failing.

## Gallery photography

Library tiles are backed by a still of the plant they open — a render of the actual
three.js scene, produced offline by `npm run backdrops` and committed to
`assets/plant-bg/`. `scene/renderer.js` exposes `capture()` for it; nothing in the
running application calls that.

Three things about it are worth knowing before changing any of them.

- **The camera aims at a cluster, not the plot.** `frameBox()` solves a distance by
  fitting every corner of a bounding box, and at the fifteen-degree elevation these
  shots use, the corner that binds is the far one — most of the answer is the *depth*
  of the site rather than its size. Raising `fill` barely moves the camera because the
  distance asymptotes to however deep the plot is. Aiming at a handful of tags instead
  puts the camera among the vessels and lets the rest of the plant recede behind it.
- **The layer stack is stated, not implied.** Photograph, resting scrim, hover scrim,
  hue atmosphere, vignette, content. A `::before` is an element's *first* child and
  would otherwise sit under the image, so `theme.css` gives the three photo layers
  explicit z-indexes.
- **The right file is chosen in script, not by `srcset`.** The one-file build inlines
  these as `data:` URIs, and a data URI cannot appear in a `srcset` — the comma after
  `;base64` is that attribute's own separator. `app/backdrops.js` picks once, up front,
  which also means a phone never begins fetching the 1600-wide file.

Both themes carry the same files and treat them oppositely: a night render laid on a
dark card has no separation and is lifted, and the same render laid on a white card is
a grey cloud and is left alone under a much lighter scrim. The numbers are in
`tokens.css` under `--photo`.

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

On a phone (≤ 640 px) the overview's library tiles become cards with the plant as a
band above the text, at full strength, rather than a photograph dimmed behind it — with
no hover on a touch screen, a dimmed photograph never brightens. The masthead is sized to
hold the mark, name, both destinations and the theme switch in 375 px; the camera row
stops short of the floating Run button; the export dialog becomes a full-screen sheet in
one scroll with its actions pinned to the foot, and its fields are 16 px so focusing one
does not zoom the page.

## Accessibility

The interface is held to WCAG 2.1 AA, with 44 × 44 targets (2.5.5) as a house rule on
every pointer. The rules live in the tokens, so a new component inherits them:

- **Text contrast (1.4.3).** Every ink token clears 4.5 : 1 on every surface and tinted
  wash it is set on, in both themes. Text is never dimmed with `opacity` — a toggle that
  is off is drawn in `--ink-ghost`, not faded.
- **Control boundaries (1.4.11).** Anything you operate is edged in `--line-control`
  (3 : 1 against both sides); `--line` and `--line-soft` are for dividers only.
- **Targets.** `--target` (44 px) is the minimum box. A control meant to read small —
  pills over a view, camera positions, the level switch, the theme switch — keeps a
  full-size box and draws its visible shape inside it (`--pill-h`, `--seg-h`,
  `--icon-h`), usually as a `::before` whose fill comes from `--pill-bg` /
  `--pill-line`. State rules set those properties, not `background` or `border`.
- **Type.** No text below 12 px (`--t-micro`, `--t-fine`) and no reported value below
  14 px (`--t-num`). Every size in the stylesheet is a scale token. The exceptions are
  text inside a picture (`role="img"`) and the flowsheet's labels, which scale with the
  diagram and its zoom.
- **Structure.** The simulator route has a visually hidden `h1`; every panel title is an
  `h2` (`panel()` makes it one); section labels inside panels are `h3.sect`. Toggles
  carry `aria-pressed` alongside `data-on` (`setOn()` in `ui/workspace.js`); the
  camera row marks the current position with `aria-current`.
- **The 3D plant.** The canvas is `role="img"` with a label and fallback text, described
  by `#plant-state-summary`. Unit states are written from `stateOf()` in
  `scene/labels.js` — the same rule that picks the caption colour — and announced
  through the HUD's live region: counts after a fresh run, named units when three or
  fewer change, at most one announcement every 2.5 s, nothing when nothing changed.

## Camera presets

A preset declares **what it looks at**, not where the camera stands:

```js
main: { subject: [TAGS.amineContactor, TAGS.amineRegenerator], azimuth: 26, elevation: 22, fill: 0.84 }
```

`scene/cameras.js` resolves that into a position once the plant is built, by taking the
bounding box of those tags and solving for the distance at which it fills `fill` of the
frame from that bearing — per box corner, taking the largest answer, rather than using a
bounding sphere that would stand far too far back from a long low plot.

Choosing a bearing is still a judgement (which side of a unit is worth seeing, and what is
standing in the way) and stays with the plant module. How far back to stand is arithmetic
and used to be done by eye: measured against the built geometry, every hand-typed overview
cropped its own plot — fertilizer needed 191 % of the frame height, paint 218 % of the
width. A preset can no longer go stale when the plot plan moves, and a preset whose
subject is not in the scene is dropped rather than pointed at the ground.

The panel shape the presets are composed for is **1.88** — measured (782 × 416 CSS pixels
at a 1512-wide window), not assumed. It lives in `cameras.js` and `renderer.js` imports
it, because the number that decides how a preset is framed and the number that decides
when a viewport is too narrow have to be the same number.

A perspective camera's field of view is vertical, so a phone held upright sees far less
across than that panel. `renderer.js` corrects in two places: the field of view opens to
64° (past which a column's verticals start to bow) and standing further back covers **most
of** the rest — not all of it. Covering it completely keeps every metre of a hundred-metre
plot on screen and delivers the plant as a small object in a large sky; covering 35 % of
the shortfall crops a little off each end at a size worth looking at, and the view pans
and pinches.

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
  does not move and neither does most of the plant, so the interval only has to be short
  enough for a turning agitator to cast something honest.

**A caution about measuring any of this.** `frameWork()` deliberately measures the
duration of the frame's own work rather than the interval between frames, because a
throttled or occluded tab is handed frames slowly while each one is cheap. What it cannot
separate is the GPU: when the browser is not presenting, WebGL calls return immediately
and the same scene measures around 4 ms; when it is presenting, they block and it measures
around 12. Both numbers are real and they are three times apart, so a before-and-after
comparison is only meaningful if the presenting state is the same on both sides — forcing
a repaint between readings is the way to hold it still.
- **Captions are their own scene**, composited after post-processing. Text stays crisp,
  never picks up bloom, and compositing it does not mean walking the plant twice.
- **Transparency is rationed.** It was half the frame budget on the reference machine
  until liquid bodies stopped being double-sided.

Stream tracers are `InstancedMesh`. `webglAvailable()` gates the 3D view and the
workspace falls back to the flowsheet alone.
