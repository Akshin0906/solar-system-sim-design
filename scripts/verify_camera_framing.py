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
OBSERVER_SURFACE_MULTIPLIER = 1.04
OBSERVER_LOOK_RADIUS_MULTIPLIER = 40
OBSERVER_MIN_LOOK_DISTANCE = 8
OBSERVER_DOWNWARD_BIAS = 0.25
MOBILE_ASPECT = 390 / 844
DESKTOP_ASPECT = 1440 / 900
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
CAMERA_PRESET_RADII = {
    "Earth/Moon": 3.0,
    "Jupiter system": 8.0,
    "Saturn system": 10.5,
    "Kuiper belt": 386.0,
}
KUIPER_FADE_MULTIPLIER = 8
KUIPER_OUTER_SCENE_RADII = (52 * REAL_UNITS_PER_AU, math.pow(52, 0.62) * 16, math.log10(52 + 1) * 52)


def fit_distance_for_radius(radius: float, safety: float = 1.55, aspect: float = 1) -> float:
    half_vertical_fov_rad = math.radians(FOV_DEG / 2)
    half_horizontal_fov_rad = math.atan(math.tan(half_vertical_fov_rad) * max(aspect, MIN_FIT_RADIUS))
    half_fov_rad = min(half_vertical_fov_rad, half_horizontal_fov_rad)
    return max(MIN_FIT_RADIUS, (max(radius, MIN_FIT_RADIUS) / math.tan(half_fov_rad)) * safety)


def visible_radius_at_distance(distance: float, aspect: float = 1) -> float:
    half_vertical_fov_rad = math.radians(FOV_DEG / 2)
    half_horizontal_fov_rad = math.atan(math.tan(half_vertical_fov_rad) * max(aspect, MIN_FIT_RADIUS))
    return math.tan(min(half_vertical_fov_rad, half_horizontal_fov_rad)) * distance


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


def observer_pose(radius: float) -> tuple[float, float]:
    camera_from_center = radius * OBSERVER_SURFACE_MULTIPLIER
    look_distance = max(radius * OBSERVER_LOOK_RADIUS_MULTIPLIER, OBSERVER_MIN_LOOK_DISTANCE)
    return camera_from_center, look_distance


def observer_near(radius: float) -> float:
    return max(min(radius * 0.02, 0.01), MIN_CAMERA_NEAR)


def main() -> None:
    for radius in (0.25, 1, 12, 90, 145):
        distance = fit_distance_for_radius(radius)
        visible_radius = visible_radius_at_distance(distance)
        ratio = visible_radius / radius
        assert ratio > 1.54, (radius, distance, ratio)
        assert ratio < 1.56, (radius, distance, ratio)

    tiny_distance = fit_distance_for_radius(0)
    assert tiny_distance > 0

    for name, radius in CAMERA_PRESET_RADII.items():
        desktop_distance = fit_distance_for_radius(radius, 1.18, DESKTOP_ASPECT)
        mobile_distance = fit_distance_for_radius(radius, 1.18, MOBILE_ASPECT)
        assert mobile_distance > desktop_distance, (name, desktop_distance, mobile_distance)
        for aspect, distance in ((DESKTOP_ASPECT, desktop_distance), (MOBILE_ASPECT, mobile_distance)):
            fill = radius / visible_radius_at_distance(distance, aspect)
            assert 0.84 < fill < 0.85, (name, aspect, fill)

    for outer_scene_radius in KUIPER_OUTER_SCENE_RADII:
        preset_radius = outer_scene_radius * 1.06
        mobile_distance = fit_distance_for_radius(preset_radius, 1.18, MOBILE_ASPECT)
        fade_end = outer_scene_radius * KUIPER_FADE_MULTIPLIER
        assert fade_end > mobile_distance + preset_radius, (outer_scene_radius, mobile_distance, fade_end)

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

    for radius in (0.0001, 0.25, 1.0):
        camera_from_center, look_distance = observer_pose(radius)
        assert camera_from_center > radius, (radius, camera_from_center)
        assert math.isclose(camera_from_center / radius, OBSERVER_SURFACE_MULTIPLIER)
        assert look_distance >= OBSERVER_MIN_LOOK_DISTANCE
        assert observer_near(radius) < camera_from_center - radius

    # A terminator observer's surface normal is perpendicular to the sunlight
    # direction, so looking sunward skims the visible horizon.
    sunward = (1.0, 0.0, 0.0)
    terminator = (0.0, 1.0, 0.0)
    assert math.isclose(sum(a * b for a, b in zip(sunward, terminator)), 0.0)
    sun_angle_from_view_deg = math.degrees(math.atan(OBSERVER_DOWNWARD_BIAS))
    body_center_angle_deg = math.degrees(math.acos(OBSERVER_DOWNWARD_BIAS / math.sqrt(1 + OBSERVER_DOWNWARD_BIAS**2)))
    body_angular_radius_deg = math.degrees(math.asin(1 / OBSERVER_SURFACE_MULTIPLIER))
    horizon_edge_deg = body_center_angle_deg - body_angular_radius_deg
    assert sun_angle_from_view_deg < FOV_DEG / 2
    assert 0 < horizon_edge_deg < 5

    print("Camera framing checks passed")
    print(f"FOV: {FOV_DEG} deg")
    print(f"1-unit target distance: {fit_distance_for_radius(1):.3f}")
    print(f"90-unit target distance: {fit_distance_for_radius(90):.3f}")
    print(f"Earth focus distance: {fit_distance_for_radius(visual_radius_for_body('Earth', real_scene_radius(REAL_RADIUS_KM['Earth'])), FOCUS_FRAMING_SAFETY):.6f}")


if __name__ == "__main__":
    main()
