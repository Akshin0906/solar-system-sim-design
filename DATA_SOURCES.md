# Data Sources

## Major Planet Orbits

The major planet orbit elements in `src/data/bodies.ts` use NASA/JPL Solar System Dynamics approximate Keplerian elements at J2000:

- Source: https://ssd.jpl.nasa.gov/planets/approx_pos.html
- Table: "Keplerian elements and their rates", Table 1.
- Validity range: 1800 AD through 2050 AD.
- Fields used:
  - semi-major axis `a`
  - eccentricity `e`
  - inclination `I`
  - longitude of ascending node `Omega`
  - longitude of perihelion `varpi`
  - mean longitude `L`

The app stores:

- `argumentOfPeriapsisDeg = varpi - Omega`
- `meanAnomalyAtEpochDeg = L - varpi`
- J2000 epoch values only.

The app currently does not apply JPL's per-century element rates during runtime. It advances planets using the stored J2000 mean anomaly and each body's orbital period. This is accurate enough for the app's visual MVP, but it is not a high-precision ephemeris. For high-precision positions, use JPL Horizons.

## Verification

Run:

```bash
npm run verify:math
```

This includes:

- basic orbital speed and scale checks,
- camera-framing checks,
- comparison of major planet app elements against JPL approximate elements,
- current-date position drift checks against JPL's approximate formula.

