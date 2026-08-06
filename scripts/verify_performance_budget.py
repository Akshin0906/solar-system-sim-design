#!/usr/bin/env python3
"""Build and measure repeatable cold-asset and worst-case scenario CPU budgets."""

from __future__ import annotations

import json
from pathlib import Path
import statistics
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[1]
VITE = ROOT / "node_modules" / ".bin" / "vite"
TSX = ROOT / "node_modules" / ".bin" / "tsx"
SCENARIO_BENCHMARK = ROOT / "scripts" / "measure_scenario_cpu.ts"

# Raw, pre-compression bytes keep the check deterministic across HTTP servers. The
# current app is intentionally kept below these ceilings with enough room for normal
# source growth, while a duplicated Three bundle or eagerly imported feature would fail.
MAX_COLD_BOOT_BYTES = 1_650_000
MAX_LARGEST_JAVASCRIPT_BYTES = 725_000

# Five in-process samples exclude TypeScript startup. Reference development runs of the
# exact 120-step, 60-fragment production cap land around 10-15 ms; 75 ms leaves ample
# shared-runner headroom while still rejecting a visibly long physics task.
MAX_SCENARIO_MEDIAN_MS = 75.0

# The public speed ceiling must fit a normal 60 Hz render with explicit step-cap
# headroom. This is a workload contract, not a wall-clock timing assertion, so it stays
# deterministic on slow CI hosts while the exact-cap benchmark independently guards CPU.
REFERENCE_RENDER_FPS = 60
MAX_NOMINAL_STEP_UTILIZATION = 0.8


def production_asset_metrics() -> tuple[int, int, list[tuple[str, int]]]:
    with tempfile.TemporaryDirectory(prefix="solar-system-perf-") as directory:
        output = Path(directory) / "dist"
        subprocess.run(
            [str(VITE), "build", "--outDir", str(output), "--emptyOutDir"],
            cwd=ROOT,
            check=True,
            text=True,
            capture_output=True,
            timeout=120,
        )

        cold_files = [output / "index.html"] + sorted(
            path
            for path in (output / "assets").iterdir()
            if path.is_file() and path.suffix in {".css", ".js"}
        )
        sizes = [(path.relative_to(output).as_posix(), path.stat().st_size) for path in cold_files]
        javascript_sizes = [size for name, size in sizes if name.endswith(".js")]
        if not javascript_sizes:
            raise AssertionError("Production build emitted no JavaScript assets")
        return sum(size for _, size in sizes), max(javascript_sizes), sizes


def scenario_cpu_metrics() -> tuple[float, dict[str, object]]:
    result = subprocess.run(
        [str(TSX), str(SCENARIO_BENCHMARK)],
        cwd=ROOT,
        check=True,
        text=True,
        capture_output=True,
        timeout=120,
    )
    metrics = json.loads(result.stdout)
    durations = metrics.get("durationsMs")
    if not isinstance(durations, list) or not durations:
        raise AssertionError(f"Scenario benchmark returned invalid samples: {metrics}")
    median_ms = statistics.median(float(duration) for duration in durations)
    return median_ms, metrics


