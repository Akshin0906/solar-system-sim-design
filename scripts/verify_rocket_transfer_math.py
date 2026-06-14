#!/usr/bin/env python3
"""Arithmetic checks for the educational rocket transfer preview."""

from __future__ import annotations

import math
from collections.abc import Callable

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

FUSION_PROFILE = {
    "initial_speed_km_s": 5,
    "max_speed_km_s": 3_000,
    "acceleration_m_s2": 2.5,
    "burn_duration_s": 6_000_000,
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


def vec_add(a: tuple[float, float, float], b: tuple[float, float, float]) -> tuple[float, float, float]:
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def vec_sub(a: tuple[float, float, float], b: tuple[float, float, float]) -> tuple[float, float, float]:
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def vec_mul(a: tuple[float, float, float], scalar: float) -> tuple[float, float, float]:
    return (a[0] * scalar, a[1] * scalar, a[2] * scalar)


def vec_lerp(
    a: tuple[float, float, float],
    b: tuple[float, float, float],
    t: float,
) -> tuple[float, float, float]:
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)


def vec_len(a: tuple[float, float, float]) -> float:
    return math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2])


def vec_normalize(a: tuple[float, float, float]) -> tuple[float, float, float]:
    length = vec_len(a)
    return (0, 0, 0) if length == 0 else (a[0] / length, a[1] / length, a[2] / length)


def cubic_bezier(
    a: tuple[float, float, float],
    b: tuple[float, float, float],
    c: tuple[float, float, float],
    d: tuple[float, float, float],
    t: float,
) -> tuple[float, float, float]:
    ab = vec_lerp(a, b, t)
    bc = vec_lerp(b, c, t)
    cd = vec_lerp(c, d, t)
    return vec_lerp(vec_lerp(ab, bc, t), vec_lerp(bc, cd, t), t)


def prograde_tangent_from_sun(point: tuple[float, float, float]) -> tuple[float, float, float]:
    tangent = vec_normalize((-point[2], 0, point[0]))
    return (0, 0, 1) if vec_len(tangent) == 0 else tangent


def sample_flight(profile: dict[str, float], elapsed_seconds: float) -> tuple[float, float]:
    t = max(0, elapsed_seconds)
    accel_km_s2 = profile["acceleration_m_s2"] / 1_000
    v0 = profile["initial_speed_km_s"]
    vmax = profile["max_speed_km_s"]
    burn = max(0, profile["burn_duration_s"])
    time_to_cap = max(0, (vmax - v0) / accel_km_s2) if accel_km_s2 > 0 else math.inf
    accel_duration = min(burn, time_to_cap)

    t1 = min(t, accel_duration)
    speed = v0 + accel_km_s2 * t1
    distance = v0 * t1 + 0.5 * accel_km_s2 * t1 * t1

    if t > accel_duration:
        capped_speed = speed
        capped_end = min(t, burn)
        distance += capped_speed * max(0, capped_end - accel_duration)
        speed = capped_speed

        if t > burn:
            distance += capped_speed * (t - burn)

    return speed, distance


def circular_orbit_position(radius_km: float, phase_rad: float, elapsed_seconds: float, period_days: float) -> tuple[float, float, float]:
    angle = phase_rad + 2 * math.pi * elapsed_seconds / (period_days * DAY_SECONDS)
    return (math.cos(angle) * radius_km, 0, math.sin(angle) * radius_km)


def direct_intercept_time_seconds(
    profile: dict[str, float],
    launch_point: tuple[float, float, float],
    target_at: Callable[[float], tuple[float, float, float]],
) -> float:
    def gap(t: float) -> float:
        return sample_flight(profile, t)[1] - vec_len(vec_sub(target_at(t), launch_point))

    lower = 0.0
    upper = 3_600.0
    max_seconds = 31_557_600 * 120
    while upper < max_seconds and gap(upper) < 0:
        lower = upper
        upper *= 2

    assert upper < max_seconds, "direct intercept did not bracket"
    for _ in range(56):
        mid = (lower + upper) / 2
        if gap(mid) >= 0:
            upper = mid
        else:
            lower = mid
    return upper


