# Implementation Prompt: Solar System Sim — UI/UX Fixes

You are implementing a prioritized set of UI/UX fixes for a 3D solar-system web app. This
document is self-contained: every task lists the file, the evidence, the root cause, the
exact change, and how to verify it. Work top-down (Phase 1 is highest impact). You may ship
phases as separate commits/PRs.

---

## 0. Project context & ground rules

**Stack:** Vite + React 19 + `@react-three/fiber` + `three@0.170` + `@react-three/drei` +
`zustand`. TypeScript. PWA/offline. Source under `src/` (`app/`, `ui/`, `scene/`,
`simulation/`, `data/`, `future/rockets/`). Styling is one global stylesheet:
`src/app/App.css` with CSS design tokens in `:root`.

**Design intent (do not violate):** "Apple-style minimal, calm, polished, uncluttered."
Fullscreen 3D scene, no landing page, UI floats lightly over the canvas, restrained corner
radii, sparse text, no on-canvas tutorial copy. Preserve the existing desktop 4-corner panel
layout and the mobile (`≤900px`) canvas-first bottom-sheet layout — both are good; you are
refining, not redesigning.

**Constraints:**
- Do NOT change orbital math or data files unless a task explicitly says so. The Keplerian
  solver is validated against JPL; keep it that way.
- Keep changes minimal and in the style of the surrounding code.
- Match existing CSS token usage (`--surface`, `--hairline`, `--muted`, `--gold`, `--cyan`,
  `--radius`, etc.). Don't introduce a new color language.

**Build / test commands (run after each phase):**
- `npm run dev` — dev server (Vite, port 5173).
- `tsc --noEmit` — typecheck (must pass).
- `npm test` — runs `scripts/verify_app_logic.ts` (app-logic invariants; must pass).
- `npm run verify:math` — Python orbit/scale verifiers. Only required if you touch
  `src/simulation/*` or `src/data/*`.
- `npm run build` — full `tsc + vite build + service worker`; run before final handoff.

### Runtime verification harness (READ THIS — it is load-bearing)

Several of these bugs are **invisible to static code review** — the source looks correct but
behaves wrong at runtime (Task 1.1 is the canonical example: a code reviewer will tell you
the handler is fine; it is not). **You MUST verify interactive fixes in the running app, not
by reading the code.**

To drive the live app deterministically:
1. Start the dev server and open the page (Claude Preview MCP `preview_*` tools, or a browser
   with devtools).
2. **The sim clock is `requestAnimationFrame`-driven** (`TimeDriver` in `src/app/App.tsx`),
   so it only advances while rendering. For any test that depends on element positions being
   stable, **pause the clock first** (click play/pause, or the scene keeps moving and labels
   shift under your cursor between "find element" and "click element").
3. To test selection by clicking a scene label, in the page console:
   ```js
   // pause, select a known body, then:
   const el = [...document.querySelectorAll('.body-label')].find(l => l.textContent.trim()==='Mars');
   el.id = 'probe';
   // confirm it is the topmost element at its center (no overlap):
   const r = el.getBoundingClientRect();
   document.elementFromPoint(r.x+r.width/2, r.y+r.height/2) === el; // expect true
   // then click and read selection:
   el.click();
   document.querySelector('.inspector-heading h2')?.textContent; // should become "Mars"
   ```
   `.inspector-heading h2` (desktop) reflects the currently selected body.

---

## Phase 1 — Selection & interaction (highest impact)

### Task 1.1 — Scene labels are not clickable (dead `onClick`); make them select + keyboard-focusable

**Problem:** Clicking a planet/moon's on-screen label does nothing. The label shows
`cursor: pointer` (advertising clickability) but never selects. Because the label sits over
the body with `pointer-events: auto`, it also intercepts clicks meant for the 3D sphere
beneath it, creating a dead zone around every body. Selection currently works only via the
3D sphere raycast (a tiny target) or the search palette.

**Evidence / root cause:** `src/scene/BodyMesh.tsx` renders the label as a drei `<Html>`
(~lines 340–356) with `onClick={(e) => { e.stopPropagation(); focusBody(body.id); }}`
(~line 349). **This React `onClick` does not fire at runtime** — verified empirically: a raw
`addEventListener('click')` attached to the same `.body-label` node DOES fire (native events
reach it), but `focusBody` never runs and selection does not change. drei `<Html>` is not
delivering its `onClick` prop through React's event delegation in this portal setup. The
sphere mesh's `onClick` (`handleClick` → `focusBody`, ~lines 211–217) works fine.

