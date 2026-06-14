# Rockets - Educational Mission Preview

The rocket feature is an educational layer on top of the solar-system simulator. It
lets you launch one active rocket from Earth, compare propulsion profiles, and preview
simple destination missions without changing any planet or moon data.

This is still not a professional mission planner. The numbers are approximate, the
visuals are scaled for comprehension, and the model intentionally avoids full n-body
gravity, patched conics, atmospheric losses, staging, propellant budgets, and
mid-course guidance.

## What It Does

- Adds a compact rocket panel from the top bar.
- Lets you choose a rocket profile, destination, mission mode, and launch assumption.
- Supports free flight, direct destination aim, and approximate transfer preview.
- Renders one active rocket with scene cues and live telemetry.
- Keeps all physical readouts in real units while the 3D scene uses the app's existing
  scale modes.
- Preserves pause, reverse, and time scrubbing because rocket state is derived from
  launch identity plus the current simulation time.

## Mission Modes

### Free Flight

Free flight launches radially outward from Earth's heliocentric position at launch
time. It has no destination cue, no target line, and no transfer math.

### Direct Aim

Direct aim is the simple moving-target model. At launch it predicts when the chosen
rocket profile can reach the destination and flies a straight line toward that
future intercept point.

Important limitations:

- It does not curve under gravity.
- It does not compute transfer windows.
- It assumes the rocket can hold a straight course to the predicted intercept.
- After arrival, the scene keeps the rocket attached to the destination body so
  scrubbing beyond arrival still reads as an arrived mission.

Telemetry still measures distance to the destination's current position, so the
closest-approach readout shows whether the simple intercept lined up.

### Transfer Preview

Transfer preview adds a separate approximate transfer model. For planets and dwarf
planets it estimates a Hohmann-style heliocentric transfer between Earth's orbit and
the destination orbit, then samples a phase-aware visual arc to the destination's
arrival position. For the Moon, it uses a simplified Earth-centered parking-orbit
transfer estimate. Non-Earth moons are intentionally not rocket destinations until
local capture can be modeled honestly.

The transfer model estimates:

- transfer time,
- ideal phase angle,
- current phase offset,
- launch-window quality,
- departure delta-v,
- arrival delta-v,
- approximate intercept date,
- whether the current launch date is favorable.

The scene renders transfer missions as curved arcs with a launch marker, progress
line, intercept marker, current rocket marker, and target highlight. Before arrival,
the rocket's position on the arc is based on elapsed mission time divided by the
estimated transfer time. After arrival, the rocket follows the destination's current
scene position and the route ends at the current destination instead of freezing at
the old intercept point.

## Launch Assumptions

The launch selector is educational, not a launch vehicle simulation.

- Earth departure: default/current behavior; the tracked cruise begins after Earth
  departure.
- Low Earth orbit: adds a simplified 7.8 km/s parking-orbit speed offset to the direct
  speed profile.
- Surface launch: starts from the same Earth marker but labels the assumption clearly;
  atmosphere and gravity losses are not modeled.

Transfer delta-v estimates are Hohmann-style orbital deltas. They do not include
launch-site losses, booster staging, detailed escape/capture design, or moon-local
insertion.

## Destination Catalog

Destinations reuse existing body IDs from `src/data`, so rocket code never duplicates
or mutates celestial body data.

Current destination groups:

- Flight: Free flight.
- Planets: Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune.
- Dwarf planets: Ceres, Pluto, Eris, Haumea, Makemake.
- Moons: Moon.

Moon transfer previews are deliberately approximate and use an Earth-centered
parking-orbit estimate. Non-Earth moon destinations are excluded so the UI does not
imply moon-local capture that the model does not perform.

## Architecture

Rocket code lives in `src/future/rockets/`.

| File | Responsibility |
| --- | --- |
| `rocketCatalog.ts` | Rocket profile data and confidence labels. |
| `destinationCatalog.ts` | Grouped destination list mapped to existing body IDs. |
| `missionOptions.ts` | Mission-mode and launch-mode definitions. |
| `flightModel.ts` | Pure closed-form speed/distance profile for direct/free launches. |
| `transferModel.ts` | Pure approximate transfer math and sampled transfer arcs. |
| `rocketState.ts` | Derived view model combining profile, destination, mission mode, launch mode, ephemeris, and scene scale. |
| `rocketStore.ts` | Zustand store for selected and active launch identity. |
| `RocketObject.tsx` | 3D rocket marker, direct trails, transfer arcs, target cue rendering. |
| `RocketTelemetry.tsx` | Live readout formatting. |
| `RocketLauncherPanel.tsx` | Compact controls and launch/reset actions. |

## Rocket Profiles

Profile numbers are educational placeholders tuned for comparison, not mission-design
figures. Confidence labels communicate how grounded each profile is.

| Rocket | Category | Confidence | init -> max km/s | accel m/s2 | burn |
| --- | --- | --- | --- | --- | --- |
| Saturn V | Existing | Real | 2 -> 11.0 | 22 | 420 s |
| Falcon Heavy | Existing | Real | 2 -> 11.5 | 24 | 430 s |
| Starship | Existing | Estimated | 1.5 -> 12.0 | 22 | 520 s |
| SLS Block 1 | Existing | Real | 2 -> 11.2 | 22 | 430 s |
| Nuclear Thermal Rocket | Near future | Estimated | 3 -> 22 | 9 | 2,400 s |
| Ion Drive Probe | Existing | Estimated | 0.5 -> 40 | 0.0006 | about 0.95 yr |
| Fusion Drive Concept | Theoretical | Speculative | 5 -> 3,000 | 2.5 | about 69 d |
| Solar Sail Concept | Near future | Speculative | 0.3 -> 70 | 0.0009 | about 1.9 yr |

## Verification

Run:

```bash
npm run verify:math
npm run verify:app
npm run build
```

`npm run verify:math` includes `scripts/verify_rocket_transfer_math.py`, which checks:

- Earth-to-Mars Hohmann transfer time is in a plausible range.
- Outer-planet transfer times increase with destination distance.
- phase-angle normalization handles wraparound correctly.
- departure and arrival delta-v values are positive and plausible.

`npm run verify:app` imports the TypeScript app modules directly and checks:

- rocket destinations do not include non-Earth moons,
- pre-launch rocket telemetry stays attached to Earth,
- app orbit positions stay close to independent JPL approximate elements,
- app transfer estimates stay in plausible ranges.

Manual QA should confirm:

- direct aim still predicts a moving-target intercept,
- free flight still works without destination cues,
- transfer preview renders a curved arc,
- telemetry updates while time runs and while time is scrubbed,
- launch-window quality and delta-v fields are clearly marked approximate,
- desktop and phone panel text does not overflow,
- no console errors occur after launching, resetting, and changing scale modes.
