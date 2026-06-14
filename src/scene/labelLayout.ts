import { useFrame } from "@react-three/fiber";
import { useRef, useState } from "react";
import type { CelestialBody } from "../simulation/orbitalElements";

type LabelLayoutOptions = {
  bodies: CelestialBody[];
  labelledIds: Set<string>;
  selectedId: string;
};

type ScreenRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

const labelPriority = (body: CelestialBody, selectedId: string) => {
  if (body.id === selectedId) {
    return 1_000;
  }

  if (body.type === "star") {
    return 900;
  }

  if (body.type === "planet") {
    return body.render.showLabelDefault ? 820 : 760;
  }

  if (body.type === "dwarfPlanet") {
    return body.render.showLabelDefault ? 640 : 560;
  }

  if (body.type === "moon") {
    return 360;
  }

  return 220;
};

const overlaps = (a: ScreenRect, b: ScreenRect) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

const sameSet = (a: Set<string>, b: Set<string>) => {
  if (a.size !== b.size) {
    return false;
  }

  for (const value of a) {
    if (!b.has(value)) {
      return false;
    }
  }

  return true;
};

export const useSceneLabelLayout = ({ bodies, labelledIds, selectedId }: LabelLayoutOptions) => {
  const [suppressedIds, setSuppressedIds] = useState(() => new Set<string>());
  const lastLayoutTimeRef = useRef(0);

  useFrame(({ size }) => {
    const now = performance.now();
    if (now - lastLayoutTimeRef.current < 120) {
      return;
    }
    lastLayoutTimeRef.current = now;

    const placed: ScreenRect[] = [];
    const nextSuppressedIds = new Set<string>();
    const edgePadding = 10;
    const desktopPanelGuard = size.width > 900 ? 310 : 0;
    const buttonsById = new Map(
      [...document.querySelectorAll<HTMLButtonElement>(".body-label[data-body-id]")].map((button) => [
        button.dataset.bodyId,
        button,
      ]),
    );

    const visibleLabels = bodies
      .filter((body) => labelledIds.has(body.id) && buttonsById.has(body.id))
      .map((body) => ({ body, priority: labelPriority(body, selectedId) }))
      .sort((a, b) => b.priority - a.priority);

    visibleLabels.forEach(({ body }) => {
      const button = buttonsById.get(body.id);
      if (!button) {
        return;
      }

      const selected = body.id === selectedId;
      const bounds = button.getBoundingClientRect();
      const rect = {
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        bottom: bounds.bottom,
      };

      const clipsEdge =
        rect.left < edgePadding ||
        rect.right > size.width - edgePadding ||
        rect.top < edgePadding ||
        rect.bottom > size.height - edgePadding;
      const clipsInspector = desktopPanelGuard > 0 && rect.right > size.width - desktopPanelGuard && rect.top < 470;
      const collides = placed.some((placedRect) => overlaps(rect, placedRect));

      if (!selected && (clipsEdge || clipsInspector || collides)) {
        nextSuppressedIds.add(body.id);
        return;
      }

      placed.push(rect);
    });

    setSuppressedIds((current) => (sameSet(current, nextSuppressedIds) ? current : nextSuppressedIds));
  });

  return suppressedIds;
};
