# Solar System Visual QA Checklist

Use this checklist after meaningful scene, UI, scale, camera, time, or service-worker changes.

## Historical QA Runs

The June entries below preserve what was tested against the then-current rocket
prototype. Names and behavior such as `Transfer preview`, confidence labels, the LEO
speed offset, and automatic post-arrival attachment were superseded by the current
Hohmann/Lambert, evidence-contract, and explicit flyby/capture model. Use the current
checklists later in this document for release sign-off.

### 2026-06-14 (Rocket Phase 2)

- `npm run verify:math` passed, including `scripts/verify_rocket_transfer_math.py`.
- `npm run build` passed and regenerated the service worker.
- Dev server loaded at `http://127.0.0.1:5176/`; 5173-5175 were already in use.
- Desktop 1280 x 720: canvas rendered, rocket panel hidden by default, no document
  overflow, no console errors.
- Rocket panel showed grouped destinations, disabled Mission mode for Free flight, and
  exposed Direct aim, Transfer preview, Earth departure, LEO, and Surface options.
- Free flight with LEO launched successfully; telemetry showed Direct aim, LEO launch
  mode, and the expected higher direct speed readout.
- Direct aim to Mars launched successfully with no transfer note and destination
  telemetry populated.
- Transfer preview to Mars launched successfully; telemetry showed Transfer preview,
  Transfer phase, transfer time, intercept date, launch-window quality, ideal phase,
  and delta-v. The curved transfer cue rendered in the scene with no console errors.
- Desktop screenshot checked: panel text fit, actions stayed reachable, no UI overlap.
- Phone viewport 390 x 844: no overflow, inspector hidden while rocket panel was open,
  rocket panel sat between scale controls and time controls, transfer telemetry fit
  without horizontal overflow, no console errors.
- Time stepping with the UI updated transfer telemetry and the top date.
- Timeline range scrubber was identified (`aria-label="Timeline"`), but direct fill was
  rejected by the browser range control and coordinate dragging did not move the native
  slider in the in-app Browser. Recheck physical range dragging before strict release sign-off.

### 2026-06-13 (Rocket Destination Targeting)

- `npm run verify:math` passed (destination feature does not touch orbital math).
- `tsc --noEmit` and `npm run build` passed; service worker regenerated.
- Desktop 1280×800 and phone 390×844 checked in browser, no console errors.
- Target selector offers Free flight, Moon, Mars, Jupiter, Saturn, Neptune, and no non-Earth moon targets.
- Launched Saturn V → Mars and → Jupiter: rocket + gold trail render, a cyan dashed line
  connects the rocket to the target, and the target body shows a subtle highlight ring.
- Telemetry adds destination, distance-to-target, arrival estimate, closest approach, and
  mission status; distance-to-target changed over time (Jupiter 6.17 → 4.11 AU) and status
  progressed Departing → Cruising → Approaching.
- Free flight still launches outward with no destination cues and no destination rows.
- Reset clears the mission; closing the panel keeps the rocket flying.
- Panel header and Launch/Reset stay pinned while the body scrolls; all telemetry rows and
  Reset remained visible at 1280×800 with no overlap. Phone docked the panel between the
  scale and time controls with the inspector hidden while open; no horizontal overflow.

### 2026-06-13 (Rocket MVP)

- `npm run verify:math` passed (rocket feature does not touch orbital math).
- `tsc --noEmit` and `npm run build` passed; service worker regenerated.
- Desktop 1280×800 and phone 390×844 checked in browser, no console errors.
- Rocket panel hidden by default; app still opens directly into the simulation.
- Launched Saturn V and Fusion Drive: trail + marker + label render from Earth,
  telemetry updates, distance-traveled and distance-from-Earth diverge correctly,
  the `% c` speed format shows for fast drives, and Reset clears the rocket.
- Planet/moon selection still works while the rocket is active.
- No panel overlap on desktop. On phone the launcher docks between the scale and
  time controls and the inspector is hidden while it is open (it returns on close).

### 2026-06-14 (Solar-system polish)

