#!/usr/bin/env python3
"""Verify authored experiences against their runtime geometry and store transitions.

The TypeScript inspector exercises the production modules.  This independent Python
gate recomputes every shadow-cone classification and scale mapping used by the tour,
then checks that Director sessions restore the exact clock/view/scale snapshot.
"""

from __future__ import annotations

import json
import math
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SEARCH_DAYS = 550
WATCH_LEAD_MS = 6 * 60 * 60 * 1_000
EARTH_RADIUS_KM = 6_371.0
# NASA/GSFC Besselian elements give greatest eclipse at 17:45:51 UT:
# https://eclipse.gsfc.nasa.gov/SEsearch/SEdata.php?Ecl=20260812
NASA_2026_GREATEST_MS = datetime(
    2026, 8, 12, 17, 45, 51, tzinfo=timezone.utc
).timestamp() * 1_000


def load_runtime_report() -> dict:
    tsx = ROOT / "node_modules" / ".bin" / "tsx"
    if not tsx.exists():
        executable = shutil.which("tsx")
        if not executable:
            raise RuntimeError("tsx is required; run npm install before this verifier")
        tsx = Path(executable)

    result = subprocess.run(
        [str(tsx), "scripts/inspect_authored_experiences.ts"],
        cwd=ROOT,
        check=True,
        text=True,
        capture_output=True,
    )
    return json.loads(result.stdout)


def expected_eclipse_kind(event: dict) -> str:
    if event["axisDistanceMoonToEarthKm"] <= 0 or event["penumbraMarginKm"] < 0:
        return "none"
    if event["coreIntersectionMarginKm"] < 0:
        return "partial"
    return "total" if event["coreRadiusAtEarthKm"] >= 0 else "annular"


def assert_close(actual: float, expected: float, tolerance: float, label: str) -> None:
    assert math.isfinite(actual), f"{label} is not finite: {actual}"
    assert abs(actual - expected) <= tolerance, (
        f"{label}: expected {expected}, got {actual} (tolerance {tolerance})"
    )


