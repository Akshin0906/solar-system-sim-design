#!/usr/bin/env python3
"""Verify the minor-body scientific contract against frozen official values."""

from __future__ import annotations

import json
import math
import shutil
import subprocess
from pathlib import Path


AU_KM = 149_597_870.7
ROOT = Path(__file__).resolve().parents[1]

# JPL Horizons ELEMENTS, 2025-01-01 00:00 TDB, heliocentric IAU76/80
# ecliptic of J2000.  Reproducible with scripts/fetch_horizons_elements.py.
DWARF_PLANETS = {
    "ceres": dict(a_au=2.766360233580095, period_days=1680.589037698568, eccentricity=.07927929080437446, inclination_deg=10.58793299269121),
    "pluto": dict(a_au=39.28778257358678, period_days=89946.58972003507, eccentricity=.2438605399689669, inclination_deg=16.93906659887321),
    "eris": dict(a_au=68.08675543103006, period_days=205207.1011778137, eccentricity=.4348062032901582, inclination_deg=43.7908184116636),
    "haumea": dict(a_au=42.9318631481777, period_days=102746.7352881387, eccentricity=.1978806241186673, inclination_deg=28.2083786346087),
    "makemake": dict(a_au=45.40809140196068, period_days=111763.0638230585, eccentricity=.1629618398485094, inclination_deg=29.03460516900455),
}

# Shape/reference-plane values are from JPL Planetary Satellite Mean Elements.
# Periods are the two-date effective values emitted by calibrate_moon_phases.py.
MAJOR_MOONS = {
    "moon": dict(a_km=384400, period_days=27.321890868, eccentricity=.0554, inclination_deg=5.16, frame="ecliptic-j2000"),
    "io": dict(a_km=421800, period_days=1.769104042, eccentricity=.004, inclination_deg=0, frame="laplace-plane"),
    "europa": dict(a_km=671100, period_days=3.551372776, eccentricity=.009, inclination_deg=.5, frame="laplace-plane"),
    "ganymede": dict(a_km=1070400, period_days=7.155586438, eccentricity=.001, inclination_deg=.2, frame="laplace-plane"),
    "callisto": dict(a_km=1882700, period_days=16.690445553, eccentricity=.007, inclination_deg=.3, frame="laplace-plane"),
    "titan": dict(a_km=1221900, period_days=15.946851096, eccentricity=.029, inclination_deg=.3, frame="laplace-plane"),
    "enceladus": dict(a_km=238400, period_days=1.370236382, eccentricity=.005, inclination_deg=0, frame="laplace-plane"),
    "rhea": dict(a_km=527200, period_days=4.517587576, eccentricity=.001, inclination_deg=.3, frame="laplace-plane"),
    "iapetus": dict(a_km=3561700, period_days=79.336717467, eccentricity=.028, inclination_deg=7.6, frame="laplace-plane"),
    "titania": dict(a_km=436298, period_days=8.708282309, eccentricity=.002, inclination_deg=.1, frame="body-equator"),
    "oberon": dict(a_km=583511, period_days=13.462963591, eccentricity=.002, inclination_deg=.1, frame="body-equator"),
    "ariel": dict(a_km=190929, period_days=2.520680208, eccentricity=.001, inclination_deg=0, frame="body-equator"),
    "umbriel": dict(a_km=265986, period_days=4.144113730, eccentricity=.004, inclination_deg=.1, frame="body-equator"),
    "miranda": dict(a_km=129846, period_days=1.413556407, eccentricity=.001, inclination_deg=4.4, frame="body-equator"),
    "triton": dict(a_km=354800, period_days=5.876563900, eccentricity=0, inclination_deg=157.3, frame="laplace-plane"),
}