def main() -> None:
    missing = [path for path in (VITE, TSX, SCENARIO_BENCHMARK) if not path.exists()]
    if missing:
        raise RuntimeError(f"Performance prerequisites are missing: {missing}; run npm ci first")

    cold_boot_bytes, largest_javascript_bytes, asset_sizes = production_asset_metrics()
    if cold_boot_bytes > MAX_COLD_BOOT_BYTES:
        raise AssertionError(
            f"Cold boot assets total {cold_boot_bytes:,} bytes, above the "
            f"{MAX_COLD_BOOT_BYTES:,}-byte budget: {asset_sizes}"
        )
    if largest_javascript_bytes > MAX_LARGEST_JAVASCRIPT_BYTES:
        raise AssertionError(
            f"Largest JavaScript asset is {largest_javascript_bytes:,} bytes, above the "
            f"{MAX_LARGEST_JAVASCRIPT_BYTES:,}-byte budget: {asset_sizes}"
        )

    scenario_median_ms, scenario_metrics = scenario_cpu_metrics()
    if scenario_metrics.get("fragmentLimit") != 60:
        raise AssertionError(f"Scenario benchmark did not use the UI fragment ceiling: {scenario_metrics}")
    if scenario_metrics.get("liveFragments") != scenario_metrics.get("fragmentLimit"):
        raise AssertionError(f"Scenario benchmark lost its intended live-fragment load: {scenario_metrics}")
    if scenario_metrics.get("stepsPerTrial") != scenario_metrics.get("maxSubstepsPerFrame"):
        raise AssertionError(f"Scenario benchmark did not exercise the production frame cap: {scenario_metrics}")
    expected_steps = scenario_metrics.get("maxSubstepsPerFrame")
    fixed_step_seconds = scenario_metrics.get("fixedStepSeconds")
    day_seconds = scenario_metrics.get("daySeconds")
    max_time_scale = scenario_metrics.get("maxScenarioTimeScaleDaysPerSec")
    executed_steps = scenario_metrics.get("executedSteps")
    executed_driver_steps = scenario_metrics.get("executedDriverSteps")
    if (
        not isinstance(expected_steps, int)
        or not isinstance(fixed_step_seconds, int)
        or scenario_metrics.get("simSecondsPerTrial") != expected_steps * fixed_step_seconds
        or not isinstance(executed_steps, list)
        or not isinstance(executed_driver_steps, list)
        or len(executed_steps) != scenario_metrics.get("trials")
        or len(executed_driver_steps) != scenario_metrics.get("trials")
        or any(steps != expected_steps for steps in executed_steps)
        or any(steps != expected_steps for steps in executed_driver_steps)
    ):
        raise AssertionError(f"Scenario benchmark did not execute every capped step: {scenario_metrics}")
    if not isinstance(day_seconds, int) or not isinstance(max_time_scale, (int, float)):
        raise AssertionError(f"Scenario benchmark omitted its user-facing speed contract: {scenario_metrics}")
    nominal_steps_per_frame = (
        float(max_time_scale) * day_seconds / REFERENCE_RENDER_FPS / fixed_step_seconds
    )
    nominal_step_utilization = nominal_steps_per_frame / expected_steps
    if nominal_step_utilization > MAX_NOMINAL_STEP_UTILIZATION + 1e-12:
        raise AssertionError(
            f"Maximum scenario speed needs {nominal_steps_per_frame:.1f} fixed steps at "
            f"{REFERENCE_RENDER_FPS} Hz ({nominal_step_utilization:.1%} of the frame cap), "
            f"above the {MAX_NOMINAL_STEP_UTILIZATION:.0%} workload budget: {scenario_metrics}"
        )
    expected_live_bodies = scenario_metrics.get("fragmentLimit", 0) + 10
    if scenario_metrics.get("liveBodies") != expected_live_bodies:
        raise AssertionError(f"Scenario benchmark lost its maximum participant/interloper load: {scenario_metrics}")
    if scenario_median_ms > MAX_SCENARIO_MEDIAN_MS:
        raise AssertionError(
            f"Worst-case scenario median is {scenario_median_ms:.1f} ms, above the "
            f"{MAX_SCENARIO_MEDIAN_MS:.1f} ms budget: {scenario_metrics}"
        )

    print(
        "Performance budgets verified: "
        f"cold boot {cold_boot_bytes:,}/{MAX_COLD_BOOT_BYTES:,} raw bytes, "
        f"largest JS {largest_javascript_bytes:,}/{MAX_LARGEST_JAVASCRIPT_BYTES:,} bytes, "
        f"60-fragment production-cap frame {scenario_median_ms:.1f}/{MAX_SCENARIO_MEDIAN_MS:.1f} ms median "
        f"for {scenario_metrics['maxSubstepsPerFrame']} fixed steps; "
        f"{max_time_scale:g} days/sec uses {nominal_steps_per_frame:.0f} steps/frame "
        f"({nominal_step_utilization:.0%}) at {REFERENCE_RENDER_FPS} Hz."
    )


if __name__ == "__main__":
    main()
