export type RocketProfile = {
  id: string;
  name: string;
  category: "existing" | "nearFuture" | "theoretical";
  description: string;
  sourceConfidence: "real" | "estimated" | "speculative";
  launchModes: Array<"earthSurface" | "lowEarthOrbit" | "earthDeparture">;
  performance: {
    maxSpeedKmS?: number;
    accelerationMS2?: number;
    ispSeconds?: number;
    thrustNewtons?: number;
    wetMassKg?: number;
    dryMassKg?: number;
  };
};

export const futureRocketCatalog: RocketProfile[] = [];
