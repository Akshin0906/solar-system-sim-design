#!/usr/bin/env python3
"""Fetch geometric JPL Horizons vectors used to refresh offline verification.

The printed coordinates are IAU76/80 ecliptic-of-J2000 X/Y/Z in kilometres.
Copy reviewed results into ``verify_ephemeris_fidelity.py``; CI never makes a
network request.
"""

from __future__ import annotations

import csv
import io
import json
import urllib.parse
import urllib.request


API_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
DATES = ("2000-01-01 12:00", "2025-01-01 00:00", "2026-07-10 00:00")
TARGETS = {
    "ceres": ("1;", "500@10"),
    "pluto": ("999", "500@10"),
    "eris": ("136199;", "500@10"),
    "haumea": ("136108;", "500@10"),
    "makemake": ("136472;", "500@10"),
    "moon": ("301", "500@399"),
    "io": ("501", "500@599"),
    "europa": ("502", "500@599"),
    "ganymede": ("503", "500@599"),
    "callisto": ("504", "500@599"),
    "enceladus": ("602", "500@699"),
    "rhea": ("605", "500@699"),
    "titan": ("606", "500@699"),
    "iapetus": ("608", "500@699"),
    "ariel": ("701", "500@799"),
    "umbriel": ("702", "500@799"),
    "titania": ("703", "500@799"),
    "oberon": ("704", "500@799"),
    "miranda": ("705", "500@799"),
    "triton": ("801", "500@899"),
}


def request_vector(command: str, center: str, date: str) -> list[float]:
    params = {
        "format": "text",
        "COMMAND": f"'{command}'",
        "EPHEM_TYPE": "'VECTORS'",
        "CENTER": f"'{center}'",
        "START_TIME": f"'{date}'",
        "STOP_TIME": f"'{date[:-2]}01'",
        "STEP_SIZE": "'1 m'",
        "REF_PLANE": "'ECLIPTIC'",
        "REF_SYSTEM": "'ICRF'",
        "OUT_UNITS": "'KM-D'",
        "TIME_TYPE": "'TDB'",
        "VEC_CORR": "'NONE'",
        "VEC_TABLE": "'2'",
        "CSV_FORMAT": "'YES'",
        "OBJ_DATA": "'NO'",
    }
    url = f"{API_URL}?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(url, timeout=30) as response:
        text = response.read().decode("utf-8")
    try:
        block = text.split("$$SOE", 1)[1].split("$$EOE", 1)[0].strip()
    except IndexError as error:
        raise RuntimeError(f"Horizons returned no vector for {command} on {date}\n{text}") from error
    row = next(csv.reader(io.StringIO(block)))
    # JD, calendar, X, Y, Z, VX, VY, VZ, optional trailing blank.
    return [float(value) for value in row[2:5]]


def main() -> None:
    output = {
        "source": API_URL,
        "reference_frame": "IAU76/80 ecliptic of J2000; geometric; no aberration correction",
        "vectors_km": {
            date: {
                body_id: request_vector(command, center, date)
                for body_id, (command, center) in TARGETS.items()
            }
            for date in DATES
        },
    }
    print(json.dumps(output, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
