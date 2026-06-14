import { bodiesById } from "../../data";
import type { RocketDestination } from "./destinationCatalog";
import { formatDeltaV, formatMissionTime, formatPhaseAngle } from "./rocketState";
import { estimateTransfer, type LaunchWindowQuality } from "./transferModel";

type RocketTransferPreviewProps = {
  destination: RocketDestination;
  launchDateMs: number;
};

const qualityLabel: Record<LaunchWindowQuality, string> = {
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
};

export const RocketTransferPreview = ({ destination, launchDateMs }: RocketTransferPreviewProps) => {
  const body = destination.bodyId ? bodiesById.get(destination.bodyId) : undefined;

  if (!body) {
    return null;
  }

  const estimate = estimateTransfer(body, bodiesById, launchDateMs);

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
        <span>Transfer window</span>
        <span className={`rocket-window ${estimate.launchWindowQuality}`}>
          {qualityLabel[estimate.launchWindowQuality]}
        </span>
      </div>
      <dl className="rocket-readout">
        <div>
          <dt>Transfer time</dt>
          <dd>{formatMissionTime(estimate.transferTimeSeconds)}</dd>
        </div>
        <div>
          <dt>Phase offset</dt>
          <dd>{formatPhaseAngle(estimate.phaseOffsetDeg)}</dd>
        </div>
        <div>
          <dt>Delta-v total</dt>
          <dd>{formatDeltaV(totalDeltaVKmS)}</dd>
        </div>
      </dl>
      <p className="rocket-note">{estimate.notes[0]} Scrub time to hunt for a better launch window.</p>
    </div>
  );
};
