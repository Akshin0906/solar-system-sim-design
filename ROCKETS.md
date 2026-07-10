# Rockets - Educational Mission Preview

The rocket feature is an educational concept-preview layer on top of the solar-system
simulator. It lets you launch one active preview object from Earth, compare explicitly
illustrative direct/free curves, and inspect physical two-body transfer requirements
without changing any planet or moon data.

This is still not a professional mission planner. The visuals are scaled for
comprehension, and the model intentionally avoids full n-body gravity, atmospheric
losses, staging, propellant budgets, finite-burn optimization, and mid-course
guidance. It does use propagated two-body conics, an endpoint-solving Lambert mode,
and explicit parking-orbit/capture-burn estimates.

## What It Does

- Adds a compact rocket panel from the top bar.
- Lets you choose a hardware/technology identity, destination, mission mode, and launch
  assumption.
- Supports conceptual free flight, Guided direct, a phase-sensitive Hohmann coast,
  and an endpoint-targeted Lambert intercept.
- Renders one active rocket with scene cues and live telemetry.
- Keeps all physical readouts in real units while the 3D scene uses the app's existing
  scale modes.
- Preserves pause, reverse, and time scrubbing because rocket state is derived from
  launch identity plus the current simulation time.

## Evidence Contract

The catalog exposes three different claims and never folds them into one confidence
badge:

1. **Hardware status** says whether the launch vehicle or propulsion technology is
   operational, flight-proven, retired after flight, in flight test, ground-tested,
   flight-demonstrated, mission-proven, or only a concept study.
2. **Direct/free curve confidence** describes only the invented 1-D speed curve used
   by Free Flight and Direct Aim. `Illustrative` means the curve conveys a real
   behavior pattern but is not reconstructed performance; `notional` means even the
   numerical curve is a concept comparison.
3. **Capability benchmarks** are source-specific payload facts. A benchmark retains
   its vehicle configuration, destination or C3, source, and caveat. It is context,
   never a mission-feasibility result.

Hohmann and Lambert transfers use none of the direct/free curve inputs. Selecting a
different catalog entry cannot reshape a physical conic. The transfer telemetry reports
required departure v-infinity, C3, parking-orbit injection, arrival v-infinity, and
capture delta-v independently. Without payload mass, fairing, launch site, declination,
recovery mode, staging, propellant, reserves, and margins, the UI deliberately makes no
launcher pass/fail claim.

## Mission Modes

### Free Flight

Free flight launches radially outward from Earth's heliocentric position at launch
time as a conceptual outbound cruise preview. It has no destination cue, no target
line, and no transfer math.

### Guided Direct

Guided direct is the simple educational moving-target model. At preview start it predicts
when the chosen rocket profile can reach the destination and flies a straight line
toward that future intercept point.

Important limitations:

- It does not curve under gravity.
- It does not compute transfer windows.
- It assumes the rocket can hold a straight course to the predicted intercept.
- It is not an operational guidance, navigation, or trajectory-design model.
- After arrival, the scene keeps the rocket attached to the destination body so
  scrubbing beyond arrival still reads as an arrived mission.

Telemetry still measures distance to the destination's current position, so the
closest-approach readout shows whether the simple intercept lined up.

### Hohmann Coast

Hohmann mode builds an impulsive two-body conic from Earth's dated heliocentric
state. It propagates that conic without steering. A poor launch phase therefore
produces a measured miss instead of bending the path or snapping the marker onto the
destination. The Moon uses a corresponding Earth-centered parking-orbit coast.

### Lambert Intercept

Lambert mode solves the departure velocity needed to connect Earth's dated state to
the destination's dated future state in a specified time, then independently
propagates the result to check its endpoint. It guarantees the mathematical two-body
intercept, not vehicle feasibility. The required departure v-infinity, C3, 400 km LEO
injection, arrival v-infinity, and idealized capture burn are reported separately
from the selected hardware label.

The transfer model estimates:

- transfer time,
- ideal phase angle,
- current phase offset,
- launch-window quality,
- departure v-infinity and C3,
- 400 km parking-orbit injection delta-v,
- arrival v-infinity and idealized capture delta-v,
- propagated arrival miss distance,
- approximate intercept date,
- whether the current launch date is favorable.

The scene renders transfer missions as propagated arcs with launch/intercept markers,
current position, and a target cue. Encounter outcome is explicit:

