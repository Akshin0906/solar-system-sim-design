import type { RocketProfile } from "./rocketCatalog";

export type RocketMissionMode = "direct" | "transfer";

export type RocketMissionModeOption = {
  id: RocketMissionMode;
  label: string;
  note: string;
};

export const rocketMissionModes: RocketMissionModeOption[] = [
  {
    id: "direct",
    label: "Direct aim",
    note: "Educational straight-line intercept toward the target's predicted position.",
  },
  {
    id: "transfer",
    label: "Transfer preview",
    note: "Educational Hohmann-style transfer window and curved path.",
  },
];

export const defaultMissionMode: RocketMissionMode = "direct";

export const missionModeLabel: Record<RocketMissionMode, string> = rocketMissionModes.reduce(
  (acc, mode) => ({ ...acc, [mode.id]: mode.label }),
  {} as Record<RocketMissionMode, string>,
);

export type RocketLaunchMode = "earth-departure" | "low-earth-orbit" | "surface-launch";

export type RocketLaunchModeOption = {
  id: RocketLaunchMode;
  label: string;
  shortLabel: string;
  note: string;
  initialSpeedBonusKmS: number;
};

export const rocketLaunchModes: RocketLaunchModeOption[] = [
  {
    id: "earth-departure",
    label: "Earth departure",
    shortLabel: "Earth departure",
    note: "Concept baseline: the tracked cruise begins after Earth departure.",
    initialSpeedBonusKmS: 0,
  },
  {
    id: "low-earth-orbit",
    label: "Low Earth orbit",
    shortLabel: "LEO",
    note: "Concept parking-orbit baseline; cruise starts after the departure burn.",
    initialSpeedBonusKmS: 0,
  },
  {
    id: "surface-launch",
    label: "Surface launch",
    shortLabel: "Surface",
    note: "Concept surface start; atmosphere and gravity losses are not modeled.",
    initialSpeedBonusKmS: 0,
  },
];

export const defaultLaunchMode: RocketLaunchMode = "earth-departure";

export const launchModesById = new Map(rocketLaunchModes.map((mode) => [mode.id, mode]));

export const launchModeLabel: Record<RocketLaunchMode, string> = rocketLaunchModes.reduce(
  (acc, mode) => ({ ...acc, [mode.id]: mode.label }),
  {} as Record<RocketLaunchMode, string>,
);

export const getLaunchModeOption = (launchMode: RocketLaunchMode) =>
  launchModesById.get(launchMode) ?? launchModesById.get(defaultLaunchMode)!;

export const applyLaunchModeToProfile = (
  profile: RocketProfile,
  launchMode: RocketLaunchMode,
): RocketProfile => {
  const bonus = getLaunchModeOption(launchMode).initialSpeedBonusKmS;
  if (bonus === 0) {
    return profile;
  }

  return {
    ...profile,
    initialSpeedKmS: profile.initialSpeedKmS + bonus,
    maxSpeedKmS: profile.maxSpeedKmS + bonus,
  };
};
