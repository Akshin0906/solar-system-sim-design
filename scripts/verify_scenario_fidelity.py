#!/usr/bin/env python3
"""Arithmetic guardrails for scenario labels and physical presentation constants."""

import math


SCHWARZSCHILD_KM_PER_SOLAR_MASS = 2.95325008
BLACK_HOLE_MASS_SOLAR = 8.0
BLACK_HOLE_EVENT_HORIZON_KM = SCHWARZSCHILD_KM_PER_SOLAR_MASS * BLACK_HOLE_MASS_SOLAR
READABLE_INTERACTION_RADIUS_KM = 120_000.0

assert 23.5 < BLACK_HOLE_EVENT_HORIZON_KM < 23.8
assert READABLE_INTERACTION_RADIUS_KM / BLACK_HOLE_EVENT_HORIZON_KM > 5_000

CHICXULUB_DIAMETER_KM = 10.0
CHICXULUB_RADIUS_KM = CHICXULUB_DIAMETER_KM / 2.0
VOLUME_FROM_RADIUS = 4.0 * math.pi * CHICXULUB_RADIUS_KM**3 / 3.0
VOLUME_IF_DIAMETER_WERE_MISTAKEN_FOR_RADIUS = 4.0 * math.pi * CHICXULUB_DIAMETER_KM**3 / 3.0
assert math.isclose(VOLUME_IF_DIAMETER_WERE_MISTAKEN_FOR_RADIUS / VOLUME_FROM_RADIUS, 8.0)

# Schroeder & Cuntz's solar-evolution result loses 0.332 solar masses by the
# tip of the red-giant branch. In the adiabatic limit, a surviving planet's
# semimajor axis expands inversely with the remaining stellar mass.
RGB_MASS_LOST_SOLAR = 0.332
RGB_REMAINING_MASS_SOLAR = 1.0 - RGB_MASS_LOST_SOLAR
ADIABATIC_ORBIT_EXPANSION = 1.0 / RGB_REMAINING_MASS_SOLAR
assert math.isclose(RGB_REMAINING_MASS_SOLAR, 0.668)
assert 1.49 < ADIABATIC_ORBIT_EXPANSION < 1.50

print(f"8 solar-mass event horizon: {BLACK_HOLE_EVENT_HORIZON_KM:.3f} km")
print(
    "Readable interaction sphere / event horizon: "
    f"{READABLE_INTERACTION_RADIUS_KM / BLACK_HOLE_EVENT_HORIZON_KM:,.1f}x"
)
print("Treating a diameter as a radius overstates spherical volume by 8x")
print(
    "Red-giant default remaining mass / adiabatic orbit expansion: "
    f"{RGB_REMAINING_MASS_SOLAR:.3f} M_sun / {ADIABATIC_ORBIT_EXPANSION:.3f}x"
)
print("Scenario fidelity arithmetic checks passed")
