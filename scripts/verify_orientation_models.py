#!/usr/bin/env python3
"""Verify PCK orientation math and instantaneous synchronous moon frames."""

from __future__ import annotations

import json
import math
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATES = ("2000-01-01T12:00:00.000Z", "2026-07-10T00:00:00.000Z")
BODIES = ("sun", "venus", "earth", "saturn", "uranus", "moon", "io", "titan", "titania", "triton")


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def cross(a, b):
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def length(vector):
    return math.sqrt(dot(vector, vector))


def normalize(vector):
    magnitude = length(vector)
    return tuple(component / magnitude for component in vector)


def load_orientation_results():
    local_tsx = ROOT / "node_modules" / ".bin" / "tsx"
    command = str(local_tsx) if local_tsx.exists() else shutil.which("tsx")
    if not command:
        raise RuntimeError("tsx is required; run npm install before verify:math")
    code = f"""
      import {{ bodiesById }} from "./src/data";
      import {{ getBodyOrientationAxes }} from "./src/simulation/orientation";
      import {{ getOrbitPositionKm }} from "./src/simulation/solveOrbit";
      const ids = {json.dumps(BODIES)};
      const dates = {json.dumps(DATES)};
      const output = Object.fromEntries(dates.map((date) => [date, Object.fromEntries(ids.map((id) => {{
        const body = bodiesById.get(id);
        if (!body) throw new Error(`missing body ${{id}}`);
        return [id, {{
          axes: getBodyOrientationAxes(body, new Date(date)),
          localPosition: body.orbit ? getOrbitPositionKm(body.orbit, new Date(date)) : null,
          legacyPeriod: body.physical.rotationPeriodHours ?? null,
          model: body.physical.orientation ?? null,
        }}];
      }}))]));
      console.log(JSON.stringify(output));
    """
    result = subprocess.run(
        [command, "--eval", code],
        cwd=ROOT,
        check=True,
        text=True,
        capture_output=True,
    )
    return json.loads(result.stdout)


def main():
    results = load_orientation_results()
    for date, by_body in results.items():
        for body_id, result in by_body.items():
            axes = result["axes"]
            assert axes, f"{body_id} missing orientation axes"
            x_axis, y_axis, z_axis = axes["xAxis"], axes["yAxis"], axes["zAxis"]
            for label, axis in (("x", x_axis), ("y", y_axis), ("z", z_axis)):
                assert math.isclose(length(axis), 1, abs_tol=1e-10), (date, body_id, label, length(axis))
            assert abs(dot(x_axis, y_axis)) < 1e-10, (date, body_id, "xy")
            assert abs(dot(x_axis, z_axis)) < 1e-10, (date, body_id, "xz")
            assert abs(dot(y_axis, z_axis)) < 1e-10, (date, body_id, "yz")
            assert dot(cross(x_axis, y_axis), z_axis) > .999999999, (date, body_id, "handedness")

            if result["model"].get("synchronous"):
                assert axes["mode"] == "synchronous"
                toward_parent = normalize(tuple(-value for value in result["localPosition"]))
                # PCK pole and mean orbit normal differ slightly, so the helper
                # projects the parent direction into the equator before locking.
                projected = normalize(tuple(
                    toward_parent[index] - dot(toward_parent, z_axis) * z_axis[index]
                    for index in range(3)
                ))
                assert dot(x_axis, projected) > .999999999, (date, body_id, dot(x_axis, projected))
                assert dot(x_axis, toward_parent) > .94, (date, body_id, dot(x_axis, toward_parent))
            else:
                assert axes["mode"] == "pck"

    j2000 = results[DATES[0]]
    assert j2000["venus"]["legacyPeriod"] > 0
    assert j2000["uranus"]["legacyPeriod"] > 0
    assert j2000["venus"]["model"]["primeMeridian"]["rateDegPerDay"] < 0
    assert j2000["uranus"]["model"]["primeMeridian"]["rateDegPerDay"] < 0
    assert j2000["earth"]["axes"]["angles"]["primeMeridianDeg"] == 190.147

    print("Orientation model checks passed")
    print(f"Checked {len(BODIES)} PCK models at {len(DATES)} dates")


if __name__ == "__main__":
    main()
