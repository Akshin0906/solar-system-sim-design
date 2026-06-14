import { majorBodies, dwarfPlanets } from "./bodies";
import { majorMoons } from "./moons";

export const bodies = [...majorBodies, ...dwarfPlanets, ...majorMoons];

export const bodiesById = new Map(bodies.map((body) => [body.id, body]));

export const childBodiesByParentId = bodies.reduce<Record<string, typeof bodies>>((acc, body) => {
  if (!body.parentId) {
    return acc;
  }

  acc[body.parentId] ??= [];
  acc[body.parentId].push(body);
  return acc;
}, {});

export const selectableBodies = bodies.filter((body) => body.type !== "star" || body.id === "sun");
