#!/usr/bin/env python3
"""Derive J2000 mean-anomaly seeds from geometric Horizons vectors.

JPL's public satellite table supplies mean orbit shape and reference planes.  This
authoring script projects a J2000 Horizons vector into each published plane, then
solves the anomaly that reproduces that authoritative phase.  It is useful where a
long-period mean-element fit's tabulated angular conventions do not reconstruct the
instantaneous SPK vector directly.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone

from fetch_horizons_vectors import request_vector


OBLIQUITY_RAD = math.radians(84_381.448 / 3_600)
EPOCH = "2000-01-01 12:00"
CHECK_DATE = "2026-07-10 00:00"
ELAPSED_DAYS = (
    datetime(2026, 7, 10, tzinfo=timezone.utc)
    - datetime(2000, 1, 1, 12, tzinfo=timezone.utc)
).total_seconds() / 86_400

# id: target, center, PCK W rate, e, i, node, argument, frame pole or None
MOONS = {
    "moon": ("301", "500@399", 13.17635815, .0554, 5.16, 125.08, 318.15, None),
    "io": ("501", "500@599", 203.4889538, .004, 0, 0, 49.1, (268.1, 64.5)),
    "europa": ("502", "500@599", 101.3747235, .009, .5, 184, 45, (268.1, 64.5)),
    "ganymede": ("503", "500@599", 50.3176081, .001, .2, 58.5, 198.3, (268.2, 64.6)),
    "callisto": ("504", "500@599", 21.5710715, .007, .3, 309.1, 43.8, (268.7, 64.8)),
    "enceladus": ("602", "500@699", 262.7318996, .005, 0, 0, 119.5, (40.6, 83.5)),
    "rhea": ("605", "500@699", 79.6900478, .001, .3, 133.7, 44.3, (40.6, 83.5)),
    "titan": ("606", "500@699", 22.5769768, .029, .3, 78.6, 78.3, (36.4, 84.0)),
    "iapetus": ("608", "500@699", 4.5379572, .028, 7.6, 86.5, 254.5, (288.7, 78.9)),
    "ariel": ("701", "500@799", -142.8356681, .001, 0, 0, 9.6, (257.311, -15.175)),
    "umbriel": ("702", "500@799", -86.8688923, .004, .1, 174.8, 183.4, (257.311, -15.175)),
    "titania": ("703", "500@799", -41.3514316, .002, .1, 29.5, 184, (257.311, -15.175)),
    "oberon": ("704", "500@799", -26.7394932, .002, .1, 76.8, 132.2, (257.311, -15.175)),
    "miranda": ("705", "500@799", -254.6906892, .001, 4.4, 100.9, 154.8, (257.311, -15.175)),
    "triton": ("801", "500@899", -61.2572637, 0, 157.3, 178.1, 0, (299.8, 43.1)),
}

# JPL table P_apsis and P_node magnitudes, Julian years.  Nodes regress; apsides
# advance.  A zero denotes no published secular term for the circular/coplanar fit.
PRECESSION_YEARS = {
    "moon": (5.997, 18.600),
    "io": (1.333, 0),
    "europa": (1.394, 30.202),
    "ganymede": (68.301, 137.812),
    "callisto": (277.921, 577.264),
    "enceladus": (2.916, 0),
    "rhea": (33.939, 35.775),
    "titan": (346.680, 687.370),
    "iapetus": (1662.900, 3130.302),
    "ariel": (28.901, 0),
    "umbriel": (64.126, 129.745),
    "titania": (579.928, 1644.649),
    "oberon": (158.604, 192.798),
    "miranda": (8.939, 17.787),
    "triton": (0, 340.379),
}


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def cross(a, b):
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def ecliptic_to_icrf(vector):
    x, y, z = vector
    return (
        x,
        math.cos(OBLIQUITY_RAD) * y - math.sin(OBLIQUITY_RAD) * z,
        math.sin(OBLIQUITY_RAD) * y + math.cos(OBLIQUITY_RAD) * z,
    )


def to_element_frame(ecliptic_vector, pole):
    if pole is None:
        return ecliptic_vector
    vector = ecliptic_to_icrf(ecliptic_vector)
    ra, dec = map(math.radians, pole)
    z_axis = (
        math.cos(dec) * math.cos(ra),
        math.cos(dec) * math.sin(ra),
        math.sin(dec),
    )
    x_axis = (-math.sin(ra), math.cos(ra), 0.0)
    y_axis = cross(z_axis, x_axis)
    return dot(vector, x_axis), dot(vector, y_axis), dot(vector, z_axis)


def phase_mean_anomaly(vector, eccentricity, inclination_deg, node_deg, argument_deg):
    inclination = math.radians(inclination_deg)
    node = math.radians(node_deg)
    cos_node, sin_node = math.cos(node), math.sin(node)
    x1 = cos_node * vector[0] + sin_node * vector[1]
    y1 = -sin_node * vector[0] + cos_node * vector[1]
    if abs(math.cos(inclination)) > 0.5:
        sin_argument = y1 / math.cos(inclination)
    else:
        sin_argument = vector[2] / math.sin(inclination)
    argument_of_latitude = math.atan2(sin_argument, x1)
    true_anomaly = argument_of_latitude - math.radians(argument_deg)
    eccentric_anomaly = 2 * math.atan2(
        math.sqrt(1 - eccentricity) * math.sin(true_anomaly / 2),
        math.sqrt(1 + eccentricity) * math.cos(true_anomaly / 2),
    )
    return math.degrees(eccentric_anomaly - eccentricity * math.sin(eccentric_anomaly)) % 360


def main():
    print("Horizons-calibrated J2000 mean anomalies")
    for body_id, (target, center, w_rate, eccentricity, inclination, node, argument, pole) in MOONS.items():
        epoch_local = to_element_frame(request_vector(target, center, EPOCH), pole)
        check_local = to_element_frame(request_vector(target, center, CHECK_DATE), pole)
        mean_anomaly = phase_mean_anomaly(epoch_local, eccentricity, inclination, node, argument)
        apsis_years, node_years = PRECESSION_YEARS[body_id]
        node_direction = 1 if body_id == "triton" else -1
        node_rate_per_century = node_direction * 36_000 / node_years if node_years else 0
        argument_rate_per_century = 36_000 / apsis_years if apsis_years else 0
        centuries = ELAPSED_DAYS / 36_525
        check_anomaly = phase_mean_anomaly(
            check_local,
            eccentricity,
            inclination,
            node + node_rate_per_century * centuries,
            argument + argument_rate_per_century * centuries,
        )
        wrapped_advance = (check_anomaly - mean_anomaly) % 360
        source_period = 360 / abs(w_rate)
        nominal_cycles = ELAPSED_DAYS / source_period
        whole_cycles = round(nominal_cycles - wrapped_advance / 360)
        total_advance = whole_cycles * 360 + wrapped_advance
        fitted_period = ELAPSED_DAYS * 360 / total_advance
        print(
            f"{body_id:<10} M={mean_anomaly:>13.9f} deg   "
            f"P={fitted_period:>13.9f} d   PCK_P={source_period:.9f}   "
            f"node_dot={node_rate_per_century:>12.6f} arg_dot={argument_rate_per_century:>12.6f}"
        )


if __name__ == "__main__":
    main()
