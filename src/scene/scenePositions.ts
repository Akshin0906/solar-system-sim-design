import type { Vec3 } from "../simulation/orbitalElements";

export type ScenePositions = Record<string, Vec3>;
export type ScenePositionsRef = { current: ScenePositions };

export const ZERO_SCENE_POSITION: Vec3 = [0, 0, 0];
