# Scientific Data Contract

The simulator distinguishes an authoritative ephemeris from an analytical model
that merely started from authoritative data.  Every rendered body now exposes:

- source title, publisher, URL, and source record/kernel/table;
- model and accuracy tier;
- epoch and source time scale;
- orbital reference frame;
- validation interval and behavior outside it;
- important omitted effects.

The stable integration surface is `getBodyScientificContract()` in
`src/simulation/scientificContract.ts`.  An `extrapolated` result is still drawn,
but must not be presented as validated.

## Scene inertial frame and time

Positions use the fixed IAU76/80 ecliptic of J2000 used by JPL Horizons.  Horizons
defines the ICRF-to-ecliptic rotation with a fixed obliquity of 84,381.448 arcsec.
Astronomical ecliptic `(X, Y, Z)` is represented in Three.js as `(X, Z, Y)` so the
ecliptic north direction is scene-up.

- Horizons frame and output definitions:
  https://ssd.jpl.nasa.gov/horizons/manual.html
- Frame implementation: `src/simulation/coordinateFrames.ts`

Planet elements are tagged TT; Horizons and satellite elements are tagged TDB;
orientation polynomials are tagged TDB.  JavaScript `Date` remains the display and
transport clock.  The analytical propagator currently treats the ISO encoding as a
uniform elapsed-day count instead of evaluating leap seconds and the periodic
TDB−TT term.  This is a disclosed approximation, not an apparent-position model.

## Major planet orbits

The eight major planets use NASA/JPL Solar System Dynamics Table 1 elements at
J2000 and their linear per-century rates:

- https://ssd.jpl.nasa.gov/planets/approx_pos.html
- validated interval: 1800-01-01 through 2050-12-31;
- tier: `validated-approximation`;
- JPL's stated order-of-magnitude accuracy is represented as 25,000 km;
- Earth's row is the Earth-Moon barycenter and is used as visual Earth.

The runtime derives argument of periapsis and mean anomaly from the published
longitude of perihelion and mean longitude.  It does not use a DE integration,
light time, stellar aberration, or observer-dependent apparent coordinates.

## Dwarf planets

Ceres, Pluto, Eris, Haumea, and Makemake use osculating Horizons elements at
JD 2460676.5 TDB (2025-01-01 00:00 TDB), centered on the Sun and expressed in the
IAU76/80 J2000 ecliptic:

- source/API: https://ssd.jpl.nasa.gov/horizons/
- authoring command: `python3 scripts/fetch_horizons_elements.py`
- tier: `ephemeris-snapshot`.

The position matches Horizons at the snapshot, but subsequent motion is a two-body
Kepler extrapolation.  It does not inherit the validity or uncertainty of the
underlying Horizons numerical integration.  The offline verifier shows the five
models remain within 0.04% of heliocentric distance on 2026-07-10; that measured
check is not a general precision guarantee.

## Major moon orbits

Orbit shape, source planes, plane poles, and secular precession periods come from
JPL Planetary Satellite Mean Elements:

- https://ssd.jpl.nasa.gov/sats/elem/
- Moon: ecliptic frame, DE405/LE405 row;
- Io, Europa, Ganymede, Callisto: local Laplace planes, JUP365;
- Enceladus, Rhea, Titan, Iapetus: local Laplace planes, SAT441;
- Ariel, Umbriel, Titania, Oberon, Miranda: Uranus equatorial frame, URA182;
- Triton: local Laplace plane, NEP097.

The table's Laplace-plane pole RA/Dec is transformed to ICRF, then into the fixed
J2000 ecliptic.  Uranian equatorial elements use Uranus's PCK pole at J2000.  The
node is not treated as an ecliptic node; doing so is the large plane error the new
frame contract is designed to prevent.

The public table is a mean-element summary, not an SPK evaluator.  To make phase
reproducible rather than decorative, `scripts/calibrate_moon_phases.py` projects
geometric Horizons vectors at J2000 and 2026-07-10 into each published reference
plane.  It fits the J2000 mean anomaly and effective mean motion while applying the
table's apsidal/nodal precession periods.  The model is tagged `mean-elements` and
validated only over that fit interval.  It still omits short-period perturbations,
resonant/libration terms, and the full source SPK.

