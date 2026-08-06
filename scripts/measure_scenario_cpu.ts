import { bodies, bodiesById } from "../src/data";
import { AU_KM, DAY_SECONDS } from "../src/data/constants";
import {
  FIXED_STEP_SECONDS,
  MAX_SIM_SECONDS_PER_FRAME,
  MAX_SUBSTEPS_PER_FRAME,
  addSimBody,
  advance,
  enableDebris,
  seedIntegrator,
  stepFixed,
} from "../src/scenarios/integrator";
import { SCENARIO_MAX_TIME_SCALE } from "../src/scenarios/scenarioValidation";

const FRAGMENT_LIMIT = 60;
const TRIALS = 5;
const WARMUP_STEPS = 8;
const START_DATE_MS = Date.parse("2026-06-14T12:00:00.000Z");

const state = seedIntegrator(bodies, bodiesById, START_DATE_MS);
enableDebris(state, FRAGMENT_LIMIT);

// Production debris scenarios can retain one injected impactor/interloper alongside
// all nine major participants and the full fragment cloud. Keep it far away so every
// trial retains the exact maximum body count without timing a one-off collision.
addSimBody(state, {
  id: "perf-interloper",
  kind: "rogue",
  posKm: [80 * AU_KM, 0, 0],
  velKmS: [0, 0, 1],
  muKm3S2: 1,
  radiusKm: 1,
  color: "#ffffff",
  alive: true,
});

// Populate the largest debris set the UI allows. The fragments are deliberately far
// apart so this measures the steady worst-case O(n²) gravity + contact workload rather
// than an unstable benchmark dominated by a one-off collision or allocation burst.
for (let index = 0; index < FRAGMENT_LIMIT; index += 1) {
  addSimBody(state, {
    id: `perf-fragment-${index}`,
    kind: "fragment",
    posKm: [
      (40 + index * 0.25) * AU_KM,
      ((index % 5) - 2) * 250_000,
      ((index % 7) - 3) * 350_000,
    ],
    velKmS: [0, 0, 1],
    muKm3S2: 1,
    radiusKm: 1,
    color: "#ffffff",
    alive: true,
  });
}

const runSteps = (count: number) => {
  for (let step = 0; step < count; step += 1) {
    stepFixed(state, FIXED_STEP_SECONDS);
  }
};

runSteps(WARMUP_STEPS);
const durationsMs: number[] = [];
const executedSteps: number[] = [];
const executedDriverSteps: number[] = [];
for (let trial = 0; trial < TRIALS; trial += 1) {
  let driverSteps = 0;
  const startedAt = performance.now();
  const steps = advance(state, MAX_SIM_SECONDS_PER_FRAME, () => {
    driverSteps += 1;
  });
  durationsMs.push(performance.now() - startedAt);
  executedSteps.push(steps);
  executedDriverSteps.push(driverSteps);
}

const liveBodies = state.bodies.filter((body) => body.alive).length;
const liveFragments = state.bodies.filter((body) => body.alive && body.kind === "fragment").length;
process.stdout.write(
  JSON.stringify({
    durationsMs,
    daySeconds: DAY_SECONDS,
    executedDriverSteps,
    executedSteps,
    fixedStepSeconds: FIXED_STEP_SECONDS,
    fragmentLimit: FRAGMENT_LIMIT,
    liveBodies,
    liveFragments,
    maxSubstepsPerFrame: MAX_SUBSTEPS_PER_FRAME,
    maxScenarioTimeScaleDaysPerSec: SCENARIO_MAX_TIME_SCALE,
    simSecondsPerTrial: MAX_SIM_SECONDS_PER_FRAME,
    stepsPerTrial: MAX_SUBSTEPS_PER_FRAME,
    trials: TRIALS,
  }),
);
