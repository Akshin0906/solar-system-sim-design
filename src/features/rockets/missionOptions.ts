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