Offline Horizons-vector checks at the two calibration dates cover an ecliptic
orbit (Moon), Jovian/Saturnian/Neptunian Laplace planes, and the Uranian equatorial
frame.  Current-date errors for those representatives are below 1% of orbital
radius except Triton (~11%), whose perturbed retrograde plane is poorly represented
by a single secular ellipse.  Use the source SPK/Horizons for precision work.

## Pole and surface orientation

Pole and prime-meridian models use secular coefficients from NAIF's generic
`pck00011.tpc`, based on the IAU 2015 WGCCRE report:

- kernel: https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc
- convention: https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/pck.html
- implementation: `src/simulation/orientation.ts`.

The model evaluates pole right ascension, pole declination, and signed prime
meridian angle `W(t)`.  The sign of `W` is the only spin-direction flag; legacy
rotation durations are positive so Venus, Uranus, and Pluto no longer encode
retrograde rotation twice.  Regular moons also expose an instantaneous synchronous
frame whose +X direction faces the parent.  PCK periodic nutation, precession, and
physical-libration terms are not yet evaluated and are reported as omissions.

## Display scale is not physical geometry

`Real` uses true heliocentric and satellite distances with true radii.  `Readable`
uses true heliocentric planet distances but enlarged bodies and nonlinearly expanded
moon systems.  Its user-facing note therefore reads:

> True planet distance · enlarged bodies and expanded moon systems

`Compact` and `Map` compress heliocentric distance as well.  No mode other than
`Real` should be described as globally true scale.

## Red-giant scenario mass loss

The red-giant scenario's default retained solar mass is `0.668 M☉`: the source
stellar-evolution model loses `0.332 M☉` by the tip of the red-giant branch.

- K.-P. Schröder and R. C. Smith (2008), *Distant future of the Sun and Earth
  revisited*, MNRAS 386, 155–163:
  https://academic.oup.com/mnras/article/386/1/155/977315
- local arithmetic/model guardrail: `scripts/verify_scenario_fidelity.py`.

For slow isotropic mass loss with negligible external torque, the adiabatic
two-body limit expands a surviving semimajor axis inversely with retained stellar
mass.  The default therefore has a reference expansion of `1 / 0.668 = 1.497×`.
The scenario now reduces the Sun's gravitational parameter during the swell so
surviving simulated orbits respond to the loss rather than remaining on their
original fixed ellipses.

That factor is a baseline, not a prediction for every planet.  The scenario
compresses stellar evolution into a watchable duration and omits detailed stellar
wind interaction.  Close planets can undergo tides and atmospheric drag, and the
same source concludes those effects are crucial for Earth's fate.  Encounters,
engulfment, and multi-body perturbations can also violate the isolated adiabatic
assumptions.  The scenario is therefore labeled accelerated/guided stellar
evolution and reports the mass-loss assumption explicitly.

## Planet texture maps

Curated texture assets live in `public/textures/`.  They are static public assets
with procedural fallback textures so the app remains usable offline.

- `earth.jpg`: NASA Science 3D Resources "Earth (A)".
- `venus.jpg`: NASA Magellan-derived radar mosaic.
- `mars.jpg`: Viking imagery processed at USGS.
- `jupiter.jpg`: Voyager imagery.
- `saturn.jpg` and `neptune.jpg`: NASA/JPL generated maps; NASA labels them fictional.
- `moon.jpg`: NASA SVS CGI Moon Kit, optimized for aesthetic rendering rather than
  scientific measurement.

Sources:

- https://science.nasa.gov/3d-resources/earth-a/
- https://science.nasa.gov/3d-resources/venus/
- https://science.nasa.gov/3d-resources/mars/
- https://science.nasa.gov/3d-resources/jupiter/
- https://science.nasa.gov/3d-resources/saturn/
- https://science.nasa.gov/3d-resources/neptune/
- https://svs.gsfc.nasa.gov/4720/

## Reproduction and verification

Networked authoring tools:

```bash
python3 scripts/fetch_horizons_elements.py
python3 scripts/fetch_horizons_vectors.py
python3 scripts/calibrate_moon_phases.py
```

Offline verification:

```bash
npm run verify:math
```

The math suite checks source values and complete metadata, major-planet formulas,
frame transforms and representative Horizons vectors at multiple dates, orientation
and synchronous-lock invariants, scale behavior, camera framing, and rocket math.
