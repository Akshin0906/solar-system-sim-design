import { useScenarioStore } from "../../scenarios/scenarioStore";
import { useTimeStore } from "../../simulation/timeStore";
import { formatDistance } from "../../simulation/units";
import type { RocketDestination } from "./destinationCatalog";
import {
  earthDepartureLaunchMode,
  missionModeLabel,
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
  launchDateMs: number;
};

// Live mission telemetry for the active rocket. Physical values come straight from
// the flight model + ephemeris (the source of truth); the panel only formats them.
// Re-renders each frame because it subscribes to the simulation clock.
const formatDate = (dateMs: number) => new Date(dateMs).toISOString().slice(0, 10);
const launchWindowQualityLabel: Record<string, string> = {
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
};

export const RocketTelemetry = ({
  profile,
  destination,
  missionMode,
  launchDateMs,
}: RocketTelemetryProps) => {
  const view = useRocketView(profile, destination, missionMode, launchDateMs);
  const preLaunch = view.status === "pre-launch";
  const target = view.destination;
  const transfer = view.transfer;
  const scenarioActive = useScenarioStore((state) => state.activeScenarioId !== null);

  const playForward = () => {
    // Resume playback moving forward so the mission clock crosses the launch instant —
    // the global transport bar is elsewhere on screen, so offer the action inline.
    useTimeStore.getState().setDirection(1);
    useTimeStore.getState().setPaused(false);
  };

  return (
    <div className="rocket-telemetry">
      <div className="rocket-status-row">
        <span className={`rocket-status ${view.status}`}>{missionStatusLabel[view.status]}</span>
        <span className={`rocket-badge ${profile.sourceConfidence}`}>{confidenceLabel[profile.sourceConfidence]}</span>
      </div>

      {scenarioActive && (
        <p className="rocket-note">
          Mission clock is paused while a doomsday scenario runs — exit the scenario to resume the flight.
        </p>
      )}

      {preLaunch && !scenarioActive && (
        <p className="rocket-note">
          Mission time is before launch —{" "}
          <button type="button" className="rocket-inline-action" onClick={playForward}>
            play forward
          </button>{" "}
          to fly.
        </p>
      )}

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
          <dt>Launch</dt>
          <dd>{earthDepartureLaunchMode.shortLabel}</dd>
        </div>
        <div>
          <dt>Mission time</dt>
          <dd>{formatMissionTime(view.elapsedSeconds)}</dd>
        </div>
        <div>
          <dt>{view.missionMode === "transfer" ? "Avg speed" : "Speed"}</dt>
          <dd>{formatSpeed(view.speedKmS)}</dd>
        </div>
        <div>
          {/* In transfer mode the drawn route is an illustrative arc (not the Hohmann
              ellipse), so its length is a route measure, not a physical odometer that
              reconciles with the vis-viva "Avg speed" shown above. */}
          <dt title={view.missionMode === "transfer" ? "Illustrative route length, not a physical odometer" : undefined}>
            {view.missionMode === "transfer" ? "Route length (approx.)" : "Distance traveled"}
          </dt>
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
            {/* The Moon path is a simplified Earth-centered parking-orbit estimate with no
                heliocentric departure reference, so a "lead angle" launch-window readout is
                not meaningful for it — show alignment only for heliocentric planet transfers. */}
            {!transfer.estimate.targetIsMoon && (
              <>
                <div>
                  <dt>Planet alignment</dt>
                  <dd>
                    {launchWindowQualityLabel[transfer.estimate.launchWindowQuality]}{" "}
                    ({formatPhaseAngle(transfer.estimate.phaseOffsetDeg)})
                  </dd>
                </div>
                <div>
                  <dt>Ideal phase</dt>
                  <dd>{formatPhaseAngle(transfer.estimate.idealPhaseAngleDeg)}</dd>
                </div>
              </>
            )}
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

      <p className="rocket-note">{earthDepartureLaunchMode.note}</p>
    </div>
  );
};
