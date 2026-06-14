# Solar System MVP: What Comes Next

## Current MVP Snapshot

The MVP is now a working Vite + React + Three.js solar system app. It opens directly into a 3D simulation with:

- Sun, planets, dwarf planets, major moons, asteroid belt, and Kuiper belt data.
- Keplerian orbit solving with eccentricity, inclination, and orbital speed estimates.
- Centralized time, scale, and selection stores.
- Scale modes: real, readable, compressed, and overview.
- Time controls: play/pause, step, reverse, speed presets, speed slider, and timeline scrubber.
- Object selection, search, focus/follow modes, and an object inspector.
- Orbit rings, optional motion trails, labels, Saturn/Uranus rings, and procedural belt clouds.
- Production build output in `dist/`.
- Best-effort PWA/offline shell through `public/service-worker.js`.
- Future rocket type boundary in `src/data/rockets.future.ts`, with no MVP rocket implementation yet.

## Verification Notes

Checks run:

- `npm run verify:math` passed.
- `npm run build` passed.
- Local app loaded at `http://127.0.0.1:5173/`.
- Browser console showed no errors during the visual pass.
- Desktop visual pass confirmed the main 3D scene, UI panels, orbit rings, inspector, and controls render.
- Mobile-sized viewport pass confirmed the panels stack and the canvas resizes correctly after settling.
- Search interaction was verified by selecting Titan from the search results and seeing the inspector update to Titan.

Known warning:

- Vite reports the built JavaScript chunk is over 500 kB. This is expected for an early Three.js MVP, but should be addressed before the app grows.

## Highest Priority Fixes

### 1. Polish The Scale Control Layout

The four-option segmented scale control is cramped on desktop. In the visual pass, `Compressed` and `Overview` visually ran together.

Recommended fixes:

- Shorten labels to `Real`, `Bodies`, `Compressed`, `Map`, or use icons with tooltips.
- Increase the control width slightly on desktop.
- Add stronger internal spacing or allow labels to wrap cleanly.
- Verify at desktop width and phone width after the change.

Done when:

- No scale-mode label touches or visually merges with another label.
- The control remains readable at common laptop and phone widths.

### 2. Add A Proper Visual QA Checklist

The app is visual and 3D-heavy, so every meaningful UI/scene change should be checked in browser.

Add a lightweight checklist covering:

- Desktop viewport.
- Phone viewport.
- Canvas is nonblank and full-viewport.
- Top bar does not overlap scale controls.
- Inspector does not cover primary controls.
- Time controls remain usable.
- Labels do not dominate the scene.
- Search opens, filters, selects, and closes.
- Scale modes visibly change the system.
- Orbit/trail toggles work.
- No console errors.

Done when:

- `QA_CHECKLIST.md` exists.
- The checklist has clear manual pass/fail items.
- The next agent can use it without reading this chat.

### 3. Harden Offline/PWA Behavior

Offline support exists but should be tested in production mode.

Recommended tasks:

- Run `npm run build`.
- Serve with `npm run preview`.
- Confirm the service worker registers in production.
- Confirm the hashed JS/CSS assets are cached after first load.
- Confirm reload works with the network disabled after first production load.
- Consider precaching `dist/assets/*` during build instead of relying only on runtime caching.

Done when:

- Production preview works offline after first successful load.
- The app still opens to the simulation while offline.
- Offline behavior is documented in the README or QA checklist.

## Next Product Milestone

The next product milestone should be **Solar System v1 Polish**, not rockets yet.

Goal:

Make the existing solar system feel refined, inspectable, and trustworthy before adding the much larger rocket simulation surface.

Recommended scope:

- Better visual materials.
- Better labels.
- Better camera presets.
- Better data provenance.
- Better performance when optional trails and full labels are enabled.
- Better offline verification.

## Recommended Work Plan

### Phase 1: UI Polish And Usability

Tasks:

- Fix scale control label crowding.
- Make selected scale mode visually clearer.
- Improve mobile spacing between stacked panels.
- Add keyboard shortcuts:
  - Space: play/pause.
  - `/` or Cmd+K: search.
  - Escape: close search.
  - Arrow left/right: step time.
- Add visible active state for `Focus`, `Follow`, and camera preset modes.
- Make the `Now` button visually match the rest of the transport controls.

