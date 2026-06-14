import { useMemo } from "react";
import { useScaleStore } from "../../simulation/scaleStore";
import { useTimeStore } from "../../simulation/timeStore";
import type { ScaleMode } from "../../simulation/units";
import { destinationsById, type RocketDestination } from "./destinationCatalog";
import { rocketsById, type RocketProfile } from "./rocketCatalog";
import { computeRocketView, type RocketView } from "./rocketState";
import { useRocketStore } from "./rocketStore";
import type { RocketMissionMode } from "./missionOptions";

type RocketViewCacheEntry = {
  key: string;
  view: RocketView;
};

let lastRocketView: RocketViewCacheEntry | null = null;

const rocketViewCacheKey = (
  profile: RocketProfile,
  launchDateMs: number,
  simulationDateMs: number,
  mode: ScaleMode,
  destination: RocketDestination | null,
  missionMode: RocketMissionMode,
) =>
  [
    profile.id,
    launchDateMs,
    simulationDateMs,
    mode,
    destination?.id ?? "free-flight",
    missionMode,
  ].join("|");

export const getCachedRocketView = (
  profile: RocketProfile,
  launchDateMs: number,
  simulationDateMs: number,
  mode: ScaleMode,
  destination: RocketDestination | null,
  missionMode: RocketMissionMode,
) => {
  const key = rocketViewCacheKey(profile, launchDateMs, simulationDateMs, mode, destination, missionMode);

  if (lastRocketView?.key === key) {
    return lastRocketView.view;
  }

  const view = computeRocketView(profile, launchDateMs, simulationDateMs, mode, destination, missionMode);
  lastRocketView = { key, view };
  return view;
};

export const useRocketView = (
  profile: RocketProfile,
  destination: RocketDestination | null,
  missionMode: RocketMissionMode,
  launchDateMs: number,
) => {
  const simulationDateMs = useTimeStore((state) => state.simulationDateMs);
  const mode = useScaleStore((state) => state.mode);

  return useMemo(
    () => getCachedRocketView(profile, launchDateMs, simulationDateMs, mode, destination, missionMode),
    [destination, launchDateMs, missionMode, mode, profile, simulationDateMs],
  );
};

export const useActiveRocketView = () => {
  const activeRocketId = useRocketStore((state) => state.activeRocketId);
  const activeDestinationId = useRocketStore((state) => state.activeDestinationId);
  const activeMissionMode = useRocketStore((state) => state.activeMissionMode);
  const launchDateMs = useRocketStore((state) => state.launchDateMs);
  const simulationDateMs = useTimeStore((state) => state.simulationDateMs);
  const mode = useScaleStore((state) => state.mode);

  const profile = activeRocketId ? rocketsById.get(activeRocketId) : undefined;
  const destination = activeDestinationId ? destinationsById.get(activeDestinationId) ?? null : null;

  const view = useMemo(() => {
    if (!profile || launchDateMs === null) {
      return null;
    }

    return getCachedRocketView(
      profile,
      launchDateMs,
      simulationDateMs,
      mode,
      destination,
      activeMissionMode,
    );
  }, [activeMissionMode, destination, launchDateMs, mode, profile, simulationDateMs]);

  return {
    activeMissionMode,
    destination,
    launchDateMs,
    mode,
    profile,
    view,
  };
};
