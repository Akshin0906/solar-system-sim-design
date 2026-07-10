#!/usr/bin/env python3
"""Fetch reproducible JPL Horizons osculating elements for bundled bodies.

This is an authoring tool, not part of ``verify:math``: it deliberately uses the
network so maintainers can refresh the checked-in element values and inspect the
exact Horizons response metadata.  Runtime and CI verification use frozen source
values and never depend on network availability.

Official API documentation: https://ssd-api.jpl.nasa.gov/doc/horizons.html
"""

from __future__ import annotations

import csv
import io
import json
import urllib.parse
import urllib.request


API_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
EPOCH = "2025-01-01"

TARGETS = {
    "ceres": ("1;", "500@10"),
    "pluto": ("999", "500@10"),
    "eris": ("136199;", "500@10"),
    "haumea": ("136108;", "500@10"),
    "makemake": ("136472;", "500@10"),
}

COLUMNS = (
    "jd_tdb",
    "calendar_tdb",
    "eccentricity",
    "periapsis_distance_au",
    "inclination_deg",
    "longitude_of_ascending_node_deg",
    "argument_of_periapsis_deg",
    "periapsis_time_jd_tdb",
    "mean_motion_deg_per_day",
    "mean_anomaly_deg",
    "true_anomaly_deg",
    "semi_major_axis_au",
    "apoapsis_distance_au",
    "period_days",
)


def request_elements(command: str, center: str) -> dict[str, float | str]:
    params = {
        "format": "text",
        "COMMAND": f"'{command}'",
        "EPHEM_TYPE": "'ELEMENTS'",
        "CENTER": f"'{center}'",
        "START_TIME": f"'{EPOCH}'",
        "STOP_TIME": "'2025-01-02'",
        "STEP_SIZE": "'1 d'",
        "REF_PLANE": "'ECLIPTIC'",
        "REF_SYSTEM": "'ICRF'",
        "OUT_UNITS": "'AU-D'",
        "TIME_TYPE": "'TDB'",
        "CSV_FORMAT": "'YES'",
        "OBJ_DATA": "'YES'",
    }
    url = f"{API_URL}?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(url, timeout=30) as response:
        text = response.read().decode("utf-8")

    try:
        data_block = text.split("$$SOE", 1)[1].split("$$EOE", 1)[0].strip()
    except IndexError as error:
        raise RuntimeError(f"Horizons response had no ephemeris block for {command}\n{text}") from error

    row = next(csv.reader(io.StringIO(data_block)))
    if row and not row[-1].strip():
        row.pop()
    values: dict[str, float | str] = {}
    if len(row) != len(COLUMNS):
        raise RuntimeError(f"Expected {len(COLUMNS)} Horizons columns, got {len(row)}")
    for key, raw in zip(COLUMNS, row):
        raw = raw.strip()
        values[key] = raw if key == "calendar_tdb" else float(raw)
    return values


def main() -> None:
    output = {
        "source": API_URL,
        "epoch": f"{EPOCH} TDB",
        "reference_frame": "IAU76/80 ecliptic of J2000, ICRF",
        "targets": {
            body_id: request_elements(command, center)
            for body_id, (command, center) in TARGETS.items()
        },
    }
    print(json.dumps(output, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