Acceptance checks:

- UI feels calm and minimal on desktop.
- UI remains usable on mobile.
- All controls have useful accessible labels or titles.
- No text overlap in the top bar, scale controls, inspector, or time controls.

### Phase 2: Visual Refinement

Tasks:

- Add subtle procedural surface variation to planets instead of flat colors.
- Add a more refined solar glow that does not wash out nearby orbits.
- Make orbit rings fade by distance and brighten on hover/selection.
- Improve Saturn and Uranus ring materials.
- Tune belt particle density by scale mode.
- Add optional high-quality local textures later, but keep procedural visuals as the offline fallback.

Acceptance checks:

- The system still looks minimal, not busy.
- Planet identities are easier to read at a glance.
- Belts feel like soft spatial structures, not noisy static.
- The selected object is obvious without a loud outline.

### Phase 3: Data Quality And Provenance

Tasks:

- Add `DATA_SOURCES.md`.
- Document which fields are approximate.
- Add comments or metadata for source confidence:
  - physical radius.
  - semi-major axis.
  - eccentricity.
  - inclination.
  - orbital period.
  - rotation period.
- Add Phobos, Deimos, and Charon as the next high-value moons.
- Consider adding Halley's Comet as the first comet object.
- Decide whether Pluto's moon system should be rendered as a nested mini-system.

Acceptance checks:

- A future agent knows where every important number came from.
- Approximate values are labeled as approximate.
- The user can trust the difference between real data, visual scaling, and artistic choices.

### Phase 4: Simulation And Performance

Tasks:

- Profile motion trails with many bodies enabled.
- Avoid recomputing full scene positions separately for every trail sample and every body.
- Cache sampled orbits more aggressively by body and scale mode.
- Consider rendering labels only when visible and important.
- Split the production bundle if it continues growing.
- Add a small FPS/debug overlay that can be toggled off by default.

Acceptance checks:

- App remains smooth with orbits on.
- App remains acceptable with trails on.
- Large chunk warning is either addressed or explicitly accepted with a reason.
- No memory growth is visible after running the simulation for several minutes.

### Phase 5: Camera And Navigation

Tasks:

- Add smoother transitions between focus targets.
- Add a small list of saved camera views:
  - Solar System.
  - Inner Planets.
  - Earth/Moon.
  - Jupiter System.
  - Saturn System.
  - Kuiper Belt.
- Improve follow mode so it tracks moving bodies without making manual orbit controls feel sticky.
- Add double-click-to-focus on bodies.
- Add hover affordances for selectable bodies.

Acceptance checks:

- Navigation feels intentional and polished.
- User can quickly inspect Earth/Moon, Jupiter, Saturn, and outer solar system.
- Manual camera movement exits automated modes predictably.

## Rocket Work: Still Defer

Do not build rockets in the next milestone unless the solar system polish is complete.

Before rockets, the app should have:

- Stable camera/focus behavior.
- Reliable time and distance scaling.
- Clear data provenance.
- A UI pattern for selecting objects and viewing stats.
- Performance confidence with existing objects.

When rockets do begin, start with a design-only spike:

- Define the rocket catalog.
- Define launch modes.
- Define distance traveled vs distance from Earth.
- Define simple speed-profile flight first.
- Keep patched conics and user-steered flight for later.
- Clearly label futuristic propulsion assumptions as speculative.

## Suggested New Docs

Add these next:

- `QA_CHECKLIST.md`: manual browser checks for visual and interaction QA.
- `DATA_SOURCES.md`: source/provenance for orbital and physical values.
- `PERFORMANCE_NOTES.md`: known performance risks and profiling observations.
- `ROCKETS_PHASE_2.md`: future rocket architecture and product design, only after v1 polish.

## Recommended Next Agent Prompt

```text
You are working in /Users/Apple/Documents/solar-system-sim-design.

The MVP is up. Read DESIGN.md and NEXT_STEPS.md first.

Start with Solar System v1 Polish, not rockets. First fix the scale control label crowding, then add QA_CHECKLIST.md, then verify desktop and mobile browser views. Keep the Apple-style minimal direction and do not add a landing page.

Run:
- npm run verify:math
- npm run build

Use the local Vite app for visual verification.
```

