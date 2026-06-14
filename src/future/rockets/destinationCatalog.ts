// Editable destination catalog for rocket targeting (v1).
//
// Destinations reuse existing celestial body IDs (see src/data) so rocket state
// never duplicates or mutates planet/moon data. `bodyId: null` means free flight
// (the original outward-from-Earth behaviour). Add or reorder entries freely.
//
// This is a straight-line, fixed-aim educational approximation — NOT a transfer-orbit
// or patched-conics simulation. See ROCKETS.md.

export type RocketDestination = {
  id: string;
  label: string;
  bodyId: string | null; // existing celestial body id, or null for free flight
};

export const rocketDestinations: RocketDestination[] = [
  { id: "free", label: "Free flight", bodyId: null },
  { id: "moon", label: "Moon", bodyId: "moon" },
  { id: "mars", label: "Mars", bodyId: "mars" },
  { id: "jupiter", label: "Jupiter", bodyId: "jupiter" },
  { id: "saturn", label: "Saturn", bodyId: "saturn" },
  { id: "neptune", label: "Neptune", bodyId: "neptune" },
];

export const defaultDestinationId = "free";

export const destinationsById = new Map(rocketDestinations.map((destination) => [destination.id, destination]));
