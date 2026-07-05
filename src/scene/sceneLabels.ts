import type { CelestialBody } from "../simulation/orbitalElements";
import type { LabelDensity, ScaleMode } from "../simulation/units";

type SceneLabelOptions = {
  bodies: CelestialBody[];
  childBodiesByParentId: Record<string, CelestialBody[]>;
  isMoonContext: boolean;
  labelDensity: LabelDensity;
  mode: ScaleMode;
  moonFocusParentId?: string | null;
  selectedBody?: CelestialBody;
  selectedId: string;
};

export const getSceneLabelledIds = ({
  bodies,
  childBodiesByParentId,
  isMoonContext,
  labelDensity,
  mode,
  moonFocusParentId,
  selectedBody,
  selectedId,
}: SceneLabelOptions) => {
  const ids = new Set<string>();

  if (mode === "real" || labelDensity === "off") {
    return ids;
  }

  bodies.forEach((body) => {
    const isDefaultLabel =
      body.render.showLabelDefault && (body.type !== "dwarfPlanet" || body.id === "pluto" || labelDensity === "full");

    if (body.id === selectedId || isDefaultLabel) {
      ids.add(body.id);
    }

    if (labelDensity === "standard" && selectedBody) {
      if (body.parentId === selectedBody.id || (selectedBody.type === "moon" && body.parentId === selectedBody.parentId)) {
        ids.add(body.id);
      }
    }

    if (labelDensity === "full") {
      ids.add(body.id);
    }
  });

  if (isMoonContext && moonFocusParentId) {
    ids.clear();
    ids.add(moonFocusParentId);
    childBodiesByParentId[moonFocusParentId]
      ?.filter((body) => body.type === "moon")
      .forEach((body) => ids.add(body.id));
    ids.add(selectedId);
  }

  if (labelDensity === "minimal") {
    bodies.forEach((body) => {
      if (body.type === "moon" || body.type === "dwarfPlanet" || body.id === "sun") {
        ids.delete(body.id);
      }
    });
    ids.add(selectedId);
  }

  return ids;
};
