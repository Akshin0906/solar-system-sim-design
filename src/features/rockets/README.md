# Rocket Module

This folder contains the educational rocket concept-preview layer. The module is
active, but it is still approximate: it is not a professional trajectory design tool.

## Layers

- `rocketCatalog.ts`: separate hardware status, direct/free curve, and capability benchmark data.
- `rocketEvidence.ts`: primary-source metadata and evidence-label helpers.
- `destinationCatalog.ts`: grouped destinations mapped to existing celestial body IDs.
- `missionOptions.ts`: direct, Hohmann, and Lambert mission modes plus launch/arrival assumptions.
- `flightModel.ts`: pure closed-form speed and distance profile for direct/free flight.
- `orbitalTransfer.ts`: universal-variable Lambert solving and two-body propagation.
- `transferModel.ts`: dated Hohmann/Lambert plans, patched-conic requirements, and sampled transfer arcs.
- `rocketState.ts`: derived view model for scene positions, telemetry, status, and
  transfer visuals.
- `rocketStore.ts`: selected and active launch identity.
- `RocketLauncherPanel.tsx`: compact controls.
- `RocketTelemetry.tsx`: live readout formatting.
- `RocketObject.tsx`: scene marker, trails, transfer arcs, and destination cues.

## Rules

- Do not mutate celestial body data.
- Keep conceptual direct/free-flight behavior working when changing physical transfer modes.
- Never consume `directCurve` from physical Hohmann/Lambert transfer math.
- Keep hardware maturity, curve confidence, and contextual payload/C3 benchmarks separate.
- Add or update Python math verification whenever changing arithmetic.
- Keep the default solar-system experience uncluttered; the rocket panel stays hidden
  until opened.
