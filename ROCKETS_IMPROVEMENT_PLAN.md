# Rocket Module — Improvement Implementation Plan

> **STATUS: COMPLETED (2026-06). All seven tasks below (C1, C2, P1, P2, M3, UX1, UX2)
> were implemented and verified — `npm run verify:rockets` passes clean. This document
> is retained for history only; do NOT action it (the fixes are already in the code).
> Paths below reference the former `src/future/rockets/`, now `src/features/rockets/`.
> The live backlog is in `NEXT_STEPS.md`.**

Handoff doc for implementing fixes found during a deep review + stress test of the
rocket feature (`src/features/rockets/`). Each task is self-contained: problem,
evidence, root cause with `file:line`, a concrete fix, and acceptance criteria.

You do **not** need the original review conversation — everything needed is here.

> Reviewed against `main` at commit `bd7fcbd` ("Limit rocket launches to Earth
> departure"). Line numbers below match that commit. If `main` has moved, re-check
> line numbers with `grep` before editing.
>
> Note: the review originally also flagged the launch-mode selector (modes were
> functionally identical, and LEO inflated the engine speed cap). Commit `bd7fcbd`
> **removed launch modes entirely**, so those findings are resolved upstream and are
> not repeated here.

---

## Orientation (read first)

- All rocket code lives in `src/future/rockets/`. Background: `ROCKETS.md`,
  `src/future/rockets/README.md`.
- The model is intentionally **pure and closed-form in elapsed mission time**:
  `flightModel.ts` (speed/distance), `transferModel.ts` (Hohmann-style estimates +
  sampled arcs), `rocketState.ts` (`computeRocketView` composes everything into a
  scale-independent scene/telemetry view). Keep it that way — do not introduce
  incremental integration or mutate celestial-body data.
- The view is recomputed reactively as the sim clock advances. The clock ticks at
  **30 Hz** (`src/app/App.tsx` `TimeDriver`, `targetTickSeconds = 1 / 30`, line 79).
- Rendering: `RocketObject.tsx` (3D marker, arcs, target cues),
  `RocketTelemetry.tsx` (readout), `RocketLauncherPanel.tsx` (controls).

### How to verify any change

```bash
npm run verify:math          # python arithmetic checks incl. rocket transfer math
npm run verify:app           # tsx app-logic checks (imports real modules)
npx tsx scripts/stress_rockets.ts   # fuzz harness used to find these issues
npm run build                # tsc --noEmit + vite build
```

`scripts/stress_rockets.ts` sweeps every profile × destination × mission-mode ×
scale-mode × mission-time (~5k cases) and asserts no NaN/Infinity, plus targeted
behavioural probes. Against `bd7fcbd` it prints a `PROBLEMS` list with **one** item:
**C1** (`DIRECT: distanceTraveled grows after arrival`). After C1 is fixed that probe
should drop out and the list should read `none`. Treat that file as the regression
check; you may also promote it into `package.json` as a `verify:` script.

Manual QA (dev server + browser): `npm run dev`, open the rocket panel (rocket icon
in the top bar), and exercise pre-launch preview, launch, time-scrub through
arrival, and scale-mode switching. Watch the browser console for errors.

---

## Priority summary

| ID | Severity | Title | Effort |
| -- | -------- | ----- | ------ |
| C1 | 🔴 Bug | Direct-mode "Distance traveled"/"Speed" never stop after arrival | XS |
| C2 | 🔴 Correctness | `"flyby"` status is dead; `"missed"` is unreachable | S |
| UX1 | 🟠 UX | Desktop panel clips the transfer preview / telemetry on short screens | M |
| P1 | 🟠 Perf | Time-invariant arc + closest-approach recomputed every frame | M |
| P2 | 🟠 Perf | Rocket arc geometry re-allocated every frame (GC churn) | S |
| UX2 | 🟡 UX | No way to focus/follow the launched rocket | M–L |
| M3 | 🔵 Polish | Transfer "Speed" is a constant average but labeled "Speed" | XS |

Recommended order: **C1 → M3 → UX1 → P1 → P2 → C2 → UX2.**

---

## C1 — Direct-mode "Distance traveled" and "Speed" never stop after arrival

**Severity:** 🔴 Bug

**Files:** `src/future/rockets/rocketState.ts`

**Problem.** In direct-aim mode, once the rocket has "Arrived" it is visually
attached to the destination (`scenePosition` = destination, `To target = 0 km`),
but the **odometer keeps climbing** and speed keeps reading the coast value.
Observed Fusion → Neptune (parked at 30 AU): `Distance traveled` = 40 AU at +30 d →
196 AU at +120 d → **681 AU at +400 d**, with `Speed` stuck at 3,000 km/s. Transfer
mode does *not* have this bug (it caps distance at the arc length).

**Root cause.** The direct-mode return always reports the raw flight integral
regardless of the `arrived` flag computed just above it:
- `arrived` computed at `rocketState.ts:600`.
- `pathDistanceKm` (already the correctly-capped distance to intercept) computed at
  `rocketState.ts:608`:
  `directPlan.canIntercept ? Math.min(flight.distanceTraveledKm, aimDistanceKm) : flight.distanceTraveledKm`.
- But the return uses raw values: `speedKmS: flight.speedKmS` (`rocketState.ts:673`)
  and `distanceTraveledKm: flight.distanceTraveledKm` (`rocketState.ts:674`).

**Fix.** In the direct-mode return object, reuse the already-capped distance and zero
the speed once arrived:

```ts
// rocketState.ts — direct-mode return
return {
  elapsedSeconds,
  speedKmS: arrived ? 0 : flight.speedKmS,
  distanceTraveledKm: pathDistanceKm,   // was: flight.distanceTraveledKm
  // ...rest unchanged
};
```

`pathDistanceKm` is already in scope. For consistency, consider zeroing transfer
speed on arrival too: the transfer return is at `rocketState.ts:555`
(`speedKmS: averageSpeedKmS`, line 562); the local `arrived` is at
`rocketState.ts:513`. This is optional — the headline bug is distance.

**Acceptance criteria.**
- Fusion → Neptune direct, scrubbed to +400 d: `Distance traveled` equals the value
  at arrival (≈30 AU path), not 681 AU. `Speed` reads `0 km/s` (or `0.00 km/s`).
- `npx tsx scripts/stress_rockets.ts` no longer prints the
  `DIRECT: distanceTraveled grows after arrival` problem (list reads `none`).
- `npm run verify:app` still passes.

---

## C2 — `"flyby"` status is dead code; `"missed"` is unreachable

**Severity:** 🔴 Correctness / clarity

**Files:** `src/future/rockets/rocketState.ts`

**Problem.** Two of the eight advertised `MissionStatus` values can never appear:
- `"flyby"` is declared in the type (`rocketState.ts:53`) and label map
  (`rocketState.ts:63`) but is **never assigned anywhere**.
- `"missed"` is only returned at `rocketState.ts:171`
  (`closestApproachKm <= arrivalToleranceKm ? "arrived" : "missed"`), but direct aim
  always flies straight to its own bisection-computed intercept, so closest approach
  is always ≈0 → it always picks `"arrived"`. Verified across the full sweep: no
  mission ever produced `"missed"` or `"flyby"`.

**Pick one fix.**

*Option A (recommended, low-risk cleanup).* Remove the dead states so the type is
honest:
- Delete `"flyby"` from the union (`rocketState.ts:53`) and from
  `missionStatusLabel` (`rocketState.ts:63`).
- Delete `"missed"` from the union (`rocketState.ts:55`) and label
  (`rocketState.ts:65`), and simplify `rocketState.ts:171` to `return "arrived";`.
- Grep for any CSS keyed on `.rocket-status.flyby` / `.rocket-status.missed` in
  `src/app/App.css` and remove if present.

*Option B (richer, more educational — optional follow-up).* Make a bad launch
actually able to miss, so the prominent "Launch window: poor" readout has a
consequence. E.g. in transfer mode, if `launchWindowQuality === "poor"`, offset the
arrival point from the destination so closest approach > tolerance and the mission
ends `"missed"`/`"flyby"`. This is a feature, not a cleanup — only do it if product
wants launch-window quality to matter. If you do this, keep the statuses.

**Acceptance criteria.**
- No `MissionStatus` value exists that the code cannot produce (Option A), **or**
  `"missed"`/`"flyby"` are reachable via a documented scenario (Option B).
- `npm run build` passes (the `Record<MissionStatus, string>` maps must stay
  exhaustive).

---

## UX1 — Desktop panel clips the transfer preview / live telemetry on short screens

**Severity:** 🟠 UX (educational content hidden)

**Files:** `src/app/App.css`, optionally `src/future/rockets/RocketLauncherPanel.tsx`

**Problem.** On viewports ≤ ~800 px tall (common laptops, and the default preview),
the rocket panel's most important content scrolls out of view **with no affordance
that it scrolls**:
- Pre-launch: the **"Concept transfer" readout** (transfer time, phase offset, ideal
  phase, Δv, launch-window quality) — the whole "scrub time to find a launch window"
  payload — falls below the fold.
- In-flight: the lower live-telemetry rows (down through Δv) clip.

The mobile bottom sheet does **not** have this problem (it scrolls with a drag
handle and shows everything) — desktop is the weak path. (The panel now has three
selects — Profile/Target/Mode — after the launch-mode selector was removed, so it's
slightly shorter than before, but still over-tall for short viewports.)

**Root cause.** `.rocket-panel` is hard-pinned and height-starved (positioning block
in `src/app/App.css`):
```css
.rocket-panel {
  position: absolute;
  top: 312px;                                              /* App.css:1015 — assumes scale panel above is ~fixed height */
  max-height: calc(var(--app-viewport-height) - 312px - 74px);   /* App.css:1022 */
  overflow: hidden;
}
.rocket-panel-body { overflow: auto; }                    /* App.css:1026 — scrolls, but no visual hint */
```
At 720 px tall this yields only ~334 px for the panel, and the inner scroll is
invisible.

**Fix (pragmatic, do all three).**
1. **Add a scroll affordance** to `.rocket-panel-body` so users know there's more:
   a subtle bottom fade/mask and/or a styled thin scrollbar. Example:
   ```css
   .rocket-panel-body { scrollbar-width: thin; }
   .rocket-panel-body::-webkit-scrollbar { width: 6px; }
   .rocket-panel-body::-webkit-scrollbar-thumb { background: var(--hairline); border-radius: 3px; }
   /* optional: a fading mask so the cut-off row looks intentionally scrollable */
   ```
2. **Surface the educational payload first.** In pre-launch, render
   `<RocketTransferPreview>` *before* the meta/blurb (and ideally before the lower
   selects) so the transfer readout is at the top of the scroll area, not after the
   blurb. It currently renders inside the `!active` block (`RocketLauncherPanel.tsx:174`)
   after the blurb (`rocket-blurb` at `RocketLauncherPanel.tsx:182`,
   `<RocketTransferPreview>` at `RocketLauncherPanel.tsx:184`).
3. **Reclaim height.** Reduce the fixed coupling to `top: 312px`. Minimal version:
   change `max-height` to `calc(var(--app-viewport-height) - 16px)` and let the
   panel sit lower in the stacking order / overlap gracefully; better version below.

**Fix (preferred, larger).** Put the left-column overlays (scale controls + view
toggles + rocket panel) in a single flex column container so the rocket panel
naturally takes the remaining height and scrolls internally, instead of independent
`position: absolute` blocks with magic-number `top` values. *Or* on short desktop
heights route the rocket panel through the same `BottomSheet` component the mobile
layout already uses (`src/ui/BottomSheet.tsx`).

**Acceptance criteria.**
- At 1280×720, with Mars + Transfer preview selected pre-launch, the full "Concept
  transfer" readout (Transfer time → Δv total) is reachable, and it's visually
  obvious the panel scrolls.
- In-flight at 1280×720, all telemetry rows through "Delta-v" are reachable.
- No regression to the mobile bottom sheet or to taller desktop layouts.

---

## P1 — Time-invariant work recomputed every frame

**Severity:** 🟠 Performance

**Files:** `src/future/rockets/rocketState.ts`, `src/future/rockets/useRocketView.ts`

**Problem.** `computeRocketView` runs in full on every 30 Hz tick because the view
cache key includes `simulationDateMs` (`useRocketView.ts:29`, single-entry
`lastRocketView` at `useRocketView.ts:16`). Inside it, two pieces that depend only on
*(launch identity, scale mode)* — not on the current sim time — are rebuilt 30×/sec:
- `getTransferSceneArc` (`rocketState.ts:363`) rebuilds the 80-point scene polyline.
  For a **Moon (Earth-centered) transfer this is ~160 Kepler solves per frame**
  (Earth heliocentric position + scene position at each of 81 samples).
- `closestTransferApproachSoFar` (`rocketState.ts:324`) and
  `closestDirectApproachSoFar` (`rocketState.ts:200`) re-sample 41 points per frame,
  each a Kepler solve.

The heliocentric transfer *plan* (`getTransferPlan`, `rocketState.ts:297`) and the
direct-aim plan (`getDirectAimPlan`) are already cached — the scene arc and
closest-approach are the gaps.

**Fix.**
1. **Memoize the scene arc.** Add a module-level LRU cache (mirror the existing
   `transferPlanCache` pattern) keyed on `${destId}|${launchDateMs}|${mode}` and
   return the cached `Vec3[]` from `getTransferSceneArc`. It is fully determined by
   those three inputs. Cap size like `TRANSFER_CACHE_LIMIT`.
2. **Closest approach.** The closest approach over the *whole planned trajectory* is
   fixed once launch params are set; "so far" only matters before arrival. Compute
   the full-trajectory closest once per `(profile, destId, launchDateMs)` and cache
   it, then display `min(plannedClosest, currentDistance)` instead of re-scanning 41
   ephemeris points every frame. (If product specifically wants a live "closest *so
   far*" that tightens as you scrub, keep sampling but memoize the monotonic running
   min keyed on launch params and only extend the scanned tail.)

Keep all functions pure; caches are module-level and bounded, consistent with the
existing `directPlanCache`/`transferPlanCache`.

**Acceptance criteria.**
- With a Moon transfer active and the clock running, `getBodyPositionKm`/Kepler-solve
  calls per frame drop to ~O(1) for the arc (verify by temporary counter or
  profiler), with no visual change to the arc or telemetry.
- `npm run verify:app` and `npx tsx scripts/stress_rockets.ts` still pass (outputs
  unchanged within float tolerance).

---

## P2 — Rocket arc geometry re-allocated every frame (GC churn)

**Severity:** 🟠 Performance

**Files:** `src/future/rockets/RocketObject.tsx`

**Problem.** `RocketObject` allocates fresh point arrays each render and hands new
refs to drei `<Line>`, which rebuilds its `BufferGeometry` every frame:
- `completedTransferPoints` rebuilt at `RocketObject.tsx:123`.
- full-arc `<Line points={transfer.arcScenePoints}>` at `RocketObject.tsx:132`
  (after P1, `arcScenePoints` becomes a stable ref and this line stops churning).

This is the same GC-churn class fixed for orbit rings in commit `402c944`
("orbit-ring GC churn"); the rocket arc still has it.

**Fix.**
- After P1 stabilizes `arcScenePoints`, the static full-arc `<Line>` will stop
  rebuilding — verify it does. Wrap it / its `points` in `useMemo` if needed.
- The progress overlay (`completedTransferPoints`, used by the `<Line>` at
  `RocketObject.tsx:140`) inherently changes each frame (it shows progress). Minimize
  churn: `useMemo` on `[transfer.arcScenePoints, progressIndex, view.scenePosition]`
  so it only rebuilds when progress actually advances a sample.

**Acceptance criteria.** With a transfer active and the clock running, at most one
`<Line>` geometry rebuilds per frame (the progress overlay), and zero when the clock
is paused. No visual regression to the arc, progress fill, or markers.

---

## UX2 — No way to focus or follow the launched rocket

**Severity:** 🟡 UX (larger; needs a little design)

**Files:** `src/future/rockets/RocketLauncherPanel.tsx` (or `RocketTelemetry.tsx`),
`src/scene/CameraRig.tsx`, `src/simulation/selectionStore.ts`; pattern reference:
`src/ui/ObjectInspector.tsx` (existing planet **Focus**/**Follow** buttons).

**Problem.** Planets have Focus/Follow; the rocket you just launched has neither,
and its in-scene `<Html>` label is not clickable (a known limitation — drei `<Html>`
`onClick` is a runtime no-op). At Map/Real scale the marker is hard to find, with no
way to center the camera on it.

**Approach (sketch — confirm with product before building).** The rocket is not a
`CelestialBody`, so it can't go through the normal `selectionStore` body-id path.
Minimal viable version: a **"Focus rocket"** button in the panel that frames the
camera on the rocket's current `view.scenePosition`. Either:
- extend `CameraRig` to accept an optional non-body focus target (a `Vec3` provided
  by the rocket store), and have the button set it; or
- add a one-shot "center camera here" camera action and call it with
  `view.scenePosition`.

Decide whether it's one-shot **Focus** (frame once) or continuous **Follow** (camera
tracks the moving rocket each frame). Follow is more useful but needs the camera to
read the live scene position every frame.

**Acceptance criteria.** From the rocket panel, the user can center the camera on the
active rocket in any scale mode; if "Follow" is implemented, the camera keeps the
moving rocket framed as the clock advances. No interference with existing body
focus/follow.

---

## M3 — Transfer "Speed" is a constant average but labeled "Speed"

**Severity:** 🔵 Polish

**Files:** `src/future/rockets/RocketTelemetry.tsx`

**Problem.** In transfer mode, `speedKmS` is `plan.estimate.meanTransferSpeedKmS`
(`rocketState.ts:542`) — a vis-viva mean of departure and arrival speeds, constant
for the whole flight (verified: 27.10 km/s at both 10 d and 200 d). It's shown under
a plain "Speed" label (`RocketTelemetry.tsx:76-77`), implying instantaneous speed; a
student sees a transfer "speed" that never changes while real heliocentric speed
swings (~21–32 km/s for Earth→Mars).

**Fix (cheapest honest version).** When `view.missionMode === "transfer"`, label the
row **"Avg speed"** instead of "Speed" (`RocketTelemetry.tsx:76`). A fuller fix —
sampling true vis-viva speed along the ellipse — is out of scope and conflicts with
the deliberate constant-rate arc; relabeling is sufficient.

**Acceptance criteria.** Transfer telemetry shows "Avg speed"; direct/free-flight
still show "Speed". No numeric change.

---

## Notes for the implementer

- Keep `flightModel.ts` and `transferModel.ts` pure (no React/Three/data imports
  beyond what's there). Math changes must be mirrored in the Python checks per
  `src/future/rockets/README.md` ("Add or update Python math verification whenever
  changing arithmetic") — see `scripts/verify_rocket_transfer_math.py`.
- Don't mutate celestial-body data; destinations reference existing body IDs.
- After each task, run the four verification commands in **Orientation**. The
  stress harness is the fastest regression signal; the build catches type/exhaustive
  -map breakage.
