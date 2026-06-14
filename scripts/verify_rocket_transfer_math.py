#!/usr/bin/env python3
"""Arithmetic checks for the educational rocket transfer preview."""

from __future__ import annotations

import math

AU_KM = 149_597_870.7
DAY_SECONDS = 86_400
MU_SUN_KM3_S2 = 132_712_440_018

ORBITS_AU = {
    "earth": 1.000_002_61,
    "mars": 1.523_710_34,
    "jupiter": 5.202_887,
    "saturn": 9.536_675_94,
    "uranus": 19.189_164_64,
    "neptune": 30.069_922_76,
}


def vector_add(a: tuple[float, float, float], b: tuple[float, float, float]) -> tuple[float, float, float]:
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def vector_sub(a: tuple[float, float, float], b: tuple[float, float, float]) -> tuple[float, float, float]:
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def vector_mul(a: tuple[float, float, float], scalar: float) -> tuple[float, float, float]:
    return (a[0] * scalar, a[1] * scalar, a[2] * scalar)


def correct_arc_endpoints(
    points: list[tuple[float, float, float]],
    launch: tuple[float, float, float],
    intercept: tuple[float, float, float],
) -> list[tuple[float, float, float]]:
    if len(points) < 2:
        return points

    start_correction = vector_sub(launch, points[0])
    end_correction = vector_sub(intercept, points[-1])
    last_index = len(points) - 1

    return [
        vector_add(
            vector_add(point, vector_mul(start_correction, 1 - index / last_index)),
            vector_mul(end_correction, index / last_index),
        )
        for index, point in enumerate(points)
    ]


def normalize_signed_radians(radians: float) -> float:
    normalized = ((radians + math.pi) % (2 * math.pi)) - math.pi
    return math.pi if math.isclose(normalized, -math.pi) else normalized


def hohmann_transfer_time_seconds(origin_radius_km: float, destination_radius_km: float) -> float:
    transfer_semimajor_axis_km = (origin_radius_km + destination_radius_km) / 2
    return math.pi * math.sqrt(transfer_semimajor_axis_km**3 / MU_SUN_KM3_S2)


def circular_speed_km_s(radius_km: float) -> float:
    return math.sqrt(MU_SUN_KM3_S2 / radius_km)


def transfer_speed_km_s(radius_km: float, transfer_semimajor_axis_km: float) -> float:
    return math.sqrt(MU_SUN_KM3_S2 * (2 / radius_km - 1 / transfer_semimajor_axis_km))


def delta_v_pair(origin_radius_km: float, destination_radius_km: float) -> tuple[float, float]:
    transfer_semimajor_axis_km = (origin_radius_km + destination_radius_km) / 2
    departure = abs(transfer_speed_km_s(origin_radius_km, transfer_semimajor_axis_km) - circular_speed_km_s(origin_radius_km))
    arrival = abs(circular_speed_km_s(destination_radius_km) - transfer_speed_km_s(destination_radius_km, transfer_semimajor_axis_km))
    return departure, arrival


def orbit_radius(name: str) -> float:
    return ORBITS_AU[name] * AU_KM


def assert_vector_close(actual: tuple[float, float, float], expected: tuple[float, float, float]) -> None:
    for actual_value, expected_value in zip(actual, expected):
        assert math.isclose(actual_value, expected_value, rel_tol=0, abs_tol=1e-12), (actual, expected)


def main() -> None:
    earth = orbit_radius("earth")
    mars = orbit_radius("mars")
    jupiter = orbit_radius("jupiter")
    saturn = orbit_radius("saturn")
    uranus = orbit_radius("uranus")
    neptune = orbit_radius("neptune")

    mars_transfer_days = hohmann_transfer_time_seconds(earth, mars) / DAY_SECONDS
    assert 250 < mars_transfer_days < 270, mars_transfer_days

    outer_transfer_days = [
        hohmann_transfer_time_seconds(earth, radius) / DAY_SECONDS
        for radius in (mars, jupiter, saturn, uranus, neptune)
    ]
    assert outer_transfer_days == sorted(outer_transfer_days), outer_transfer_days
    assert outer_transfer_days[-1] > outer_transfer_days[0] * 20, outer_transfer_days

    assert math.isclose(math.degrees(normalize_signed_radians(math.radians(190))), -170)
    assert math.isclose(math.degrees(normalize_signed_radians(math.radians(-190))), 170)
    assert math.isclose(math.degrees(normalize_signed_radians(math.radians(30 - 390))), 0)

    mars_departure, mars_arrival = delta_v_pair(earth, mars)
    jupiter_departure, jupiter_arrival = delta_v_pair(earth, jupiter)
    assert 2.8 < mars_departure < 3.1, mars_departure
    assert 2.5 < mars_arrival < 2.8, mars_arrival
    assert jupiter_departure > mars_departure
    assert jupiter_arrival > 5

    ideal_arc = [(0.0, 0.0, 0.0), (5.0, 2.0, 0.0), (10.0, 0.0, 0.0)]
    launch = (1.0, -2.0, 3.0)
    intercept = (12.0, 4.0, -6.0)
    corrected_arc = correct_arc_endpoints(ideal_arc, launch, intercept)
    assert_vector_close(corrected_arc[0], launch)
    assert_vector_close(corrected_arc[-1], intercept)
    assert_vector_close(corrected_arc[1], (6.5, 3.0, -1.5))

    print("Rocket transfer math checks passed")
    print(f"Earth-Mars Hohmann transfer: {mars_transfer_days:.1f} days")
    print("Outer transfer days:", ", ".join(f"{days:.1f}" for days in outer_transfer_days))
    print(f"Mars delta-v departure/arrival: {mars_departure:.2f}/{mars_arrival:.2f} km/s")
    print(f"Jupiter delta-v departure/arrival: {jupiter_departure:.2f}/{jupiter_arrival:.2f} km/s")
    print("Transfer arc endpoint correction anchors launch/intercept samples")


if __name__ == "__main__":
    main()
