import type {
  OrbitReferenceFrame,
  ScientificMetadata,
  ScientificSource,
} from "../simulation/orbitalElements";

export const JPL_APPROXIMATE_PLANET_ELEMENTS: ScientificSource = {
  id: "jpl-approximate-planet-elements-table-1",
  title: "Approximate Positions of the Planets — Table 1",
  publisher: "NASA/JPL Solar System Dynamics",
  url: "https://ssd.jpl.nasa.gov/planets/approx_pos.html",
  record: "Keplerian elements and rates; 1800–2050",
};

export const JPL_HORIZONS: ScientificSource = {
  id: "jpl-horizons-api",
  title: "Horizons System",
  publisher: "NASA/JPL Solar System Dynamics",
  url: "https://ssd.jpl.nasa.gov/horizons/",
  record: "ELEMENTS; ICRF; IAU76/80 ecliptic of J2000",
};

export const JPL_SATELLITE_MEAN_ELEMENTS: ScientificSource = {
  id: "jpl-planetary-satellite-mean-elements",
  title: "Planetary Satellite Mean Elements",
  publisher: "NASA/JPL Solar System Dynamics",
  url: "https://ssd.jpl.nasa.gov/sats/elem/",
  record: "Mean elements, reference-plane poles, and source SPK identifiers",
};

export const NAIF_PCK_00011: ScientificSource = {
  id: "naif-pck00011",
  title: "Generic Planetary Constants Kernel pck00011.tpc",
  publisher: "NASA/JPL Navigation and Ancillary Information Facility",
  url: "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc",
  record: "IAU 2015 WGCCRE orientation models",
};

export const NAIF_PCK_SPECIFICATION: ScientificSource = {
  id: "naif-pck-required-reading",
  title: "PCK Required Reading",
  publisher: "NASA/JPL Navigation and Ancillary Information Facility",
  url: "https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/pck.html",
  record: "RA, DEC, W orientation convention",
};

export const ECLIPTIC_J2000_FRAME: OrbitReferenceFrame = {
  id: "ecliptic-j2000",
  label: "IAU76/80 ecliptic of J2000",
};

export const PLANET_ORBIT_METADATA: ScientificMetadata = {
  model: "JPL J2000 mean elements with linear secular rates",
  accuracy: {
    tier: "validated-approximation",
    description: "JPL's low-precision analytical approximation; not a DE/Horizons ephemeris.",
    typicalPositionErrorKm: 25_000,
  },
  validity: {
    from: "1800-01-01T00:00:00Z",
    to: "2050-12-31T23:59:59Z",
    outsideRange: "extrapolated",
  },
  sources: [JPL_APPROXIMATE_PLANET_ELEMENTS],
  omissions: [
    "Planet-planet perturbations beyond the published secular rates",
    "Earth-Moon barycenter to geocenter correction",
    "Light-time and observer-dependent apparent position",
  ],
};

export const createHorizonsSnapshotMetadata = (record: string): ScientificMetadata => ({
  model: "Two-body propagation from a JPL Horizons osculating-element snapshot",
  accuracy: {
    tier: "ephemeris-snapshot",
    description:
      "Matches the Horizons state at the epoch; accuracy degrades away from it because perturbations are not re-integrated.",
  },
  validity: {
    from: "2025-01-01T00:00:00Z",
    to: "2025-01-01T00:00:00Z",
    outsideRange: "extrapolated",
  },
  sources: [{ ...JPL_HORIZONS, record }],
  omissions: [
    "N-body perturbations after the element epoch",
    "Element covariance and positional uncertainty",
    "Light-time and observer-dependent apparent position",
  ],
});

export type SatelliteEphemerisId = "DE405/LE405" | "JUP365" | "SAT441" | "URA182" | "NEP097";

const SATELLITE_VALIDITY: Record<SatelliteEphemerisId, { from: string; to: string }> = {
  "DE405/LE405": { from: "1600-01-01T00:00:00Z", to: "2200-01-01T00:00:00Z" },
  JUP365: { from: "1600-01-10T00:00:00Z", to: "2200-01-10T00:00:00Z" },
  SAT441: { from: "1749-12-30T00:00:00Z", to: "2250-01-06T00:00:00Z" },
  URA182: { from: "1550-01-10T00:00:00Z", to: "2650-01-03T00:00:00Z" },
  NEP097: { from: "1800-01-01T00:00:00Z", to: "2100-01-10T00:00:00Z" },
};

export const createSatelliteMeanElementMetadata = (
  ephemeris: SatelliteEphemerisId,
  referenceFrame: string,
): ScientificMetadata => ({
  model: `JPL mean satellite elements with two-date Horizons phase fit (${ephemeris}; ${referenceFrame})`,
  accuracy: {
    tier: "mean-elements",
    description:
      "Published mean shape/reference plane with phase and effective mean motion fitted to geometric Horizons vectors at J2000 and 2026-07-10; still a fixed Kepler ellipse rather than the source SPK.",
  },
  validity: {
    from: "2000-01-01T12:00:00Z",
    to: "2026-07-10T00:00:00Z",
    outsideRange: "extrapolated",
  },
  sources: [
    { ...JPL_SATELLITE_MEAN_ELEMENTS, record: ephemeris },
    { ...JPL_HORIZONS, record: "Geometric vectors at J2000 and 2026-07-10 used to fit phase and mean motion" },
  ],
  omissions: [
    `The ${ephemeris} source SPK spans ${SATELLITE_VALIDITY[ephemeris].from.slice(0, 10)} to ${SATELLITE_VALIDITY[ephemeris].to.slice(0, 10)}, but that coverage does not transfer to this fixed-ellipse fit`,
    "Short-period perturbations and resonant terms",
    "Apsidal and nodal precession after the source epoch",
    "Light-time and observer-dependent apparent position",
  ],
});

export const PCK_ORIENTATION_METADATA: ScientificMetadata = {
  model: "IAU pole and prime-meridian polynomial (secular PCK terms)",
  accuracy: {
    tier: "validated-approximation",
    description: "PCK secular RA, DEC, and W terms; periodic nutation/libration terms are not yet evaluated.",
  },
  validity: {
    from: "1900-01-01T00:00:00Z",
    to: "2100-01-01T00:00:00Z",
    outsideRange: "extrapolated",
  },
  sources: [NAIF_PCK_00011, NAIF_PCK_SPECIFICATION],
  omissions: ["PCK trigonometric nutation, precession, and physical-libration terms"],
};

export const BODY_PHYSICAL_METADATA: ScientificMetadata = {
  model: "Curated mean physical constants",
  accuracy: {
    tier: "validated-approximation",
    description: "Rounded mean radii and rotation/GM values for educational rendering.",
  },
  validity: {
    from: "1900-01-01T00:00:00Z",
    to: "2100-01-01T00:00:00Z",
    outsideRange: "extrapolated",
  },
  sources: [NAIF_PCK_00011],
  omissions: ["Triaxial shape except where a future renderer consumes dedicated shape data"],
};

export const isModelWithinValidity = (metadata: ScientificMetadata, date: Date) => {
  const time = date.getTime();
  return time >= Date.parse(metadata.validity.from) && time <= Date.parse(metadata.validity.to);
};
