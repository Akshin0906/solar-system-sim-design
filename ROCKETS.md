# Rockets (v1 — Educational Launch MVP)

This document covers the first rocket-launch feature added on top of the solar-system
MVP. It explains the architecture, the flight model, every rocket profile, and — most
importantly — **what is intentionally simplified**. Read this before changing rocket
behaviour or extending the catalog.

The feature is deliberately small and educational. It is **not** a mission planner, an
orbital-mechanics engine, or a trajectory-design tool. It exists to let you launch a
rocket from Earth, watch it move outward, and compare propulsion concepts side by side.

## What it does

- Adds a compact, toggleable launch panel (rocket icon in the top bar). Hidden by
  default so the standard solar-system view stays uncluttered.
- Lets you pick a rocket profile and launch from Earth.
- Renders one active rocket in the 3D scene (marker + outbound trail + label).
- Shows live telemetry: name, category, mission time, current speed, distance
  traveled, and straight-line distance from Earth.
- Lets you reset/clear the rocket at any time.

## What it intentionally does NOT do (yet)

- No full orbital mechanics, no patched conics, no transfer windows.
- No staging, no propellant mass / tank depletion, no thrust-to-weight modelling.
- No atmosphere, gravity losses, or launch-azimuth physics.
- No steering, no mid-course burns, no destination targeting.
- No gravity from the Sun or planets acting on the rocket (it does not fall or curve).
- Only one rocket at a time. Launching again replaces the previous one.

These are all reserved for later phases (see DESIGN.md → "Future Rocket Architecture").

## Architecture

Rocket code lives entirely under `src/future/rockets/` and is layered so that physics,
state, and rendering stay independent. It never mutates planet/moon data and adds no
network dependencies, so the app still works offline.

| File | Responsibility |
| --- | --- |
| `rocketCatalog.ts` | Editable data: the 8 rocket profiles + label maps. Single source of truth. |
| `flightModel.ts` | **Pure** physics. Closed-form speed/distance as a function of elapsed mission time. No Three.js, no React, no celestial data. |
| `rocketState.ts` | Composition layer. Combines the flight model + Earth's ephemeris + scene-scale utilities into a full `RocketView` (telemetry + scene position). |
| `rocketStore.ts` | Zustand store. Holds only the launch *identity* and launch *time* (and panel open state). Separate from celestial body state. |
| `RocketObject.tsx` | Scene rendering (declarative R3F geometry + drei `<Line>` trail). |
| `RocketTelemetry.tsx` | Telemetry readout (formats physical values; does not compute them). |
| `RocketLauncherPanel.tsx` | The launch panel container; embeds telemetry when a rocket is active. |

### Why flight state is derived, not stored

The rocket's position/speed/distance are **derived each frame** from
`(profile, launchDateMs, currentSimulationDateMs)` rather than integrated and stored.
This is deliberate and important:

- It reuses the existing time system. Mission elapsed time is simply
  `simulationDateMs − launchDateMs`.
- It is exact and consistent under **pause, reverse, scrub, and extreme time scales**.
  Scrubbing the clock back before launch shows the rocket pre-launch (clamped to t=0);
  scrubbing forward advances the mission. There is no accumulated integration drift.

Because flight state is a pure function of time, the closed-form model in
`flightModel.ts` can be reasoned about and tested directly.

## Flight model (v1 — simple speed profile)

Each rocket has these flight fields (all physical and scale-independent):

- `initialSpeedKmS` — speed at the start of the tracked outbound cruise.
- `maxSpeedKmS` — a ceiling the speed will not exceed.
- `accelerationMS2` — applied while the engine is burning.
- `burnDurationSeconds` — how long the engine accelerates before coasting.

Given elapsed mission time `t`, speed and path distance follow three phases:

1. **Accelerate** from `initialSpeedKmS` at `accelerationMS2` until either the speed
   cap or the end of the burn.
2. **Hold at the cap** for the rest of the burn (only if the cap was reached first).
3. **Coast** forever after the burn at whatever speed it ended with.

Distance traveled is the exact integral of that speed profile.

### Direction and position

- The rocket launches from **Earth's heliocentric position at launch time** and travels
  **radially outward, away from the Sun**, along a frozen direction.
