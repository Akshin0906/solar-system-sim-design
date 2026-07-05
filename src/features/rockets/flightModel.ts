import type { RocketProfile } from "./rocketCatalog";

// Simple speed-profile flight model (v1).
//
// This module is PURE physics: speed and path distance as closed-form functions
// of elapsed mission time. It has no Three.js, no React, and no celestial data,
// so it can be unit-reasoned about and reused by both the renderer and the UI.
//
// Closed form (rather than incremental integration) is deliberate: the app's time
// system can be paused, reversed, scrubbed, and run at huge time scales. A pure
// function of elapsed time stays exact and consistent under all of those, with no
// accumulated drift.
//
// Phases, while the engine accelerates at `accelerationMS2` up to `maxSpeedKmS`:
//   1. accelerate from initialSpeedKmS until the speed cap or the burn ends
//   2. (if the cap is hit before the burn ends) hold at the cap until burn end
//   3. coast at the final burn speed forever after
//
// This is a 1-D outbound speed profile. Direction is handled in `rocketState.ts`.

export type RocketFlightSample = {
  elapsedSeconds: number;
  speedKmS: number;
  distanceTraveledKm: number;
};

type RocketFlightOptions = {
  speedOffsetKmS?: number;
};

export const sampleFlight = (
  profile: RocketProfile,
  elapsedSeconds: number,
  options: RocketFlightOptions = {},
): RocketFlightSample => {
  const t = Math.max(0, elapsedSeconds);
  const accelKmS2 = (profile.accelerationMS2 ?? 0) / 1_000; // m/s^2 -> km/s^2
  const speedOffsetKmS = Math.max(0, options.speedOffsetKmS ?? 0);
  const v0 = profile.initialSpeedKmS + speedOffsetKmS;
  const vMax = profile.maxSpeedKmS + speedOffsetKmS;
  const burn = Math.max(0, profile.burnDurationSeconds);

  // Time spent accelerating before reaching the speed cap (or never, if accel is 0).
  const timeToCap = accelKmS2 > 0 ? Math.max(0, (vMax - v0) / accelKmS2) : Infinity;
  const accelDuration = Math.min(burn, timeToCap);

  // Phase 1: accelerating.
  const t1 = Math.min(t, accelDuration);
  let speedKmS = v0 + accelKmS2 * t1;
  let distanceTraveledKm = v0 * t1 + 0.5 * accelKmS2 * t1 * t1;

  // Phase 2: capped speed for the rest of the burn (only reached if the cap was hit).
  if (t > accelDuration) {
    const cappedSpeed = speedKmS; // speed held constant from here through the burn
    const cappedEnd = Math.min(t, burn);
    const t2 = Math.max(0, cappedEnd - accelDuration);
    distanceTraveledKm += cappedSpeed * t2;
    speedKmS = cappedSpeed;

    // Phase 3: coast after the burn ends.
    if (t > burn) {
      distanceTraveledKm += cappedSpeed * (t - burn);
    }
  }

  return { elapsedSeconds: t, speedKmS, distanceTraveledKm };
};
