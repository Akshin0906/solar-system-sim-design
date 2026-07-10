/* Ad-hoc stress harness for the rocket model. Run: npx tsx scripts/stress_rockets.ts
 *
 * Sweeps every profile x destination x mission-mode x launch-mode x scale-mode x mission-time and
 * asserts no NaN/Infinity/throws, then runs targeted behavioural probes.
 */
import { bodiesById } from "../src/data";
import { rocketCatalog, rocketsById } from "../src/features/rockets/rocketCatalog";
import { rocketDestinations } from "../src/features/rockets/destinationCatalog";
import {
  directSpeedOffsetForLaunchMode,
  rocketLaunchModes,
  rocketMissionModes,
} from "../src/features/rockets/missionOptions";
import { computeRocketView } from "../src/features/rockets/rocketState";
import { estimateTransfer, sampleTransferArcKm } from "../src/features/rockets/transferModel";
import { sampleFlight } from "../src/features/rockets/flightModel";
import type { ScaleMode } from "../src/simulation/units";

const MODES: ScaleMode[] = ["real", "readable", "compressed", "overview"];
const NOW = Date.parse("2026-06-14T12:00:00Z");
const DAY = 86_400_000;
const YEAR = 365.256 * DAY;
const AU = 149_597_870.7;

const problems: string[] = [];
const note = (m: string) => problems.push(m);

const finite = (v: number) => Number.isFinite(v);
const checkVec = (tag: string, v: readonly number[]) => {
  if (!v || v.some((x) => !finite(x))) note(`${tag}: non-finite vector ${JSON.stringify(v)}`);
};

// ---- 1. Flight model edge cases ----------------------------------------
console.log("== flight model ==");
for (const p of rocketCatalog) {
  const curve = p.directCurve;
  for (const t of [-100, 0, 1, curve.burnDurationSeconds, curve.burnDurationSeconds * 2, 1e12]) {
    const s = sampleFlight(p, t);
    if (!finite(s.speedKmS) || !finite(s.distanceTraveledKm)) note(`flight ${p.id} t=${t}: NaN ${JSON.stringify(s)}`);
    if (s.distanceTraveledKm < 0) note(`flight ${p.id} t=${t}: negative distance ${s.distanceTraveledKm}`);
    if (s.speedKmS < 0) note(`flight ${p.id} t=${t}: negative speed ${s.speedKmS}`);
    if (s.speedKmS > curve.maxSpeedKmS + 1e-6) note(`flight ${p.id} t=${t}: speed ${s.speedKmS} exceeds max ${curve.maxSpeedKmS}`);
    for (const launchMode of rocketLaunchModes) {
      const offset = directSpeedOffsetForLaunchMode(launchMode.id);
      const offsetSample = sampleFlight(p, t, { speedOffsetKmS: offset });
      if (offsetSample.speedKmS > curve.maxSpeedKmS + offset + 1e-6) {
        note(`flight ${p.id}/${launchMode.id} t=${t}: speed ${offsetSample.speedKmS} exceeds offset max`);
      }
      if (offsetSample.distanceTraveledKm < s.distanceTraveledKm - 1e-6) {
        note(`flight ${p.id}/${launchMode.id} t=${t}: offset distance regressed`);
      }
    }
  }
  let prev = -1;
  for (let t = 0; t <= curve.burnDurationSeconds * 2 + 1; t += Math.max(1, curve.burnDurationSeconds / 50)) {
    const d = sampleFlight(p, t).distanceTraveledKm;
    if (d < prev - 1e-6) note(`flight ${p.id}: distance not monotonic at t=${t}`);
    prev = d;
  }
}

