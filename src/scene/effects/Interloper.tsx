import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BackSide,
  Color,
  DoubleSide,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  ShaderMaterial,
} from "three";
import { getParticipant } from "../../scenarios/scenarioRuntime";
import { INTERLOPER_ID, interloperType } from "../../scenarios/registry";
import { useScenarioStore } from "../../scenarios/scenarioStore";
import { scaleDistanceFromSun, scaleVectorFromSun, type ScaleMode } from "../../simulation/units";

const noopRaycast = () => null;

// Readable event-horizon size per scale mode. In "real" mode the true Schwarzschild radius
// is a sub-pixel speck, so honour it but floor to a faint dot; elsewhere use a legible size.
const horizonSceneRadius = (captureRadiusKm: number, mode: ScaleMode) =>
  mode === "real" ? Math.max(scaleDistanceFromSun(captureRadiusKm, mode), 0.012) : 0.2;
const starSceneRadius = (mode: ScaleMode) => (mode === "real" ? 0.05 : 0.85);

// Accretion-disk shader: a rotating, sheared annulus that runs hot-blue at the inner edge
// and cools to orange outward, with an orbital-shear brightness swirl. uBrightness ramps as
// the hole accretes. Additive + bloom (from PostFx) makes it genuinely luminous.
const DISK_VERT = /* glsl */ `
  varying vec2 vPos;
  void main() {
    vPos = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const DISK_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uBrightness;
  uniform float uInner;
  uniform float uOuter;
  uniform vec3 uHot;
  uniform vec3 uCool;
  varying vec2 vPos;
  void main() {
    float r = length(vPos);
    float t = clamp((r - uInner) / (uOuter - uInner), 0.0, 1.0);
    float ang = atan(vPos.y, vPos.x);
    // Orbital shear: inner edge sweeps faster than the outer, so the bands wind up.
    float swirl = 0.5 + 0.5 * sin(ang * 2.0 - uTime * (3.4 - 2.0 * t) + t * 9.0);
    // Bright just outside the inner edge, fading to nothing at the rim.
    float radial = smoothstep(0.0, 0.10, t) * (1.0 - smoothstep(0.55, 1.0, t));
    vec3 col = mix(uHot, uCool, pow(t, 0.7));
    float intensity = radial * (0.45 + 0.7 * swirl) * uBrightness;
    gl_FragColor = vec4(col * intensity, intensity);
  }
`;

// Fresnel rim shell: a faint shell that brightens at grazing angles — a cheap stand-in for
// light bending around the hole (gravitational lensing) without a screen-space pass.
const RIM_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const RIM_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uStrength;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float rim = pow(1.0 - max(dot(vNormal, vView), 0.0), 3.0);
    gl_FragColor = vec4(uColor, rim * uStrength);
  }