def sample_phase_aware_transfer_arc(
    launch_point: tuple[float, float, float],
    intercept_point: tuple[float, float, float],
    transfer_semimajor_axis_km: float,
    samples: int = 80,
) -> list[tuple[float, float, float]]:
    chord = vec_len(vec_sub(intercept_point, launch_point))
    control_distance = min(chord * 0.42, transfer_semimajor_axis_km * 0.85)
    control_one = vec_add(launch_point, vec_mul(prograde_tangent_from_sun(launch_point), control_distance))
    control_two = vec_sub(intercept_point, vec_mul(prograde_tangent_from_sun(intercept_point), control_distance))
    return [
        cubic_bezier(launch_point, control_one, control_two, intercept_point, index / samples)
        for index in range(samples + 1)
    ]


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

    earth_launch = circular_orbit_position(earth, 0, 0, 365.256)
    mars_phase = math.radians(65)
    mars_at = lambda t: circular_orbit_position(mars, mars_phase, t, 686.98)
    direct_intercept = direct_intercept_time_seconds(FUSION_PROFILE, earth_launch, mars_at)
    _, direct_distance = sample_flight(FUSION_PROFILE, direct_intercept)
    direct_target_distance = vec_len(vec_sub(mars_at(direct_intercept), earth_launch))
    assert abs(direct_distance - direct_target_distance) < 1, (direct_distance, direct_target_distance)

    transfer_arc = sample_phase_aware_transfer_arc(
        earth_launch,
        mars_at(mars_transfer_days * DAY_SECONDS),
        (earth + mars) / 2,
    )
    assert vec_len(vec_sub(transfer_arc[0], earth_launch)) < 1e-6
    assert vec_len(vec_sub(transfer_arc[-1], mars_at(mars_transfer_days * DAY_SECONDS))) < 1e-6
    transfer_chord = vec_len(vec_sub(transfer_arc[-1], transfer_arc[0]))
    transfer_length = sum(vec_len(vec_sub(transfer_arc[index], transfer_arc[index - 1])) for index in range(1, len(transfer_arc)))
    assert transfer_length > transfer_chord * 1.02, (transfer_length, transfer_chord)

    # Once a mission has arrived, the scene should keep the rocket with the
    # destination body as time continues, not frozen at the old intercept point.
    post_arrival_elapsed = (mars_transfer_days + 365.256 * 4) * DAY_SECONDS
    stale_arrival_point = mars_at(mars_transfer_days * DAY_SECONDS)
    current_target_point = mars_at(post_arrival_elapsed)
    stale_post_arrival_miss = vec_len(vec_sub(stale_arrival_point, current_target_point))
    locked_post_arrival_miss = vec_len(vec_sub(current_target_point, current_target_point))
    assert stale_post_arrival_miss > AU_KM, stale_post_arrival_miss
    assert locked_post_arrival_miss == 0

    print("Rocket transfer math checks passed")
    print(f"Earth-Mars Hohmann transfer: {mars_transfer_days:.1f} days")
    print("Outer transfer days:", ", ".join(f"{days:.1f}" for days in outer_transfer_days))
    print(f"Mars delta-v departure/arrival: {mars_departure:.2f}/{mars_arrival:.2f} km/s")
    print(f"Jupiter delta-v departure/arrival: {jupiter_departure:.2f}/{jupiter_arrival:.2f} km/s")
    print(f"Fusion direct Mars intercept: {direct_intercept / DAY_SECONDS:.2f} days")
    print(f"Phase-aware Mars arc/chord: {transfer_length / transfer_chord:.3f}x")
    print(f"Post-arrival stale miss avoided: {stale_post_arrival_miss / AU_KM:.2f} AU")


if __name__ == "__main__":
    main()
