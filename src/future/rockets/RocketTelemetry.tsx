import { formatDistance } from "../../simulation/units";
import type { RocketDestination } from "./destinationCatalog";
import {
  getLaunchModeOption,
  missionModeLabel,
  type RocketLaunchMode,
  type RocketMissionMode,
} from "./missionOptions";
import { confidenceLabel, type RocketProfile } from "./rocketCatalog";
import {
  formatDeltaV,
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
const formatDate = (dateMs: number) => new Date(dateMs).toISOString().slice(0, 10);

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

      <p className="rocket-note">Conceptual mission preview; values are educational estimates.</p>

      {transfer && (
        <p className="rocket-note">
          Approximate transfer preview. {transfer.estimate.notes[0]} It is not a professional mission planner.
        </p>
      )}

      <dl className="rocket-readout">
        <div>
          <dt>Mission mode</dt>
          <dd>{missionModeLabel[view.missionMode]}</dd>
        </div>
        <div>
          <dt>Phase</dt>
          <dd>{missionStatusLabel[view.status]}</dd>
        </div>
        <div>
          <dt>Launch mode</dt>
          <dd>{launchModeOption.shortLabel}</dd>
        </div>
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
            <div>
              <dt>Closest approach</dt>
              <dd>{formatDistance(target.closestApproachKm)}</dd>
            </div>
          </>
        )}
        {transfer && (
          <>
            <div>
              <dt>Transfer time</dt>
              <dd>{formatMissionTime(transfer.estimate.transferTimeSeconds)}</dd>
            </div>
            <div>
              <dt>Intercept date</dt>
              <dd>{formatDate(transfer.estimate.arrivalDateMs)}</dd>
            </div>
            <div>
              <dt>Launch window</dt>
              <dd>
                {transfer.estimate.launchWindowQuality} ({formatPhaseAngle(transfer.estimate.phaseOffsetDeg)})
              </dd>
            </div>
            <div>
              <dt>Ideal phase</dt>
              <dd>{formatPhaseAngle(transfer.estimate.idealPhaseAngleDeg)}</dd>
            </div>
            <div>
              <dt>Delta-v</dt>
              <dd>
                {formatDeltaV(transfer.estimate.departureDeltaVKmS)} /{" "}
                {formatDeltaV(transfer.estimate.arrivalDeltaVKmS)}
              </dd>
            </div>
          </>
        )}
      </dl>

      <p className="rocket-note">{launchModeOption.note}</p>
    </div>
  );
};
