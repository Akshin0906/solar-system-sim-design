# Solar System Visual QA Checklist

Use this checklist after meaningful scene, UI, scale, camera, time, or service-worker changes.

## Latest QA Run - 2026-06-13 (Rocket MVP)

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

## Latest QA Run - 2026-06-14

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

## Rocket Launch Checks

- [ ] Rocket panel is hidden by default; the default view stays uncluttered.
- [ ] The rocket button in the top bar opens and closes the launch panel.
- [ ] Selecting a profile updates the category, confidence badge, and description.
- [ ] Confidence is clearly labeled: Real, Estimated, or Speculative.
- [ ] Launch from Earth shows a marker, outbound trail, and label in the scene.
- [ ] Telemetry shows name, category, mission time, speed, distance traveled, and
      distance from Earth, and all update as time advances.
- [ ] Distance traveled and distance from Earth differ once Earth has moved along its orbit.
- [ ] Fast drives (e.g. Fusion Drive) show speed as a fraction of light speed (`% c`).
- [ ] Reset rocket clears the marker, trail, and telemetry.
- [ ] Closing the panel keeps the active rocket flying in the scene.
- [ ] Launching does not change planet/moon positions, and body selection still works.
- [ ] No panel overlap on desktop with the rocket panel open.
- [ ] No panel overlap on phone (390×844); the inspector is hidden while the panel is open
      and returns when it is closed.
- [ ] No console errors after launching, resetting, and switching scale modes.

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