// ---- 2. Transfer estimates for every sun-orbiting destination ----------
console.log("== transfer estimates ==");
for (const dest of rocketDestinations) {
  if (!dest.bodyId) continue;
  const body = bodiesById.get(dest.bodyId)!;
  const est = estimateTransfer(body, bodiesById, NOW);
  if (!est) { note(`transfer ${dest.id}: null estimate`); continue; }
  for (const [k, v] of Object.entries(est)) {
    if (typeof v === "number" && !finite(v)) note(`transfer ${dest.id}.${k} = ${v}`);
  }
  if (est.transferTimeSeconds <= 0) note(`transfer ${dest.id}: non-positive time ${est.transferTimeSeconds}`);
  if (est.departureDeltaVKmS < 0) note(`transfer ${dest.id}: negative departure dv`);
  if (est.arrivalDeltaVKmS !== null && est.arrivalDeltaVKmS < 0) note(`transfer ${dest.id}: negative arrival dv`);
  if (Math.abs(est.phaseOffsetDeg) > 180.0001) note(`transfer ${dest.id}: phaseOffset out of range ${est.phaseOffsetDeg}`);
  const arc = sampleTransferArcKm(est, bodiesById, NOW);
  if (!arc) { note(`transfer ${dest.id}: null arc`); continue; }
  arc.pointsKm.forEach((pt, i) => checkVec(`arc ${dest.id}[${i}]`, pt));
  if (!finite(arc.arcLengthKm) || arc.arcLengthKm <= 0) note(`transfer ${dest.id}: bad arcLength ${arc.arcLengthKm}`);
  console.log(`  ${dest.id.padEnd(9)} T=${(est.transferTimeSeconds/86400).toFixed(0)}d dv=${est.departureDeltaVKmS.toFixed(2)}/${est.arrivalDeltaVKmS?.toFixed(2)} window=${est.launchWindowQuality} arcLen=${(arc.arcLengthKm/AU).toFixed(2)}AU`);
}

// ---- 3. Full view sweep: every profile x dest x mode x scale, across mission time
console.log("== full view sweep ==");
let views = 0;
const sampleTimes = [-30 * DAY, 0, DAY, 30 * DAY, 200 * DAY, 2 * YEAR, 50 * YEAR, 500 * YEAR];
for (const profile of rocketCatalog) {
  for (const dest of rocketDestinations) {
    for (const mm of rocketMissionModes) {
      for (const launchMode of rocketLaunchModes) {
        for (const mode of MODES) {
          for (const dt of sampleTimes) {
            views++;
            let v;
            try {
              v = computeRocketView(profile, NOW, NOW + dt, mode, dest, mm.id, launchMode.id);
            } catch (e) {
              note(`view threw: ${profile.id}/${dest.id}/${mm.id}/${launchMode.id}/${mode}/dt=${dt}: ${(e as Error).message}`);
              continue;
            }
            checkVec(`scenePos ${profile.id}/${dest.id}/${mm.id}/${launchMode.id}/${mode}/dt=${dt}`, v.scenePosition);
            checkVec(`sceneDir ${profile.id}/${dest.id}/${mm.id}/${launchMode.id}/${mode}/dt=${dt}`, v.sceneDirection);
            for (const key of ["elapsedSeconds","speedKmS","distanceTraveledKm","distanceFromEarthKm"] as const) {
              if (!finite(v[key])) note(`view ${profile.id}/${dest.id}/${mm.id}/${launchMode.id}/${mode}/dt=${dt}: ${key}=${v[key]}`);
            }
            if (v.distanceTraveledKm < -1e-6) note(`view ${profile.id}/${dest.id}/${mm.id}/${launchMode.id}/${mode}/dt=${dt}: negative dist ${v.distanceTraveledKm}`);
            if (v.launchMode !== launchMode.id) note(`view ${profile.id}/${dest.id}: launch mode not preserved`);
            if (v.destination) {
              if (!finite(v.destination.distanceToTargetKm)) note(`dest dist NaN ${profile.id}/${dest.id}/${mm.id}/${launchMode.id}/${mode}/dt=${dt}`);
              if (!finite(v.destination.closestApproachKm)) note(`closest NaN ${profile.id}/${dest.id}/${mm.id}/${launchMode.id}/${mode}/dt=${dt}`);
              if (v.destination.closestApproachKm < -1e-6) note(`closest<0 ${profile.id}/${dest.id}/${mm.id}/${launchMode.id}/${mode}/dt=${dt}`);
              v.destination.destScenePosition && checkVec("destScene", v.destination.destScenePosition);
            }
            if (v.transfer) {
              v.transfer.arcScenePoints.forEach((pt, i) => checkVec(`tArc ${dest.id}[${i}]`, pt));
              if (!finite(v.transfer.progress)) note(`transfer progress NaN ${profile.id}/${dest.id}/${mode}/dt=${dt}`);
            }
            if (v.directScenePoints) v.directScenePoints.forEach((pt, i) => checkVec(`dScene ${dest.id}[${i}]`, pt));
          }
        }
      }
    }
  }
}
console.log(`  swept ${views} views`);

