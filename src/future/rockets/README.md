# Future Rocket Module

Rocket launches are intentionally outside the MVP. This folder reserves the integration point for later phases so flight models, vehicle catalogs, and mission UI can attach to the existing simulation stores and scene without rewriting the solar-system renderer.

Planned layers:

- `rocketCatalog.ts`: editable rocket profiles and assumptions.
- `flightModel.ts`: simple profile, patched-conic, or sandbox flight propagation.
- Future UI: launch mode, destination, mission elapsed time, velocity, and confidence labeling.
