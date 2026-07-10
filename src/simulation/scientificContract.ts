import type {
  AccuracyTier,
  CelestialBody,
  ScientificMetadata,
  ScientificSource,
} from "./orbitalElements";

export type BodyScientificContract = {
  position: {
    model: string;
    accuracyTier: AccuracyTier;
    accuracyDescription: string;
    epoch: string | null;
    epochTimeScale: string | null;
    referenceFrame: string | null;
    validFrom: string;
    validTo: string;
    isExtrapolated: boolean;
    omissions: readonly string[];
  } | null;
  orientation: {
    model: string;
    accuracyTier: AccuracyTier;
    accuracyDescription: string;
    epoch: string;
    epochTimeScale: string;
    validFrom: string;
    validTo: string;
    isExtrapolated: boolean;
    synchronousToParent: boolean;
    omissions: readonly string[];
  } | null;
  sources: readonly ScientificSource[];
};

const isExtrapolated = (metadata: ScientificMetadata, date: Date) => {
  const time = date.getTime();
  return time < Date.parse(metadata.validity.from) || time > Date.parse(metadata.validity.to);
};

const uniqueSources = (sources: readonly ScientificSource[]) => {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.id}:${source.record ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

/** Stable UI-facing summary of what the current position/orientation actually means. */
export const getBodyScientificContract = (body: CelestialBody, date: Date): BodyScientificContract => {
  const orbitMetadata = body.orbit?.metadata;
  const orientation = body.physical.orientation;
  const orientationMetadata = orientation?.metadata;
  const sources = uniqueSources([
    ...(body.scientific?.sources ?? []),
    ...(orbitMetadata?.sources ?? []),
    ...(orientationMetadata?.sources ?? []),
  ]);

  return {
    position:
      body.orbit && orbitMetadata
        ? {
            model: orbitMetadata.model,
            accuracyTier: orbitMetadata.accuracy.tier,
            accuracyDescription: orbitMetadata.accuracy.description,
            epoch: body.orbit.epoch,
            epochTimeScale: body.orbit.epochTimeScale ?? null,
            referenceFrame: body.orbit.referenceFrame?.label ?? null,
            validFrom: orbitMetadata.validity.from,
            validTo: orbitMetadata.validity.to,
            isExtrapolated: isExtrapolated(orbitMetadata, date),
            omissions: orbitMetadata.omissions ?? [],
          }
        : null,
    orientation:
      orientation && orientationMetadata
        ? {
            model: orientationMetadata.model,
            accuracyTier: orientationMetadata.accuracy.tier,
            accuracyDescription: orientationMetadata.accuracy.description,
            epoch: orientation.epoch,
            epochTimeScale: orientation.epochTimeScale,
            validFrom: orientationMetadata.validity.from,
            validTo: orientationMetadata.validity.to,
            isExtrapolated: isExtrapolated(orientationMetadata, date),
            synchronousToParent: Boolean(orientation.synchronous),
            omissions: orientationMetadata.omissions ?? [],
          }
        : null,
    sources,
  };
};
