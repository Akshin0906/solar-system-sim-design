# Quality and release checks

The project combines deterministic model verification with browser-level interaction checks. A green production release must pass both: numerical correctness alone cannot catch a blank WebGL scene, and visual QA alone cannot validate orbital math.

## Automated checks

| Command | Coverage |
| --- | --- |
| `npm run lint` | TypeScript, React Hooks, and JSX accessibility rules. |
| `npm run typecheck` | Application, verification scripts, Playwright config, and browser tests. |
| `npm run test:unit` | Node unit tests for production render-quality and scenario-input validation, with scoped 100% line, branch, and function coverage gates. |
| `npm test` | Unit tests, app-state invariants, rocket sweeps, scenario conservation/stability, and service-worker ownership. |
| `npm run verify:performance` | Production cold-asset budgets and the maximum-fragment live integrator workload. |
| `npm run verify:math` | Orbits, JPL comparisons, coordinate frames, orientations, scale/camera math, transfers, scenarios, texture budgets, and experiences. |
| `npm run build` | Root-path production bundle and generated service worker. |
| `npm run build:github` | Complete Pages artifact at `/solar-system-sim-design/`, including build identity and final service worker. |
| `npm run test:e2e` | Chromium desktop/mobile, normal and reduced motion, Firefox/WebKit cross-browser checks, console errors, and offline reload. |
| `npm run test:e2e:pages` | Build and test the exact repository-prefix artifact, including generated provenance and service-worker assets. |
| `npm run check` | Full static, model, behavior, and production-build gate. |
| `npm run check:release` | `check` plus a fresh Pages-prefix build tested by the browser suite. |

The unit coverage threshold intentionally applies only to
`src/scene/renderQuality.ts` and `src/scenarios/scenarioValidation.ts`. Node's
built-in coverage maps those modules back to their TypeScript sources reliably in
this repository. The focused 100% gate protects the boundary, clamping, choice,
projection, LOD, and geometry-sharing branches exercised there without presenting
that number as whole-application coverage; stateful simulations and browser behavior
remain covered by the deterministic and Playwright suites listed above.

Install the Playwright browsers once before a local release run:

```bash
npx playwright install chromium firefox webkit
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
3. Confirm the manifest, PNG icons, hashed JavaScript/CSS, textures, service worker,
   and `build-info.json` return successfully.
4. Load once online, wait for the service worker, disable the network, and reload.
5. Restore the network and verify no stale cache serves a previous asset manifest
   or a previous release's bytes for a changed same-path texture. Runtime texture
   keys include each file's SHA-256 identity, so unchanged visited textures remain
   reusable while superseded identities are pruned.

GitHub Actions performs these checks on pull requests and pushes to `main`. A
successful push checks the tip of `main` before uploading the already-tested Pages
artifact and checks it again immediately before deployment. An out-of-order stale
run completes without deploying. The deployment then verifies the live HTML,
manifest, service worker, and generated build identity against the repository,
ref, workflow commit, clean-worktree state, and run URL.

Pull requests and feature-branch validation runs have ref-isolated concurrency;
deploy-capable `main` runs share a single cancelling group. GitHub CodeQL default
setup separately scans JavaScript/TypeScript, Python, and workflow definitions on
pull requests, `main`, and its scheduled cadence. A release requires both the
application gate and code scanning to complete successfully on the released commit.

The same `npm run build:github` command is the supported local artifact flow. Its
`build-info.json` records the local `HEAD`; a dirty worktree is explicitly marked
with `"dirty": true` rather than being presented as an exact committed artifact.

## Reporting failures

When a check fails, separate product defects from environment failures:

- A deterministic verifier mismatch is a model or source-contract defect until explained.
- A browser assertion or console error is an app defect unless the trace shows a browser/GPU startup failure.
- A browser-engine installation, runner GPU, or preview transport failure is infrastructure; reproduce locally before changing product behavior.
- A Pages-only failure usually points to the repository base path, service-worker scope, or stale deployment cache.

### Client diagnostics

Render failures, uncaught browser errors, rejected promises, WebGL initialization
failures, context loss, and service-worker registration failures are recorded as a
bounded, privacy-conscious diagnostic list in session storage. Recovery screens
expose a **Copy diagnostics** action so a visitor can attach the build identifier,
browser, viewport, path, and truncated stack to a bug report. URL query/hash state
is stripped, and saved preferences are never read into the report.

Deployments that provide a same-origin `VITE_ERROR_REPORT_ENDPOINT` also send the same JSON record with `navigator.sendBeacon`. Same-origin enforcement preserves the app's restrictive connection policy. The endpoint is optional: reporting failures never block recovery, and the application does not collect diagnostics remotely unless that build-time setting is explicitly configured. See [`.env.example`](../.env.example) for the opt-in setting.