**Fix (unified with keyboard accessibility — see Task 4.1):** Render the label content as a
real, focusable `<button>` and wire selection so it does **not** depend on drei's `<Html>`
`onClick`. Two acceptable implementations; prefer (A):

- **(A) Native listener via ref (guaranteed to work — proven at runtime):** keep/restructure
  the `<Html>`, render `<button class="body-label …" ref={labelBtnRef} tabIndex={0}>{name}</button>`
  inside it, and attach the handler imperatively:
  ```tsx
  useEffect(() => {
    const el = labelBtnRef.current; if (!el) return;
    const select = (e: Event) => { e.stopPropagation(); focusBody(body.id); };
    el.addEventListener('click', select);
    return () => el.removeEventListener('click', select);
  }, [body.id, focusBody]);
  ```
  (A keyboard `<button>` already activates on Enter/Space and dispatches a `click`, so the
  same listener covers keyboard.)
- **(B) `<button onClick>`** as the label, THEN verify at runtime. If the React `onClick` on
  the child button fires (it may, since the problem is specific to `<Html>`'s own prop, not
  child elements), keep it. If it does NOT fire, fall back to (A).

Move the `body-label` styling onto the `<button>` (reset default button styles: `border`,
`background`, `font`, `padding` already handled by the `.body-label` rule — add
`appearance: none` and inherit font). Keep `pointer-events: auto`.

**Files:** `src/scene/BodyMesh.tsx` (label render), `src/app/App.css` (`.body-label` ~939–953
— ensure it works as a `<button>`: add `appearance: none; font: inherit; color: inherit;`).

**Verify (REQUIRED, runtime):** Use the harness above. With the clock paused, click the
Mars label → inspector must switch to "Mars". Click an empty area of a planet's disk → still
selects via raycast. Tab through the page → labels are reachable and Enter selects. Confirm
on both desktop and mobile (`≤900px`) viewports.

### Task 1.2 — Selecting a body should not force the camera into focus mode

**Problem:** Every selection path force-sets `cameraMode: "focus"`, yanking the user out of
their current framing (overview/inner/outer) into a tight focus shot they didn't request —
even though the inspector already has an explicit **Focus** button.

**Evidence:** `src/simulation/selectionStore.ts:18` —
`focusBody: (selectedId) => set({ selectedId, cameraMode: "focus" })`. There is an unused
`setSelectedId` (line 16). All four selection entry points call `focusBody`:
`BodyMesh.tsx` mesh click (~213) and label (~349), `SearchCommand.tsx:62`,
`ObjectInspector.tsx:86` (moon chips).

**Fix:** Separate "select" from "frame". Implement one of:
- Preferred: a `select(id)` action that sets `selectedId` only, and **conditionally** keeps
  the camera coherent — keep the current `cameraMode` unless it is `"free"` (in which case
  leave it free) or `"focus"`/`"follow"`/`"moons"` already targeting a body (re-point those
  at the new selection). Route mesh click, label click, search, and moon chips through
  `select`. Leave the explicit Focus/Follow/Moons buttons in `ObjectInspector` calling
  `setCameraMode` as today.
- Minimum viable: change the four entry points to `setSelectedId(id)` (no camera change), and
  rely on the existing Focus button for framing.

Keep the `CameraRig` "moons"/"focus"/"follow" logic reading `selectedId` so re-pointing works.

**Files:** `src/simulation/selectionStore.ts`, `src/scene/BodyMesh.tsx`,
`src/ui/SearchCommand.tsx`, `src/ui/ObjectInspector.tsx`.

**Verify:** Click "Inner planets" preset, then click a planet → the inner framing is
preserved (camera does not snap to a tight focus). Click the inspector's **Focus** → it does
snap. Search-select a body from overview → overview framing preserved, inspector updates.

### Task 1.3 — Dragging silently invalidates the active camera-mode button; give feedback

**Problem:** Any drag flips `cameraMode` to `"free"`, and whichever mode button was lit
(overview/inner/outer in ScaleControls, or focus/follow/moons in the inspector) just goes
dark with no transition or indication. The user can't tell what happened or how to get back.

