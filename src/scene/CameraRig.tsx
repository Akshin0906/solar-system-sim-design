import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type ComponentRef } from "react";
import { Vector3 } from "three";
import { bodies, bodiesById, childBodiesByParentId } from "../data";
import { useSelectionStore } from "../simulation/selectionStore";
import { getBodySceneRadius, type ScaleMode } from "../simulation/units";
import { useReducedMotion } from "../ui/useMediaQuery";
import {
  FOCUS_FRAMING_SAFETY,
  cameraNearForTarget,
  boundsForPoints,
  cameraOffset,
  fitDistanceForRadius,
  surfaceMinDistanceForRadius,
  visualRadiusForBody,
} from "./cameraFraming";
import type { ScenePositionsRef } from "./scenePositions";

type CameraRigProps = {
  positionsRef: ScenePositionsRef;
  mode: ScaleMode;
};

const asVector = (value: [number, number, number]) => new Vector3(value[0], value[1], value[2]);

const distanceBetween = (a: Vector3, b: Vector3) => a.distanceTo(b);

const shouldUpdateRange = (current: number, next: number, absoluteEpsilon: number, relativeEpsilon: number) =>
  Math.abs(current - next) > Math.max(absoluteEpsilon, Math.abs(next) * relativeEpsilon);

const FOCUS_TARGET_DAMPING = 4.677692;
const FOCUS_POSITION_DAMPING = 3.394221;
const FOLLOW_TARGET_DAMPING = 10.461203;
const FOLLOW_POSITION_DAMPING = 6.321631;

const dampingAlpha = (ratePerSecond: number, deltaSeconds: number) =>
  1 - Math.exp(-ratePerSecond * Math.min(deltaSeconds, 0.12));