- `npm run verify:math` passed.
- `npm run build` passed and generated `dist/service-worker.js`.
- `npm audit --audit-level=high` passed with zero vulnerabilities.
- Dev server loaded at `http://127.0.0.1:5173/` with one rendered canvas and no console errors.
- Desktop viewport passed panel overlap, control readability, selected object, time controls, search, scale controls, orbit/trail toggles, and inspector action checks.
- Phone viewport at `390 x 844` passed canvas, panel stacking, readability, and overflow checks.
- Search opened from the search button, `/` from fresh page focus, and Cmd/Ctrl+K; typing `Titan` filtered results, selecting Titan updated the top bar and inspector, and Escape closed search.
- Space toggled play/pause; ArrowLeft and ArrowRight stepped time backward and forward.
- Production preview loaded at `http://127.0.0.1:4173/` with one rendered canvas and no console errors.
- Service-worker artifacts were verified from the production build: the app bundle registers `/service-worker.js`, the generated service worker precaches `/`, `/index.html`, current hashed JS/CSS, manifest, and icon assets, and the preview server returned each asset with `200`.
- Codex Browser's read-only runtime did not expose `navigator.serviceWorker`, so a true offline reload could not be observed inside this tool. For strict release sign-off, repeat the production offline reload manually in a normal browser.

## Setup

- [ ] Run `npm run verify:math`.
- [ ] Run `npm run build`.
- [ ] Start the local app with `npm run dev -- --port 5173` or use an already-running dev server.
- [ ] Open `http://127.0.0.1:5173/`.
- [ ] Check the browser console for errors.

## Desktop Viewport

- [ ] Canvas fills the viewport and is not blank.
- [ ] Top bar does not overlap scale controls or inspector.
- [ ] Scale control labels are separated and readable.
- [ ] Selected scale mode is visually clear.
- [ ] Inspector does not cover the time controls.
- [ ] Time controls remain usable, including play/pause, step, speed preset, speed slider, scrubber, and Now.
- [ ] Labels are useful but do not dominate the scene.
- [ ] Orbit rings are visible and not visually noisy.
- [ ] Selected object is obvious without a harsh outline.

## Phone Viewport

- [ ] Test at about 390 x 844.
- [ ] Canvas fills the viewport and is not blank.
- [ ] Top bar, scale controls, inspector, and time controls do not overlap.
- [ ] Page has no horizontal or vertical document overflow.
- [ ] Scale control labels remain readable.
- [ ] Time controls remain tappable.
- [ ] Inspector content is readable and does not hide primary controls.

## Interaction Checks

- [ ] Search opens from the search button.
- [ ] Search opens with `/`.
- [ ] Search opens with Cmd+K or Ctrl+K.
- [ ] Search filters results.
- [ ] Selecting a result updates the top bar and inspector, then closes search.
- [ ] Escape closes search.
- [ ] Space toggles play/pause when focus is not in a form field.
- [ ] Arrow left steps time backward when focus is not in a form field.
- [ ] Arrow right steps time forward when focus is not in a form field.
- [ ] Scale modes visibly change the solar system.
- [ ] Orbit toggle hides and shows orbit rings.
- [ ] Trail toggle hides and shows optional body trails.
- [ ] Focus, Follow, and Moons buttons show their active state when selected.
- [ ] Double-clicking a body or choosing it in Search moves to a useful focused view.
- [ ] Observe places a non-stellar body beneath a visible Sun-facing horizon and shows
      the terminator-observer scale disclosure.
- [ ] Turning off labels, grid, orbits, and trails exposes the recovery action, and that
      action restores a useful recommended view.

## Scientific Trust And Sharing Checks

- [ ] The inspector shows the selected body's model tier and exposes its sources,
      reference frame, accuracy description, and important omissions.
- [ ] Moving outside a model's validated interval shows the extrapolation warning.
- [ ] Real scale keeps physical radius and distance on one linear scale; every other
      lens states what it enlarges or compresses.
- [ ] Photo mode hides the UI while leaving a reachable Show controls action.
- [ ] A copied view link restores body, date, camera mode, scale lens, playback state,
      labels, grid, orbits, and trails without console errors.

## Rocket Launch Checks

- [ ] Rocket panel is hidden by default; the default view stays uncluttered.
- [ ] The rocket button in the top bar opens and closes the launch panel.
- [ ] Selecting a profile updates hardware status, direct/free curve confidence,
      description, primary sources, and any contextual payload/C3 benchmarks.
- [ ] Hardware maturity, curve confidence, and capability benchmarks remain visibly
      separate; a physical transfer never claims launcher feasibility.
- [ ] Preview free flight shows a marker, outbound trail, and label in the scene.
- [ ] Telemetry shows mission time, speed, distance traveled, distance from Earth,
      and target range/arrival when applicable, and all update as time advances.
- [ ] Distance traveled and distance from Earth differ once Earth has moved along its orbit.
- [ ] Fast drives (e.g. Fusion Drive) show speed as a fraction of light speed (`% c`).
- [ ] Reset rocket clears the marker, trail, and telemetry.
- [ ] Closing the panel keeps the active rocket flying in the scene.
- [ ] Launching does not change planet/moon positions, and body selection still works.
- [ ] No panel overlap on desktop with the rocket panel open.
- [ ] No panel overlap on phone (390×844); the inspector is hidden while the panel is open
      and returns when it is closed.