- Flyby keeps the propagated arrival velocity and continues the conic past encounter.
- Capture applies the displayed idealized arrival burn only after a valid intercept,
  then follows the destination. Propellant, thrust, and burn duration are not modeled.

## Launch Assumptions

The launch selector is educational, not a launch vehicle simulation or mission planner.

- Earth departure: default/current behavior; the tracked cruise begins after Earth
  departure.
- Low Earth orbit: uses a 400 km circular parking-orbit reference for the displayed
  injection burn. Orbital velocity is a vector state and is never added as free
  scalar cruise speed.
- Surface launch: starts from the same Earth marker but labels the assumption clearly;
  atmosphere and gravity losses are not modeled.

Transfer requirements do not include launch-site losses, booster staging, finite
burns, detailed sphere-of-influence transitions, or propulsion-system feasibility.

## Destination Catalog

Destinations reuse existing body IDs from `src/data`, so rocket code never duplicates
or mutates celestial body data.

Current destination groups:

- Flight: Free flight.
- Planets: Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune.
- Dwarf planets: Ceres, Pluto, Eris, Haumea, Makemake.
- Moons: Moon.

Moon transfer previews are deliberately approximate and use an Earth-centered
parking-orbit estimate. The UI therefore offers Guided direct and Hohmann coast for
Moon, but not the heliocentric Lambert solver. Non-Earth moon destinations are excluded
so the UI does not imply moon-local capture that the model does not perform.

## Architecture

Rocket code lives in `src/features/rockets/`.

| File | Responsibility |
| --- | --- |
| `rocketCatalog.ts` | Separate hardware evidence, direct/free curves, and contextual capability benchmarks. |
| `rocketEvidence.ts` | Primary-source metadata, evidence labels, and benchmark formatting. |
| `destinationCatalog.ts` | Grouped destination list mapped to existing body IDs. |
| `missionOptions.ts` | Mission-mode and launch-mode definitions. |
| `flightModel.ts` | Pure closed-form speed/distance curve used only by direct/free previews. |
| `orbitalTransfer.ts` | Universal-variable Lambert solver and two-body propagation. |
| `transferModel.ts` | Dated Hohmann/Lambert plans, patched-conic metrics, and sampled arcs. |
| `rocketState.ts` | Derived view model combining profile, destination, mission mode, launch mode, ephemeris, and scene scale. |
| `rocketStore.ts` | Zustand store for selected and active launch identity. |
| `RocketObject.tsx` | 3D rocket marker, direct trails, transfer arcs, target cue rendering. |
| `RocketTelemetry.tsx` | Live readout formatting. |
| `RocketLauncherPanel.tsx` | Compact controls and launch/reset actions. |

## Catalog Entries and Direct/Free Curves

Every number in the last three columns belongs to the 1-D direct/free display curve,
not to launch-vehicle ascent, payload performance, a spacecraft mass model, or a
transfer solver.

| Entry | Hardware evidence | Curve confidence | curve init -> cap km/s | curve accel m/s² | curve burn s |
| --- | --- | --- | ---: | ---: | ---: |
| Saturn V | Flown, retired | Illustrative | 2 -> 11.0 | 22 | 420 |
| Falcon Heavy | Operational, flight-proven | Illustrative | 2 -> 11.5 | 24 | 430 |
| Starship | Development flight test | Notional | 1.5 -> 12.0 | 22 | 520 |
| SLS Block 1 | Flight-proven on Artemis I | Illustrative | 2 -> 11.2 | 22 | 430 |
| Nuclear Thermal Propulsion | NERVA ground-tested; not flown | Notional | 3 -> 22 | 9 | 2,400 |
| Ion Propulsion Probe | Technology mission-proven on Dawn | Illustrative | 0.5 -> 18.5 | 0.0006 | 30,000,000 |
| Fusion Drive Concept | NIAC concept study | Notional | 5 -> 3,000 | 2.5 | 6,000,000 |
| Solar Sail Craft | Technology flight-demonstrated | Notional | 0.3 -> 54.3 | 0.0009 | 60,000,000 |

## Contextual Payload and C3 Benchmarks

These are the only payload facts encoded in the catalog. They are displayed with
their caveats and source links. A row does not prove that the matching vehicle can
fly the current app trajectory.

