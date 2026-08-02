import { TIME_PRESETS, type TimePresetId } from "../../data/constants";
import type { TransferEstimate } from "./transferModel";

const TARGET_PLAYBACK_SECONDS = 12;
const MIN_COMFORTABLE_PLAYBACK_SECONDS = 8;
const MAX_COMFORTABLE_PLAYBACK_SECONDS = 15;

export type RocketPlaybackRecommendation = {
  estimatedRealSeconds: number;
  preset: TimePresetId | null;
  timeScale: number;
};

const realPlaybackSeconds = (missionDurationSeconds: number, timeScale: number) =>
  missionDurationSeconds / timeScale;

/**
 * Pick a mission-watch speed that reaches the planned encounter quickly enough
 * to feel alive without turning a multi-year flight into a single-frame jump.
 * Existing transport presets win when one lands inside the comfort window;
 * otherwise the clock uses a bounded custom rate aimed at twelve real seconds.
 */
export const recommendRocketPlayback = (
  missionDurationSeconds: number | null | undefined,
): RocketPlaybackRecommendation | null => {
  if (!missionDurationSeconds || !Number.isFinite(missionDurationSeconds) || missionDurationSeconds <= 0) {
    return null;
  }

  const presetCandidates = TIME_PRESETS.map((preset) => ({
    estimatedRealSeconds: realPlaybackSeconds(missionDurationSeconds, preset.secondsPerSecond),
    preset,
  })).filter(
    ({ estimatedRealSeconds }) =>
      estimatedRealSeconds >= MIN_COMFORTABLE_PLAYBACK_SECONDS &&
      estimatedRealSeconds <= MAX_COMFORTABLE_PLAYBACK_SECONDS,
  );

  const bestPreset = presetCandidates.reduce<(typeof presetCandidates)[number] | null>(
    (best, candidate) =>
      !best ||
      Math.abs(candidate.estimatedRealSeconds - TARGET_PLAYBACK_SECONDS) <
        Math.abs(best.estimatedRealSeconds - TARGET_PLAYBACK_SECONDS)
        ? candidate
        : best,
    null,
  );

  if (bestPreset) {
    return {
      estimatedRealSeconds: bestPreset.estimatedRealSeconds,
      preset: bestPreset.preset.id,
      timeScale: bestPreset.preset.secondsPerSecond,
    };
  }

  const minimumScale = TIME_PRESETS[0].secondsPerSecond;
  const maximumScale = TIME_PRESETS[TIME_PRESETS.length - 1].secondsPerSecond;
  const timeScale = Math.min(
    Math.max(missionDurationSeconds / TARGET_PLAYBACK_SECONDS, minimumScale),
    maximumScale,
  );
  const exactPreset = TIME_PRESETS.find((preset) => preset.secondsPerSecond === timeScale);

  return {
    estimatedRealSeconds: realPlaybackSeconds(missionDurationSeconds, timeScale),
    preset: exactPreset?.id ?? null,
    timeScale,
  };
};

export const formatRocketPlaybackRate = (recommendation: RocketPlaybackRecommendation) => {
  const exactPreset = recommendation.preset
    ? TIME_PRESETS.find((preset) => preset.id === recommendation.preset)
    : null;
  if (exactPreset) {
    return exactPreset.label;
  }

  const dayScale = TIME_PRESETS.find((preset) => preset.id === "day")?.secondsPerSecond ?? 86_400;
  const yearScale = TIME_PRESETS.find((preset) => preset.id === "year")?.secondsPerSecond ?? dayScale * 365.256;
  const rate = recommendation.timeScale >= yearScale
    ? `${(recommendation.timeScale / yearScale).toLocaleString(undefined, { maximumFractionDigits: 1 })} years/sec`
    : `${(recommendation.timeScale / dayScale).toLocaleString(undefined, { maximumFractionDigits: 1 })} days/sec`;
  return `~${rate}`;
};

export const transferHasPredictedIntercept = (
  estimate: TransferEstimate | null,
  destinationRadiusKm: number,
) => {
  if (!estimate) {
    return false;
  }

  const interceptToleranceKm = Math.max(destinationRadiusKm * 1.05, 10);
  return estimate.interceptGuaranteed || estimate.arrivalMissDistanceKm <= interceptToleranceKm;
};

export const transferCaptureAvailable = (
  estimate: TransferEstimate | null,
  destinationRadiusKm: number,
) => transferHasPredictedIntercept(estimate, destinationRadiusKm) && estimate?.captureDeltaVKmS !== null;
