import type { CameraMode } from "../../simulation/selectionStore";
import type { ScaleMode } from "../../simulation/units";

export type ExperienceFidelity = {
  label: string;
  detail: string;
  tier: "physical" | "modeled" | "distorted";
};

export type DirectorStop = {
  id: string;
  eyebrow: string;
  title: string;
  narration: string;
  watchFor: string;
  selectedBodyId: string;
  cameraMode: CameraMode;
  scaleMode: ScaleMode;
  fidelity: readonly ExperienceFidelity[];
};

export type AuthoredTourId = "scale-revelation" | "three-worlds";

export type AuthoredTour = {
  id: AuthoredTourId;
  title: string;
  shortTitle: string;
  description: string;
  estimatedMinutes: number;
  stops: readonly DirectorStop[];
};

const physicalPosition: ExperienceFidelity = {
  tier: "modeled",
  label: "Modeled positions",
  detail: "Body positions come from the simulator's dated orbital-element model.",
};

export const AUTHORED_TOURS: readonly AuthoredTour[] = [
  {
    id: "scale-revelation",
    title: "Powers of Ten: Scale Revelation",
    shortTitle: "Scale Revelation",
    description: "Move through all four scale lenses and see exactly what each one preserves or distorts.",
    estimatedMinutes: 2,
    stops: [
      {
        id: "true-scale",
        eyebrow: "Lens 1 of 4 · Real",
        title: "Space is mostly absence",
        narration:
          "Distances and radii now share one linear scale. The planets nearly vanish; that apparent emptiness is the scientifically meaningful result.",
        watchFor: "Use the orbit paths to find Earth, then notice how tiny the world is beside the span of its year.",
        selectedBodyId: "earth",
        cameraMode: "overview",
        scaleMode: "real",
        fidelity: [
          {
            tier: "physical",
            label: "True proportions",
            detail: "Body radius and heliocentric distance use the same linear conversion.",
          },
        ],
      },
      {
        id: "readable-scale",
        eyebrow: "Lens 2 of 4 · Readable",
        title: "Keep the map, reveal the worlds",
        narration:
          "Planet distances remain linear, while bodies are enlarged and moon systems are spread apart so their structure can be read.",
        watchFor: "Earth stays in the same place, but its visible globe and the Earth–Moon separation become intentionally oversized.",
        selectedBodyId: "earth",
        cameraMode: "earth-moon",
        scaleMode: "readable",
        fidelity: [
          physicalPosition,
          {
            tier: "distorted",
            label: "Size enlarged",
            detail: "Planet radii and moon-system spacing are no longer on the distance scale.",
          },
        ],
      },
      {
        id: "compressed-scale",
        eyebrow: "Lens 3 of 4 · Compact",
        title: "Bring the frontier inward",
        narration:
          "Heliocentric distance now follows a power curve, bringing the outer planets closer while retaining their order and orbital direction.",
        watchFor: "Compare the inner-planet cluster with Jupiter and Saturn; gaps are easier to scan, but no longer proportional.",
        selectedBodyId: "jupiter",
        cameraMode: "overview",
        scaleMode: "compressed",
        fidelity: [
          physicalPosition,
          {
            tier: "distorted",
            label: "Distance compressed",
            detail: "Distance uses the app's 0.62-power mapping; body radii remain enlarged.",
          },
        ],
      },
      {
        id: "map-scale",
        eyebrow: "Lens 4 of 4 · Map",
        title: "A system you can hold at once",
        narration:
          "The map lens uses a logarithmic distance transform. It is an index of the system, not a ruler for judging gaps, sizes, or travel time.",
        watchFor: "The Kuiper-belt region and inner planets can coexist in one view; treat proximity here as graphic organization only.",
        selectedBodyId: "sun",
        cameraMode: "overview",
        scaleMode: "overview",
        fidelity: [
          physicalPosition,
          {
            tier: "distorted",
            label: "Logarithmic map",
            detail: "Distance and body size are both strongly stylized for whole-system legibility.",
          },
        ],
      },
    ],
  },
  {
    id: "three-worlds",
    title: "Three Worlds, Three Kinds of Wonder",
    shortTitle: "Three Worlds",
    description: "A short directed tour from our double world to the giant planets and Saturn's ring plane.",
    estimatedMinutes: 2,
    stops: [
      {
        id: "earth-moon",
        eyebrow: "Stop 1 of 3 · Double world",
        title: "Earth and its companion",
        narration:
          "Start with a familiar scale anchor: a rocky planet and a large satellite moving through a shared neighborhood.",
        watchFor: "Follow the Moon's inclined path and look for the moments when its orbit crosses the Sun–Earth line.",
        selectedBodyId: "earth",
        cameraMode: "earth-moon",
        scaleMode: "readable",
        fidelity: [
          physicalPosition,
          {
            tier: "distorted",
            label: "Readable spacing",
            detail: "The Moon's separation and both body radii are expanded for inspection.",
          },
        ],
      },
      {
        id: "jupiter-system",
        eyebrow: "Stop 2 of 3 · Miniature system",
        title: "Jupiter and the Galilean worlds",
        narration:
          "The giant planet anchors a nested orbital system. Each moon keeps its modeled phase and reference plane as the camera reframes the family.",
        watchFor: "Compare the tight inner orbit of Io with Callisto's wider circuit, and watch their shadows cross Jupiter when geometry permits.",
        selectedBodyId: "jupiter",
        cameraMode: "jupiter-system",
        scaleMode: "readable",
        fidelity: [
          physicalPosition,
          {
            tier: "distorted",
            label: "Readable spacing",
            detail: "Moon distances and visible radii are enlarged; orbital ordering and direction are preserved.",
          },
        ],
      },
      {
        id: "saturn-system",
        eyebrow: "Stop 3 of 3 · Rings and moons",
        title: "A plane made visible",
        narration:
          "Saturn's ring plane turns orientation into something you can see immediately, while its moons reveal a second family of orbital scales.",
        watchFor: "Notice the ring tilt, then compare close Enceladus with distant Titan and Iapetus.",
        selectedBodyId: "saturn",
        cameraMode: "saturn-system",
        scaleMode: "readable",
        fidelity: [
          physicalPosition,
          {
            tier: "distorted",
            label: "Readable spacing",
            detail: "The ring plane and band structure are shown; body radii and moon spacing are visually enlarged.",
          },
        ],
      },
    ],
  },
] as const;

export const authoredTourById = new Map(AUTHORED_TOURS.map((tour) => [tour.id, tour]));
