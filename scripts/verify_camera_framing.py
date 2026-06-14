#!/usr/bin/env python3
"""Verify the camera framing formula used by the Three.js camera rig."""

from __future__ import annotations

import math

FOV_DEG = 48


def fit_distance_for_radius(radius: float, safety: float = 1.55) -> float:
    half_fov_rad = math.radians(FOV_DEG / 2)
    return max(0.01, (max(radius, 0.01) / math.tan(half_fov_rad)) * safety)


def visible_radius_at_distance(distance: float) -> float:
    return math.tan(math.radians(FOV_DEG / 2)) * distance


def main() -> None:
    for radius in (0.25, 1, 12, 90, 145):
        distance = fit_distance_for_radius(radius)
        visible_radius = visible_radius_at_distance(distance)
        ratio = visible_radius / radius
        assert ratio > 1.54, (radius, distance, ratio)
        assert ratio < 1.56, (radius, distance, ratio)

    tiny_distance = fit_distance_for_radius(0)
    assert tiny_distance > 0

    print("Camera framing checks passed")
    print(f"FOV: {FOV_DEG} deg")
    print(f"1-unit target distance: {fit_distance_for_radius(1):.3f}")
    print(f"90-unit target distance: {fit_distance_for_radius(90):.3f}")


if __name__ == "__main__":
    main()
