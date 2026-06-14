import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { bodies, bodiesById, childBodiesByParentId } from "../data";
import { useSelectionStore } from "../simulation/selectionStore";
import type { Vec3 } from "../simulation/orbitalElements";
import { getBodySceneRadius, type ScaleMode } from "../simulation/units";
import { boundsForPoints, cameraOffset, fitDistanceForRadius } from "./cameraFraming";

type CameraRigProps = {
  positions: Record<string, Vec3>;
  mode: ScaleMode;
};

const asVector = (value: Vec3) => new THREE.Vector3(value[0], value[1], value[2]);

const distanceBetween = (a: THREE.Vector3, b: THREE.Vector3) => a.distanceTo(b);

export const CameraRig = ({ positions, mode }: CameraRigProps) => {
  const controlsRef = useRef<any>(null);
  const cameraMode = useSelectionStore((state) => state.cameraMode);
  const selectedId = useSelectionStore((state) => state.selectedId);
  const setCameraMode = useSelectionStore((state) => state.setCameraMode);
  const { camera } = useThree();

  const selectedBody = bodiesById.get(selectedId);
  const moonCount = childBodiesByParentId[selectedId]?.filter((body) => body.type === "moon").length ?? 0;

  const desired = useMemo(() => {
    const selectedPosition = positions[selectedId] ? asVector(positions[selectedId]) : new THREE.Vector3();
    const selectedRadius = selectedBody ? getBodySceneRadius(selectedBody, mode) : 0.4;
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
      const target = mode === "real" || mode === "readable" ? bounds.center : new THREE.Vector3(0, 0, 0);
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

    const baseRadius = selectedBody?.type === "moon" ? selectedRadius * 5.5 : selectedRadius * (moonCount > 0 ? 8 : 6);
    const distance = Math.min(Math.max(fitDistanceForRadius(baseRadius, 48, 1.65), 3.2), 46);
    return {
      target: selectedPosition,
      position: selectedPosition.clone().add(cameraOffset(distance, "focus")),
    };
  }, [cameraMode, mode, moonCount, positions, selectedBody, selectedId]);

  useFrame(() => {
    if (!controlsRef.current || cameraMode === "free") {
      return;
    }

    controlsRef.current.target.lerp(desired.target, cameraMode === "follow" ? 0.16 : 0.075);
    camera.position.lerp(desired.position, cameraMode === "follow" ? 0.1 : 0.055);
    controlsRef.current.update();
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.055}
      rotateSpeed={0.42}
      zoomSpeed={0.62}
      panSpeed={0.45}
      minDistance={0.35}
      maxDistance={520}
      onStart={() => {
        if (cameraMode !== "free") {
          setCameraMode("free");
        }
      }}
    />
  );
};
