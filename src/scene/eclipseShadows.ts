import type { CelestialBody } from "../simulation/orbitalElements";

export const MAX_ANALYTIC_OCCLUDERS = 4;

export const getFocusedSystemParentId = (
  selectedBody: CelestialBody | undefined,
  childBodiesByParentId: Record<string, CelestialBody[]>,
) => {
  if (!selectedBody) {
    return undefined;
  }
  if (selectedBody.type === "moon") {
    return selectedBody.parentId ?? undefined;
  }
  return childBodiesByParentId[selectedBody.id]?.some((body) => body.type === "moon")
    ? selectedBody.id
    : undefined;
};

export const getAnalyticOccluders = (
  body: CelestialBody,
  focusedSystemParentId: string | undefined,
  bodiesById: Map<string, CelestialBody>,
  childBodiesByParentId: Record<string, CelestialBody[]>,
) => {
  if (!focusedSystemParentId) {
    return [];
  }

  if (body.id === focusedSystemParentId) {
    return [...(childBodiesByParentId[focusedSystemParentId] ?? [])]
      .filter((candidate) => candidate.type === "moon")
      .sort((a, b) => b.physical.radiusKm - a.physical.radiusKm)
      .slice(0, MAX_ANALYTIC_OCCLUDERS);
  }

  if (body.type === "moon" && body.parentId === focusedSystemParentId) {
    const parent = bodiesById.get(focusedSystemParentId);
    return parent ? [parent] : [];
  }

  return [];
};

// CPU mirror of the shader's ray/sphere test. It keeps the approximation easy to
// verify and useful to future event/tour code without requiring a WebGL context.
export const analyticSphereOcclusion = (
  surfacePoint: readonly [number, number, number],
  solarPosition: readonly [number, number, number],
  occluderPosition: readonly [number, number, number],
  occluderRadius: number,
) => {
  const toSun: [number, number, number] = [
    solarPosition[0] - surfacePoint[0],
    solarPosition[1] - surfacePoint[1],
    solarPosition[2] - surfacePoint[2],
  ];
  const solarDistance = Math.hypot(...toSun);
  if (solarDistance <= 0 || occluderRadius <= 0) {
    return 0;
  }

  const solarRay: [number, number, number] = [
    toSun[0] / solarDistance,
    toSun[1] / solarDistance,
    toSun[2] / solarDistance,
  ];
  const toOccluder: [number, number, number] = [
    occluderPosition[0] - surfacePoint[0],
    occluderPosition[1] - surfacePoint[1],
    occluderPosition[2] - surfacePoint[2],
  ];
  const alongRay = toOccluder[0] * solarRay[0] + toOccluder[1] * solarRay[1] + toOccluder[2] * solarRay[2];
  if (alongRay <= 0 || alongRay >= solarDistance) {
    return 0;
  }

  const perpendicular = Math.hypot(
    toOccluder[0] - solarRay[0] * alongRay,
    toOccluder[1] - solarRay[1] * alongRay,
    toOccluder[2] - solarRay[2] * alongRay,
  );
  const penumbraStart = occluderRadius * 0.82;
  const penumbraEnd = occluderRadius * 1.18;
  const amount = Math.min(1, Math.max(0, (perpendicular - penumbraStart) / (penumbraEnd - penumbraStart)));
  const smoothAmount = amount * amount * (3 - 2 * amount);
  return 1 - smoothAmount;
};