- Because that direction is exactly Earth's radius vector, the path stays on a single ray
  from the Sun. It maps cleanly through the existing `scaleVectorFromSun` scaling, so the
  rocket lives in the same scaled space as the planets and travels a straight scene path.
- **Distance traveled** = length of the rocket's own path.
- **Distance from Earth** = straight-line distance to Earth's *current* position. Earth
  keeps orbiting after launch, so this diverges from distance traveled over time. (E.g.
  a Saturn V at ~200 days: ~1.3 AU traveled but ~3.3 AU from Earth, because Earth has
  swung ~110° around the Sun.) This is the most useful educational detail in the feature.

### Honesty about scale

Telemetry is the source of truth and is always in real physical units (km, AU, km/s).
The 3D position is a derived rendering convenience using the compressed scene scale, so
"how far along the scene it looks" is not linear with kilometres — the numbers are. Very
fast drives (fusion) at high time scales can fly off-screen in a frame; the telemetry
keeps reading correctly. Use a slower time scale to watch them.

## Rocket catalog (v1)

All numbers are **educational placeholders** tuned for clear, comparable behaviour, not
mission-design figures. They model an *outbound cruise* speed, not pad liftoff. Edit them
freely in `rocketCatalog.ts`.

Confidence labels shown in the UI:

- **Real** — hardware that has flown; grounded in public figures.
- **Estimated** — real / near-term hardware, but this cruise profile is approximated.
- **Speculative** — conceptual propulsion; numbers illustrate intent, not measurement.

| Rocket | Category | Confidence | init → max km/s | accel m/s² | burn |
| --- | --- | --- | --- | --- | --- |
| Saturn V | Existing | Real | 2 → 11.0 | 22 | 420 s |
| Falcon Heavy | Existing | Real | 2 → 11.5 | 24 | 430 s |
| Starship | Existing | Estimated | 1.5 → 12.0 | 22 | 520 s |
| SLS Block 1 | Existing | Real | 2 → 11.2 | 22 | 430 s |
| Nuclear Thermal Rocket | Near future | Estimated | 3 → 22 | 9 | 2,400 s |
| Ion Drive Probe | Existing | Estimated | 0.5 → 40 | 0.0006 | ~0.95 yr |
| Fusion Drive Concept | Theoretical | Speculative | 5 → 3,000 | 2.5 | ~69 d |
| Solar Sail Concept | Near future | Speculative | 0.3 → 70 | 0.0009 | ~1.9 yr |

Notes on intent:

- **Chemical rockets** (Saturn V, Falcon Heavy, Starship, SLS) reach a trans-lunar-
  injection-class departure speed (~11–12 km/s) within a short burn, then coast.
- **Nuclear thermal** sustains a longer burn to a higher cruise speed.
- **Ion drive** has tiny acceleration but burns for ~a year, ending around ~18 km/s —
  the classic "slow but patient" profile. Its 40 km/s cap is a ceiling it does not reach
  within the modelled burn.
- **Fusion drive** hits its 3,000 km/s (~1% c) cap quickly and holds it — by far the
  fastest profile.
- **Solar sail** builds speed very slowly from sunlight pressure over ~2 years. The model
  uses a *constant* acceleration; a real sail's thrust falls off with distance from the
  Sun. That simplification is intentional for v1.

## Verification

The rocket feature does not affect the orbital math, so `npm run verify:math` is
unchanged. It was run alongside `npm run build` and both pass.

Manual checks performed in a real browser (desktop 1280×800 and phone 390×844):

- App opens directly into the simulation; rocket panel hidden by default.
- Existing planet/moon selection still works (top bar + inspector update).
- Launch appears from Earth; trail + marker + label render in the scene.
- Telemetry updates over time; distance-traveled and distance-from-Earth diverge.
- The `% c` speed format appears for the fast drives.
- Reset clears the rocket; closing the panel keeps the rocket flying.
- No console errors; no panel overlap on desktop or phone.

## Extending this later

- Add destination targeting by replacing the frozen "away from the Sun" direction in
  `rocketState.ts` with a vector toward a selected body.
- Add patched conics / gravity by swapping `flightModel.ts` for a richer propagator that
  returns a full position, keeping the same pure `(profile, elapsed) → state` shape.
- Support multiple simultaneous rockets by turning the single active id in `rocketStore.ts`
  into a list.