// ---- 4. Specific behavioural probes ------------------------------------
console.log("== behavioural probes ==");

// 4a. C1: direct-mode distance-traveled after arrival keeps growing (parked at body).
{
  const fusion = rocketsById.get("fusion-drive")!;
  const neptune = rocketDestinations.find((d) => d.id === "neptune")!;
  const arr = computeRocketView(fusion, NOW, NOW + 30 * DAY, "compressed", neptune, "direct");
  const later = computeRocketView(fusion, NOW, NOW + 400 * DAY, "compressed", neptune, "direct");
  console.log(`  direct arrived dist@30d=${(arr.distanceTraveledKm/AU).toFixed(1)}AU status=${arr.status}; @400d=${(later.distanceTraveledKm/AU).toFixed(1)}AU status=${later.status} toTarget=${later.destination?.distanceToTargetKm}`);
  if (later.status === "arrived" && later.distanceTraveledKm > arr.distanceTraveledKm + 1e6)
    note(`DIRECT: distanceTraveled grows after arrival (${(arr.distanceTraveledKm/AU).toFixed(1)} -> ${(later.distanceTraveledKm/AU).toFixed(1)} AU) while parked at target`);
}

// 4b. Launch modes alter the initial vector state, not the selected craft's speed budget.
{
  const sv = rocketsById.get("saturn-v")!;
  const mars = rocketDestinations.find((d) => d.id === "mars")!;
  const free = rocketDestinations.find((d) => d.id === "free")!;
  const directEarth = computeRocketView(sv, NOW, NOW + DAY, "compressed", mars, "direct", "earth-departure");
  const directLeo = computeRocketView(sv, NOW, NOW + DAY, "compressed", mars, "direct", "low-earth-orbit");
  const freeEarth = computeRocketView(sv, NOW, NOW + DAY, "compressed", free, "direct", "earth-departure");
  const freeLeo = computeRocketView(sv, NOW, NOW + DAY, "compressed", free, "direct", "low-earth-orbit");
  const transferEarth = computeRocketView(sv, NOW, NOW + 10 * DAY, "compressed", mars, "hohmann", "earth-departure");
  const transferLeo = computeRocketView(sv, NOW, NOW + 10 * DAY, "compressed", mars, "hohmann", "low-earth-orbit");
  console.log(`  LEO direct/free speed delta=${(directLeo.speedKmS - directEarth.speedKmS).toFixed(1)}/${(freeLeo.speedKmS - freeEarth.speedKmS).toFixed(1)} km/s`);
  if (Math.abs(directLeo.speedKmS - directEarth.speedKmS) > 1e-9) note("LEO should not add orbital speed to the selected craft's direct-mode speed budget");
  if (Math.abs(freeLeo.speedKmS - freeEarth.speedKmS) > 1e-9) note("LEO should not add orbital speed to the selected craft's free-flight speed budget");
  if (Math.abs(transferLeo.speedKmS - transferEarth.speedKmS) > 1e-6) note("LEO should not alter transfer average speed baseline");
}

