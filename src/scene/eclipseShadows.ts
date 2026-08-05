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
