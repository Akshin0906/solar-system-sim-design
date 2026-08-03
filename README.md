# Solar System Simulator

An interactive, offline-friendly 3D solar system built with React, TypeScript, and Three.js. Explore planets, dwarf planets, and major moons; move through time; compare scale lenses; and inspect the assumptions behind the simulation.

When GitHub Pages is enabled for this repository, the production app is available at [akshin0906.github.io/solar-system-sim-design](https://akshin0906.github.io/solar-system-sim-design/).

## Highlights

- Browse a rendered solar system with planets, dwarf planets, major moons, belts, comets, orbital rings, labels, and motion trails.
- Control simulation time: play, pause, step days, scrub the timeline, and choose speed presets.
- Switch between real, readable, compact, and map scale lenses—each discloses when size or distance has been adjusted for legibility.
- Inspect bodies for scientific sources, model tier, reference frame, validation interval, and known omissions.
- Focus, follow, or observe a selected body; use photo mode and shareable view links to capture a scene.
- Try guided experiences, including director tours and an eclipse chase, with visible fidelity notes.
- Preview educational rocket missions using free-flight, guided-direct, Hohmann, and Lambert modes. Transfer requirements and vehicle evidence are intentionally kept separate.
- Explore accelerated, guided solar-system scenarios such as impacts and stellar evolution without presenting them as literal forecasts.
- Install the app as a PWA and continue using cached assets offline after installation.

## Quick start

Requires Node.js 22 or newer.

```bash
npm ci
npm run dev
```

Open the local address printed by Vite (normally `http://127.0.0.1:5173`).

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server. |
| `npm run build` | Type-check, create a production build, and generate the service worker. |
| `npm run build:github` | Build with the `/solar-system-sim-design/` GitHub Pages base path. |
| `npm test` | Type-check scripts and run application, rocket, scenario, and service-worker checks. |
| `npm run verify:math` | Run orbital, ephemeris, orientation, scale, rocket-transfer, scenario, render-quality, texture, and experience verification. |
| `npm run test:e2e` | Run Playwright browser smoke tests. |
| `npm run preview` | Serve the latest production build locally. |

## Controls

- **Rotate:** drag
- **Zoom:** scroll (or pinch on touch devices)
- **Pan:** right-drag (or two-finger drag)
- **Inspect:** click or tap a body
- **Focus a body:** double-click it, or choose it in Search
- **Search:** `/` or <kbd>Cmd/Ctrl</kbd> + <kbd>K</kbd>
- **Play / pause:** <kbd>Space</kbd>
- **Step one day:** <kbd>←</kbd> / <kbd>→</kbd>
- **Close dialogs and popovers:** <kbd>Esc</kbd>

## Scientific scope

This is an educational visualization, not an observatory-grade ephemeris or mission-planning tool. Major-planet motion is an analytical approximation based on JPL elements and rates; dwarf planets use dated Horizons element snapshots; moon motion uses calibrated mean elements. The inspector identifies each model's reference frame, validation period, accuracy tier, source material, and omitted effects.

Rocket views are likewise educational. Hohmann and Lambert modes model idealized two-body transfers, while direct/free modes are illustrative trajectories. The app does not model full n-body gravity, atmospheric losses, staging, finite burns, propellant budgets, or vehicle feasibility.

For sources, assumptions, and reproducibility details, see [DATA_SOURCES.md](DATA_SOURCES.md), [ROCKETS.md](ROCKETS.md), and [DESIGN.md](DESIGN.md).

## Project layout

```text
src/
  app/          React application shell and styling
  data/         Celestial-body, moon, belt, and scientific metadata
  features/     Rockets, authored experiences, sharing, and photo mode
  scene/        React Three Fiber scene, camera, effects, materials, and labels
  scenarios/    Guided scenario definitions and runtime state
  simulation/   Orbit solving, coordinate frames, time, scale, and scientific contract
  ui/           Controls, inspector, search, panels, and accessibility helpers
scripts/        Offline model, data, rendering, and behavior verification
tests/e2e/      Playwright browser smoke tests
```

## Deployment

Pushing to `main` runs the GitHub Actions workflow in [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml). It installs dependencies, audits production packages, runs the verification and browser suites, builds the GitHub Pages artifact, and deploys it when the build succeeds.

## License

No license file is currently included. Add one before distributing the project under a specific license.
