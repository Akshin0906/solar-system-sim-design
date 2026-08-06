# Architecture

The simulator is a client-only React application built around a React Three Fiber scene. It keeps scientific inputs, simulation math, view state, rendering, and educational feature layers separate so visual changes do not silently alter the underlying model.

## System map

```mermaid
flowchart TD
  App[React application shell] --> UI[Instrument-style controls]
  App --> Scene[React Three Fiber scene]

  Data[Celestial data and provenance] --> Model[Orbit and orientation model]
  Time[Simulation clock] --> Model
  Model --> Positions[Scene positions]
  Positions --> Scene

  Scale[Scale and display lenses] --> Positions
  Scale --> Scene
  Selection[Selection and camera state] --> UI
  Selection --> Scene

  Experiences[Guided experiences] --> Time
  Experiences --> Scale
  Experiences --> Selection

  Rockets[Educational mission previews] --> Model
  Rockets --> Scene
  Scenarios[Isolated scenario integrator] --> Scene
```

## Main layers

| Area | Responsibility |
| --- | --- |
| `src/data/` | Celestial bodies, moons, belts, orientation inputs, and scientific metadata. |
| `src/simulation/` | Kepler solving, coordinate frames, orientation, time, selection, scale transforms, and scientific contracts. |
| `src/scene/` | Three.js objects, materials, lighting, camera, labels, effects, adaptive quality, and scene composition. |
| `src/ui/` | Search, inspectors, time/scale controls, bottom sheets, keyboard behavior, focus handling, and safe preferences. |
| `src/features/` | Guided experiences, rocket previews, photo mode, and shareable views. |
| `src/scenarios/` | Deterministic isolated gravity experiments and their bounded runtime. |
| `scripts/` | Offline verification of math, source data, rendering budgets, and application invariants. |
| `tests/e2e/` | Browser coverage for desktop, mobile, PWA, accessibility, and major feature flows. |

## Scientific model boundary

The application deliberately distinguishes source data from model output:

1. `src/data/` records orbital and physical inputs plus provenance.
2. `src/simulation/scientificContract.ts` exposes source, model tier, frame, validity interval, accuracy notes, and omissions.
3. Orbit and orientation modules calculate dated states in a fixed J2000 ecliptic frame.
4. `scenePositions.ts` and the scale utilities translate physical states into a readable 3D composition.
5. The inspector shows when a result is extrapolated or visually distorted.

Only the **Real** lens uses one linear scale for both distance and radius. Other lenses make documented changes for legibility. See [the scientific model](../DATA_SOURCES.md) for source-by-source details.

## State ownership

Zustand stores own low-frequency application state:

| Store | Owns |
| --- | --- |
| `timeStore` | Simulation date, playback speed/direction, pause state, and transport locking. |
| `scaleStore` | Scale lens, label density, overlays, and persisted view preferences. |
| `selectionStore` | Selected body, camera mode, camera restores, and nested view sessions. |
| `uiStore` | Mutually exclusive sheets, popovers, responsive UI state, and an explicit rocket-watch clock snapshot. |
| `experienceStore` | Reversible tours, eclipse-chase state, and its explicit restoration snapshot. |
| `rocketStore` | Mission configuration and the active educational preview. |
| `scenarioStore` | Scenario parameters and low-frequency status. |

The high-frequency scenario integrator is intentionally held outside React and Zustand. The scene advances it in bounded fixed steps, which avoids rerendering the UI for each physics step and prevents unbounded background-tab catch-up.

### Reversible session transitions

Three features temporarily own the clock and camera: guided experiences, rocket watch, and what-if scenarios. Their transition rules are deliberately observable in store state rather than hidden module variables:

