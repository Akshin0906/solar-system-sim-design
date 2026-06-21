import { bodiesById } from "../../data";
import type { RocketDestination } from "./destinationCatalog";
import type { RocketProfile } from "./rocketCatalog";
import { formatDeltaV, formatMissionTime, formatPhaseAngle } from "./rocketState";
import { estimateTransfer, type LaunchWindowQuality } from "./transferModel";

type RocketTransferPreviewProps = {
  destination: RocketDestination;
  launchDateMs: number;
  profile: RocketProfile;
};

const qualityLabel: Record<LaunchWindowQuality, string> = {
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
};

const formatDate = (dateMs: number) => new Date(dateMs).toISOString().slice(0, 10);

export const RocketTransferPreview = ({ destination, launchDateMs, profile }: RocketTransferPreviewProps) => {
  const body = destination.bodyId ? bodiesById.get(destination.bodyId) : undefined;

  if (!body) {
    return null;
  }

  const estimate = estimateTransfer(body, bodiesById, launchDateMs, profile);

  if (!estimate) {
    return (
      <p className="rocket-note">
        Transfer preview is unavailable for {destination.label}; launch will use direct aim.
      </p>
    );
  }

  const totalDeltaVKmS =
    estimate.arrivalDeltaVKmS === null
      ? estimate.departureDeltaVKmS
      : estimate.departureDeltaVKmS + estimate.arrivalDeltaVKmS;

  return (
    <div className="rocket-telemetry rocket-transfer-preview">
      <div className="rocket-preview-head">
        <span>Concept transfer</span>
        {/* Launch-window quality is only meaningful for heliocentric planet transfers; the
            Moon's simplified Earth-centered estimate has no real lead-angle, so omit it. */}
        {!estimate.targetIsMoon && (
          <span className={`rocket-window ${estimate.launchWindowQuality}`}>
            {qualityLabel[estimate.launchWindowQuality]}
          </span>
        )}
      </div>
      <dl className="rocket-readout">
        <div>
          <dt>Transfer time</dt>
          <dd>{formatMissionTime(estimate.transferTimeSeconds)}</dd>
        </div>
        <div>
          <dt>Intercept date</dt>
          <dd>{formatDate(estimate.arrivalDateMs)}</dd>
        </div>
        {!estimate.targetIsMoon && (
          <>
            <div>
              <dt>Planet alignment</dt>
              <dd>{formatPhaseAngle(estimate.phaseOffsetDeg)}</dd>
            </div>
            <div>
              <dt>Ideal phase</dt>
              <dd>{formatPhaseAngle(estimate.idealPhaseAngleDeg)}</dd>
            </div>
          </>
        )}
        <div>
          <dt>Delta-v total</dt>
          <dd>{formatDeltaV(totalDeltaVKmS)}</dd>
        </div>
      </dl>
      <p className="rocket-note">{estimate.notes[0]} Scrub time to hunt for a better launch window.</p>
    </div>
  );
};
