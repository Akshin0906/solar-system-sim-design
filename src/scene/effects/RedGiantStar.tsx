import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { AdditiveBlending, Color, type Group, type Mesh, type MeshBasicMaterial } from "three";
import { bodiesById } from "../../data";
import { getParticipant } from "../../scenarios/scenarioRuntime";
import { getBodySceneRadius, scaleDistanceFromSun, scaleVectorFromSun, type ScaleMode } from "../../simulation/units";

const noopRaycast = () => null;
const SUN_RADIUS_KM = 696_340;

// Cooling sequence: a hot yellow-white photosphere reddens as it inflates. Full red
// (~180 R☉) corresponds to a true red-giant surface temperature near 3500 K.
const HOT = new Color("#fff1c2");
const WARM = new Color("#ff9a3a");
const COOL = new Color("#ff3b1e");
const scratch = new Color();

const colorForProgress = (p: number) => {
  if (p < 0.5) {
    return scratch.copy(HOT).lerp(WARM, p / 0.5);
  }
  return scratch.copy(WARM).lerp(COOL, (p - 0.5) / 0.5);
};

// The swelling Sun, rendered as a bespoke overlay so BodyMesh stays untouched. Driven
// entirely off the Sun SimBody's live radius: scene size uses the SAME scale transform
// as orbital distances, so the surface reaches a planet at the exact frame the
// integrator engulfs it. The normal Sun mesh is hidden by SolarScene while this runs.
export const RedGiantStar = ({ mode }: { mode: ScaleMode }) => {
  const groupRef = useRef<Group>(null);
  const coreRef = useRef<Mesh>(null);
  const innerCoronaRef = useRef<Mesh>(null);
  const outerCoronaRef = useRef<Mesh>(null);

  // Never render smaller than the Sun normally appears, so the handoff at T+0 is seamless.
  const floorRadius = getBodySceneRadius(bodiesById.get("sun")!, mode);

  useFrame(() => {
    const sun = getParticipant("sun");
    const group = groupRef.current;
    if (!sun || !group) {
      return;
    }

    const [x, y, z] = scaleVectorFromSun(sun.posKm, mode);
    group.position.set(x, y, z);

    const sceneRadius = Math.max(scaleDistanceFromSun(sun.radiusKm, mode), floorRadius);
    const progress = Math.min(Math.max((sun.radiusKm / SUN_RADIUS_KM - 1) / (180 - 1), 0), 1);
    const color = colorForProgress(progress);

    const apply = (mesh: Mesh | null, scale: number) => {
      if (!mesh) {
        return;
      }
      mesh.scale.setScalar(sceneRadius * scale);
      (mesh.material as MeshBasicMaterial).color.copy(color);
    };
    apply(coreRef.current, 1);
    apply(innerCoronaRef.current, 1.22);
    apply(outerCoronaRef.current, 1.7);
  });

  return (
    <group ref={groupRef}>
      <mesh ref={coreRef} raycast={noopRaycast}>
        <sphereGeometry args={[1, 48, 32]} />
        <meshBasicMaterial toneMapped={false} />
      </mesh>
      <mesh ref={innerCoronaRef} raycast={noopRaycast}>
        <sphereGeometry args={[1, 32, 24]} />
        <meshBasicMaterial transparent opacity={0.32} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={outerCoronaRef} raycast={noopRaycast}>
        <sphereGeometry args={[1, 24, 18]} />
        <meshBasicMaterial transparent opacity={0.16} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
};