`;

// The rogue interloper, rendered as a bespoke overlay (like RedGiantStar). Tracks the
// injected interloper SimBody by id and draws the visual for the selected type:
//   black hole → event horizon + photon ring + accretion disk + lensing rim shell
//   rogue star → a glowing star with coronae
//   rogue planet → nothing here (the generic ScenarioLayer draws its marker)
export const Interloper = ({ mode }: { mode: ScaleMode }) => {
  const typeIndex = useScenarioStore((state) => state.params.interloperType ?? 0);
  const instanceId = useScenarioStore((state) => state.instanceId);
  const type = interloperType(typeIndex);
  const camera = useThree((state) => state.camera);

  const groupRef = useRef<Group>(null);
  const photonRingRef = useRef<Mesh>(null);
  const starCoreRef = useRef<Mesh>(null);

  const initialMuRef = useRef<number | null>(null);
  const lastMuRef = useRef(0);
  const flashRef = useRef(0);

  const diskMaterial = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uBrightness: { value: 0.8 },
          uInner: { value: 1 },
          uOuter: { value: 4.4 },
          uHot: { value: new Color("#cfe2ff") },
          uCool: { value: new Color("#ff7a26") },
        },
        vertexShader: DISK_VERT,
        fragmentShader: DISK_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
        toneMapped: false,
      }),
    [],
  );

  const rimMaterial = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uColor: { value: new Color("#9bc4ff") },
          uStrength: { value: 0.6 },
        },
        vertexShader: RIM_VERT,
        fragmentShader: RIM_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: BackSide,
        toneMapped: false,
      }),
    [],
  );

  useEffect(() => {
    return () => {
      diskMaterial.dispose();
      rimMaterial.dispose();
    };
  }, [diskMaterial, rimMaterial]);

  // A (re)seed resets the accretion baseline so brightness tracks the fresh run, not the
  // mass the hole had swallowed before the slider edit.
  useEffect(() => {
    initialMuRef.current = null;
    flashRef.current = 0;
  }, [instanceId]);

  useFrame((_, delta) => {
    const hole = getParticipant(INTERLOPER_ID);
    const group = groupRef.current;
    if (!hole || !hole.alive || !group) {
      if (group) {
        group.visible = false;
      }
      return;
    }
    group.visible = true;
    const [x, y, z] = scaleVectorFromSun(hole.posKm, mode);
    group.position.set(x, y, z);

    // Accretion brightness: a slow ramp with total accreted mass plus a decaying flash on
    // each fresh swallow (the hole's μ jumps when it merges a body/fragment in).
    if (initialMuRef.current === null) {
      initialMuRef.current = hole.muKm3S2;
      lastMuRef.current = hole.muKm3S2;
    }
    if (hole.muKm3S2 > lastMuRef.current * 1.0000001) {
      flashRef.current = 1.4;
    }
    lastMuRef.current = hole.muKm3S2;
    flashRef.current = Math.max(0, flashRef.current - delta * 2.4);
    const accretedFrac = initialMuRef.current > 0 ? (hole.muKm3S2 - initialMuRef.current) / initialMuRef.current : 0;
    const brightness = 0.7 + Math.min(accretedFrac, 2) * 0.3 + flashRef.current;

    if (type.value === 1) {
      // Rogue star: gently pulse the glow; reuse brightness for accretion flares.
      const core = starCoreRef.current;
      if (core) {
        (core.material as MeshBasicMaterial).color.setRGB(1, 0.78 + 0.06 * Math.min(flashRef.current, 1), 0.55);
      }
      return;
    }

    if (type.value === 2) {
      return; // rogue planet uses the generic marker
    }

    // Black hole.
    diskMaterial.uniforms.uTime.value += delta;
    diskMaterial.uniforms.uBrightness.value = brightness;
    rimMaterial.uniforms.uStrength.value = 0.45 + 0.35 * Math.min(flashRef.current, 1);

    // Billboard the photon ring so it always reads as a circle (the lensed photon sphere).
    const ring = photonRingRef.current;
    if (ring) {
      ring.quaternion.copy(camera.quaternion);
    }
  });

  // Rogue planet: nothing to draw here.
  if (type.value === 2) {
    return null;
  }

  if (type.value === 1) {
    const r = starSceneRadius(mode);
    return (
      <group ref={groupRef}>
        <mesh ref={starCoreRef} raycast={noopRaycast}>
          <sphereGeometry args={[r, 48, 32]} />
          <meshBasicMaterial color="#ffce8a" toneMapped={false} />
        </mesh>
        <mesh raycast={noopRaycast}>
          <sphereGeometry args={[r * 1.25, 32, 24]} />
          <meshBasicMaterial color="#ffb35e" transparent opacity={0.3} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh raycast={noopRaycast}>
          <sphereGeometry args={[r * 1.7, 24, 18]} />
          <meshBasicMaterial color="#ff8a3a" transparent opacity={0.16} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
    );
  }

  // Black hole.
  const r = horizonSceneRadius(type.captureRadiusKm, mode);
  return (
    <group ref={groupRef}>
      {/* Event horizon: opaque, writes depth so it occludes the disk behind it and stars. */}
      <mesh raycast={noopRaycast} renderOrder={1}>
        <sphereGeometry args={[r, 48, 32]} />
        <meshBasicMaterial color="#000000" toneMapped={false} />
      </mesh>
      {/* Lensing rim shell (fresnel) — cheap stand-in for light bending round the hole. */}
      <mesh raycast={noopRaycast} renderOrder={2} scale={r * 1.45}>
        <sphereGeometry args={[1, 48, 32]} />
        <primitive object={rimMaterial} attach="material" />
      </mesh>
      {/* Accretion disk: tilted for a 3/4 view, rotating + brightening with accretion. */}
      <mesh raycast={noopRaycast} renderOrder={3} rotation={[-1.18, 0, 0.35]} scale={r}>
        <ringGeometry args={[1, 4.4, 96, 1]} />
        <primitive object={diskMaterial} attach="material" />
      </mesh>
      {/* Photon ring: billboarded thin bright annulus (the lensed photon sphere). */}
      <mesh ref={photonRingRef} raycast={noopRaycast} renderOrder={4}>
        <ringGeometry args={[r * 1.28, r * 1.46, 96, 1]} />
        <meshBasicMaterial color="#dfeaff" transparent opacity={0.95} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
};