// 4c. M3: transfer "Speed" is the constant arc-average (not instantaneous).
{
  const sv = rocketsById.get("saturn-v")!;
  const mars = rocketDestinations.find((d) => d.id === "mars")!;
  const v1 = computeRocketView(sv, NOW, NOW + 10 * DAY, "compressed", mars, "hohmann");
  const v2 = computeRocketView(sv, NOW, NOW + 200 * DAY, "compressed", mars, "hohmann");
  console.log(`  transfer speed @10d=${v1.speedKmS.toFixed(2)} @200d=${v2.speedKmS.toFixed(2)} (constant=${Math.abs(v1.speedKmS-v2.speedKmS) < 1e-6})`);
}

// 4d. Transfer to Moon: sanity of Earth-centered estimate.
{
  const body = bodiesById.get("moon")!;
  const est = estimateTransfer(body, bodiesById, NOW)!;
  console.log(`  moon transfer: T=${(est.transferTimeSeconds/3600).toFixed(1)}h dv=${est.departureDeltaVKmS.toFixed(2)}/${est.arrivalDeltaVKmS?.toFixed(2)} central=${est.centralBodyId}`);
  if (est.transferTimeSeconds/86400 > 30) note(`moon transfer time implausibly long: ${(est.transferTimeSeconds/86400).toFixed(1)} d`);
}

// 4e. Determinism: same inputs -> same scene position.
{
  const sv = rocketsById.get("saturn-v")!;
  const mars = rocketDestinations.find((d) => d.id === "mars")!;
  const a = computeRocketView(sv, NOW, NOW + 50 * DAY, "compressed", mars, "direct");
  const b = computeRocketView(sv, NOW, NOW + 50 * DAY, "compressed", mars, "direct");
  if (JSON.stringify(a.scenePosition) !== JSON.stringify(b.scenePosition)) note(`direct view non-deterministic for same inputs`);
}

// 4f. A physical intercept must distinguish an uncaptured flyby from an
// explicitly modeled impulsive capture.
{
  const sv = rocketsById.get("saturn-v")!;
  const mars = rocketDestinations.find((d) => d.id === "mars")!;
  const marsBody = bodiesById.get("mars")!;
  const lambert = estimateTransfer(marsBody, bodiesById, NOW, sv, "lambert")!;
  const afterEncounterMs = lambert.arrivalDateMs + DAY;
  const flyby = computeRocketView(
    sv,
    NOW,
    afterEncounterMs,
    "compressed",
    mars,
    "lambert",
    "low-earth-orbit",
    "flyby",
  );
  const capture = computeRocketView(
    sv,
    NOW,
    afterEncounterMs,
    "compressed",
    mars,
    "lambert",
    "low-earth-orbit",
    "capture",
  );
  if (flyby.status !== "flyby") note(`Lambert flyby should continue uncaptured, got ${flyby.status}`);
  if (!flyby.transfer || flyby.transfer.continuationScenePoints.length < 2) note("Lambert flyby should render a propagated post-encounter trail");
  if (flyby.destination?.distanceToTargetKm === 0) note("Lambert flyby should separate from the destination after encounter");
  if (flyby.transfer?.captureApplied) note("Flyby must not apply the arrival burn");
  if (capture.status !== "arrived") note(`Lambert capture should attach after a valid burn, got ${capture.status}`);
  if (!capture.transfer?.captureApplied) note("Capture should apply the displayed arrival burn at a valid intercept");
  if (capture.destination?.distanceToTargetKm !== 0) note("Captured mission should remain attached to the destination");
}

console.log("\n==== PROBLEMS (" + problems.length + ") ====");
for (const p of problems) console.log(" - " + p);
if (!problems.length) console.log("none");
if (problems.length > 0) {
  process.exitCode = 1;
}
