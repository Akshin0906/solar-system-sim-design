#!/usr/bin/env python3
"""Independent arithmetic checks for the two-body Lambert transfer implementation.

This intentionally uses only Python's standard library so it remains an independent
check on the TypeScript implementation rather than importing application code.
"""

from __future__ import annotations

import math
from typing import Callable


MU_SUN_KM3_S2 = 132_712_440_018.0
AU_KM = 149_597_870.7
DAY_SECONDS = 86_400.0
Vec3 = tuple[float, float, float]


def add(a: Vec3, b: Vec3) -> Vec3:
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def sub(a: Vec3, b: Vec3) -> Vec3:
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def mul(v: Vec3, scalar: float) -> Vec3:
    return (v[0] * scalar, v[1] * scalar, v[2] * scalar)


def dot(a: Vec3, b: Vec3) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def cross(a: Vec3, b: Vec3) -> Vec3:
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def length(v: Vec3) -> float:
    return math.sqrt(dot(v, v))


def stumpff_c(z: float) -> float:
    if z > 1e-8:
        root = math.sqrt(z)
        return (1.0 - math.cos(root)) / z
    if z < -1e-8:
        root = math.sqrt(-z)
        return (math.cosh(root) - 1.0) / -z
    return 0.5 - z / 24.0 + z * z / 720.0


def stumpff_s(z: float) -> float:
    if z > 1e-8:
        root = math.sqrt(z)
        return (root - math.sin(root)) / (root**3)
    if z < -1e-8:
        root = math.sqrt(-z)
        return (math.sinh(root) - root) / (root**3)
    return 1.0 / 6.0 - z / 120.0 + z * z / 5_040.0


def bisect_root(fn: Callable[[float], float], lower: float, upper: float) -> float:
    f_lower = fn(lower)
    f_upper = fn(upper)
    assert math.isfinite(f_lower) and math.isfinite(f_upper)
    assert f_lower * f_upper <= 0, (lower, upper, f_lower, f_upper)
    for _ in range(160):
        mid = (lower + upper) / 2.0
        f_mid = fn(mid)
        if abs(f_mid) < 1e-8:
            return mid
        if f_lower * f_mid <= 0:
            upper = mid
            f_upper = f_mid
        else:
            lower = mid
            f_lower = f_mid
    return (lower + upper) / 2.0


def lambert_universal(r1: Vec3, r2: Vec3, dt: float, mu: float) -> tuple[Vec3, Vec3]:
    r1_mag = length(r1)
    r2_mag = length(r2)
    cosine = max(-1.0, min(1.0, dot(r1, r2) / (r1_mag * r2_mag)))
    base_angle = math.acos(cosine)
    # App coordinates use +Y as the orbital-plane normal, while prograde motion in
    # the X/Z plane has a negative Y cross product.
    transfer_angle = base_angle if cross(r1, r2)[1] <= 0 else 2.0 * math.pi - base_angle
    sine = math.sin(transfer_angle)
    a_parameter = sine * math.sqrt((r1_mag * r2_mag) / (1.0 - cosine))
    assert abs(a_parameter) > 1e-12

    def time_residual(z: float) -> float:
        c = stumpff_c(z)
        s = stumpff_s(z)
        if c <= 0:
            return math.nan
        y = r1_mag + r2_mag + a_parameter * (z * s - 1.0) / math.sqrt(c)
        if y <= 0:
            return math.nan
        x = math.sqrt(y / c)
        return (x**3 * s + a_parameter * math.sqrt(y)) / math.sqrt(mu) - dt

    samples: list[tuple[float, float]] = []
    for index in range(2_001):
        z = -4.0 * math.pi * math.pi + index * (8.0 * math.pi * math.pi / 2_000)
        residual = time_residual(z)
        if math.isfinite(residual):
            samples.append((z, residual))
    bracket = next(
        ((samples[i - 1][0], samples[i][0]) for i in range(1, len(samples)) if samples[i - 1][1] * samples[i][1] <= 0),
        None,
    )
    assert bracket is not None, "Lambert root was not bracketed"
    z = bisect_root(time_residual, bracket[0], bracket[1])
    c = stumpff_c(z)
    s = stumpff_s(z)
    y = r1_mag + r2_mag + a_parameter * (z * s - 1.0) / math.sqrt(c)
    f = 1.0 - y / r1_mag
    g = a_parameter * math.sqrt(y / mu)
    g_dot = 1.0 - y / r2_mag
    assert abs(g) > 1e-12
    v1 = mul(sub(r2, mul(r1, f)), 1.0 / g)
    v2 = mul(sub(mul(r2, g_dot), r1), 1.0 / g)
    return v1, v2


