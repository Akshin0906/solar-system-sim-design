export type BodyType =
  | "star"
  | "planet"
  | "dwarfPlanet"
  | "moon"
  | "asteroidBelt"
  | "kuiperBelt"
  | "comet";

export type Orbit = {
  semiMajorAxisKm: number;
  eccentricity: number;
  inclinationDeg: number;
  longitudeOfAscendingNodeDeg: number;
  argumentOfPeriapsisDeg: number;
  meanAnomalyAtEpochDeg: number;
  orbitalPeriodDays: number;
  epoch: string;
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
    axialTiltDeg?: number;
    rotationPeriodHours?: number;
    gravitationalParameterKm3S2?: number;
  };
  orbit?: Orbit;
  render: {
    minScreenRadiusPx?: number;
    maxScreenRadiusPx?: number;
    showLabelDefault: boolean;
    trailColor?: string;
    orbitColor?: string;
  };
};

export type Vec3 = [number, number, number];
