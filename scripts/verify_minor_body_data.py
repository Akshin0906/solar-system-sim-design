#!/usr/bin/env python3
"""Validate rounded dwarf planet and major moon values in the app data."""

from __future__ import annotations

import json
import math
import subprocess
from pathlib import Path

AU_KM = 149_597_870.7
ROOT = Path(__file__).resolve().parents[1]

DWARF_PLANETS = {
    "ceres": dict(a_au=2.7675, period_days=1_680.5, eccentricity=0.0758, inclination_deg=10.59),
    "pluto": dict(a_au=39.48, period_days=90_560, eccentricity=0.2488, inclination_deg=17.16),
    "eris": dict(a_au=67.78, period_days=203_600, eccentricity=0.44, inclination_deg=44.04),
    "haumea": dict(a_au=43.13, period_days=103_774, eccentricity=0.195, inclination_deg=28.2),
    "makemake": dict(a_au=45.79, period_days=112_897, eccentricity=0.161, inclination_deg=29.0),
}

MAJOR_MOONS = {
    "moon": dict(a_km=384_400, period_days=27.3217, eccentricity=0.0549, inclination_deg=5.145),
    "io": dict(a_km=421_700, period_days=1.769, eccentricity=0.0041, inclination_deg=0.04),
    "europa": dict(a_km=671_100, period_days=3.551, eccentricity=0.009, inclination_deg=0.47),
    "ganymede": dict(a_km=1_070_400, period_days=7.154, eccentricity=0.0013, inclination_deg=0.2),
    "callisto": dict(a_km=1_882_700, period_days=16.689, eccentricity=0.0074, inclination_deg=0.192),
    "titan": dict(a_km=1_221_870, period_days=15.945, eccentricity=0.0288, inclination_deg=0.3485),
    "enceladus": dict(a_km=238_020, period_days=1.37, eccentricity=0.0047, inclination_deg=0.009),
    "rhea": dict(a_km=527_108, period_days=4.518, eccentricity=0.001, inclination_deg=0.345),
    "iapetus": dict(a_km=3_560_820, period_days=79.32, eccentricity=0.0286, inclination_deg=15.47),
    "titania": dict(a_km=435_910, period_days=8.706, eccentricity=0.0011, inclination_deg=0.34),
    "oberon": dict(a_km=583_520, period_days=13.463, eccentricity=0.0014, inclination_deg=0.058),
    "ariel": dict(a_km=190_900, period_days=2.52, eccentricity=0.0012, inclination_deg=0.31),
    "umbriel": dict(a_km=266_000, period_days=4.144, eccentricity=0.0039, inclination_deg=0.36),
    "miranda": dict(a_km=129_900, period_days=1.413, eccentricity=0.0013, inclination_deg=4.338),
    "triton": dict(a_km=354_759, period_days=5.877, eccentricity=0.000016, inclination_deg=156.865, retrograde=True),
}


def load_app_orbits() -> dict[str, dict[str, object]]:
    ids = sorted([*DWARF_PLANETS.keys(), *MAJOR_MOONS.keys()])
    code = f"""
      import {{ bodiesById }} from "./src/data";
      const ids = {json.dumps(ids)};
      const out = Object.fromEntries(ids.map((id) => {{
        const body = bodiesById.get(id);
        if (!body?.orbit) {{
          return [id, null];
        }}
        return [id, {{
          type: body.type,
          semiMajorAxisKm: body.orbit.semiMajorAxisKm,
          orbitalPeriodDays: body.orbit.orbitalPeriodDays,
          eccentricity: body.orbit.eccentricity,
          inclinationDeg: body.orbit.inclinationDeg,
          retrograde: body.orbit.retrograde === true,
        }}];
      }}));
      console.log(JSON.stringify(out));
    """
    tsx = ROOT / "node_modules" / ".bin" / "tsx"
    result = subprocess.run(
        [str(tsx), "--eval", code],
        cwd=ROOT,
        check=True,
        text=True,
        capture_output=True,
    )
    return json.loads(result.stdout)


def assert_close(actual: float, expected: float, tolerance: float, label: str) -> None:
    if not math.isclose(actual, expected, abs_tol=tolerance):
        raise AssertionError(f"{label}: expected {expected}, got {actual}")


def main() -> None:
    app_orbits = load_app_orbits()

    for body_id, expected in DWARF_PLANETS.items():
        actual = app_orbits[body_id]
        assert actual, f"missing app orbit for {body_id}"
        assert actual["type"] == "dwarfPlanet", f"{body_id} should be a dwarf planet"
        assert_close(actual["semiMajorAxisKm"] / AU_KM, expected["a_au"], 0.000_01, f"{body_id} semi-major axis AU")
        assert_close(actual["orbitalPeriodDays"], expected["period_days"], 0.05, f"{body_id} period days")
        assert_close(actual["eccentricity"], expected["eccentricity"], 0.000_1, f"{body_id} eccentricity")
        assert_close(actual["inclinationDeg"], expected["inclination_deg"], 0.01, f"{body_id} inclination")

    for body_id, expected in MAJOR_MOONS.items():
        actual = app_orbits[body_id]
        assert actual, f"missing app orbit for {body_id}"
        assert actual["type"] == "moon", f"{body_id} should be a moon"
        assert_close(actual["semiMajorAxisKm"], expected["a_km"], 0.5, f"{body_id} semi-major axis km")
        assert_close(actual["orbitalPeriodDays"], expected["period_days"], 0.000_5, f"{body_id} period days")
        assert_close(actual["eccentricity"], expected["eccentricity"], 0.000_01, f"{body_id} eccentricity")
        assert_close(actual["inclinationDeg"], expected["inclination_deg"], 0.001, f"{body_id} inclination")
        if "retrograde" in expected:
            assert actual["retrograde"] is expected["retrograde"], f"{body_id} retrograde flag should be {expected['retrograde']}"

    print("Minor body source-value checks passed")
    print(f"Checked {len(DWARF_PLANETS)} dwarf planets and {len(MAJOR_MOONS)} major moons")


if __name__ == "__main__":
    main()
