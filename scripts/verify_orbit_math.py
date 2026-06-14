#!/usr/bin/env python3
"""Small arithmetic checks for the MVP orbital model."""

from __future__ import annotations

import math

AU_KM = 149_597_870.7
DAY_SECONDS = 86_400


def circular_speed_km_s(semi_major_axis_km: float, period_days: float) -> float:
    return (2 * math.pi * semi_major_axis_km) / (period_days * DAY_SECONDS)


def vis_viva_speed_km_s(semi_major_axis_km: float, eccentricity: float, period_days: float, true_anomaly_deg: float) -> float:
    true_anomaly = math.radians(true_anomaly_deg)
    radius = semi_major_axis_km * (1 - eccentricity**2) / (1 + eccentricity * math.cos(true_anomaly))
    period_seconds = period_days * DAY_SECONDS
    derived_mu = 4 * math.pi**2 * semi_major_axis_km**3 / period_seconds**2
    return math.sqrt(derived_mu * (2 / radius - 1 / semi_major_axis_km))


def compressed_distance_units(distance_au: float) -> float:
    return distance_au**0.62 * 16


def overview_distance_units(distance_au: float) -> float:
    return math.log10(distance_au + 1) * 52


def main() -> None:
    earth_speed = circular_speed_km_s(AU_KM, 365.256)
    mars_speed = circular_speed_km_s(1.523_679 * AU_KM, 686.98)
    neptune_speed = circular_speed_km_s(30.11 * AU_KM, 60_190)
    mercury_perihelion_speed = vis_viva_speed_km_s(0.387_098 * AU_KM, 0.20563, 87.969, 0)
    mercury_aphelion_speed = vis_viva_speed_km_s(0.387_098 * AU_KM, 0.20563, 87.969, 180)

    assert 29.7 < earth_speed < 29.9, earth_speed
    assert 24.0 < mars_speed < 24.3, mars_speed
    assert 5.4 < neptune_speed < 5.5, neptune_speed
    assert mercury_perihelion_speed > mercury_aphelion_speed
    assert 58.0 < mercury_perihelion_speed < 59.5, mercury_perihelion_speed
    assert 38.0 < mercury_aphelion_speed < 39.5, mercury_aphelion_speed

    earth_compressed = compressed_distance_units(1)
    neptune_compressed = compressed_distance_units(30.11)
    kuiper_overview = overview_distance_units(52)

    assert math.isclose(earth_compressed, 16.0)
    assert 130 < neptune_compressed < 133, neptune_compressed
    assert 89 < kuiper_overview < 90, kuiper_overview

    print("Orbit math checks passed")
    print(f"Earth circular speed: {earth_speed:.3f} km/s")
    print(f"Mars circular speed: {mars_speed:.3f} km/s")
    print(f"Neptune circular speed: {neptune_speed:.3f} km/s")
    print(f"Mercury perihelion/aphelion: {mercury_perihelion_speed:.3f}/{mercury_aphelion_speed:.3f} km/s")
    print(f"Compressed Earth/Neptune scene units: {earth_compressed:.2f}/{neptune_compressed:.2f}")
    print(f"Overview Kuiper outer edge scene units: {kuiper_overview:.2f}")


if __name__ == "__main__":
    main()