export const CameraRig = ({ positionsRef, mode }: CameraRigProps) => {
  const controlsRef = useRef<ComponentRef<typeof OrbitControls> | null>(null);
  const cameraRangeRef = useRef<{ near: number; far: number } | null>(null);
  const controlsRangeRef = useRef<{ minDistance: number; maxDistance: number } | null>(null);
  const cameraModeRef = useRef<ReturnType<typeof useSelectionStore.getState>["cameraMode"]>("overview");
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const cameraMode = useSelectionStore((state) => state.cameraMode);
  const selectedId = useSelectionStore((state) => state.selectedId);
  const setCameraMode = useSelectionStore((state) => state.setCameraMode);
  const { camera, gl } = useThree();
  const reducedMotion = useReducedMotion();

  const selectedBody = bodiesById.get(selectedId);
  const selectedRadius = selectedBody ? getBodySceneRadius(selectedBody, mode) : 0.4;
  const moonFocusParentId =
    selectedBody?.type === "moon" && selectedBody.parentId ? selectedBody.parentId : selectedBody?.id;
  const controlsTargetBody =
    cameraMode === "moons" && moonFocusParentId ? bodiesById.get(moonFocusParentId) ?? selectedBody : selectedBody;
  const controlsTargetRadius = controlsTargetBody ? getBodySceneRadius(controlsTargetBody, mode) : 0;

  useEffect(() => {
    cameraModeRef.current = cameraMode;
  }, [cameraMode]);

  const getDesiredCamera = () => {
    const positions = positionsRef.current;
    const selectedPosition = positions[selectedId] ? asVector(positions[selectedId]) : new Vector3();
    const pointsForIds = (ids: string[]) =>
      ids.flatMap((id) => {
        const position = positions[id];
        return position ? [asVector(position)] : [];
      });

    if (cameraMode === "overview") {
      const overviewPoints = bodies
        .filter((body) => body.parentId === "sun" && (body.type === "planet" || body.id === "pluto"))
        .map((body) => body.id);
      const bounds = boundsForPoints(pointsForIds(["sun", ...overviewPoints]));
      const target = mode === "real" || mode === "readable" ? bounds.center : new Vector3(0, 0, 0);
      const fittedDistance = fitDistanceForRadius(bounds.radius, 48, mode === "real" || mode === "readable" ? 1.9 : 1.42);
      const maxDistance =
        mode === "real" || mode === "readable"
          ? 360
          : mode === "overview"
            ? 132
            : 152;
      const distance = Math.min(fittedDistance, maxDistance);
      return {
        target,
        position: target.clone().add(cameraOffset(distance, "overview")),
      };
    }

    if (cameraMode === "inner") {
      const bounds = boundsForPoints(pointsForIds(["sun", "mercury", "venus", "earth", "mars", "ceres"]));
      const distance = fitDistanceForRadius(bounds.radius, 48, 1.7);
      return { target: bounds.center, position: bounds.center.clone().add(cameraOffset(distance, "inner")) };
    }

    if (cameraMode === "outer") {
      const bounds = boundsForPoints(pointsForIds(["jupiter", "saturn", "uranus", "neptune", "pluto"]));
      const distance = fitDistanceForRadius(bounds.radius, 48, 1.72);
      return { target: bounds.center, position: bounds.center.clone().add(cameraOffset(distance, "outer")) };
    }

    if (cameraMode === "moons" && selectedBody) {
      const focusParent = selectedBody.type === "moon" && selectedBody.parentId ? selectedBody.parentId : selectedBody.id;
      const parentPosition = positions[focusParent] ? asVector(positions[focusParent]) : selectedPosition;
      const moonPositions =
        childBodiesByParentId[focusParent]
          ?.filter((body) => body.type === "moon")
          .flatMap((body) => {
            const position = positions[body.id];
            return position ? [asVector(position)] : [];
          }) ?? [];
      const moonRadius = moonPositions.reduce(
        (largest, point) => Math.max(largest, distanceBetween(parentPosition, point)),
        selectedRadius * 2.6,
      );
      const distance = fitDistanceForRadius(Math.max(moonRadius, selectedRadius * 4), 48, 1.86);
      return {
        target: parentPosition,
        position: parentPosition.clone().add(cameraOffset(Math.min(Math.max(distance, 3.2), 64), "moons")),
      };
    }

    const focusRadius = selectedBody ? visualRadiusForBody(selectedBody, selectedRadius) : selectedRadius;
    const distance = Math.min(
      Math.max(fitDistanceForRadius(focusRadius, 48, FOCUS_FRAMING_SAFETY), selectedRadius * 1.3),
      46,
    );
    return {
      target: selectedPosition,
      position: selectedPosition.clone().add(cameraOffset(distance, "focus")),
    };
  };

  useFrame((_, delta) => {
    const controls = controlsRef.current;

    if (!controls) {
      return;
    }

    if (cameraMode !== "free") {
      const desired = getDesiredCamera();

      if (reducedMotion) {
        controls.target.copy(desired.target);
        camera.position.copy(desired.position);
      } else {
        const targetAlpha = dampingAlpha(cameraMode === "follow" ? FOLLOW_TARGET_DAMPING : FOCUS_TARGET_DAMPING, delta);
        const positionAlpha = dampingAlpha(cameraMode === "follow" ? FOLLOW_POSITION_DAMPING : FOCUS_POSITION_DAMPING, delta);
        controls.target.lerp(desired.target, targetAlpha);
        camera.position.lerp(desired.position, positionAlpha);
      }
      controls.update();
    }

    const bodyRelativeControls =
      cameraMode === "focus" || cameraMode === "follow" || cameraMode === "moons";
    const previousControlRange = controlsRangeRef.current;
    const minDistance =
      bodyRelativeControls && controlsTargetBody
        ? surfaceMinDistanceForRadius(controlsTargetRadius)
        : cameraMode === "free"
          ? previousControlRange?.minDistance ?? 0.35
          : 0.35;
    const maxDistance = 520;

    if (
      !previousControlRange ||
      shouldUpdateRange(previousControlRange.minDistance, minDistance, 0.000001, 0.01) ||
      shouldUpdateRange(previousControlRange.maxDistance, maxDistance, 0.1, 0.01)
    ) {
      controls.minDistance = minDistance;
      controls.maxDistance = maxDistance;
      controlsRangeRef.current = { minDistance, maxDistance };
    }

    const targetDistance = Math.max(camera.position.distanceTo(controls.target), 0.000001);
    const nextNear = cameraNearForTarget(targetDistance, controlsTargetRadius);
    const nextFar = Math.max(targetDistance * 6, 600);
    const currentRange = cameraRangeRef.current ?? { near: camera.near, far: camera.far };

    if (
      shouldUpdateRange(currentRange.near, nextNear, 0.000001, 0.08) ||
      shouldUpdateRange(currentRange.far, nextFar, 1, 0.06)
    ) {
      camera.near = nextNear;
      camera.far = nextFar;
      camera.updateProjectionMatrix();
      cameraRangeRef.current = { near: nextNear, far: nextFar };
    }
  });

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) {
      return;
    }

    gl.domElement.tabIndex = 0;
    controls.keyPanSpeed = 18;
    controls.listenToKeyEvents(gl.domElement);
    return () => controls.stopListenToKeyEvents();
  }, [gl.domElement]);

  useEffect(() => {
    const canvas = gl.domElement;
    const enterFreeLook = () => {
      if (cameraModeRef.current !== "free") {
        setCameraMode("free");
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      pointerStartRef.current = { x: event.clientX, y: event.clientY };
    };
    const handlePointerMove = (event: PointerEvent) => {
      const start = pointerStartRef.current;
      if (!start) {
        return;
      }

      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 6) {
        enterFreeLook();
      }
    };
    const clearPointerStart = () => {
      pointerStartRef.current = null;
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown") {
        enterFreeLook();
      }
    };

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", clearPointerStart);
    canvas.addEventListener("pointercancel", clearPointerStart);
    canvas.addEventListener("wheel", enterFreeLook, { passive: true });
    canvas.addEventListener("keydown", handleKeyDown);

    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", clearPointerStart);
      canvas.removeEventListener("pointercancel", clearPointerStart);
      canvas.removeEventListener("wheel", enterFreeLook);
      canvas.removeEventListener("keydown", handleKeyDown);
    };
  }, [gl.domElement, setCameraMode]);

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping={!reducedMotion}
      dampingFactor={reducedMotion ? 0 : 0.055}
      rotateSpeed={0.42}
      zoomSpeed={0.62}
      panSpeed={0.45}
    />
  );
};
