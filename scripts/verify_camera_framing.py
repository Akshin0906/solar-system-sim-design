#!/usr/bin/env python3
"""Verify the camera framing formula used by the Three.js camera rig."""

from __future__ import annotations

import math

FOV_DEG = 48
AU_KM = 149_597_870
REAL_UNITS_PER_AU = 7
MIN_FIT_RADIUS = 0.00001
MIN_SURFACE_DISTANCE = 0.0001
SURFACE_DISTANCE_RADIUS_MULTIPLIER = 1.2
PREFERRED_CAMERA_NEAR = 0.00001
MIN_CAMERA_NEAR = 0.000001
MAX_CAMERA_NEAR = 0.1
FOCUS_FRAMING_SAFETY = 1.9
CAMERA_DAMPING_RATES = {
    "focus_target": (4.677692, 0.075),
    "focus_position": (3.394221, 0.055),
    "follow_target": (10.461203, 0.16),
    "follow_position": (6.321631, 0.1),
}

REAL_RADIUS_KM = {
    "Mercury": 2439.7,
    "Earth": 6371,
    "Mars": 3389.5,
    "Jupiter": 69911,
    "Saturn": 58232,
    "Uranus": 25362,
    "Neptune": 24622,
    "Pluto": 1188.3,
}

VISUAL_RADIUS_MULTIPLIER = {
    "Saturn": 2.68,
    "Uranus": 2.05,
}


def fit_distance_for_radius(radius: float, safety: float = 1.55) -> float:
    half_fov_rad = math.radians(FOV_DEG / 2)
    return max(MIN_FIT_RADIUS, (max(radius, MIN_FIT_RADIUS) / math.tan(half_fov_rad)) * safety)


def visible_radius_at_distance(distance: float) -> float:
    return math.tan(math.radians(FOV_DEG / 2)) * distance


def real_scene_radius(radius_km: float) -> float:
    return (radius_km / AU_KM) * REAL_UNITS_PER_AU


def visual_radius_for_body(name: str, radius: float) -> float:
    return max(radius, MIN_FIT_RADIUS) * VISUAL_RADIUS_MULTIPLIER.get(name, 1.1)


def surface_min_distance_for_radius(radius: float) -> float:
    return max(radius * SURFACE_DISTANCE_RADIUS_MULTIPLIER, MIN_SURFACE_DISTANCE)


def camera_near_for_target(distance_to_target: float, target_radius: float = 0) -> float:
    distance_based_near = min(max(distance_to_target * 0.02, PREFERRED_CAMERA_NEAR), MAX_CAMERA_NEAR)
    surface_clearance = distance_to_target - target_radius

    if surface_clearance <= 0:
        return MIN_CAMERA_NEAR

    return max(min(distance_based_near, surface_clearance * 0.48), MIN_CAMERA_NEAR)


def damping_alpha(rate_per_second: float, delta_seconds: float) -> float:
    return 1 - math.exp(-rate_per_second * min(delta_seconds, 0.12))


def main() -> None:
    for radius in (0.25, 1, 12, 90, 145):
        distance = fit_distance_for_radius(radius)
        visible_radius = visible_radius_at_distance(distance)
        ratio = visible_radius / radius
        assert ratio > 1.54, (radius, distance, ratio)
        assert ratio < 1.56, (radius, distance, ratio)

    tiny_distance = fit_distance_for_radius(0)
    assert tiny_distance > 0

    for name, radius_km in REAL_RADIUS_KM.items():
        body_radius = real_scene_radius(radius_km)
        visual_radius = visual_radius_for_body(name, body_radius)
        distance = fit_distance_for_radius(visual_radius, FOCUS_FRAMING_SAFETY)
        visible_radius = visible_radius_at_distance(distance)
        visual_fill = visual_radius / visible_radius
        body_fill = body_radius / visible_radius

        assert 0.52 < visual_fill < 0.53, (name, visual_fill)

        if name not in VISUAL_RADIUS_MULTIPLIER:
            assert 0.47 < body_fill < 0.48, (name, body_fill)

        surface_distance = surface_min_distance_for_radius(body_radius)
        near = camera_near_for_target(surface_distance, body_radius)
        assert near < surface_distance - body_radius, (name, near, surface_distance, body_radius)

    for name, (rate, expected_alpha_60fps) in CAMERA_DAMPING_RATES.items():
        alpha_60fps = damping_alpha(rate, 1 / 60)
        alpha_10fps = damping_alpha(rate, 1 / 10)

        assert abs(alpha_60fps - expected_alpha_60fps) < 0.000001, (name, alpha_60fps, expected_alpha_60fps)
        assert alpha_10fps > expected_alpha_60fps, (name, alpha_10fps, expected_alpha_60fps)

    print("Camera framing checks passed")
    print(f"FOV: {FOV_DEG} deg")
    print(f"1-unit target distance: {fit_distance_for_radius(1):.3f}")
    print(f"90-unit target distance: {fit_distance_for_radius(90):.3f}")
    print(f"Earth focus distance: {fit_distance_for_radius(visual_radius_for_body('Earth', real_scene_radius(REAL_RADIUS_KM['Earth'])), FOCUS_FRAMING_SAFETY):.6f}")


if __name__ == "__main__":
    main()
