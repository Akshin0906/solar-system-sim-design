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

// Every body in the dataset is selectable (the Sun is the only star and is itself
// selectable). The previous `type !== "star" || id === "sun"` predicate was a no-op
// for this data; alias directly so the intent is unambiguous.
export const selectableBodies = bodies;

// Dev-only sanity pass: the Kepler propagator divides by orbitalPeriodDays and a body's
// radius, so a zero/negative element (an easy data typo) would silently poison the whole
// scene with Infinity/NaN. Fail loudly in development instead.
// `import.meta.env` is undefined under tsx/Node (where the verify scripts import this),
// so guard the access rather than only relying on the bundler.
if (import.meta.env?.DEV) {
  for (const body of bodies) {
    if (body.orbit) {
      if (!(body.orbit.orbitalPeriodDays > 0)) {
        console.error(`[data] ${body.id}: orbitalPeriodDays must be > 0, got ${body.orbit.orbitalPeriodDays}`);
      }
      if (!(body.orbit.semiMajorAxisKm > 0)) {
        console.error(`[data] ${body.id}: semiMajorAxisKm must be > 0, got ${body.orbit.semiMajorAxisKm}`);
      }
    }
  }
}
