import { bodiesById } from "../../data";
import { DAY_SECONDS } from "../../data/constants";
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

const AVERAGE_YEAR_SECONDS = DAY_SECONDS * 365.256;
const AVERAGE_MONTH_SECONDS = DAY_SECONDS * 30.437;

const formatArrivalDuration = (seconds: number) => {
  const safeSeconds = Math.max(0, seconds);
  const years = Math.floor(safeSeconds / AVERAGE_YEAR_SECONDS);
  const afterYearsSeconds = safeSeconds - years * AVERAGE_YEAR_SECONDS;
  const months = Math.floor(afterYearsSeconds / AVERAGE_MONTH_SECONDS);
  const afterMonthsSeconds = afterYearsSeconds - months * AVERAGE_MONTH_SECONDS;
  const days = Math.round(afterMonthsSeconds / DAY_SECONDS);

  return `${years} yr ${months} mo ${days} d`;
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
        <span>Concept transfer</span>
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
          <dt>Arrival time</dt>
          <dd>{formatArrivalDuration(estimate.transferTimeSeconds)}</dd>
        </div>
        <div>
          <dt>Phase offset</dt>
          <dd>{formatPhaseAngle(estimate.phaseOffsetDeg)}</dd>
        </div>
        <div>
          <dt>Ideal phase</dt>
          <dd>{formatPhaseAngle(estimate.idealPhaseAngleDeg)}</dd>
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