| Entry | Sourced benchmark | Basis |
| --- | --- | --- |
| Saturn V | approximately 117,900 kg to LEO | NASA published capability |
| Saturn V | approximately 40,800 kg toward the Moon | NASA published capability |
| Falcon Heavy | up to 63,800 kg to LEO | SpaceX headline capability |
| Falcon Heavy | up to 16,800 kg toward Mars | SpaceX headline capability; trajectory assumptions are not exposed on the overview |
| Falcon Heavy Expendable | modeled 8,345 kg at C3 29.36 km²/s² | NASA Uranus Orbiter and Probe 2031 mission-study point |
| SLS Block 1 | at least 95,000 kg to LEO | NASA Block 1 crew-configuration reference |
| SLS Block 1 | more than 27,000 kg to TLI | NASA Block 1 crew-configuration reference |
| Starship | no operational benchmark asserted | Developmental flight-test identity only |

The Falcon Heavy C3 row is intentionally a single mission-study point rather than a
fake universal limit. Launch-vehicle performance is a payload-versus-energy curve
conditioned by configuration and mission assumptions. The app therefore displays the
current trajectory's required C3 beside that point but never labels it “capable” or
“incapable.”

## Primary Sources

- [NASA Rockets Educator Guide — Saturn V capability](https://www.nasa.gov/sites/default/files/atoms/files/rockets-educator-guide-20.pdf)
- [SpaceX Falcon Heavy overview](https://www.spacex.com/vehicles/falcon-heavy)
- [NASA Uranus Orbiter and Probe mission study](https://science.nasa.gov/wp-content/uploads/2023/10/uranus-orbiter-and-probe.pdf)
- [SpaceX Starship flight test 12](https://www.spacex.com/launches/starship-flight-12)
- [NASA SLS Reference Guide](https://www.nasa.gov/wp-content/uploads/2022/03/sls_reference_guide_2022_web.pdf)
- [NASA Artemis I performance review](https://www.nasa.gov/missions/artemis/analysis-confirms-successful-artemis-i-moon-mission-reviews-continue/)
- [NASA NERVA history](https://www.nasa.gov/rocket-systems-area-nuclear-rockets/)
- [NASA Dawn ion propulsion](https://science.nasa.gov/mission/dawn/technology/ion-propulsion/)
- [NASA Fusion Driven Rocket concept](https://www.nasa.gov/general/the-fusion-driven-rocket-nuclear-propulsion-through-direct-conversion-of-fusion-energy/)
- [NASA Small Spacecraft in-space propulsion state of the art](https://www.nasa.gov/smallsat-institute/sst-soa/in-space_propulsion/)

## Verification

Run:

```bash
npm run verify:math
npm run verify:app
npm run build
```

`npm run verify:math` includes the independent
`scripts/verify_rocket_catalog.py`, `scripts/verify_rocket_transfer_math.py`, and
`scripts/verify_lambert_transfer.py` arithmetic checks. They verify:

- publisher-rounded pound/kilogram benchmark pairs reconcile,
- every direct/free curve can physically reach its stated cap under its own invented
  acceleration and burn duration,
- C3 and v-infinity retain the expected square relationship,
- the physical transfer model does not import or consume `directCurve`,
- Earth-to-Mars Hohmann transfer time is in a plausible range.
- hardware identity does not silently reshape a physical conic.
- Outer-planet transfer times increase with destination distance.
- phase-angle normalization handles wraparound correctly.
- Lambert propagation reaches its endpoint, preserves endpoint velocity, and remains
  continuous and energy-conserving beyond an uncaptured flyby.
- departure, injection, arrival, and capture quantities stay finite and plausible.

`npm run verify:app` imports the TypeScript app modules directly and checks:

- rocket destinations do not include non-Earth moons,
- pre-launch rocket telemetry stays attached to Earth,
- app orbit positions stay close to independent JPL approximate elements,
- app transfer estimates stay in plausible ranges.
- Hohmann paths can miss while Lambert paths reconcile to the dated target state.

Manual QA should confirm:

- Guided direct still predicts a moving-target intercept,
- free flight still works without destination cues,
- Hohmann and Lambert render their propagated arcs,
- flyby continues past encounter while capture attaches only after applying the
  displayed arrival burn,
- telemetry updates while time runs and while time is scrubbed,
- launch-window quality and delta-v fields are clearly marked approximate,
- desktop and phone panel text does not overflow,
- no console errors occur after launching, resetting, and changing scale modes.