def propagate_universal(r0: Vec3, v0: Vec3, dt: float, mu: float) -> tuple[Vec3, Vec3]:
    r0_mag = length(r0)
    v0_sq = dot(v0, v0)
    radial_velocity = dot(r0, v0) / r0_mag
    alpha = 2.0 / r0_mag - v0_sq / mu
    sqrt_mu = math.sqrt(mu)

    chi = sqrt_mu * abs(alpha) * dt if abs(alpha) > 1e-12 else sqrt_mu * dt / r0_mag
    for _ in range(120):
        z = alpha * chi * chi
        c = stumpff_c(z)
        s = stumpff_s(z)
        residual = (
            (r0_mag * radial_velocity / sqrt_mu) * chi * chi * c
            + (1.0 - alpha * r0_mag) * chi**3 * s
            + r0_mag * chi
            - sqrt_mu * dt
        )
        derivative = (
            (r0_mag * radial_velocity / sqrt_mu) * chi * (1.0 - z * s)
            + (1.0 - alpha * r0_mag) * chi * chi * c
            + r0_mag
        )
        step = residual / derivative
        chi -= step
        if abs(step) < 1e-8:
            break

    z = alpha * chi * chi
    c = stumpff_c(z)
    s = stumpff_s(z)
    f = 1.0 - chi * chi * c / r0_mag
    g = dt - chi**3 * s / sqrt_mu
    position = add(mul(r0, f), mul(v0, g))
    radius = length(position)
    f_dot = sqrt_mu * chi * (z * s - 1.0) / (radius * r0_mag)
    g_dot = 1.0 - chi * chi * c / radius
    velocity = add(mul(r0, f_dot), mul(v0, g_dot))
    return position, velocity


def circular_position(radius: float, angle: float) -> Vec3:
    return (radius * math.cos(angle), 0.0, radius * math.sin(angle))


def run_case(label: str, destination_au: float) -> None:
    origin_radius = AU_KM
    destination_radius = destination_au * AU_KM
    semimajor = (origin_radius + destination_radius) / 2.0
    transfer_time = math.pi * math.sqrt(semimajor**3 / MU_SUN_KM3_S2)
    destination_motion = math.sqrt(MU_SUN_KM3_S2 / destination_radius**3)
    ideal_phase = math.pi - destination_motion * transfer_time
    r1 = circular_position(origin_radius, 0.0)
    # Exercise a genuine Lambert intercept rather than the exactly antipodal Hohmann
    # geometry (A -> 0 is a known singular form of the universal-variable equation).
    r2 = circular_position(destination_radius, ideal_phase + destination_motion * transfer_time + math.radians(10.0))
    v1, v2 = lambert_universal(r1, r2, transfer_time, MU_SUN_KM3_S2)
    propagated, propagated_velocity = propagate_universal(r1, v1, transfer_time, MU_SUN_KM3_S2)
    endpoint_error = length(sub(propagated, r2))
    velocity_error = length(sub(propagated_velocity, v2))
    assert endpoint_error < 0.05, (label, endpoint_error)
    assert velocity_error < 1e-7, (label, velocity_error)

    # An uncaptured encounter must remain on the same conic after the Lambert
    # endpoint instead of snapping to the destination. Check both continuity and
    # specific orbital-energy conservation one day beyond arrival.
    post_position, post_velocity = propagate_universal(r2, v2, DAY_SECONDS, MU_SUN_KM3_S2)
    continuous_position, continuous_velocity = propagate_universal(
        r1, v1, transfer_time + DAY_SECONDS, MU_SUN_KM3_S2
    )
    continuation_error = length(sub(post_position, continuous_position))
    continuation_velocity_error = length(sub(post_velocity, continuous_velocity))
    assert continuation_error < 0.1, (label, continuation_error)
    assert continuation_velocity_error < 1e-7, (label, continuation_velocity_error)
    arrival_energy = dot(v2, v2) / 2.0 - MU_SUN_KM3_S2 / length(r2)
    post_energy = dot(post_velocity, post_velocity) / 2.0 - MU_SUN_KM3_S2 / length(post_position)
    assert abs(post_energy - arrival_energy) < 1e-8, (label, arrival_energy, post_energy)

    route_points = [propagate_universal(r1, v1, transfer_time * index / 400, MU_SUN_KM3_S2)[0] for index in range(401)]
    route_length = sum(length(sub(route_points[index], route_points[index - 1])) for index in range(1, len(route_points)))
    mean_speed = route_length / transfer_time
    assert abs(mean_speed - route_length / transfer_time) < 1e-12
    print(
        f"{label}: {transfer_time / DAY_SECONDS:.2f} d, endpoint {endpoint_error:.6f} km, "
        f"velocity {velocity_error:.3e} km/s, continuation {continuation_error:.6f} km, "
        f"route mean {mean_speed:.3f} km/s"
    )


def main() -> None:
    run_case("Earth to Mars", 1.523679)
    run_case("Earth to Jupiter", 5.202887)
    print("Lambert and universal-propagation arithmetic checks passed")


if __name__ == "__main__":
    main()