- [ ] No console errors after launching, resetting, and switching scale modes.

## Rocket Destination And Mission Checks

- [ ] The Target selector groups Free flight, planets, dwarf planets, and Moon only.
- [ ] The mission mode selector offers Guided direct, Hohmann coast, and Lambert intercept
      for heliocentric targets; Moon omits unsupported Lambert, and Free flight disables the selector.
- [ ] The launch assumption selector offers Earth departure, Low Earth orbit, and Surface launch.
- [ ] The Preview button label reflects the target and mission mode (for example,
      "Preview guided direct to Mars", "Preview Hohmann coast to Mars", or "Preview free flight").
- [ ] Launching toward a destination shows a subtle highlight ring on the target body.
- [ ] Guided direct shows a straight outbound path and a thin dashed line to the selected destination.
- [ ] Destination telemetry shows the target name, distance to target, estimated arrival,
      and closest approach.
- [ ] Distance to target changes over time (decreases while approaching).
- [ ] Mission phase updates through appropriate values such as Burn, Coast, Approach, Flyby, Arrived, or Missed.
- [ ] Free flight launches outward with no destination cues and no destination telemetry rows.
- [ ] Reset clears the destination mission, target highlight, and target line.
- [ ] All telemetry rows and the Reset button remain reachable (header/actions stay pinned).
- [ ] Destination launches do not move or modify any planet/moon.
- [ ] No console errors after selecting destinations, launching, and resetting.

## Physical Rocket Transfer Checks

- [ ] Hohmann and Lambert modes render propagated transfer arcs instead of a guided straight line.
- [ ] The arc shows a launch marker, current rocket marker, and intercept/arrival cue.
- [ ] Rocket progress advances along the arc as time runs and updates when time is scrubbed.
- [ ] A Hohmann coast can report and visibly continue through a phase-dependent miss;
      Lambert reaches its dated modeled endpoint without borrowing a catalog speed curve.
- [ ] Flyby continues the propagated conic after encounter. Capture follows the destination
      only after a valid intercept and application of the displayed idealized burn.
- [ ] Telemetry shows mission/arrival modes, transfer time, intercept date, phase offset,
      v-infinity, C3, 400 km LEO injection, capture burn, arrival miss, and closest approach.
- [ ] Transfer math is labeled as a two-body educational model, not a launcher verdict or
      professional mission planner.
- [ ] Hohmann launch-window quality changes with target/date and includes a phase offset.
- [ ] A Moon transfer clearly identifies its simplified Earth-centered Hohmann model.
- [ ] Non-Earth moons are absent from rocket destinations until local capture is modeled.
- [ ] Guided direct predicts a moving-target straight-line intercept and can report Arrived near the target.
- [ ] Low Earth orbit is a 400 km injection reference; its orbital speed is never added
      as free scalar cruise speed and launch assumptions never change the physical conic.

## Authored Experience And Scenario Checks

- [ ] Scale Revelation visits Real, Readable, Compact, and Map with a persistent disclosure
      of what each lens preserves or distorts.
- [ ] Eclipse Chase computes a live model event, keeps its mean-element timing limitation
      visible, and supports replay/hold controls.
- [ ] Three Worlds visits Earth/Moon, Jupiter, and Saturn with useful watch prompts.
- [ ] Exiting an authored experience, rocket watch, or scenario restores the pre-session
      clock, view, and scale state, including a manually composed free-look camera.
- [ ] Each Doomsday scenario shows integrated/guided/stylized fidelity badges, uses its
      compact watch HUD, narrates the latest event, and restores the untouched system on exit.

## Production Offline Check

- [ ] Run `npm run build`.
- [ ] Run `npm run preview`.
- [ ] Open the preview URL.
- [ ] Confirm the service worker registers after the production page loads.
- [ ] Reload once so the page is controlled by the service worker.
- [ ] Confirm hashed JS and CSS assets are present in the service-worker cache.
- [ ] Disable network or use offline mode.
- [ ] Reload the page and confirm the app still opens directly into the simulation.
- [ ] Re-enable network before continuing.

## Acceptance

- [ ] No console errors.
- [ ] Desktop and phone screenshots look intentionally framed.
- [ ] No visible text overlaps in common viewport sizes.
- [ ] The app still opens directly into the simulation, with no landing page.
