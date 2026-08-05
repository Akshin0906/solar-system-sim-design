# Quality and release checks

The project combines deterministic model verification with browser-level interaction checks. A green production release must pass both: numerical correctness alone cannot catch a blank WebGL scene, and visual QA alone cannot validate orbital math.

## Automated checks

| Command | Coverage |
| --- | --- |
| `npm run lint` | TypeScript, React Hooks, and JSX accessibility rules. |
| `npm run typecheck` | Application, verification scripts, Playwright config, and browser tests. |
| `npm test` | App-state invariants, rocket sweeps, scenario conservation/stability, and service-worker ownership. |
| `npm run verify:math` | Orbits, JPL comparisons, coordinate frames, orientations, scale/camera math, transfers, scenarios, texture budgets, and experiences. |
| `npm run build` | Root-path production bundle and generated service worker. |
| `npm run build:github` | GitHub Pages bundle at `/solar-system-sim-design/`. |
| `npm run test:e2e` | Chromium desktop/mobile, normal and reduced motion, WebKit smoke, console errors, and offline reload. |
| `npm run check` | Full static, model, behavior, and production-build gate. |
| `npm run check:release` | `check` plus the browser suite. |

Install the Playwright browsers once before a local release run:

```bash
npx playwright install chromium webkit
npm run check:release
```

## Manual desktop pass

Use a current desktop browser at approximately 1280 × 720.

- Confirm the scene renders immediately and the console stays clear.
- Rotate, zoom, and pan; switch between Solar system, Inner planets, Outer planets, and Free look.
- Search for a planet and a moon; select with pointer and keyboard; use Focus, Follow, Moons, and Observe.
- Play, pause, reverse, step, scrub the timeline, change speed, and return to Now.
- Exercise Real, Readable, Compact, and Map lenses and verify their disclosures.
- Toggle labels, grid, orbits, and trails; verify the recovery action appears when all orientation aids are hidden.
- Open scientific-model details and confirm source links, frame, tier, validity, and omissions are readable.
- Enter and exit Photo mode; copy and reload a share link.
- Run each guided experience and confirm exit restores the starting camera, clock, and view.
- Open each what-if scenario, adjust a parameter, pause/resume, enter watch mode, and exit.
- Preview free flight, guided direct, Hohmann, and Lambert rocket modes; verify flyby/capture intent and telemetry.

## Manual phone pass

Use a 390 × 844 viewport and also spot-check a narrow 320 × 568 viewport.

- Confirm there is no document overflow or overlap between the canvas, transport, peeks, and sheets.
- Verify every primary control remains reachable with a comfortable touch target.
- Search and select a body, open/close its detail sheet, and switch scale/view settings.
- Open the time sheet and confirm the absolute date updates while scrubbing.
- Launch a rocket preview and verify the compact watch HUD leaves the transport usable.
- Start a guided experience and confirm the focused watch layout stays clear of the transport.
- Rotate/pinch/pan the scene and verify orientation changes do not strand an open sheet.

## PWA and deployment pass

1. Build the exact Pages artifact with `npm run build:github`.
2. Serve it from the production preview server at the repository prefix.
3. Confirm the manifest, PNG icons, hashed JavaScript/CSS, textures, and service worker return successfully.
4. Load once online, wait for the service worker, disable the network, and reload.
5. Restore the network and verify no stale cache serves a previous asset manifest.

GitHub Actions performs these checks on pull requests and pushes to `main`. A successful push uploads the already-tested Pages artifact, deploys it, and verifies the live HTML, manifest, and service worker endpoints.

## Reporting failures

When a check fails, separate product defects from environment failures:

- A deterministic verifier mismatch is a model or source-contract defect until explained.
- A browser assertion or console error is an app defect unless the trace shows a browser/GPU startup failure.
- A browser-engine installation, runner GPU, or preview transport failure is infrastructure; reproduce locally before changing product behavior.
- A Pages-only failure usually points to the repository base path, service-worker scope, or stale deployment cache.
