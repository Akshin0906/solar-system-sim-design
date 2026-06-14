import { useScaleStore } from "../../simulation/scaleStore";
import { useTimeStore } from "../../simulation/timeStore";
import { formatDistance } from "../../simulation/units";
import type { RocketDestination } from "./destinationCatalog";
import { categoryLabel, confidenceLabel, type RocketProfile } from "./rocketCatalog";
import { computeRocketView, formatMissionTime, formatSpeed, missionStatusLabel } from "./rocketState";

type RocketTelemetryProps = {
  profile: RocketProfile;
  destination: RocketDestination | null;
  launchDateMs: number;
};

// Live mission telemetry for the active rocket. Physical values come straight from
// the flight model + ephemeris (the source of truth); the panel only formats them.
// Re-renders each frame because it subscribes to the simulation clock.
export const RocketTelemetry = ({ profile, destination, launchDateMs }: RocketTelemetryProps) => {
  const simulationDateMs = useTimeStore((state) => state.simulationDateMs);
  const mode = useScaleStore((state) => state.mode);
  const view = computeRocketView(profile, launchDateMs, simulationDateMs, mode, destination);
  const preLaunch = simulationDateMs < launchDateMs;
  const target = view.destination;

  return (
    <div className="rocket-telemetry">
      <div className="rocket-telemetry-head">
        <div>
          <span className="rocket-kicker">{categoryLabel[profile.category]}</span>
          <strong>{profile.name}</strong>
        </div>
        <span className={`rocket-badge ${profile.sourceConfidence}`}>{confidenceLabel[profile.sourceConfidence]}</span>
      </div>

      <div className="rocket-status-row">
        <span className={`rocket-status ${view.status}`}>{missionStatusLabel[view.status]}</span>
        <span className="rocket-status-dest">{target ? `→ ${target.label}` : "Free flight"}</span>
      </div>

      {preLaunch && <p className="rocket-note">Mission time is before launch — run the clock forward to fly.</p>}

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
            <div>
              <dt>Closest approach</dt>
              <dd>{formatDistance(target.closestApproachKm)}</dd>
            </div>
          </>
        )}
      </dl>
    </div>
  );
};
