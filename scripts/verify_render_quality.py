#!/usr/bin/env python3
"""Independent arithmetic checks for projected LOD and analytic eclipse geometry."""

from __future__ import annotations

import math


def projected_radius_px(radius: float, distance: float, fov_deg: float, viewport_height: float) -> float:
    angular_radius = math.asin(radius / distance)
    return math.tan(angular_radius) / math.tan(math.radians(fov_deg) / 2) * viewport_height / 2


def smoothstep(edge0: float, edge1: float, value: float) -> float:
    amount = min(1.0, max(0.0, (value - edge0) / (edge1 - edge0)))
    return amount * amount * (3 - 2 * amount)


def sphere_occlusion(
    surface: tuple[float, float, float],
    sun: tuple[float, float, float],
    occluder: tuple[float, float, float],
    radius: float,
) -> float:
    to_sun = tuple(sun[index] - surface[index] for index in range(3))
    sun_distance = math.sqrt(sum(component * component for component in to_sun))
    ray = tuple(component / sun_distance for component in to_sun)
    to_occluder = tuple(occluder[index] - surface[index] for index in range(3))
    along = sum(to_occluder[index] * ray[index] for index in range(3))
    if along <= 0 or along >= sun_distance:
        return 0
    perpendicular = math.sqrt(
        sum((to_occluder[index] - ray[index] * along) ** 2 for index in range(3))
    )
    return 1 - smoothstep(radius * 0.82, radius * 1.18, perpendicular)


def earth_roughness(red: int, green: int, blue: int) -> float:
    blue_lead = (blue - max(red, green)) / 255
    luminance = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255
    water = smoothstep(0.015, 0.22, blue_lead) * (1 - smoothstep(0.72, 0.94, luminance))
    return min(0.96, max(0.28, 0.92 - water * 0.64))


def solar_exposure(distance: float, solar_radius: float) -> float:
    radii = distance / solar_radius
    amount = smoothstep(2.2, 5.5, radii)
    return 0.8 + (1.08 - 0.8) * amount


def adaptive_dpr(initial_dpr: float, quality_factor: float) -> float:
    minimum = min(1.0, initial_dpr)
    quality = min(1.0, max(0.5, quality_factor))
    return minimum + (initial_dpr - minimum) * quality


def performance_bounds(refresh_rate: float) -> tuple[float, float]:
    return min(45.0, refresh_rate * 0.55), min(58.0, refresh_rate * 0.9)


def main() -> None:
    near = projected_radius_px(1, 10, 60, 1_000)
    far = projected_radius_px(1, 20, 60, 1_000)
    assert math.isclose(near, 87.0388279778, rel_tol=1e-10)
    assert math.isclose(far, 43.3554984762, rel_tol=1e-10)
    assert near > 54 > far, "the example should cross the high/medium LOD boundary"

    totality = sphere_occlusion((10, 0, 0), (0, 0, 0), (5, 0, 0), 1)
    clear = sphere_occlusion((10, 0, 0), (0, 0, 0), (5, 1.3, 0), 1)
    behind_observer = sphere_occlusion((10, 0, 0), (0, 0, 0), (12, 0, 0), 1)
    assert math.isclose(totality, 1)
    assert math.isclose(clear, 0)
    assert math.isclose(behind_observer, 0)

    ocean_roughness = earth_roughness(22, 76, 142)
    land_roughness = earth_roughness(98, 123, 72)
    ice_roughness = earth_roughness(230, 238, 242)
    assert ocean_roughness < 0.5
    assert land_roughness > 0.85
    assert ice_roughness > 0.85

    near_exposure = solar_exposure(2, 1)
    transition_exposure = solar_exposure(3.85, 1)
    far_exposure = solar_exposure(8, 1)
    assert math.isclose(near_exposure, 0.8)
    assert math.isclose(transition_exposure, 0.94)
    assert math.isclose(far_exposure, 1.08)

    assert math.isclose(adaptive_dpr(1.65, 1.0), 1.65)
    assert math.isclose(adaptive_dpr(1.65, 0.5), 1.325)
    assert adaptive_dpr(1.0, 0.5) == 1.0
    assert performance_bounds(60) == (33.0, 54.0)
    assert performance_bounds(120) == (45.0, 58.0)

    print(
        "render-quality arithmetic verified:",
        f"projected radii={near:.3f}px/{far:.3f}px,",
        f"occlusion={totality:.1f}/{clear:.1f}/{behind_observer:.1f},",
        f"roughness={ocean_roughness:.2f}/{land_roughness:.2f}/{ice_roughness:.2f}",
        f"exposure={near_exposure:.2f}/{transition_exposure:.2f}/{far_exposure:.2f},",
        f"adaptive-dpr={adaptive_dpr(1.65, 0.5):.3f}",
    )


if __name__ == "__main__":
    main()
