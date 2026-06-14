# Performance Notes

## Current Status

The app is smooth in the default desktop and phone-sized browser checks on a modern laptop. The production build still reports a large JavaScript chunk, which is expected for the current single-bundle Three.js MVP.

Known build warning:

- Vite reports the main JavaScript chunk is over 500 kB.
- This is accepted for the current MVP because the app is a single 3D simulation surface and imports Three.js, React Three Fiber, Drei, Zustand, and Lucide.

## Higher-Risk Areas

- Procedural canvas textures are generated at runtime for bodies and clouds.
- Motion trails recompute multiple sampled positions for each trailed body.
- Full label density can add many `Html` labels.
- Belt particles are regenerated when scale mode changes.
- Browser screenshot capture can be slow while WebGL is actively rendering.

## Observed QA Notes

- Trails off is the best baseline performance mode.
- Trails on is acceptable for short manual checks, but trail sampling is the first place to optimize if stutter appears.
- Moon-system focus is lighter than full-system browsing because unrelated body emphasis and belt opacity are reduced.
- Mobile layout checks passed without document overflow or panel overlap.

## Optimization Backlog

1. Cache trail sample positions by body, scale mode, and coarse simulation time buckets.
2. Generate lower-resolution textures for moons and dwarf planets.
3. Lazy-create procedural textures when a body first becomes visible or selected.
4. Code-split the simulation route or lazy-load heavy 3D helpers if the app gains non-simulation surfaces.
5. Add an optional FPS/debug overlay that is off by default.
6. Consider instanced label culling or simpler label rendering for full-label mode.

## Acceptance For Now

- `npm run build` passes.
- The chunk-size warning is documented here and in `NEXT_STEPS.md`.
- Default app load and camera interaction feel usable.
- No memory-growth test has been run yet; run a several-minute simulation pass before adding rockets or mission planning.
