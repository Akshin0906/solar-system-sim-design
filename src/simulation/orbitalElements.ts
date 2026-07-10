export type BodyType =
  | "star"
  | "planet"
  | "dwarfPlanet"
  | "moon"
  | "asteroidBelt"
  | "kuiperBelt"
  | "comet";

/** Time scale used by the source data, not the browser clock used for display. */
export type EphemerisTimeScale = "TDB" | "TT" | "UTC";

export type AccuracyTier =
  | "authoritative-ephemeris"
  | "ephemeris-snapshot"
  | "validated-approximation"
  | "mean-elements"
  | "illustrative";

export type ScientificSource = {
  id: string;
  title: string;
  publisher: string;
  url: string;
  /** Optional target/table/kernel identifier needed to reproduce this datum. */
  record?: string;
};

export type ModelValidity = {
  from: string;
  to: string;
  /** What the app does rather than implying the model remains validated. */
  outsideRange: "extrapolated" | "clamped" | "not-available";
};

export type ScientificMetadata = {
  model: string;
  accuracy: {
    tier: AccuracyTier;
    description: string;
    typicalPositionErrorKm?: number;
  };
  validity: ModelValidity;
  sources: readonly ScientificSource[];
  omissions?: readonly string[];
};

/**
 * Orbital-element plane.  The scene's inertial frame is the IAU76/80 ecliptic of
 * J2000.  Elements published in a planet equator or local Laplace plane carry the
 * plane pole in ICRF so solveOrbit can rotate them into that scene frame.
 */
export type OrbitReferenceFrame =
  | {
      id: "ecliptic-j2000";
      label: "IAU76/80 ecliptic of J2000";
    }
  | {
      id: "icrf-equatorial";
      label: "ICRF equatorial";
    }
  | {
      id: "laplace-plane" | "body-equator";
      label: string;
      poleRightAscensionDeg: number;
      poleDeclinationDeg: number;
      poleEpoch: string;
      poleTimeScale: EphemerisTimeScale;
      centerId: string;
    };

export type OrientationModel = {
  kind: "iau-pck";
  epoch: string;
  epochTimeScale: EphemerisTimeScale;
  /** ICRF pole polynomial: constant plus degrees per Julian century. */
  pole: {
    rightAscensionDeg: number;
    declinationDeg: number;
    rightAscensionRateDegPerCentury?: number;
    declinationRateDegPerCentury?: number;
  };
  /** Prime-meridian polynomial W: constant plus signed degrees per TDB day. */
  primeMeridian: {
    angleDeg: number;
    rateDegPerDay: number;
    accelerationDegPerDay2?: number;
  };
  /**
   * Regular moons can use an instantaneous parent-facing frame.  This is the
   * single source of spin direction for the lock; no negative period flag is used.
   */
  synchronous?: {
    parentId: string;
    subParentLongitudeDeg?: number;
  };
  metadata: ScientificMetadata;
};

export type Orbit = {
  semiMajorAxisKm: number;
  eccentricity: number;
  inclinationDeg: number;
  longitudeOfAscendingNodeDeg: number;
  argumentOfPeriapsisDeg: number;
  meanAnomalyAtEpochDeg: number;
  orbitalPeriodDays: number;
  /** ISO representation of the source epoch; epochTimeScale states its scale. */
  epoch: string;
  epochTimeScale?: EphemerisTimeScale;
  referenceFrame?: OrbitReferenceFrame;
  metadata?: ScientificMetadata;
  /** @deprecated Direction belongs in inclination/reference-frame geometry. */
  retrograde?: boolean;
  elementRatesPerCentury?: {
    semiMajorAxisAu?: number;
    eccentricity?: number;
    inclinationDeg?: number;
    longitudeOfAscendingNodeDeg?: number;
    longitudeOfPeriapsisDeg?: number;
    meanLongitudeDeg?: number;
  };
};

export type CelestialBody = {
  id: string;
  name: string;
  type: BodyType;
  parentId: string | null;
  physical: {
    radiusKm: number;
    color: string;
    texture?: string;
    /** Legacy renderer hint. Prefer orientation.pole for scientific geometry. */
    axialTiltDeg?: number;
    /** Legacy positive duration. Spin direction lives only in orientation W. */
    rotationPeriodHours?: number;
    gravitationalParameterKm3S2?: number;
    orientation?: OrientationModel;
  };
  orbit?: Orbit;
  scientific?: ScientificMetadata;
  render: {
    minScreenRadiusPx?: number;
    maxScreenRadiusPx?: number;
    showLabelDefault: boolean;
    trailColor?: string;
    orbitColor?: string;
  };
};

export type Vec3 = [number, number, number];
