export type RocketMissionMode = "direct" | "transfer";
export type RocketLaunchMode = "earth-departure" | "low-earth-orbit" | "surface";

export type RocketMissionModeOption = {
  id: RocketMissionMode;
  label: string;
  note: string;
};

export type RocketLaunchModeOption = {
  id: RocketLaunchMode;
  label: string;
  note: string;
  directSpeedOffsetKmS: number;
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
export const defaultLaunchMode: RocketLaunchMode = "earth-departure";

export const rocketLaunchModes: RocketLaunchModeOption[] = [
  {
    id: "earth-departure",
    label: "Earth departure",
    note: "Cruise begins after Earth departure.",
    directSpeedOffsetKmS: 0,
  },
  {
    id: "low-earth-orbit",
    label: "Low Earth orbit",
    note: "Adds a simplified 7.8 km/s parking-orbit offset to direct and free flight.",
    directSpeedOffsetKmS: 7.8,
  },
  {
    id: "surface",
    label: "Surface launch",
    note: "Same Earth marker; atmosphere and gravity losses are not modeled.",
    directSpeedOffsetKmS: 0,
  },
];

export const missionModeLabel: Record<RocketMissionMode, string> = rocketMissionModes.reduce(
  (acc, mode) => ({ ...acc, [mode.id]: mode.label }),
  {} as Record<RocketMissionMode, string>,
);

export const launchModeLabel: Record<RocketLaunchMode, string> = rocketLaunchModes.reduce(
  (acc, mode) => ({ ...acc, [mode.id]: mode.label }),
  {} as Record<RocketLaunchMode, string>,
);

export const directSpeedOffsetForLaunchMode = (launchMode: RocketLaunchMode) =>
  rocketLaunchModes.find((mode) => mode.id === launchMode)?.directSpeedOffsetKmS ?? 0;
