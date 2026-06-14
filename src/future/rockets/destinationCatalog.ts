// Editable destination catalog for rocket targeting.
//
// Destinations reuse existing celestial body IDs (see src/data) so rocket state
// never duplicates or mutates planet/moon data. `bodyId: null` means free flight
// (the original outward-from-Earth behaviour). Add or reorder entries freely.
//
// Mission modes decide whether a body uses the straight-line direct model or the
// approximate transfer preview. See ROCKETS.md.

export type RocketDestinationGroup = "Flight" | "Planets" | "Dwarf planets" | "Moons";

export type RocketDestination = {
  id: string;
  label: string;
  bodyId: string | null; // existing celestial body id, or null for free flight
  group: RocketDestinationGroup;
};

export const rocketDestinations: RocketDestination[] = [
  { id: "free", label: "Free flight", bodyId: null, group: "Flight" },
  { id: "mercury", label: "Mercury", bodyId: "mercury", group: "Planets" },
  { id: "venus", label: "Venus", bodyId: "venus", group: "Planets" },
  { id: "moon", label: "Moon", bodyId: "moon", group: "Moons" },
  { id: "mars", label: "Mars", bodyId: "mars", group: "Planets" },
  { id: "jupiter", label: "Jupiter", bodyId: "jupiter", group: "Planets" },
  { id: "saturn", label: "Saturn", bodyId: "saturn", group: "Planets" },
  { id: "uranus", label: "Uranus", bodyId: "uranus", group: "Planets" },
  { id: "neptune", label: "Neptune", bodyId: "neptune", group: "Planets" },
  { id: "ceres", label: "Ceres", bodyId: "ceres", group: "Dwarf planets" },
  { id: "pluto", label: "Pluto", bodyId: "pluto", group: "Dwarf planets" },
  { id: "eris", label: "Eris", bodyId: "eris", group: "Dwarf planets" },
  { id: "haumea", label: "Haumea", bodyId: "haumea", group: "Dwarf planets" },
  { id: "makemake", label: "Makemake", bodyId: "makemake", group: "Dwarf planets" },
  { id: "io", label: "Io (Jupiter)", bodyId: "io", group: "Moons" },
  { id: "europa", label: "Europa (Jupiter)", bodyId: "europa", group: "Moons" },
  { id: "ganymede", label: "Ganymede (Jupiter)", bodyId: "ganymede", group: "Moons" },
  { id: "callisto", label: "Callisto (Jupiter)", bodyId: "callisto", group: "Moons" },
  { id: "titan", label: "Titan (Saturn)", bodyId: "titan", group: "Moons" },
  { id: "enceladus", label: "Enceladus (Saturn)", bodyId: "enceladus", group: "Moons" },
  { id: "triton", label: "Triton (Neptune)", bodyId: "triton", group: "Moons" },
];

export const defaultDestinationId = "free";
export const destinationGroupOrder: RocketDestinationGroup[] = ["Flight", "Planets", "Dwarf planets", "Moons"];

export const destinationsById = new Map(rocketDestinations.map((destination) => [destination.id, destination]));