```mermaid
stateDiagram-v2
  [*] --> Browsing
  Browsing --> Experience: start tour or eclipse chase
  Experience --> Browsing: exit and restore snapshot
  Experience --> RocketWatch: launch ends experience, then snapshots
  Experience --> Scenario: scenario ends experience, then snapshots
  Browsing --> RocketWatch: launch and snapshot
  RocketWatch --> Browsing: exit and restore snapshot
  RocketWatch --> Scenario: start isolated scenario, preserve nested baseline
  Scenario --> RocketWatch: exit scenario, resume active preview
  Scenario --> Browsing: retire rocket during scenario, then exit
  Browsing --> Scenario: start, freeze clock, and snapshot
  Scenario --> Browsing: exit, unlock, and restore snapshot
```

A scenario's transport lock rejects new experience and rocket launches until the
scenario exits. An already-active rocket preview may sit beneath the isolated
scenario: exiting the scenario resumes it, while retiring the rocket during the
scenario folds the pre-rocket clock and view into the scenario's eventual restore.
Starting a rocket or scenario first stops an experience so the new owner captures
the visitor's real pre-session state rather than an authored camera stop. Every exit
clears or folds its snapshot after restoration, which makes nested transitions and
test isolation deterministic.

## Rendering strategy

- React Three Fiber composes the scene and renders on demand.
- The simulation clock advances in fixed real-time slices while playback is active.
- Shared sphere LODs, label culling, adaptive DPR, adaptive exposure, and conditional effects bound GPU work.
- Curated planet textures have procedural fallbacks so a failed image does not blank a body.
- `BodyMesh` owns per-frame position, orientation, lighting, and LOD coordination; texture lifecycle,
  declarative surface layers, label DOM behavior, and shader/ring resources live in focused scene modules.
- WebGL context loss is surfaced as a recoverable state, while render errors have an application-level boundary and structured, copyable client diagnostics.
- Reduced-motion and coarse-pointer modes adapt camera movement and controls for accessibility.

## Feature isolation

### Guided experiences

Tours direct the existing clock, camera, and scale stores. They snapshot the visitor's state, apply temporary authored settings without overwriting saved preferences, and restore the exact prior composition on exit.

### Rocket previews

Rocket code lives under `src/features/rockets/` and never mutates celestial-body data. Illustrative direct/free curves are kept separate from two-body Hohmann and Lambert calculations. Hardware evidence is presented independently from trajectory requirements. See [the rocket model](../ROCKETS.md).

### What-if scenarios

Scenarios freeze the analytical base clock, seed an isolated deterministic integrator, and own the view until exit. Each rendered frame is capped at 120 fixed physics steps. The public speed ceiling is 120 days/sec, which requests 96 steps per frame at 60 Hz and reserves 20% of the step budget for ordinary render jitter; the red-giant scenario defaults to 100 days/sec for additional headroom. Sustained slow frames contract the accepted wall-time slice to the cap, retain one additional slice for brief stalls, drop older debt, and surface throttling in the UI. The executed fixed-step trajectory stays deterministic while requested playback timing slows. Fragment caps and conservation checks keep extreme events stable without representing them as forecasts.

### Sharing and offline use

Share links serialize a validated, bounded view state. Imported views are temporary and do not replace local defaults. Production builds generate a service worker with content-hashed cache versioning that owns its cache namespace and precaches the application shell for offline reloads.

## Reliability contract

- TypeScript runs in strict mode with unused-symbol checks.
- ESLint covers TypeScript, React Hooks, and JSX accessibility.
- Pure TypeScript and Python verifiers exercise orbital math, frames, ephemeris snapshots, scale transforms, transfers, scenarios, and rendering budgets.
- Playwright tests the same base-path artifact deployed to GitHub Pages. Chromium
  carries the complete desktop and mobile suite plus offline and reduced-motion smoke
  coverage; targeted search, scenario-restoration, mobile, focus, and rendering checks
  repeat in Firefox and WebKit.
- CI pins third-party actions by commit SHA, audits the complete dependency tree, and uses least-privilege permissions.

See [Quality and release checks](QUALITY.md) for the complete validation workflow.