def load_app_contract() -> dict[str, dict[str, object]]:
    ids = sorted([*DWARF_PLANETS, *MAJOR_MOONS])
    code = f"""
      import {{ bodies, bodiesById }} from "./src/data";
      const ids = {json.dumps(ids)};
      const selected = Object.fromEntries(ids.map((id) => {{
        const body = bodiesById.get(id);
        if (!body?.orbit) return [id, null];
        return [id, {{
          type: body.type,
          semiMajorAxisKm: body.orbit.semiMajorAxisKm,
          orbitalPeriodDays: body.orbit.orbitalPeriodDays,
          eccentricity: body.orbit.eccentricity,
          inclinationDeg: body.orbit.inclinationDeg,
          meanAnomalyAtEpochDeg: body.orbit.meanAnomalyAtEpochDeg,
          epochTimeScale: body.orbit.epochTimeScale,
          referenceFrame: body.orbit.referenceFrame,
          orbitMetadata: body.orbit.metadata,
          bodyMetadata: body.scientific,
          orientation: body.physical.orientation,
          rotationPeriodHours: body.physical.rotationPeriodHours,
        }}];
      }}));
      const all = bodies.map((body) => ({{
        id: body.id,
        hasScientific: Boolean(body.scientific),
        orbitComplete: !body.orbit || Boolean(
          body.orbit.epochTimeScale && body.orbit.referenceFrame && body.orbit.metadata
        ),
        rotationPeriodHours: body.physical.rotationPeriodHours ?? null,
      }}));
      console.log(JSON.stringify({{ selected, all }}));
    """
    local_tsx = ROOT / "node_modules" / ".bin" / "tsx"
    if local_tsx.exists():
        command = str(local_tsx)
    else:
        command = shutil.which("tsx")
        if not command:
            raise RuntimeError("tsx is required; run npm install before verify:math")
    result = subprocess.run(
        [command, "--eval", code],
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
    contract = load_app_contract()
    selected = contract["selected"]

    for body_id, expected in DWARF_PLANETS.items():
        actual = selected[body_id]
        assert actual, f"missing app orbit for {body_id}"
        assert actual["type"] == "dwarfPlanet"
        assert_close(actual["semiMajorAxisKm"] / AU_KM, expected["a_au"], 1e-12, f"{body_id} a")
        assert_close(actual["orbitalPeriodDays"], expected["period_days"], 1e-7, f"{body_id} period")
        assert_close(actual["eccentricity"], expected["eccentricity"], 1e-12, f"{body_id} eccentricity")
        assert_close(actual["inclinationDeg"], expected["inclination_deg"], 1e-10, f"{body_id} inclination")
        assert actual["epochTimeScale"] == "TDB"
        assert actual["referenceFrame"]["id"] == "ecliptic-j2000"
        assert actual["orbitMetadata"]["accuracy"]["tier"] == "ephemeris-snapshot"
        assert "horizons" in actual["orbitMetadata"]["sources"][0]["id"]

    for body_id, expected in MAJOR_MOONS.items():
        actual = selected[body_id]
        assert actual, f"missing app orbit for {body_id}"
        assert actual["type"] == "moon"
        assert_close(actual["semiMajorAxisKm"], expected["a_km"], 1e-6, f"{body_id} a")
        assert_close(actual["orbitalPeriodDays"], expected["period_days"], 1e-9, f"{body_id} period")
        assert_close(actual["eccentricity"], expected["eccentricity"], 1e-12, f"{body_id} eccentricity")
        assert_close(actual["inclinationDeg"], expected["inclination_deg"], 1e-12, f"{body_id} inclination")
        assert actual["epochTimeScale"] == "TDB"
        assert actual["referenceFrame"]["id"] == expected["frame"]
        assert actual["orbitMetadata"]["accuracy"]["tier"] == "mean-elements"
        assert actual["orientation"]["kind"] == "iau-pck"
        assert actual["orientation"]["synchronous"]["parentId"]

    for body in contract["all"]:
        assert body["hasScientific"], f"{body['id']} missing body scientific metadata"
        assert body["orbitComplete"], f"{body['id']} orbit contract is incomplete"
        period = body["rotationPeriodHours"]
        assert period is None or period > 0, f"{body['id']} has a signed legacy rotation period"

    assert selected["triton"]["referenceFrame"]["poleRightAscensionDeg"] == 299.8
    assert selected["titania"]["referenceFrame"]["poleDeclinationDeg"] == -15.175

    print("Scientific contract source-value checks passed")
    print(f"Checked {len(DWARF_PLANETS)} Horizons dwarf snapshots and {len(MAJOR_MOONS)} JPL moon models")


if __name__ == "__main__":
    main()
