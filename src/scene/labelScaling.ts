import type { ScaleMode } from "../simulation/units";

export const REAL_LABEL_REFERENCE_DISTANCE = 3.2;
export const MIN_REAL_LABEL_SCALE = 0.42;
export const MAX_REAL_LABEL_SCALE = 1;
export const BODY_LABEL_DISTANCE_FACTOR = 10;
export const DEFAULT_LABEL_CAMERA_FOV_DEG = 48;
export const MIN_PROJECTED_LABEL_DISTANCE = 0.05;
export const MIN_PROJECTED_LABEL_SCALE = 0.78;
export const MAX_PROJECTED_LABEL_SCALE = 1.08;
export const SCENE_HTML_Z_INDEX_RANGE: [number, number] = [4, 3];

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

// Mirrors Drei Html's perspective distanceFactor scale so the inner CSS transform can cap the final on-screen size.
const getProjectedHtmlScale = (cameraDistance: number, cameraFovDeg = DEFAULT_LABEL_CAMERA_FOV_DEG) => {
  const safeDistance = Number.isFinite(cameraDistance)
    ? Math.max(cameraDistance, MIN_PROJECTED_LABEL_DISTANCE)
    : REAL_LABEL_REFERENCE_DISTANCE;
  const safeFovDeg = Number.isFinite(cameraFovDeg) && cameraFovDeg > 0
    ? cameraFovDeg
    : DEFAULT_LABEL_CAMERA_FOV_DEG;
  const fovRad = (safeFovDeg * Math.PI) / 180;

  return BODY_LABEL_DISTANCE_FACTOR / (2 * Math.tan(fovRad / 2) * safeDistance);
};

export const getBodyLabelScale = (mode: ScaleMode, cameraDistance: number, cameraFovDeg?: number) => {
  if (mode !== "real") {
    const projectedScale = getProjectedHtmlScale(cameraDistance, cameraFovDeg);
    const clampedScale = clamp(projectedScale, MIN_PROJECTED_LABEL_SCALE, MAX_PROJECTED_LABEL_SCALE);

    return clampedScale / projectedScale;
  }

  const safeDistance = Number.isFinite(cameraDistance)
    ? Math.max(cameraDistance, 0)
    : REAL_LABEL_REFERENCE_DISTANCE;
  const scaledDistance = Math.sqrt(safeDistance / REAL_LABEL_REFERENCE_DISTANCE);

  return clamp(scaledDistance, MIN_REAL_LABEL_SCALE, MAX_REAL_LABEL_SCALE);
};
