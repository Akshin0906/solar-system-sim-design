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

    print("Rocket transfer math checks passed")
    print(f"Earth-Mars Hohmann transfer: {mars_transfer_days:.1f} days")
    print("Outer transfer days:", ", ".join(f"{days:.1f}" for days in outer_transfer_days))
    print(f"Mars delta-v departure/arrival: {mars_departure:.2f}/{mars_arrival:.2f} km/s")
    print(f"Jupiter delta-v departure/arrival: {jupiter_departure:.2f}/{jupiter_arrival:.2f} km/s")


if __name__ == "__main__":
    main()
