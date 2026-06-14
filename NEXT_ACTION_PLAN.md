# Next Action Plan

This doc is the immediate handoff plan for the next agent. It assumes the current MVP already exists and that `DESIGN.md`, `NEXT_STEPS.md`, and `QA_CHECKLIST.md` have been read.

## Current State

The app is a working 3D solar system MVP with:

- React + Vite + Three.js.
- Keplerian orbit movement.
- Planets, dwarf planets, major moons, asteroid belt, and Kuiper belt.
- Scale modes, time controls, search, inspector, camera focus/follow modes, orbit rings, and optional trails.
- Procedural planet/cloud visuals.
- Camera framing utilities and verification.
- Production service-worker generation.
- Educational rocket feature implemented in `src/future/rockets/`: launch panel, rocket
  catalog, simple speed-profile flight model, and destination targeting (Moon, Mars,
  Jupiter, Saturn, Neptune). See `ROCKETS.md`. Patched conics / transfer orbits remain future.

## Immediate Priority

Do a polish and QA hardening pass before adding new product surface.

Do **not** start rockets yet.

## Task 1: Resolve Trail Toggle Behavior

Issue:

- `SolarScene` currently renders the selected body's motion trail even when the `Trails` toggle is off.
- This may be intentional, but it conflicts with the checklist wording that the trail toggle hides and shows optional body trails.

Recommended decision:

- Make `Trails` off mean no trails at all.
- If always showing the selected trail is preferred later, rename the control or add a separate selected-trail setting.

Implementation target:

- Update `src/scene/SolarScene.tsx`.
- Keep the behavior simple:
  - `showTrails === false`: render no `MotionTrail` components.
  - `showTrails === true`: render selected/all trails according to the chosen design.

Acceptance checks:

- With `Trails` unchecked, no body trail lines render.
- With `Trails` checked, trails render.
- `QA_CHECKLIST.md` wording matches the actual behavior.

## Task 2: Run Manual Interaction QA

Browser automation had trouble entering text because of a virtual clipboard/tooling issue, so typed search should be checked manually.

Manual checks:

- `/` opens search.
- Cmd+K opens search.
- Ctrl+K opens search.
- Typing `Titan` filters results.
- Selecting Titan updates the top bar and inspector.
- Search closes after selecting a result.
- Escape closes search.
- Space toggles play/pause.
- ArrowLeft steps backward.
- ArrowRight steps forward.

Acceptance checks:

- All keyboard shortcuts work outside form fields.
- Shortcuts do not interfere while typing in search or using selects/sliders.
- No console errors appear.

## Task 3: Complete The Visual QA Checklist

Use `QA_CHECKLIST.md` as the source of truth.

Required viewports:

- Desktop default browser viewport.
- Phone-sized viewport around `390 x 844`.

Focus areas:

- Canvas fills the viewport after loading.
- No panel overlap.
- Scale controls remain readable.
- Inspector does not cover primary controls.
- Time controls remain tappable on phone.
- Labels do not dominate the scene.
- Moon-system focus remains readable.

Acceptance checks:

- Every relevant item in `QA_CHECKLIST.md` is manually checked.
- Any failed item becomes a concrete fix before moving on.

## Task 4: Verify Production Offline Support

The build now generates `dist/service-worker.js` from the actual production output.

Run:

```bash
npm run build
npm run preview
```

Then verify:

- Production page loads.
- Service worker registers.
- Reload once so the page is controlled by the service worker.
- Built JS/CSS assets are cached.
- Offline reload still opens directly into the simulation.

Acceptance checks:

- Offline reload works after first production load.
- No runtime errors appear in production preview.
- `QA_CHECKLIST.md` remains accurate.

## Task 5: Performance Check

The app now generates procedural canvas textures for bodies and clouds. This improves visuals, but may increase startup and render cost.

Check:

- Initial load time.
- Time until canvas reaches full size.
- Camera responsiveness.
- Trails off performance.
- Trails on performance.
- Full label density performance.
- Moon-system focus performance.
- Screenshot/capture responsiveness if using browser tooling.

Potential follow-up fixes:

- Lower procedural texture resolution for small moons/dwarf planets.
- Lazy-create textures only for visible or important bodies.
- Cache or reuse generated textures more explicitly.
- Reduce trail sampling or compute trails less often.
- Code-split if the production bundle keeps growing.

Acceptance checks:

- App feels smooth on a modern laptop.
- Trails do not cause obvious stutter.
- The large bundle warning is either reduced or documented as accepted for now.

## Task 6: Add Data Provenance

After QA is stable, add `DATA_SOURCES.md`.

Document source/provenance for:

- Radius.
- Semi-major axis.
- Eccentricity.
- Inclination.
- Orbital period.
- Rotation period.
- Approximate mean anomaly / epoch assumptions.

Acceptance checks:

- A future agent can tell which numbers are sourced and which are approximate.
- The app clearly separates real data, visual scale choices, and artistic rendering choices.

## Task 7: Then Improve Camera And Moon Systems

Only after the QA and offline checks pass:

- Refine Jupiter and Saturn moon-system camera views.
- Add saved camera presets:
  - Solar System.
  - Inner Planets.
  - Earth/Moon.
  - Jupiter System.
  - Saturn System.
  - Kuiper Belt.
- Add Phobos, Deimos, Charon, and possibly Halley's Comet.

Acceptance checks:

- Camera motion feels polished.
- Moon systems are easy to inspect.
- New objects do not clutter the default view.

## Rockets Stay Deferred

Rockets should wait until the solar system foundation is more mature.

Before rockets:

- Trail behavior is resolved.
- QA checklist passes.
- Offline production mode is verified.
- Performance risks are understood.
- Data provenance is documented.
- Camera and moon-system navigation feels solid.

When rockets start later, begin with a design spike, not direct implementation.

## Recommended Next Agent Prompt

```text
You are working in /Users/Apple/Documents/solar-system-sim-design.

Read DESIGN.md, NEXT_STEPS.md, QA_CHECKLIST.md, and NEXT_ACTION_PLAN.md.

Start by resolving the trail toggle behavior in SolarScene.tsx. Then run npm run verify:math and npm run build. After that, manually run the QA checklist, including typed search, desktop/mobile layout, and production offline behavior.

Do not implement rockets yet.
```

