export type RocketMissionMode = "direct" | "hohmann" | "lambert";
export type RocketLaunchMode = "earth-departure" | "low-earth-orbit" | "surface";
export type RocketArrivalMode = "flyby" | "capture";

export type RocketMissionModeOption = {
  id: RocketMissionMode;
  label: string;
  note: string;
};

export type RocketLaunchModeOption = {
  id: RocketLaunchMode;
  label: string;
  note: string;
};

export type RocketArrivalModeOption = {
  id: RocketArrivalMode;
  label: string;
  note: string;
};

export const rocketMissionModes: RocketMissionModeOption[] = [
  {
    id: "direct",
    label: "Guided direct",
    note: "A deliberately guided straight-line demonstration, not a free ballistic trajectory.",
  },
  {
    id: "hohmann",
    label: "Hohmann coast",
    note: "A real two-body conic that only meets the target when the launch phase is favorable.",
  },
  {
    id: "lambert",
    label: "Lambert intercept",
    note: "Endpoint-targeted two-body transfer with explicit required departure and arrival velocity.",
  },
];

export const missionModesForDestination = (bodyId: string | null) =>
  bodyId === "moon"
    ? rocketMissionModes.filter((option) => option.id !== "lambert")
    : rocketMissionModes;

export const resolveMissionModeForDestination = (
  selectedMode: RocketMissionMode,
  bodyId: string | null,
): RocketMissionMode =>
  bodyId === null
    ? "direct"
    : bodyId === "moon" && selectedMode === "lambert"
      ? "hohmann"
      : selectedMode;

export const defaultMissionMode: RocketMissionMode = "direct";
export const defaultLaunchMode: RocketLaunchMode = "earth-departure";
export const defaultArrivalMode: RocketArrivalMode = "flyby";

export const rocketArrivalModes: RocketArrivalModeOption[] = [
  {
    id: "flyby",
    label: "Flyby",
    note: "Keeps the propagated arrival velocity and continues past the target without a braking burn.",
  },
  {
    id: "capture",
    label: "Capture",
    note: "Applies the displayed idealized arrival burn at intercept; propellant and vehicle feasibility remain outside this preview.",
  },
];

export const rocketLaunchModes: RocketLaunchModeOption[] = [
  {
    id: "earth-departure",
    label: "Earth departure",
    note: "Trajectory starts at Earth's heliocentric state; launch vehicle performance is reported separately.",
  },
  {
    id: "low-earth-orbit",
    label: "Low Earth orbit",
    note: "Reports the injection burn from a 400 km circular parking orbit; orbital speed is not added as free cruise speed.",
  },
  {
    id: "surface",
    label: "Surface launch",
    note: "Uses the same trajectory requirement while flagging atmosphere, gravity loss, staging, and ascent as unmodeled.",
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

export const arrivalModeLabel: Record<RocketArrivalMode, string> = rocketArrivalModes.reduce(
  (acc, mode) => ({ ...acc, [mode.id]: mode.label }),
  {} as Record<RocketArrivalMode, string>,
);

/** @deprecated Parking-orbit speed is a vector state, never a free scalar cruise bonus. */
export const directSpeedOffsetForLaunchMode = (_launchMode: RocketLaunchMode) => 0;
