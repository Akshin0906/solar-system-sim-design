import { AU_KM } from "./constants";

export type BeltConfig = {
  id: "asteroid-belt" | "kuiper-belt";
  name: string;
  type: "asteroidBelt" | "kuiperBelt";
  innerRadiusKm: number;
  outerRadiusKm: number;
  particleCount: number;
  color: string;
  opacity: number;
  verticalSpreadKm: number;
};

export const beltConfigs: BeltConfig[] = [
  {
    id: "asteroid-belt",
    name: "Asteroid Belt",
    type: "asteroidBelt",
    innerRadiusKm: 2.1 * AU_KM,
    outerRadiusKm: 3.3 * AU_KM,
    particleCount: 2_800,
    color: "#d5c4a8",
    opacity: 0.38,
    verticalSpreadKm: 0.055 * AU_KM,
  },
  {
    id: "kuiper-belt",
    name: "Kuiper Belt",
    type: "kuiperBelt",
    innerRadiusKm: 32 * AU_KM,
    outerRadiusKm: 52 * AU_KM,
    particleCount: 2_100,
    color: "#9ec8d0",
    opacity: 0.22,
    verticalSpreadKm: 1.8 * AU_KM,
  },
];
