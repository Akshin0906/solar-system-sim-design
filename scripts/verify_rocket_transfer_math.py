#!/usr/bin/env python3
"""Independent arithmetic checks for physical Hohmann requirements.

Lambert endpoint/continuation math is checked separately in
verify_lambert_transfer.py. This file deliberately keeps the catalog's illustrative
direct/free curve out of every physical-transfer equation.
"""

from __future__ import annotations

import math
from collections.abc import Callable


AU_KM = 149_597_870.7
DAY_SECONDS = 86_400.0
MU_SUN_KM3_S2 = 132_712_440_018.0
MU_EARTH_KM3_S2 = 398_600.435
EARTH_RADIUS_KM = 6_371.0
LEO_ALTITUDE_KM = 400.0

ORBITS_AU = {
    "earth": 1.000_002_61,
    "mars": 1.523_710_34,
    "jupiter": 5.202_887,
    "saturn": 9.536_675_94,
    "uranus": 19.189_164_64,
    "neptune": 30.069_922_76,
}

# Used only by the explicitly guided direct/free comparison below.
ILLUSTRATIVE_FUSION_CURVE = {
    "initial_speed_km_s": 5.0,
    "max_speed_km_s": 3_000.0,
    "acceleration_m_s2": 2.5,
    "burn_duration_s": 6_000_000.0,
}


def normalize_signed_radians(radians: float) -> float:
    normalized = ((radians + math.pi) % (2 * math.pi)) - math.pi
    return math.pi if math.isclose(normalized, -math.pi) else normalized


def orbit_radius(name: str) -> float:
    return ORBITS_AU[name] * AU_KM


def hohmann_transfer_time_seconds(origin_radius_km: float, destination_radius_km: float) -> float:
    semimajor_axis_km = (origin_radius_km + destination_radius_km) / 2
    return math.pi * math.sqrt(semimajor_axis_km**3 / MU_SUN_KM3_S2)


def circular_speed_km_s(radius_km: float, mu: float = MU_SUN_KM3_S2) -> float:
    return math.sqrt(mu / radius_km)


def transfer_speed_km_s(radius_km: float, semimajor_axis_km: float) -> float:
    return math.sqrt(MU_SUN_KM3_S2 * (2 / radius_km - 1 / semimajor_axis_km))


def hohmann_v_infinity_pair(origin_radius_km: float, destination_radius_km: float) -> tuple[float, float]:
    semimajor_axis_km = (origin_radius_km + destination_radius_km) / 2
    departure = abs(transfer_speed_km_s(origin_radius_km, semimajor_axis_km) - circular_speed_km_s(origin_radius_km))
    arrival = abs(circular_speed_km_s(destination_radius_km) - transfer_speed_km_s(destination_radius_km, semimajor_axis_km))
    return departure, arrival


def parking_orbit_injection_km_s(v_infinity_km_s: float) -> float:
    parking_radius_km = EARTH_RADIUS_KM + LEO_ALTITUDE_KM
    hyperbolic_periapsis_speed = math.sqrt(v_infinity_km_s**2 + 2 * MU_EARTH_KM3_S2 / parking_radius_km)
    return hyperbolic_periapsis_speed - circular_speed_km_s(parking_radius_km, MU_EARTH_KM3_S2)


def sample_direct_curve(profile: dict[str, float], elapsed_seconds: float) -> tuple[float, float]:
    elapsed = max(0.0, elapsed_seconds)
    acceleration_km_s2 = profile["acceleration_m_s2"] / 1_000
    initial = profile["initial_speed_km_s"]
    maximum = profile["max_speed_km_s"]
    burn = max(0.0, profile["burn_duration_s"])
    time_to_cap = (maximum - initial) / acceleration_km_s2
    accelerated = min(elapsed, burn, time_to_cap)
    speed = initial + acceleration_km_s2 * accelerated
    distance = initial * accelerated + 0.5 * acceleration_km_s2 * accelerated**2
    distance += speed * max(0.0, elapsed - accelerated)
    return speed, distance


Vec3 = tuple[float, float, float]


