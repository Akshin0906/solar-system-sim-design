# Rocket Module

This folder contains the educational rocket concept-preview layer. The module is
active, but it is still approximate: it is not a professional trajectory design tool.

## Layers

- `rocketCatalog.ts`: rocket profile data, assumptions, and confidence labels.
- `destinationCatalog.ts`: grouped destinations mapped to existing celestial body IDs.
- `missionOptions.ts`: direct/transfer mission modes and launch assumptions.
- `flightModel.ts`: pure closed-form speed and distance profile for direct/free flight.
- `transferModel.ts`: pure Hohmann-style transfer estimates and sampled transfer arcs.
- `rocketState.ts`: derived view model for scene positions, telemetry, status, and
  transfer visuals.
- `rocketStore.ts`: selected and active launch identity.
- `RocketLauncherPanel.tsx`: compact controls.
- `RocketTelemetry.tsx`: live readout formatting.
- `RocketObject.tsx`: scene marker, trails, transfer arcs, and destination cues.

## Rules

- Do not mutate celestial body data.
- Keep conceptual direct/free-flight behavior working when changing transfer preview.
- Keep transfer math pure and approximate labels visible.
- Add or update Python math verification whenever changing arithmetic.
- Keep the default solar-system experience uncluttered; the rocket panel stays hidden
  until opened.
