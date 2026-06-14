import { formatDistance } from "../../simulation/units";
import type { RocketDestination } from "./destinationCatalog";
import {
  getLaunchModeOption,
  type RocketLaunchMode,
  type RocketMissionMode,
} from "./missionOptions";
import { confidenceLabel, type RocketProfile } from "./rocketCatalog";
import {
  formatMissionTime,
  formatPhaseAngle,
  formatSpeed,
  missionStatusLabel,
} from "./rocketState";
import { useRocketView } from "./useRocketView";

type RocketTelemetryProps = {
  profile: RocketProfile;
  destination: RocketDestination | null;
  missionMode: RocketMissionMode;
  launchMode: RocketLaunchMode;
  launchDateMs: number;
};

// Live mission telemetry for the active rocket. Physical values come straight from
// the flight model + ephemeris (the source of truth); the panel only formats them.
// Re-renders each frame because it subscribes to the simulation clock.
export const RocketTelemetry = ({
  profile,
  destination,
  missionMode,
  launchMode,
  launchDateMs,
}: RocketTelemetryProps) => {
  const view = useRocketView(profile, destination, missionMode, launchMode, launchDateMs);
  const preLaunch = view.status === "pre-launch";
  const target = view.destination;
  const transfer = view.transfer;
  const launchModeOption = getLaunchModeOption(view.launchMode);

  return (
    <div className="rocket-telemetry">
      <div className="rocket-status-row">
        <span className={`rocket-status ${view.status}`}>{missionStatusLabel[view.status]}</span>
        <span className={`rocket-badge ${profile.sourceConfidence}`}>{confidenceLabel[profile.sourceConfidence]}</span>
      </div>

      {preLaunch && <p className="rocket-note">Mission time is before launch — run the clock forward to fly.</p>}

      {transfer && (
        <p className="rocket-note">
          Approximate transfer preview. {transfer.estimate.notes[0]} It is not a professional mission planner.
        </p>
      )}

      <dl className="rocket-readout">
        <div>
          <dt>Mission time</dt>
          <dd>{formatMissionTime(view.elapsedSeconds)}</dd>
        </div>
        <div>
          <dt>Speed</dt>
          <dd>{formatSpeed(view.speedKmS)}</dd>
        </div>
        <div>
          <dt>Distance traveled</dt>
          <dd>{formatDistance(view.distanceTraveledKm)}</dd>
        </div>
        <div>
          <dt>From Earth</dt>
          <dd>{formatDistance(view.distanceFromEarthKm)}</dd>
        </div>
        {target && (
          <>
            <div>
              <dt>To {target.label}</dt>
              <dd>{formatDistance(target.distanceToTargetKm)}</dd>
            </div>
            <div>
              <dt>Arrival (est.)</dt>
              <dd>{target.etaSeconds === null ? "—" : formatMissionTime(target.etaSeconds)}</dd>
            </div>
          </>
        )}
        {transfer && (
          <div>
            <dt>Launch window</dt>
            <dd>
              {transfer.estimate.launchWindowQuality} ({formatPhaseAngle(transfer.estimate.phaseOffsetDeg)})
            </dd>
          </div>
        )}
      </dl>

      <p className="rocket-note">{launchModeOption.note}</p>
    </div>
  );
};
