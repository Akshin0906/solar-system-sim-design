# Data Sources

## Major Planet Orbits

The major planet orbit elements in `src/data/bodies.ts` use NASA/JPL Solar System Dynamics approximate Keplerian elements at J2000 plus JPL's per-century rates:

- Source: https://ssd.jpl.nasa.gov/planets/approx_pos.html
- Table: "Keplerian elements and their rates", Table 1.
- Validity range: 1800 AD through 2050 AD.
- Fields used:
  - semi-major axis `a`
  - semi-major axis rate `a_dot`
  - eccentricity `e`
  - eccentricity rate `e_dot`
  - inclination `I`
  - inclination rate `I_dot`
  - longitude of ascending node `Omega`
  - longitude of ascending node rate `Omega_dot`
  - longitude of perihelion `varpi`
  - longitude of perihelion rate `varpi_dot`
  - mean longitude `L`
  - mean longitude rate `L_dot`

The app stores:

- `argumentOfPeriapsisDeg = varpi - Omega`
- `meanAnomalyAtEpochDeg = L - varpi`
- `elementRatesPerCentury` in the JPL source units where practical.
- JPL's Table 1 labels Earth's row as `EM Bary`; the app uses it as Earth's visual heliocentric orbit for simplicity.

At runtime, the app resolves date-specific planet elements with `a = a0 + a_dot * T`, `e = e0 + e_dot * T`, and the corresponding angular rates for `I`, `Omega`, `varpi`, and `L`, where `T` is Julian centuries from J2000. It then derives `argumentOfPeriapsisDeg = varpi - Omega` and `meanAnomalyDeg = L - varpi`.

This remains an approximate Keplerian model. It does not use JPL Horizons, DE ephemerides, n-body perturbations, or JPL's longer-range Table 2 outer-planet correction terms. For high-precision positions, use JPL Horizons.

## Dwarf Planet Orbits

The dwarf planet entries in `src/data/bodies.ts` are rounded approximate Kepler elements intended for visual scale and educational comparison:

- Ceres, Pluto, Eris, Haumea, and Makemake use local rounded values for semi-major axis, period, eccentricity, and inclination.
- Source context: JPL Small-Body Database / Horizons-class orbital data, summarized locally rather than queried at runtime.
- Accuracy note: these values are not date-fitted ephemerides and do not include per-century rates. They are suitable for approximate placement and relative motion only.

Use JPL Horizons or the JPL Small-Body Database for current precision elements:

- https://ssd.jpl.nasa.gov/horizons/app.html
- https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html

## Major Moon Orbits

The major moon entries in `src/data/moons.ts` use rounded mean elements:

- Source context: JPL Solar System Dynamics "Planetary Satellite Mean Elements" and public NASA/JPL fact-sheet values.
- Fields used where available: semi-major axis, eccentricity, inclination, orbital period, node, argument of periapsis, and a visual mean anomaly seed.
- Accuracy note: these are mean/rounded values for visual layout. The app does not model satellite perturbations, precession, Laplace-plane details, resonances, or local capture dynamics.

Primary source:

- https://ssd.jpl.nasa.gov/sats/elem/

## Planet Texture Maps

Curated texture assets live in `public/textures/`. They are static public assets loaded at runtime with procedural canvas textures as fallback, so the app remains usable offline or if an image fails to load.

- `earth.jpg`: NASA Science 3D Resources "Earth (A)", USGS/NASA/JPL topography-like map.
- `venus.jpg`: NASA Science 3D Resources "Venus", stitched Magellan radar imagery with gap fill.
- `mars.jpg`: NASA Science 3D Resources "Mars", Viking imagery processed at USGS.
- `jupiter.jpg`: NASA Science 3D Resources "Jupiter", Voyager imagery.
- `saturn.jpg`: NASA Science 3D Resources "Saturn", JPL/Caltech generated planetary map explicitly labeled fictional by NASA.
- `neptune.jpg`: NASA Science 3D Resources "Neptune", JPL/Caltech generated planetary map explicitly labeled fictional by NASA.
- `moon.jpg`: NASA SVS CGI Moon Kit `lroc_color_2k.jpg`, based on LRO/LROC and LOLA-derived source data; NASA notes the rendering map is optimized for aesthetics rather than science.

Sources:

- https://science.nasa.gov/3d-resources/earth-a/
- https://science.nasa.gov/3d-resources/venus/
- https://science.nasa.gov/3d-resources/mars/
- https://science.nasa.gov/3d-resources/jupiter/
- https://science.nasa.gov/3d-resources/saturn/
- https://science.nasa.gov/3d-resources/neptune/
- https://svs.gsfc.nasa.gov/4720/

## Verification

Run:

```bash
npm run verify:math
```

This includes:

- basic orbital speed and scale checks,
- camera-framing checks,
- comparison of major planet app elements and runtime rates against JPL approximate elements,
- current-date position checks against JPL's approximate rate formula,
- focused dwarf planet and major moon data checks for key rounded values.