def main() -> None:
    report = load_runtime_report()
    day_ms = report["constants"]["DAY_MS"]

    print("Authored experience eclipse solves")
    print("start        maximum              kind      miss(km)  penumbra margin(km)")
    seen_maxima: set[int] = set()
    for case in report["eclipseCases"]:
        event = case["event"]
        assert event is not None, f"no eclipse found after {case['startMs']}"
        assert case["startMs"] < event["maximumDateMs"]
        assert event["maximumDateMs"] <= case["startMs"] + SEARCH_DAYS * day_ms + 60_000
        assert event["kind"] == expected_eclipse_kind(event)
        assert event["kind"] in {"partial", "annular", "total"}
        assert event["axisDistanceMoonToEarthKm"] > 0
        assert event["penumbraMarginKm"] >= 0

        recomputed_penumbra_margin = (
            EARTH_RADIUS_KM
            + event["penumbraRadiusAtEarthKm"]
            - event["shadowAxisMissKm"]
        )
        recomputed_core_margin = (
            EARTH_RADIUS_KM
            + abs(event["coreRadiusAtEarthKm"])
            - event["shadowAxisMissKm"]
        )
        assert_close(
            event["penumbraMarginKm"],
            recomputed_penumbra_margin,
            1e-6,
            "penumbra intersection margin",
        )
        assert_close(
            event["coreIntersectionMarginKm"],
            recomputed_core_margin,
            1e-6,
            "core intersection margin",
        )

        before = case["beforeOneHour"]
        after = case["afterOneHour"]
        assert before["solarAngularSeparationDeg"] > event["solarAngularSeparationDeg"]
        assert after["solarAngularSeparationDeg"] > event["solarAngularSeparationDeg"]
        seen_maxima.add(round(event["maximumDateMs"]))
        print(
            f"{case['startMs']:<12.0f} {event['maximumDateMs']:<20.0f} "
            f"{event['kind']:<9} {event['shadowAxisMissKm']:>9.1f} "
            f"{event['penumbraMarginKm']:>19.1f}"
        )

    assert len(seen_maxima) >= 2, "search returned a single canned maximum for every start date"
    first_event = report["eclipseCases"][0]["event"]
    nasa_timing_error_hours = abs(
        first_event["maximumDateMs"] - NASA_2026_GREATEST_MS
    ) / (60 * 60 * 1_000)
    assert first_event["kind"] == "total"
    assert datetime.fromtimestamp(
        first_event["maximumDateMs"] / 1_000, tz=timezone.utc
    ).date() == datetime(2026, 8, 12, tzinfo=timezone.utc).date()
    # This mean-element renderer is not an eclipse almanac. Keep the live solve in
    # the correct NASA event/day and within half a day, while the UI discloses the
    # lower-fidelity timing instead of implying Besselian accuracy.
    assert nasa_timing_error_hours < 12
    print(f"2026 solve differs from NASA greatest eclipse by {nasa_timing_error_hours:.2f} h")

    tours = {tour["id"]: tour for tour in report["tours"]}
    assert tours["scale-revelation"]["scaleModes"] == [
        "real",
        "readable",
        "compressed",
        "overview",
    ]
    assert len(tours["three-worlds"]["stopIds"]) == 3
    assert all(count > 0 for tour in tours.values() for count in tour["fidelityCounts"])

    scales = report["scaleSamples"]
    one = scales["oneAu"]
    ten = scales["tenAu"]
    assert_close(ten["real"] / one["real"], 10.0, 1e-12, "real distance ratio")
    assert_close(ten["readable"] / one["readable"], 10.0, 1e-12, "readable distance ratio")
    assert_close(
        ten["compressed"] / one["compressed"],
        10.0**0.62,
        1e-12,
        "compressed distance ratio",
    )
    assert_close(one["overview"], math.log10(2.0) * 52.0, 1e-12, "overview 1 AU mapping")
    assert_close(ten["overview"], math.log10(11.0) * 52.0, 1e-12, "overview 10 AU mapping")
    assert_close(
        scales["realRadiusRatio"],
        scales["physicalRadiusRatio"],
        1e-12,
        "real-scale radius ratio",
    )

    transitions = report["stateTransitions"]
    assert transitions["firstStopState"] == {
        "experience": "scale-revelation",
        "stop": "true-scale",
        "mode": "real",
        "selectedId": "earth",
        "cameraMode": "overview",
        "paused": True,
    }
    assert transitions["secondStopState"] == {
        "stop": "readable-scale",
        "mode": "readable",
        "cameraMode": "earth-moon",
    }
    assert transitions["boundedStopState"] == {"index": 3, "stop": "map-scale"}
    assert transitions["restoredState"]["clock"] == transitions["originalClock"]
    assert transitions["restoredState"]["scale"] == transitions["originalScale"]
    assert transitions["restoredState"]["selection"] == {
        "selectedId": "mars",
        "cameraMode": "focus",
        "rocketTarget": None,
    }

    eclipse_session = transitions["eclipseSessionState"]
    assert eclipse_session["active"] == "eclipse-chase"
    assert eclipse_session["selectedId"] == "earth"
    assert eclipse_session["cameraMode"] == "earth-moon"
    assert eclipse_session["scaleMode"] == "readable"
    assert eclipse_session["direction"] == 1
    assert eclipse_session["preset"] == "hour"
    assert eclipse_session["paused"] is False
    assert eclipse_session["maximumDateMs"] is not None
    assert_close(
        eclipse_session["maximumDateMs"] - eclipse_session["simulationDateMs"],
        WATCH_LEAD_MS,
        1.0,
        "eclipse watch lead",
    )
    assert transitions["maximumHoldState"] == {
        "paused": True,
        "simulationDateMs": eclipse_session["maximumDateMs"],
    }
    assert transitions["eclipseRestoredClock"] == {
        "direction": -1,
        "isPaused": True,
        "preset": "custom",
        "simulationDateMs": report["eclipseCases"][0]["startMs"],
        "timeScale": 54_321,
    }
    assert transitions["scenarioHandoffState"] == {
        "experience": None,
        "scenario": "red-giant",
        "transportLocked": True,
    }
    assert transitions["scenarioExitState"] == {
        "clock": transitions["originalClock"],
        "selectedId": "mars",
        "cameraMode": "focus",
    }
    assert transitions["rocketHandoffState"] == {
        "experience": None,
        "selectedId": "mars",
        "cameraMode": "focus",
    }
    assert transitions["rocketExitState"] == {
        "selectedId": "mars",
        "cameraMode": "focus",
    }
    assert transitions["recommendedResetState"] == {
        "experience": None,
        "selectedId": "earth",
        "cameraMode": "overview",
        "scaleMode": "compressed",
        "labelDensity": "standard",
    }

    print("Scale disclosures, Director bounds, symmetric handoffs, and exact restore checks passed")


if __name__ == "__main__":
    main()