def subtract(a: Vec3, b: Vec3) -> Vec3:
    return a[0] - b[0], a[1] - b[1], a[2] - b[2]


def length(value: Vec3) -> float:
    return math.sqrt(sum(component * component for component in value))


def circular_position(radius_km: float, phase_rad: float, elapsed_seconds: float, period_days: float) -> Vec3:
    angle = phase_rad + 2 * math.pi * elapsed_seconds / (period_days * DAY_SECONDS)
    return math.cos(angle) * radius_km, 0.0, math.sin(angle) * radius_km


def direct_intercept_time_seconds(
    profile: dict[str, float], launch_point: Vec3, target_at: Callable[[float], Vec3]
) -> float:
    def gap(seconds: float) -> float:
        return sample_direct_curve(profile, seconds)[1] - length(subtract(target_at(seconds), launch_point))

    lower = 0.0
    upper = 3_600.0
    maximum_seconds = 31_557_600.0 * 120
    while upper < maximum_seconds and gap(upper) < 0:
        lower = upper
        upper *= 2
    assert upper < maximum_seconds, "guided direct intercept did not bracket"
    for _ in range(56):
        midpoint = (lower + upper) / 2
        if gap(midpoint) >= 0:
            upper = midpoint
        else:
            lower = midpoint
    return upper


def main() -> None:
    earth = orbit_radius("earth")
    destinations = [orbit_radius(name) for name in ("mars", "jupiter", "saturn", "uranus", "neptune")]
    transfer_days = [hohmann_transfer_time_seconds(earth, radius) / DAY_SECONDS for radius in destinations]
    assert 250 < transfer_days[0] < 270
    assert transfer_days == sorted(transfer_days)
    assert transfer_days[-1] > transfer_days[0] * 20

    assert math.isclose(math.degrees(normalize_signed_radians(math.radians(190))), -170)
    assert math.isclose(math.degrees(normalize_signed_radians(math.radians(-190))), 170)

    mars_departure_v_infinity, mars_arrival_v_infinity = hohmann_v_infinity_pair(earth, destinations[0])
    jupiter_departure_v_infinity, jupiter_arrival_v_infinity = hohmann_v_infinity_pair(earth, destinations[1])
    mars_c3 = mars_departure_v_infinity**2
    mars_injection = parking_orbit_injection_km_s(mars_departure_v_infinity)
    assert 2.8 < mars_departure_v_infinity < 3.1
    assert 2.5 < mars_arrival_v_infinity < 2.8
    assert 8.0 < mars_c3 < 9.5
    assert 3.4 < mars_injection < 3.8
    assert jupiter_departure_v_infinity > mars_departure_v_infinity
    assert jupiter_arrival_v_infinity > 5

    # The catalog profile is exercised only in guided-direct space. Calling the
    # Hohmann functions before and after this calculation yields the same result,
    # demonstrating that no vehicle label enters the transfer equations.
    earth_launch = circular_position(earth, 0, 0, 365.256)
    mars_at = lambda seconds: circular_position(destinations[0], math.radians(65), seconds, 686.98)
    direct_intercept = direct_intercept_time_seconds(ILLUSTRATIVE_FUSION_CURVE, earth_launch, mars_at)
    physical_time_after_direct_demo = hohmann_transfer_time_seconds(earth, destinations[0])
    assert math.isclose(physical_time_after_direct_demo / DAY_SECONDS, transfer_days[0])

    print("Rocket transfer math checks passed")
    print("Outer Hohmann days:", ", ".join(f"{days:.1f}" for days in transfer_days))
    print(
        "Mars v-infinity departure/arrival, C3, 400 km LEO injection: "
        f"{mars_departure_v_infinity:.2f}/{mars_arrival_v_infinity:.2f} km/s, "
        f"{mars_c3:.2f} km^2/s^2, {mars_injection:.2f} km/s"
    )
    print(
        "Catalog independence: physical Hohmann remains "
        f"{physical_time_after_direct_demo / DAY_SECONDS:.1f} days; "
        f"illustrative guided-direct intercept is {direct_intercept / DAY_SECONDS:.2f} days"
    )


if __name__ == "__main__":
    main()
