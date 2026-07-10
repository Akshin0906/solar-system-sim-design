import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useLayoutEffect, useRef, type ComponentRef } from "react";
import { Vector3 } from "three";
import { bodies, bodiesById, childBodiesByParentId } from "../data";
import { beltConfigs } from "../data/belts";
import { getLiveCameraPose, useSelectionStore, type CameraPose } from "../simulation/selectionStore";
import { getBodySceneRadius, scaleDistanceFromSun, type ScaleMode } from "../simulation/units";
import { useReducedMotion } from "../ui/useMediaQuery";
import {
  CAMERA_FOV_DEG,
  FOCUS_FRAMING_SAFETY,
  MIN_CAMERA_NEAR,
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
const asTuple = (value: Vector3): [number, number, number] => [value.x, value.y, value.z];
const diagnosticTuple = (value: [number, number, number]): [number, number, number] =>
  value.map((coordinate) => Number(coordinate.toFixed(6))) as [number, number, number];
const diagnosticPose = (pose: CameraPose): CameraPose => ({
  position: diagnosticTuple(pose.position),
  target: diagnosticTuple(pose.target),
  up: diagnosticTuple(pose.up),
});

const distanceBetween = (a: Vector3, b: Vector3) => a.distanceTo(b);

const shouldUpdateRange = (current: number, next: number, absoluteEpsilon: number, relativeEpsilon: number) =>
  Math.abs(current - next) > Math.max(absoluteEpsilon, Math.abs(next) * relativeEpsilon);

const FOCUS_TARGET_DAMPING = 4.677692;
const FOCUS_POSITION_DAMPING = 3.394221;
const FOLLOW_TARGET_DAMPING = 10.461203;
const FOLLOW_POSITION_DAMPING = 6.321631;
const OBSERVER_SURFACE_MULTIPLIER = 1.04;
const OBSERVER_LOOK_RADIUS_MULTIPLIER = 40;
const OBSERVER_MIN_LOOK_DISTANCE = 8;
const OBSERVER_DOWNWARD_BIAS = 0.25;
const kuiperBelt = beltConfigs.find((belt) => belt.id === "kuiper-belt");

const systemPresetParentId = (cameraMode: ReturnType<typeof useSelectionStore.getState>["cameraMode"]) =>
  cameraMode === "earth-moon"
    ? "earth"
    : cameraMode === "jupiter-system"
      ? "jupiter"
      : cameraMode === "saturn-system"
        ? "saturn"
        : null;

const dampingAlpha = (ratePerSecond: number, deltaSeconds: number) =>
  1 - Math.exp(-ratePerSecond * Math.min(deltaSeconds, 0.12));

export const CameraRig = ({ positionsRef, mode }: CameraRigProps) => {
  const controlsRef = useRef<ComponentRef<typeof OrbitControls> | null>(null);
  const cameraRangeRef = useRef<{ near: number; far: number } | null>(null);
  const controlsRangeRef = useRef<{ minDistance: number; maxDistance: number } | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const cameraMode = useSelectionStore((state) => state.cameraMode);
  const cameraModeRef = useRef(cameraMode);
  const selectedId = useSelectionStore((state) => state.selectedId);
  const rocketTarget = useSelectionStore((state) => state.rocketTarget);
  const cameraRestoreRequest = useSelectionStore((state) => state.cameraRestoreRequest);
  const setCameraMode = useSelectionStore((state) => state.setCameraMode);
  const reportCameraPose = useSelectionStore((state) => state.reportCameraPose);
  const acknowledgeCameraRestore = useSelectionStore((state) => state.acknowledgeCameraRestore);
  const { camera, gl, invalidate } = useThree();
  const reducedMotion = useReducedMotion();

  const selectedBody = bodiesById.get(selectedId);
  const selectedRadius = selectedBody ? getBodySceneRadius(selectedBody, mode) : 0.4;
  const presetParentId = systemPresetParentId(cameraMode);
  const moonFocusParentId =
    selectedBody?.type === "moon" && selectedBody.parentId ? selectedBody.parentId : selectedBody?.id;
  const controlsTargetBody =
    presetParentId
      ? bodiesById.get(presetParentId)
      : cameraMode === "moons" && moonFocusParentId
        ? bodiesById.get(moonFocusParentId) ?? selectedBody
        : selectedBody;
  const controlsTargetRadius =
    cameraMode === "rocket-follow" && rocketTarget
      ? rocketTarget.radius
      : controlsTargetBody
        ? getBodySceneRadius(controlsTargetBody, mode)
        : 0;
  const isFollowMode = cameraMode === "follow" || cameraMode === "observer" || cameraMode === "rocket-follow";

  const publishCameraPose = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) {
      return;
    }
    const pose: CameraPose = {
      position: asTuple(camera.position),
      target: asTuple(controls.target),
      up: asTuple(camera.up),
    };
    reportCameraPose(pose);
    // A stable diagnostic surface lets the production E2E suite verify that a
    // manually composed orbit-camera view survives an authored-mode round trip.
    gl.domElement.dataset.cameraPose = JSON.stringify(diagnosticPose(pose));
  }, [camera, gl.domElement, reportCameraPose]);

  const clearControlMomentum = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) {
      return;
    }
    const dampingWasEnabled = controls.enableDamping;
    controls.enableDamping = false;
    controls.update();
    controls.enableDamping = dampingWasEnabled;
  }, []);

  const applyCameraPose = useCallback((pose: CameraPose) => {
    const controls = controlsRef.current;
    if (!controls) {
      return false;
    }
    // A tour can take ownership while OrbitControls still has a damped rotation,
    // pan, or zoom delta queued from the user's last gesture. Consume and clear
    // those private accumulators before applying the saved pose; otherwise the
    // restored camera keeps drifting even though its logical mode is already free.
    clearControlMomentum();
    camera.position.set(pose.position[0], pose.position[1], pose.position[2]);
    camera.up.set(pose.up[0], pose.up[1], pose.up[2]);
    controls.target.set(pose.target[0], pose.target[1], pose.target[2]);
    camera.updateProjectionMatrix();
    controls.update();
    publishCameraPose();
    invalidate();
    return true;
  }, [camera, clearControlMomentum, invalidate, publishCameraPose]);

  useLayoutEffect(() => {
    if (!cameraRestoreRequest) {
      return;
    }
    if (cameraRestoreRequest.expectedMode !== cameraMode) {
      acknowledgeCameraRestore(cameraRestoreRequest.revision);
      return;
    }
    if (applyCameraPose(cameraRestoreRequest.pose)) {
      acknowledgeCameraRestore(cameraRestoreRequest.revision);
    }
  }, [acknowledgeCameraRestore, applyCameraPose, cameraMode, cameraRestoreRequest]);

  // `liveCameraPose` is kept outside Three so a Canvas/WebGL remount does not
  // discard a free-look composition. Pending deep-link/session requests use the
  // revisioned path above; this mount-only fallback covers a plain scene remount.
  useLayoutEffect(() => {
    if (cameraModeRef.current !== "free" || useSelectionStore.getState().cameraRestoreRequest) {
      return;
    }
    const pose = getLiveCameraPose();
    if (pose) {
      applyCameraPose(pose);
    }
    // Applying this on later free-look transitions would fight the first drag or
    // wheel event that intentionally entered free mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    publishCameraPose();
  }, [publishCameraPose]);

  useLayoutEffect(() => {
    const previousMode = cameraModeRef.current;
    cameraModeRef.current = cameraMode;
    if (previousMode !== cameraMode && cameraMode !== "free") {
      // Automated presets own the next camera move. Discard any inertial tail
      // from the gesture that handed off control so the authored frame is not
      // temporarily rotated or panned away from its intended subject.
      clearControlMomentum();
    }
  }, [cameraMode, clearControlMomentum]);

  const getDesiredCamera = () => {
    const positions = positionsRef.current;
    const selectedPosition = positions[selectedId] ? asVector(positions[selectedId]) : new Vector3();
    const cameraAspect = "aspect" in camera && typeof camera.aspect === "number" ? camera.aspect : 1;
    const fitDistance = (radius: number, safety: number) => fitDistanceForRadius(radius, CAMERA_FOV_DEG, safety, cameraAspect);
    const pointsForIds = (ids: string[]) =>
      ids.flatMap((id) => {
        const position = positions[id];
        return position ? [asVector(position)] : [];
      });

    if (cameraMode === "rocket-follow" && rocketTarget) {
      const target = asVector(rocketTarget.position);
      const focusRadius = Math.max(rocketTarget.radius, 0.35);
      const distance = Math.min(Math.max(fitDistance(focusRadius, 4.2), 4.8), 36);
      return {
        target,
        position: target.clone().add(cameraOffset(distance, "focus")),
      };
    }

    if (cameraMode === "observer" && selectedBody && selectedBody.id !== "sun") {
      const sunPosition = positions.sun ? asVector(positions.sun) : new Vector3();
      const sunward = sunPosition.sub(selectedPosition).normalize();
      if (sunward.lengthSq() > 0) {
        const sceneUp = new Vector3(0, 1, 0);
        const terminatorNormal = sceneUp
          .clone()
          .addScaledVector(sunward, -sceneUp.dot(sunward))
          .normalize();
        if (terminatorNormal.lengthSq() === 0) {
          terminatorNormal.crossVectors(sunward, new Vector3(0, 0, 1)).normalize();
        }
        const observerRadius = visualRadiusForBody(selectedBody, selectedRadius);
        const position = selectedPosition
          .clone()
          .addScaledVector(terminatorNormal, observerRadius * OBSERVER_SURFACE_MULTIPLIER);
        const lookDistance = Math.max(
          observerRadius * OBSERVER_LOOK_RADIUS_MULTIPLIER,
          OBSERVER_MIN_LOOK_DISTANCE,
        );
        const viewDirection = sunward
          .clone()
          .addScaledVector(terminatorNormal, -OBSERVER_DOWNWARD_BIAS)
          .normalize();
        return {
          target: position.clone().addScaledVector(viewDirection, lookDistance),
          position,
          maxDistance: lookDistance * 2,
        };
      }
    }

    if (cameraMode === "overview") {
      const overviewPoints = bodies
        .filter((body) => body.parentId === "sun" && (body.type === "planet" || body.id === "pluto"))
        .map((body) => body.id);
      const bounds = boundsForPoints(pointsForIds(["sun", ...overviewPoints]));
      const target = mode === "real" || mode === "readable" ? bounds.center : new Vector3(0, 0, 0);
      const fittedDistance = fitDistance(bounds.radius, mode === "real" || mode === "readable" ? 1.9 : 1.42);
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
      const distance = fitDistance(bounds.radius, 1.7);
      return { target: bounds.center, position: bounds.center.clone().add(cameraOffset(distance, "inner")) };
    }

    if (cameraMode === "outer") {
      const bounds = boundsForPoints(pointsForIds(["jupiter", "saturn", "uranus", "neptune", "pluto"]));
      const distance = fitDistance(bounds.radius, 1.72);
      return { target: bounds.center, position: bounds.center.clone().add(cameraOffset(distance, "outer")) };
    }

    if (presetParentId) {
      const moonIds = childBodiesByParentId[presetParentId]?.filter((body) => body.type === "moon").map((body) => body.id) ?? [];
      const bounds = boundsForPoints(pointsForIds([presetParentId, ...moonIds]));
      const distance = fitDistance(Math.max(bounds.radius, controlsTargetRadius * 4), presetParentId === "earth" ? 1.9 : 1.72);
      return {
        target: bounds.center,
        position: bounds.center.clone().add(cameraOffset(Math.min(Math.max(distance, 3.2), 96), "moons")),
      };
    }

    if (cameraMode === "kuiper-belt" && kuiperBelt) {
      const radius = scaleDistanceFromSun(kuiperBelt.outerRadiusKm, mode) * 1.06;
      const distance = fitDistance(radius, 1.18);
      return {
        target: new Vector3(),
        position: cameraOffset(distance, "overview"),
        maxDistance: distance * 1.18,
      };
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
      const distance = fitDistance(Math.max(moonRadius, selectedRadius * 4), 1.86);
      return {
        target: parentPosition,
        position: parentPosition.clone().add(cameraOffset(Math.min(Math.max(distance, 3.2), 64), "moons")),
      };
    }

    const focusRadius = selectedBody ? visualRadiusForBody(selectedBody, selectedRadius) : selectedRadius;
    const distance = Math.min(Math.max(fitDistance(focusRadius, FOCUS_FRAMING_SAFETY), selectedRadius * 1.3), 46);
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

    // Zustand can publish a mode handoff just before R3F swaps this frame
    // callback's render closure. Never let the departing preset write one final
    // camera pose over a freshly restored free-look composition.
    const liveCameraMode = useSelectionStore.getState().cameraMode;
    if (liveCameraMode !== cameraMode) {
      invalidate();
      return;
    }

    // A shared free-view URL can be applied by the outer App effect before the
    // Drei controls ref attaches. The layout effect deliberately leaves that
    // request pending; the first live frame retries it once the controls exist.
    const pendingRestore = useSelectionStore.getState().cameraRestoreRequest;
    if (pendingRestore) {
      if (pendingRestore.expectedMode === cameraMode) {
        if (applyCameraPose(pendingRestore.pose)) {
          acknowledgeCameraRestore(pendingRestore.revision);
        }
      } else {
        acknowledgeCameraRestore(pendingRestore.revision);
      }
    }

    // With frameloop="demand", a settling framing animation has to keep requesting the
    // next frame itself — nothing else will. Once the camera reaches its target pose
    // (or reduced motion snaps it there) we stop, so an idle scene draws nothing.
    let animating = false;
    let desiredMaxDistance = controlsRangeRef.current?.maxDistance ?? 520;
    if (cameraMode !== "free") {
      const desired = getDesiredCamera();
      desiredMaxDistance = desired.maxDistance ?? 520;
      controls.maxDistance = desiredMaxDistance;

      if (reducedMotion) {
        controls.target.copy(desired.target);
        camera.position.copy(desired.position);
      } else {
        const targetAlpha = dampingAlpha(isFollowMode ? FOLLOW_TARGET_DAMPING : FOCUS_TARGET_DAMPING, delta);
        const positionAlpha = dampingAlpha(isFollowMode ? FOLLOW_POSITION_DAMPING : FOCUS_POSITION_DAMPING, delta);
        controls.target.lerp(desired.target, targetAlpha);
        camera.position.lerp(desired.position, positionAlpha);
        animating =
          controls.target.distanceTo(desired.target) > 1e-3 ||
          camera.position.distanceTo(desired.position) > 1e-3;
      }
      controls.update();
    }

    const bodyRelativeControls =
      cameraMode === "focus" ||
      cameraMode === "follow" ||
      cameraMode === "moons" ||
      cameraMode === "observer" ||
      Boolean(presetParentId) ||
      cameraMode === "rocket-follow";
    const previousControlRange = controlsRangeRef.current;
    const minDistance =
      bodyRelativeControls && controlsTargetRadius > 0
        ? surfaceMinDistanceForRadius(controlsTargetRadius)
        : cameraMode === "free"
          ? previousControlRange?.minDistance ?? 0.35
          : 0.35;
    const maxDistance = cameraMode === "free" ? (previousControlRange?.maxDistance ?? 520) : desiredMaxDistance;

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
    const nextNear =
      cameraMode === "observer"
        ? Math.max(Math.min(controlsTargetRadius * 0.02, 0.01), MIN_CAMERA_NEAR)
        : cameraNearForTarget(targetDistance, controlsTargetRadius);
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

    if (animating) {
      invalidate();
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
      onChange={publishCameraPose}
      regress
      enableDamping={!reducedMotion}
      dampingFactor={reducedMotion ? 0 : 0.055}
      rotateSpeed={0.42}
      zoomSpeed={0.62}
      panSpeed={0.45}
    />
  );
};
