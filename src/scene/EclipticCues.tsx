import { useEffect, useMemo } from "react";
import { BufferGeometry, Color, Float32BufferAttribute } from "three";
import { AU_KM } from "../data/constants";
import { scaleDistanceFromSun, type ScaleMode } from "../simulation/units";

type EclipticCuesProps = {
  mode: ScaleMode;
  opacityMultiplier?: number;
};

const ringCuesAu = [
  { au: 1, tone: 0.82 },
  { au: 5, tone: 0.68 },
  { au: 10, tone: 0.56 },
  { au: 20, tone: 0.46 },
  { au: 40, tone: 0.38 },
];
const ringSegments = 192;
const spokeCount = 16;
const maxCueAu = 52;
const centerGapAu = 0.36;

const pushVertex = (vertices: number[], colors: number[], color: Color, x: number, z: number) => {
  vertices.push(x, 0, z);
  colors.push(color.r, color.g, color.b);
};

export const EclipticCues = ({ mode, opacityMultiplier = 1 }: EclipticCuesProps) => {
  const geometry = useMemo(() => {
    const vertices: number[] = [];
    const colors: number[] = [];
    const innerTone = new Color("#d4ba82");
    const outerTone = new Color("#6f9dad");
    const spokeTone = new Color("#536474");

    ringCuesAu.forEach(({ au, tone }) => {
      const radius = scaleDistanceFromSun(AU_KM * au, mode);
      const ringColor = innerTone.clone().lerp(outerTone, Math.min(1, au / 40)).multiplyScalar(tone);

      for (let index = 0; index < ringSegments; index += 1) {
        const startAngle = (index / ringSegments) * Math.PI * 2;
        const endAngle = ((index + 1) / ringSegments) * Math.PI * 2;

        pushVertex(vertices, colors, ringColor, Math.cos(startAngle) * radius, Math.sin(startAngle) * radius);
        pushVertex(vertices, colors, ringColor, Math.cos(endAngle) * radius, Math.sin(endAngle) * radius);
      }
    });

    const innerRadius = scaleDistanceFromSun(AU_KM * centerGapAu, mode);
    const outerRadius = scaleDistanceFromSun(AU_KM * maxCueAu, mode);

    for (let index = 0; index < spokeCount; index += 1) {
      const angle = (index / spokeCount) * Math.PI * 2;
      const spokeColor = spokeTone.clone().multiplyScalar(index % 4 === 0 ? 0.64 : 0.42);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      pushVertex(vertices, colors, spokeColor, cos * innerRadius, sin * innerRadius);
      pushVertex(vertices, colors, spokeColor, cos * outerRadius, sin * outerRadius);
    }

    const cueGeometry = new BufferGeometry();
    cueGeometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
    cueGeometry.setAttribute("color", new Float32BufferAttribute(colors, 3));

    return cueGeometry;
  }, [mode]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineSegments geometry={geometry} renderOrder={-12}>
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={0.42 * opacityMultiplier}
        depthWrite={false}
        depthTest
      />
    </lineSegments>
  );
};
