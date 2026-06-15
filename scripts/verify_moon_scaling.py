#!/usr/bin/env python3
"""Verify readable-mode moon offsets clear parent bodies without invading planet paths."""

from __future__ import annotations

import math
import re
from pathlib import Path


NUMBER = r"[0-9][0-9_.]*"
BODY_RE = re.compile(
    r'id: "([^"]+)".*?type: "([^"]+)".*?physical:\s*{\s*radiusKm: (' + NUMBER + r")",
    re.S,
)
PLANET_ORBIT_RE = re.compile(
    r'id: "([^"]+)".*?orbit:\s*{\s*semiMajorAxisKm: ('
    + NUMBER
    + r") \* AU_KM,\s*eccentricity: ("
    + NUMBER
    + r")",
    re.S,
)
MOON_RE = re.compile(
    r'moon\("([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*('
    + NUMBER
    + r"),\s*("
    + NUMBER
    + r")",
)
CONST_RE = re.compile(
    r"export const (AU_KM|EARTH_RADIUS_KM|READABLE_MOON_DISTANCE_EXPONENT|"
    r"READABLE_MOON_DISTANCE_MULTIPLIER|READABLE_MOON_MIN_CLEARANCE) = (" + NUMBER + r");"
)
REAL_UNITS_RE = re.compile(r"const realUnitsPerAu = ([0-9.]+);")


def parse_number(value: str) -> float:
    return float(value.replace("_", ""))


def load_constants() -> dict[str, float]:
    constants_source = Path("src/data/constants.ts").read_text()
    units_source = Path("src/simulation/units.ts").read_text()
    constants = {name: parse_number(value) for name, value in CONST_RE.findall(constants_source + "\n" + units_source)}
    real_units_match = REAL_UNITS_RE.search(units_source)

    if not real_units_match:
        raise AssertionError("Could not read realUnitsPerAu")

    constants["REAL_UNITS_PER_AU"] = float(real_units_match.group(1))
    expected = {
        "AU_KM",
        "EARTH_RADIUS_KM",
        "READABLE_MOON_DISTANCE_EXPONENT",
        "READABLE_MOON_DISTANCE_MULTIPLIER",
        "READABLE_MOON_MIN_CLEARANCE",
        "REAL_UNITS_PER_AU",
    }

    if set(constants) != expected:
        missing = ", ".join(sorted(expected - set(constants)))
        extra = ", ".join(sorted(set(constants) - expected))
        raise AssertionError(f"Unexpected moon scaling constants. Missing: {missing or 'none'}; extra: {extra or 'none'}")

    return constants


def load_bodies() -> dict[str, tuple[str, float]]:
    source = Path("src/data/bodies.ts").read_text()
    return {body_id: (body_type, parse_number(radius)) for body_id, body_type, radius in BODY_RE.findall(source)}


def load_planet_orbits() -> dict[str, tuple[float, float]]:
    source = Path("src/data/bodies.ts").read_text()
    return {
        body_id: (parse_number(semi_major_axis_au), parse_number(eccentricity))
        for body_id, semi_major_axis_au, eccentricity in PLANET_ORBIT_RE.findall(source)
    }


def load_moons() -> list[tuple[str, str, str, float, float]]:
    source = Path("src/data/moons.ts").read_text()
    return [
        (moon_id, name, parent_id, parse_number(radius), parse_number(semi_major_axis))
        for moon_id, name, parent_id, radius, semi_major_axis in MOON_RE.findall(source)
    ]


def body_scene_radius(radius_km: float, body_type: str, constants: dict[str, float]) -> float:
    if body_type == "star":
        return 1.35

    readable_radius = 0.06 + math.sqrt(radius_km / constants["EARTH_RADIUS_KM"]) * 0.115
    cap = 0.22 if body_type in {"moon", "dwarfPlanet"} else 0.72
    minimum = 0.075 if body_type == "moon" else 0.11
    return min(max(readable_radius, minimum), cap)