**Evidence:** `src/scene/CameraRig.tsx:189–193` — OrbitControls `onStart` →
`setCameraMode("free")` with no movement threshold. Mode buttons key their `active` class on
exact equality, so they binary-toggle off.

**Fix (pick the lightest that reads well):**
- Add a visible **"Free look"** state: when `cameraMode === "free"`, show a small, calm
  indicator (e.g., a subtle pill near the camera controls, or a neutral "Free" affordance in
  the ScaleControls `view-buttons` group) so the lit/unlit states always sum to the true
  mode. AND/OR
- Keep the previously-active button in a "paused/dimmed-active" style (not fully off) when you
  drop to free, with a CSS transition so the change is legible rather than a hard flip.
- Optionally add a small drag threshold before dropping to `"free"` so a 1px nudge doesn't
  kill follow/focus.

**Files:** `src/scene/CameraRig.tsx`, `src/ui/ScaleControls.tsx` (and/or a small new
indicator), `src/app/App.css`.

**Verify:** Enter "Outer planets", drag → you can tell you're now in free look; re-clicking a
preset re-frames smoothly (it's a damped lerp, not a hard snap).

---

## Phase 2 — Scene legibility

### Task 2.1 — Lighting: lift the night-side and keep the outer system from fading to black

**Problem:** Roughly half of every planet crushes to near-black, and the outer planets
(Jupiter→Pluto) progressively darken even on their day side in the wide overview the app is
built for.

**Evidence:** `src/scene/Lighting.tsx` (~lines 3–7): `ambientLight` intensity `0.045` color
`#526174` (cold blue, tints shadows blue); sun `pointLight` intensity `520`, `distance 560`,
`decay 1.38` (so brightness falls off sharply with distance); a one-sided `directionalLight`
`0.24` `#7f9dff` is the only night-side fill; `hemisphereLight 0.11`. Planets use
`meshStandardMaterial` with `emissive #000000` (`BodyMesh.tsx` ~262) and there is no
environment map. Compounding: scene `fog` `['#050609', 150, 590]` in `SolarScene.tsx` (~114)
fades distant geometry to near-black, and the default scale mode is `compressed`.

**Fix:**
- Raise the ambient fill to ~`0.12`–`0.18` and change its color to warm-neutral (e.g.
  `#3a3a3c`/`#403b34`-ish) so shadows are dim, not blue.
- Re-tune the sun `pointLight` so outer planets stay lit in overview: increase `distance`
  (e.g. toward `1000+`) and/or lower `decay` toward `1.0`, or add a second very-low-intensity
  sun-tracking light dedicated to the far system. Verify the inner planets don't blow out
  (watch the ACES tone-mapping at exposure 1.08 in `App.tsx`).
- Re-examine `fog` far distance (590) so Neptune/Pluto/Eris in `readable`/`compressed` aren't
  fogged to black; push `far` out or reduce fog density.
- Demote or neutralize the cold `directionalLight` (lower intensity / neutral color) so there
  is one clear warm key (Sun) plus a soft neutral fill, per "Sun emits warm light."

**Files:** `src/scene/Lighting.tsx`, `src/scene/SolarScene.tsx` (fog).

**Verify (visual):** In `Compact` + overview, every planet reads with a visible lit disk;
the night terminator is dim, not black; Neptune/Pluto are legible. Switch to `Real`/`Map` and
confirm no blown-out inner planets. No math tests affected.

### Task 2.2 — Label de-collision + edge clamping

**Problem:** Scene labels overlap into unreadable stacks (inner planets near the Sun; moon
labels on Saturn), clip off the viewport edge ("Venus"→"enus"), and at narrow desktop widths
collide with the inspector panel. There is no de-collision today.

**Evidence:** Labels are independent drei `<Html>` per body (`BodyMesh.tsx` ~340–356);
`src/scene/labelScaling.ts` only computes a per-label CSS scale, no collision/occlusion logic.
`SolarScene.tsx` chooses which ids get labels (`labelDensity`) but never de-conflicts them.

**Fix:** Add a screen-space de-collision pass for visible labels. Approach (keep it cheap):
- In a `useFrame` (or a throttled effect) compute each visible label's projected screen
  position, sort by priority (selected > planet > dwarf > moon, or by camera distance), and
  hide/fade labels whose screen-space rect overlaps a higher-priority already-placed label.
  Toggle a `quiet`/hidden class rather than unmounting.
- Clamp label screen position (or just let overflow hide) so labels never render partly
  off-screen; at minimum, suppress labels whose anchor projects outside the viewport.
- Optionally nudge colliding labels with a small vertical offset before hiding.
Keep it framerate-friendly (only recompute when the camera or positions change meaningfully;
you already throttle elsewhere). Do not break the "selected body is always labeled" rule.

**Files:** `src/scene/labelScaling.ts` and/or a new small `labelLayout` helper,
`src/scene/SolarScene.tsx`, `src/scene/BodyMesh.tsx` (consume a "suppressed" flag),
`src/app/App.css` (a faded/hidden label state).

**Verify:** In `Real` and `Compact`, the inner-planet labels no longer stack illegibly; focus
Saturn and confirm moon labels don't pile up; no label is half-clipped at the frame edge.

### Task 2.3 — Sun corona: soft falloff instead of hard-edged shells

**Problem:** The Sun's glow is two additive constant-opacity spheres, so it renders as a flat
disk with a crisp silhouette — not the "gentle glow" the design asks for. It's the brightest
element on screen, so the hardness reads as cheap.

**Evidence:** `src/scene/BodyMesh.tsx` ~220–239 — two additive `meshBasicMaterial` shells
(`×2.6 @ 0.08`, `×1.55 @ 0.14`) with no radial falloff. A proper rim shader already exists for
planet atmospheres (~76–89). No bloom/post-processing in the project.

**Fix:** Give the corona a real radial/rim falloff — either reuse the atmosphere rim shader
(`pow(1 - dot(normal, viewDir), power)`) on a back-side shell, or use a camera-facing
radial-gradient sprite/billboard for soft falloff. Keep it warm (`#f7b260`/`#ffd08a` family).
(Optional, larger: a single selective bloom pass would unify Sun glow + ring highlights +
selection halo — only do this if you're comfortable adding `postprocessing` and profiling it.)

**Files:** `src/scene/BodyMesh.tsx` (star branch).

**Verify (visual):** The Sun glow fades smoothly to transparent with no hard ring; inner
planets still read against it.

### Task 2.4 — Make the selection cue visible when zoomed out

**Problem:** The in-scene "what's selected" cue is imperceptible unless you're zoomed in: the
halo is `opacity 0.025` and the rings are ~1% of the body radius, so on small/distant bodies
selection relies entirely on the (now-fixed) label.

**Evidence:** `src/scene/BodyMesh.tsx` ~314–339 — halo sphere `opacity 0.025`; three torus
rings with tube radius `visualRadius * 0.018 * {0.62,0.42,0.42}`.

**Fix:** Thicken the primary equatorial selection ring (tube ~3–4% of `visualRadius`) and
raise the halo to a perceptible-but-soft level (~`0.06`–`0.1`). Better: add a faint
**constant-screen-size** ring/marker (size compensated by camera distance, like the labels)
so selection reads even on a 2px-wide distant body. Keep it "quietly unmistakable," not a loud
outline (per design).

**Files:** `src/scene/BodyMesh.tsx`.

**Verify:** Select Saturn, pull the camera back to overview — you can still tell Saturn is
selected without reading the label.

---

## Phase 3 — Mobile

### Task 3.1 — Surface the absolute simulation date on mobile

**Problem:** On phones (`≤900px`) there is no visible absolute calendar date anywhere — only
a relative delta ("now", "+3.2 yr"). For a time-scrubbing app that's a core feature you can't
read on mobile.

**Evidence:** `src/app/App.css:1340–1342` hides `.top-date { display: none }` at `≤900px`;
the absolute date is rendered only in `TopBar.tsx:72–75`. The mobile speed chip/sheet show
only `speedLabel` + `nowDeltaLabel` (`TimeControls.tsx` ~54, ~136). A `scrubDateFormatter`
already exists (`TimeControls.tsx:13–17`).

**Fix:** Show the absolute date on mobile. Cleanest: add a compact date line in the **Speed &
time** bottom-sheet header (reuse `scrubDateFormatter`), and/or in the inspector peek bar.
Keep it minimal/muted.

**Files:** `src/ui/TimeControls.tsx`, `src/app/App.css`.

**Verify (mobile viewport):** Open the Speed & time sheet → the current sim date is visible
and updates as you scrub the timeline.

### Task 3.2 — Add a touch/tablet tier (don't ship desktop targets to iPad landscape)

**Problem:** The only breakpoint is width-only `(max-width: 900px)`, so an iPad in landscape
(>900px) gets the full desktop layout with 34px hover-first targets, and rotating to portrait
swaps to a totally different UI.

**Evidence:** `src/ui/useMediaQuery.ts:31` `MOBILE_QUERY = "(max-width: 900px)"`; only
`@media (max-width:900px)` and `(max-width:640px)` exist in CSS; no `pointer`/`hover` query.

**Fix:** Gate the touch (bottom-sheet) layout on coarse pointers as well as width, e.g.
`(max-width: 900px), (pointer: coarse)` — so touch tablets get the sheet UI. If you keep
desktop layout for large touch screens instead, add a tablet/touch tier that bumps the
sub-44px targets (see Task 4.5) and removes hover-only reveals. Update both `useMediaQuery`
(JS `isMobile`) and the CSS so they stay in lockstep (there's a comment noting they must
match).

**Files:** `src/ui/useMediaQuery.ts`, `src/app/App.css`.

**Verify:** Emulate a coarse-pointer device >900px wide → it uses the touch/sheet layout (or
the bumped-target tablet layout), not 34px hover buttons.

---

## Phase 4 — Accessibility

### Task 4.1 — Keyboard selection of bodies (folds into Task 1.1) + camera keyboard control

**Problem:** A keyboard-only user cannot select any body by keyboard (labels aren't focusable,
the sphere is raycast-only) and cannot move the camera at all (OrbitControls has no keyboard
config). Search is the only keyboard path to selection.

**Evidence:** `BodyMesh.tsx` label has only `onClick`, no `role`/`tabIndex`/`onKeyDown`;
`CameraRig.tsx:182–194` OrbitControls has no `listenToKeyEvents`/`keys`. Global shortcuts
(`App.tsx`) cover only Space/←/→/`/`/Cmd-K/Esc.

**Fix:**
- Labels-as-`<button>` from Task 1.1 already make them tab-reachable and Enter/Space-select.
  Ensure tab order is sane (selected/major bodies first is fine; don't trap focus on tiny
  belt/moon labels you de-prioritize).
- Enable camera keyboard control: pass `listenToKeyEvents={window}` (or the canvas) and a
  `keys` mapping to `<OrbitControls>`, OR document the existing transport bindings and add
  arrow-key camera nudge. At minimum, rotate/zoom should have a keyboard path.

**Files:** `src/scene/BodyMesh.tsx`, `src/scene/CameraRig.tsx`.

**Verify:** Tab to a planet label, press Enter → selects. With the canvas focused, arrow keys
move the camera.

### Task 4.2 — Screen-reader: announce simulation state; give the canvas a text alternative

**Problem:** The 3D scene is a silent black box to assistive tech — no `aria-label` on the
canvas, no live announcement of selection/date/play/speed. The only `aria-live` in the app is
the WebGL-failure panel.

**Evidence:** `App.tsx:201–224` Canvas has no `role`/`aria-label`; no `role="status"` / visually
-hidden live region anywhere.

**Fix:** Add a visually-hidden (`sr-only`) `role="status" aria-live="polite"` region driven
from the selection + time stores that announces changes like
"Mars selected · June 2026 · paused · 1 day/sec". Give the `<Canvas>` (or an adjacent
off-screen summary) a dynamic `aria-label`/`role="img"` describing the current state. Add an
`.sr-only` utility class to `App.css`.

**Files:** `src/app/App.tsx` (or a small `LiveRegion` component), `src/app/App.css`.

**Verify:** With a screen reader (or by inspecting the live region's text), selecting a body
and toggling play announces the change.

### Task 4.3 — Fix contrast failures (`--quiet` text and `quiet-label`)

**Problem:** Some text fails WCAG AA. `--quiet` (~3.7:1) is used as text on disabled rocket
selects, the search placeholder, and rocket notes; the `quiet-label` tier (~2.5:1) is used for
de-emphasized scene labels.

**Evidence:** `App.css:16` `--quiet: rgba(245,241,232,0.42)`; used at ~249 (placeholder),
~1261 (`.rocket-note`), ~1046 (disabled select). `.body-label.quiet-label { opacity: 0.36 }`
(~966–968) over `.body-label` (color `0.84`, bg `0.56`).

**Fix:** Introduce a text-grade muted token (~`rgba(245,241,232,0.55)`, ≥4.5:1 on the panel
surfaces) and use it wherever `--quiet` carries actual text; keep `0.42` only for non-text
hairlines/decoration. Raise `.quiet-label` opacity from `0.36` to ~`0.5`–`0.55` so dimmed
labels still clear 3:1. (`--muted` at 0.62 is fine; leave it.)

**Files:** `src/app/App.css`.

**Verify:** Spot-check the search placeholder, a disabled rocket "Mode" select, and a
de-emphasized scene label against a contrast checker (≥4.5:1 for the text, ≥3:1 for labels).

### Task 4.4 — Honor `prefers-reduced-motion`

**Problem:** No reduced-motion handling at all — camera lerps, sheet slide-in, CSS transitions
are unconditional. (Planet rotation is sim-clock-driven, so it halts on pause; leave it or
optionally still it under reduced motion.)

**Evidence:** Zero `prefers-reduced-motion` matches in the repo. `@keyframes sheet-in` +
transitions in `App.css` (~781, ~929–937, ~188); camera damping/lerps in `CameraRig.tsx`.

**Fix:** Add `@media (prefers-reduced-motion: reduce)` in `App.css` to disable `sheet-in` and
zero/shorten UI transitions. In JS, read `matchMedia('(prefers-reduced-motion: reduce)')`
(reuse the existing `useMediaQuery` hook) and snap camera transitions instead of lerping (skip
the damping in `CameraRig`'s `useFrame`).

**Files:** `src/app/App.css`, `src/scene/CameraRig.tsx`, `src/ui/useMediaQuery.ts` (export a
`useReducedMotion` helper).

**Verify:** With OS "reduce motion" on, sheets appear without sliding and camera jumps rather
than glides.

### Task 4.5 — Touch-target sizes and `aria-pressed` on toggles

**Problem:** Several interactive controls are 26–34px (below the 44px touch comfort
guideline), and active/selected state is conveyed by color only (no `aria-pressed`/
`aria-current`).

**Evidence (App.css):** `.icon-button` 34×34 (~181), `.segmented-control button` min-height
30 (~369), `.moon-list button` 26 (~514), `.rocket-icon-button` 28 (~1015),
`.inspector-actions button` 34 (~534). `aria-pressed` exists only on the mobile-gated TopBar
buttons (`TopBar.tsx` ~100/111); the segmented scale/camera buttons, inspector Focus/Follow/
Moons, and the desktop direction toggle have none.

**Fix:**
- On touch-reachable controls, reach ≥44px min target (grow the box, or add invisible
  hit-padding so the visual stays compact). Prioritize the 26px moon chips and 30px segmented
  control on mobile.
- Add `aria-pressed={isActive}` to toggle buttons (inspector Focus/Follow/Moons, camera view
  buttons, direction toggle, desktop search/rocket) and `aria-current`/radio semantics to the
  single-select scale segmented group.

**Files:** `src/app/App.css`, `src/ui/ScaleControls.tsx`, `src/ui/ObjectInspector.tsx`,
`src/ui/TimeControls.tsx`, `src/ui/TopBar.tsx`.

**Verify:** Inspect targets on a mobile viewport (≥44px); a screen reader announces the
pressed/selected state of scale mode and camera buttons.

---

## Phase 5 — Perceived performance & first impression

### Task 5.1 — Add a loading affordance (kill the black-screen first paint)

**Problem:** First load is a black screen under the floating chrome for a couple of seconds.
`Suspense fallback={null}` and an empty `#root` mean nothing paints until the bundle boots.

**Evidence:** `App.tsx:221` `<Suspense fallback={null}>`; `index.html` `#root` is empty.

**Fix:** Add an **inline pre-hydration splash** in `index.html` (a centered minimal mark / thin
progress bar styled with the theme background `#090907`) so something paints before React
mounts; remove it on first render. (Note: changing `fallback={null}` alone does little because
the boundary rarely suspends — the splash is the high-value fix.) Optionally wire a
`three.js` `LoadingManager` to a thin top progress bar.

**Files:** `index.html`, optionally `src/app/App.tsx` / `src/main.tsx`.

**Verify:** Hard-reload with cache disabled → something calm is visible immediately, not black.

### Task 5.2 — Don't block first paint on synchronous procedural textures; preload/crossfade images

**Problem:** On first commit, all ~29 bodies generate surface/bump/cloud textures synchronously
(768×384 px noise+crater loops) on the main thread, freezing first frames. Then the ~6 bodies
with `.jpg` textures pop in seconds later (hard swap over the procedural surface; ~3.5MB of
large JPGs).

**Evidence:** `BodyMesh.tsx` ~146–150 build textures in `useMemo` unconditionally; `~91–133`
loads images imperatively per body with a fresh `TextureLoader` and hard-swaps
(`imageSurfaceTexture ?? proceduralSurfaceTexture`, ~148). No preload/shared loader.

**Fix:**
- Get the scene painting fast: render bodies with their flat `baseColor` (or a tiny placeholder)
  immediately and generate the procedural texture asynchronously — e.g. an
  `requestIdleCallback` queue that yields between bodies, or an OffscreenCanvas Web Worker.
- For image planets: `<link rel="preload" as="image">` the visible planet JPGs in `index.html`
  (or drei `useTexture`), share one `TextureLoader`/`LoadingManager`, and **crossfade**
  procedural→image instead of a hard swap.

**Files:** `src/scene/BodyMesh.tsx`, `src/scene/planetVisuals.ts`, `index.html`.

**Verify:** First paint shows the scene quickly (no multi-second freeze); planet textures fade
in rather than popping. Frame rate stays smooth on a mid device.

### Task 5.3 — Stop re-rendering the whole scene + panels every clock tick

**Problem:** The 30Hz sim clock re-renders the entire scene tree plus `TopBar` and
`TimeControls` every tick just to advance time, multiplying the cost of everything else and
showing as input lag while dragging during playback.

**Evidence:** `SolarScene.tsx:19` subscribes to `simulationDateMs` (recomputes positions every
tick); `TopBar.tsx:25` and `TimeControls.tsx:40` subscribe to it only to format a date string,
re-rendering 30×/s. `TimeDriver` ticks at 1/30s (`App.tsx:79–88`).

**Fix:** Decouple the visual tick from React. Read time transiently inside `useFrame` (via a
ref or a transient zustand subscription) so `BodyMesh` positions update without re-rendering
`SolarScene`. Throttle the date-label panels: subscribe to a derived day/minute bucket (or
update the label off a ~1s interval) so `TopBar`/`TimeControls` don't re-render every frame.
Don't change the math or the displayed values' correctness.

**Files:** `src/scene/SolarScene.tsx`, `src/ui/TopBar.tsx`, `src/ui/TimeControls.tsx`,
possibly `src/simulation/timeStore.ts`.

**Verify:** With React DevTools' "highlight updates", `TopBar`/`TimeControls` no longer flash
30×/s during playback; dragging the camera while playing feels smoother. `npm test` still
passes (don't regress clock behavior). Optional: cut belt particle counts on mobile
(`belts.ts` 2800/2100) gated on `isMobile` where the geometry is built (`BeltCloud.tsx`).

### Task 5.4 — Recover from WebGL context loss instead of dead-ending

**Problem:** A transient GPU context loss (routine on mobile) tears the whole scene down to the
same full-screen "WebGL unavailable" panel used for "no WebGL at all", requiring a manual
Retry and losing scene state.

**Evidence:** `App.tsx:211–218` adds `webglcontextlost` with `{ once: true }` →
`webglUnavailable = true`; no `webglcontextrestored` handler. It already calls
`event.preventDefault()` (the signal that you intend to restore).

**Fix:** Add a `webglcontextrestored` listener that rebuilds the renderer and resumes
automatically. Treat `contextlost` as a soft "pausing" overlay (keep the UI) rather than the
hard no-WebGL fallback, and only show manual Retry if restore doesn't fire within a timeout.

**Files:** `src/app/App.tsx`.

**Verify:** Trigger context loss via the dev tools `WEBGL_lose_context` extension → the scene
restores automatically without the full-screen error.

---

## Phase 6 — Microcopy & polish

Small, high-clarity wins. Each is a 1–5 line change.

- **6.1 "Distance (est.)" → "Distance".** `ObjectInspector.tsx:59`. That value is the app's
  *exact* Kepler radius (`getOrbitRadiusKm`), not an estimate; the "(est.)" qualifier is on the
  wrong field. Use "Distance" (or "Distance from Sun" / "Distance from {parent}" — for moons it
  is distance from the parent, not the Sun). Reserve "estimate" language for the rocket
  telemetry.
- **6.2 "Speed (Kepler)" → "Orbital speed".** `ObjectInspector.tsx:67`. Move the model name into
  a `title=` tooltip ("Instantaneous orbital speed (vis-viva)") rather than the visible label.
- **6.3 Search shows raw camelCase types.** `SearchCommand.tsx:68` renders `{body.type}` raw, so
  dwarf planets show "dwarfPlanet". Extract the existing `titleCaseType` helper from
  `ObjectInspector.tsx:12–16` into a shared util (e.g. `src/simulation/units.ts` or a small
  format module) and use it in both places.
- **6.4 Search has no empty state.** `SearchCommand.tsx:56–70`. When
  `results.length === 0 && query.trim()`, render one muted row: `No objects match "{query}"`.
- **6.5 Scale-mode labels.** `units.ts` `SCALE_MODES` (~8–13). "Bodies" is opaque (it means
  "readable bodies, true distance"). Consider relabeling "Bodies"→"Readable", and ensure each
  chip's word appears in its own note; optionally mark the default ("Compact"/`compressed`) as
  recommended. The note (`ScaleControls.tsx:100`) is already always-visible — keep it.
- **6.6 Rocket telemetry redundancy.** `RocketTelemetry.tsx` renders the status pill (~48) and
  then repeats the identical value in a "Phase" row (~68–69) — drop the row.
  `RocketTransferPreview.tsx:64–71` shows "Transfer time" and "Arrival time" as the same
  duration in two formats — keep one duration row, or relabel "Arrival time" to a real intercept
  date (`RocketTelemetry` already computes one via `formatDate(arrivalDateMs)`).
- **6.7 Phase-angle units.** `rocketState.ts` `formatPhaseAngle` emits ASCII "deg"; use the `°`
  symbol to match "AU"/"km/s", and soften labels ("Phase offset"→"Planet alignment"). Capitalize
  the launch-window quality enum ("good"→"Good").
- **6.8 First-run discoverability cue.** No hint that bodies are clickable or that `/` searches.
  Add one calm, dismissible, `localStorage`-remembered caption (e.g. auto-fading
  "Click a planet · press / to search") — consistent with the "no on-canvas tutorial text"
  intent (keep it brief and auto-fade).
- **6.9 (optional) De-emphasize the Rocket entry** in the top bar — it currently has equal
  visual weight to Search/Help for an experimental "concept preview" feature. Consider moving it
  into the View/overflow surface or visually subordinating it. Low priority.

---

## Do NOT "fix" these (verified non-issues — don't waste time)

- Desktop time-controls do **not** overflow at narrow widths (901–1200px) — the grid has
  ~217px of slack.
- Label-density "Full" **does** include the outer planets (Jupiter/Uranus/Neptune render at
  Standard and Full); there is no missing-label bug there.
- The `multiply` vignette does **not** darken the scene labels (labels are above it via
  z-index); it only mood-darkens the canvas imagery, as intended.
- The `TimeDriver` clock is **not** biased — it consumes the full accumulator each tick; the
  `Math.min(delta, 0.12)` clamp is an intentional spiral-of-death guard.

---

## Definition of done

- `tsc --noEmit` clean; `npm test` passes; `npm run build` succeeds.
- If you touched `src/simulation/*` or `src/data/*`: `npm run verify:math` passes.
- Phase 1 fixes verified **in the running app** (not just by reading code) per the harness in
  §0 — especially Task 1.1 (label click selects) and 1.2 (selection doesn't hijack the camera).
- Desktop and mobile (`≤900px`) layouts both still look and behave correctly.
- No regression to the calm/minimal aesthetic; no new color tokens outside the existing system.
