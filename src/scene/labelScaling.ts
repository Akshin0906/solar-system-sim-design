import type { ScaleMode } from "../simulation/units";

export const REAL_LABEL_REFERENCE_DISTANCE = 3.2;
export const MIN_REAL_LABEL_SCALE = 0.42;
export const MAX_REAL_LABEL_SCALE = 1;

export const getBodyLabelScale = (mode: ScaleMode, cameraDistance: number) => {
  if (mode !== "real") {
    return 1;
  }

  const safeDistance = Number.isFinite(cameraDistance)
    ? Math.max(cameraDistance, 0)
    : REAL_LABEL_REFERENCE_DISTANCE;
  const scaledDistance = Math.sqrt(safeDistance / REAL_LABEL_REFERENCE_DISTANCE);

  return Math.min(MAX_REAL_LABEL_SCALE, Math.max(MIN_REAL_LABEL_SCALE, scaledDistance));
};