def readable_moon_distance(
    parent_radius_km: float,
    parent_type: str,
    moon_radius_km: float,
    semi_major_axis_km: float,
    constants: dict[str, float],
) -> float:
    true_distance = (semi_major_axis_km / constants["AU_KM"]) * constants["REAL_UNITS_PER_AU"]
    fallback_distance = (
        math.pow(semi_major_axis_km / 100_000, constants["READABLE_MOON_DISTANCE_EXPONENT"])
        * constants["READABLE_MOON_DISTANCE_MULTIPLIER"]
    )
    parent_radius = body_scene_radius(parent_radius_km, parent_type, constants)
    moon_radius = body_scene_radius(moon_radius_km, "moon", constants)
    distance_in_parent_radii = max(semi_major_axis_km / parent_radius_km, 1)
    scaled_spread = (
        parent_radius
        * math.pow(distance_in_parent_radii, constants["READABLE_MOON_DISTANCE_EXPONENT"])
        * constants["READABLE_MOON_DISTANCE_MULTIPLIER"]
    )
    minimum_distance = parent_radius + moon_radius + constants["READABLE_MOON_MIN_CLEARANCE"]

    return max(true_distance, fallback_distance, minimum_distance + scaled_spread)


def main() -> None:
    constants = load_constants()
    bodies = load_bodies()
    planet_orbits = load_planet_orbits()
    moons = load_moons()

    if not moons:
        raise AssertionError("No moons were parsed from source data")
    if "earth" not in planet_orbits or "venus" not in planet_orbits:
        raise AssertionError("Could not read Earth/Venus orbit elements")

    had_regression_case = False
    tightest_clearance = math.inf
    tightest_moon = ""

    for moon_id, name, parent_id, moon_radius_km, semi_major_axis_km in moons:
        if parent_id not in bodies:
            raise AssertionError(f"{name}: missing parent body {parent_id}")

        parent_type, parent_radius_km = bodies[parent_id]
        parent_scene_radius = body_scene_radius(parent_radius_km, parent_type, constants)
        moon_scene_radius = body_scene_radius(moon_radius_km, "moon", constants)
        true_distance = (semi_major_axis_km / constants["AU_KM"]) * constants["REAL_UNITS_PER_AU"]
        readable_distance = readable_moon_distance(
            parent_radius_km,
            parent_type,
            moon_radius_km,
            semi_major_axis_km,
            constants,
        )
        minimum_distance = parent_scene_radius + moon_scene_radius + constants["READABLE_MOON_MIN_CLEARANCE"]
        clearance = readable_distance - (parent_scene_radius + moon_scene_radius)

        if parent_id == "jupiter" and true_distance < parent_scene_radius + moon_scene_radius:
            had_regression_case = True

        if moon_id == "moon":
            earth_a_au, earth_e = planet_orbits["earth"]
            venus_a_au, venus_e = planet_orbits["venus"]
            tight_earth_venus_gap = (earth_a_au * (1 - earth_e) - venus_a_au * (1 + venus_e)) * constants[
                "REAL_UNITS_PER_AU"
            ]
            maximum_readable_moon_distance = tight_earth_venus_gap * 0.55

            if readable_distance >= maximum_readable_moon_distance:
                raise AssertionError(
                    f"Moon readable distance {readable_distance:.3f} reaches too far into the "
                    f"Earth/Venus gap {tight_earth_venus_gap:.3f}"
                )

        if readable_distance < minimum_distance:
            raise AssertionError(
                f"{name}: readable distance {readable_distance:.3f} does not clear minimum {minimum_distance:.3f}"
            )

        if clearance < tightest_clearance:
            tightest_clearance = clearance
            tightest_moon = moon_id

    if not had_regression_case:
        raise AssertionError("Expected at least one Jupiter moon true-distance regression case")

    print("moon scaling math ok")
    print(f"checked moons: {len(moons)}")
    print(f"tightest readable clearance: {tightest_moon} at {tightest_clearance:.3f} scene units")


if __name__ == "__main__":
    main()
