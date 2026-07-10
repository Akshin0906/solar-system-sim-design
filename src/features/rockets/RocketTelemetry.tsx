import { useScenarioStore } from "../../scenarios/scenarioStore";
import { useTimeStore } from "../../simulation/timeStore";
import { formatDistance } from "../../simulation/units";
import type { RocketDestination } from "./destinationCatalog";
import {
  arrivalModeLabel,
  launchModeLabel,
  missionModeLabel,
  type RocketArrivalMode,
  type RocketLaunchMode,
  type RocketMissionMode,
} from "./missionOptions";
import type { RocketProfile } from "./rocketCatalog";
import {
  directCurveConfidenceLabel,
  formatCapabilityBenchmark,
  hardwareKindLabel,
  hardwareStatusLabel,
  hardwareStatusTone,
  rocketReferences,
} from "./rocketEvidence";
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
  arrivalMode: RocketArrivalMode;
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
  launchMode,
  arrivalMode,
  launchDateMs,
}: RocketTelemetryProps) => {
  const view = useRocketView(profile, destination, missionMode, launchMode, arrivalMode, launchDateMs);
  const preLaunch = view.status === "pre-launch";
  const target = view.destination;
  const transfer = view.transfer;
  const isTransfer = view.missionMode !== "direct";
  const c3Benchmarks = profile.capabilityBenchmarks.filter((benchmark) => benchmark.c3Km2S2 !== undefined);
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
        <div className="rocket-evidence-badges">
          <span className={`rocket-badge ${hardwareStatusTone[profile.hardware.status]}`}>
            {hardwareStatusLabel[profile.hardware.status]}
          </span>
          <span className={`rocket-badge curve-${profile.directCurve.confidence}`}>
            {directCurveConfidenceLabel[profile.directCurve.confidence]}
            {isTransfer ? " · unused" : ""}
          </span>
        </div>
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

      <div className={`rocket-model-contract ${isTransfer ? "physical" : "illustrative"}`}>
        <strong>{isTransfer ? "Physical transfer · hardware unchecked" : "Illustrative direct/free curve"}</strong>
        <p>
          {isTransfer
            ? "The dated conic and its C3/delta-v requirements are solved without the selected catalog curve. No payload, staging, propellant, or launcher margin is selected, so this is not a capability verdict."
            : profile.directCurve.note}
        </p>
      </div>

      {transfer && (
        <p className="rocket-note">
          {transfer.estimate.notes[0]} It is not a professional mission planner.
        </p>
      )}

      {transfer && c3Benchmarks.length > 0 && (
        <details className="rocket-c3-context">
          <summary>Reference C3 point · not a feasibility verdict</summary>
          <p className="rocket-note">
            This trajectory requires C3 {transfer.estimate.departureC3Km2S2.toFixed(2)} km²/s². The source point below
            has its own payload, configuration, date, and mission assumptions; it is context, not a pass/fail comparison.
          </p>
          {c3Benchmarks.map((benchmark) => {
            const source = rocketReferences[benchmark.sourceId];
            return (
              <div className="rocket-c3-benchmark" key={benchmark.id}>
                <strong>{benchmark.label}</strong>
                <span>{formatCapabilityBenchmark(benchmark)}</span>
                <small>
                  {benchmark.configuration}. {benchmark.caveat}
                </small>
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.publisher} source
                </a>
              </div>
            );
          })}
        </details>
      )}

      {transfer && c3Benchmarks.length === 0 && (
        <p className="rocket-note rocket-capability-disclaimer">
          {profile.hardware.kind === "launch-vehicle"
            ? `No like-for-like payload-versus-C3 curve is stored for ${profile.name}; no launch-capability claim is made.`
            : `${profile.name} is ${hardwareKindLabel[profile.hardware.kind].toLowerCase()}, not an Earth launch vehicle; no launch-capability claim is made.`}
        </p>
      )}

      <dl className="rocket-readout">
        <div>
          <dt>Mission mode</dt>
          <dd>{missionModeLabel[view.missionMode]}</dd>
        </div>
        {isTransfer && (
          <div>
            <dt>Encounter</dt>
            <dd>{arrivalModeLabel[view.arrivalMode]}</dd>
          </div>
        )}
        <div>
          <dt>Launch</dt>
          <dd>{launchModeLabel[view.launchMode]}</dd>
        </div>
        <div>
          <dt>Mission time</dt>
          <dd>{formatMissionTime(view.elapsedSeconds)}</dd>
        </div>
        <div>
          <dt>
            {isTransfer && view.transfer?.progress === 1 && !view.transfer.captureApplied
              ? "Current inertial speed"
              : isTransfer
                ? "Route mean speed"
                : "Speed"}
          </dt>
          <dd>{formatSpeed(view.speedKmS)}</dd>
        </div>
        <div>
          <dt>{isTransfer ? "Transfer arc length" : "Distance traveled"}</dt>
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
              <dt>Departure v∞</dt>
              <dd>
                {formatDeltaV(transfer.estimate.departureVInfinityKmS)} · C3{" "}
                {transfer.estimate.departureC3Km2S2.toFixed(1)} km²/s²
              </dd>
            </div>
            <div>
              <dt>LEO injection</dt>
              <dd>{formatDeltaV(transfer.estimate.parkingOrbitInjectionDeltaVKmS)}</dd>
            </div>
            <div>
              <dt>Arrival v∞</dt>
              <dd>{formatDeltaV(transfer.estimate.arrivalVInfinityKmS)}</dd>
            </div>
            <div>
              <dt>
                {transfer.captureApplied
                  ? "Capture burn (applied)"
                  : view.arrivalMode === "capture"
                    ? "Capture burn (planned)"
                    : "Capture burn (not applied)"}
              </dt>
              <dd>
                {formatDeltaV(transfer.estimate.captureDeltaVKmS)}
                {view.arrivalMode === "capture" && !transfer.captureAvailable ? " · unavailable" : ""}
              </dd>
            </div>
            <div>
              <dt>Arrival miss</dt>
              <dd>{formatDistance(transfer.estimate.arrivalMissDistanceKm)}</dd>
            </div>
          </>
        )}
      </dl>

      <p className="rocket-note">
        {launchMode === "low-earth-orbit"
          ? "400 km circular parking orbit: injection is reported as a burn requirement, never added as free cruise speed."
          : launchMode === "surface"
            ? "Surface reference: atmosphere, gravity loss, staging, and ascent are explicitly outside this trajectory model."
            : "Earth-departure reference: launcher and trajectory capability are reported separately."}
      </p>
      {transfer && view.arrivalMode === "capture" && (
        <p className="rocket-note">
          {transfer.captureApplied
            ? "The idealized impulsive capture burn is applied at intercept. Propellant, engine limits, and burn duration are not modeled."
            : transfer.captureAvailable && transfer.progress < 1
              ? "A valid intercept and idealized capture burn are planned. Propellant, engine limits, and burn duration are not modeled."
              : "Capture was requested but no valid intercept and finite capture burn were available, so the trajectory remains uncaptured."}
        </p>
      )}
    </div>
  );
};
