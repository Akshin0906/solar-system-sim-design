#!/usr/bin/env python3
"""Compare app planet orbit elements against JPL approximate planet elements.

Reference:
https://ssd.jpl.nasa.gov/planets/approx_pos.html
Table 1, valid for 1800 AD - 2050 AD.
"""

from __future__ import annotations

import datetime as dt
import math

AU_KM = 149_597_870.7
DAY_SECONDS = 86_400
J2000 = dt.datetime(2000, 1, 1, 12, tzinfo=dt.timezone.utc)
CHECK_DATE = dt.datetime(2026, 6, 14, 0, tzinfo=dt.timezone.utc)


APP = {
    "Mercury": dict(a=0.387_099_27, e=0.205_635_93, i=7.004_979_02, node=48.330_765_93, arg=29.127_030_35, m0=174.792_527_22, period=87.969),
    "Venus": dict(a=0.723_335_66, e=0.006_776_72, i=3.394_676_05, node=76.679_842_55, arg=54.922_624_63, m0=50.376_632_32, period=224.701),
    "Earth": dict(a=1.000_002_61, e=0.016_711_23, i=-0.000_015_31, node=0.0, arg=102.937_681_93, m0=357.526_889_73, period=365.256),
    "Mars": dict(a=1.523_710_34, e=0.093_394_1, i=1.849_691_42, node=49.559_538_91, arg=286.496_831_5, m0=19.390_197_54, period=686.98),
    "Jupiter": dict(a=5.202_887, e=0.048_386_24, i=1.304_396_95, node=100.473_909_09, arg=274.254_570_74, m0=19.667_960_68, period=4_332.589),
    "Saturn": dict(a=9.536_675_94, e=0.053_861_79, i=2.485_991_87, node=113.662_424_48, arg=338.936_453_83, m0=317.355_365_92, period=10_759.22),
    "Uranus": dict(a=19.189_164_64, e=0.047_257_44, i=0.772_637_83, node=74.016_925_03, arg=96.937_351_27, m0=142.283_828_21, period=30_685.4),
    "Neptune": dict(a=30.069_922_76, e=0.008_590_48, i=1.770_043_47, node=131.784_225_74, arg=273.180_536_53, m0=259.915_208_04, period=60_190),
}


JPL = {
    # a, adot, e, edot, i, idot, L, Ldot, long_peri, long_peri_dot, node, nodedot
    "Mercury": (0.38709927, 0.00000037, 0.20563593, 0.00001906, 7.00497902, -0.00594749, 252.25032350, 149472.67411175, 77.45779628, 0.16047689, 48.33076593, -0.12534081),
    "Venus": (0.72333566, 0.00000390, 0.00677672, -0.00004107, 3.39467605, -0.00078890, 181.97909950, 58517.81538729, 131.60246718, 0.00268329, 76.67984255, -0.27769418),
    "Earth": (1.00000261, 0.00000562, 0.01671123, -0.00004392, -0.00001531, -0.01294668, 100.46457166, 35999.37244981, 102.93768193, 0.32327364, 0.0, 0.0),
    "Mars": (1.52371034, 0.00001847, 0.09339410, 0.00007882, 1.84969142, -0.00813131, -4.55343205, 19140.30268499, -23.94362959, 0.44441088, 49.55953891, -0.29257343),
    "Jupiter": (5.20288700, -0.00011607, 0.04838624, -0.00013253, 1.30439695, -0.00183714, 34.39644051, 3034.74612775, 14.72847983, 0.21252668, 100.47390909, 0.20469106),
    "Saturn": (9.53667594, -0.00125060, 0.05386179, -0.00050991, 2.48599187, 0.00193609, 49.95424423, 1222.49362201, 92.59887831, -0.41897216, 113.66242448, -0.28867794),
    "Uranus": (19.18916464, -0.00196176, 0.04725744, -0.00004397, 0.77263783, -0.00242939, 313.23810451, 428.48202785, 170.95427630, 0.40805281, 74.01692503, 0.04240589),
    "Neptune": (30.06992276, 0.00026291, 0.00859048, 0.00005105, 1.77004347, 0.00035372, -55.12002969, 218.45945325, 44.96476227, -0.32241464, 131.78422574, -0.00508664),
}


def norm360(deg: float) -> float:
    return deg % 360.0


def signed_angle_delta(a: float, b: float) -> float:
    return (a - b + 180.0) % 360.0 - 180.0


def solve_eccentric_anomaly(mean_anomaly_rad: float, eccentricity: float) -> float:
    mean_anomaly = mean_anomaly_rad % (math.pi * 2)
    eccentric_anomaly = mean_anomaly if eccentricity < 0.8 else math.pi
    for _ in range(12):
        delta = (
            eccentric_anomaly
            - eccentricity * math.sin(eccentric_anomaly)
            - mean_anomaly
        ) / (1 - eccentricity * math.cos(eccentric_anomaly))
        eccentric_anomaly -= delta
        if abs(delta) < 1e-10:
            break
    return eccentric_anomaly


def position_au(a: float, e: float, inc_deg: float, node_deg: float, arg_deg: float, mean_anomaly_deg: float) -> tuple[float, float, float]:
    eccentric_anomaly = solve_eccentric_anomaly(math.radians(mean_anomaly_deg), e)
    true_anomaly = math.atan2(
        math.sqrt(1 - e * e) * math.sin(eccentric_anomaly),
        math.cos(eccentric_anomaly) - e,
    )
    radius = a * (1 - e * math.cos(eccentric_anomaly))
    argument = math.radians(arg_deg) + true_anomaly
    inclination = math.radians(inc_deg)
    node = math.radians(node_deg)

    cos_node = math.cos(node)
    sin_node = math.sin(node)
    cos_arg = math.cos(argument)
    sin_arg = math.sin(argument)
    cos_inc = math.cos(inclination)
    sin_inc = math.sin(inclination)

    # Same axis convention as the app: y is ecliptic vertical.
    return (
        radius * (cos_node * cos_arg - sin_node * sin_arg * cos_inc),
        radius * (sin_arg * sin_inc),
        radius * (sin_node * cos_arg + cos_node * sin_arg * cos_inc),
    )


def vector_len(vec: tuple[float, float, float]) -> float:
    return math.sqrt(sum(component * component for component in vec))


def jpl_elements(name: str, date: dt.datetime) -> dict[str, float]:
    T = (date - J2000).total_seconds() / (DAY_SECONDS * 36_525)
    a, adot, e, edot, inc, incdot, mean_long, mean_long_dot, peri, peridot, node, nodedot = JPL[name]
    a += adot * T
    e += edot * T
    inc += incdot * T
    mean_long += mean_long_dot * T
    peri += peridot * T
    node += nodedot * T
    return {
        "a": a,
        "e": e,
        "i": inc,
        "node": norm360(node),
        "arg": norm360(peri - node),
        "m": norm360(mean_long - peri),
    }


def app_elements(name: str, date: dt.datetime) -> dict[str, float]:
    source = APP[name]
    elapsed_days = (date - J2000).total_seconds() / DAY_SECONDS
    return {
        "a": source["a"],
        "e": source["e"],
        "i": source["i"],
        "node": norm360(source["node"]),
        "arg": norm360(source["arg"]),
        "m": norm360(source["m0"] + 360.0 * elapsed_days / source["period"]),
    }


def print_report() -> None:
    print(f"Reference: JPL approximate planet elements, Table 1, valid 1800-2050")
    print(f"Check date: {CHECK_DATE.isoformat()}")
    print()
    print("J2000 element deltas: app - JPL")
    print("planet      da(AU)       de       dI(deg)   dNode(deg)  dArg(deg)   dM(deg)")
    for name in APP:
        j = jpl_elements(name, J2000)
        a = app_elements(name, J2000)
        print(
            f"{name:<8} "
            f"{a['a'] - j['a']:>10.6f} "
            f"{a['e'] - j['e']:>9.6f} "
            f"{a['i'] - j['i']:>10.4f} "
            f"{signed_angle_delta(a['node'], j['node']):>11.4f} "
            f"{signed_angle_delta(a['arg'], j['arg']):>10.4f} "
            f"{signed_angle_delta(a['m'], j['m']):>9.4f}"
        )

    print()
    print("Position differences on check date")
    print("planet      delta(AU)  delta(million km)  angular(deg)  app_r(AU)  jpl_r(AU)")
    for name in APP:
        a = app_elements(name, CHECK_DATE)
        j = jpl_elements(name, CHECK_DATE)
        app_pos = position_au(a["a"], a["e"], a["i"], a["node"], a["arg"], a["m"])
        jpl_pos = position_au(j["a"], j["e"], j["i"], j["node"], j["arg"], j["m"])
        delta = vector_len(tuple(app_pos[index] - jpl_pos[index] for index in range(3)))
        app_r = vector_len(app_pos)
        jpl_r = vector_len(jpl_pos)
        dot = sum(app_pos[index] * jpl_pos[index] for index in range(3)) / (app_r * jpl_r)
        angular = math.degrees(math.acos(max(-1.0, min(1.0, dot))))
        print(f"{name:<8} {delta:>10.5f} {delta * AU_KM / 1_000_000:>18.2f} {angular:>13.4f} {app_r:>10.4f} {jpl_r:>10.4f}")

    print()
    print("Flagged outer-planet path data")
    for name in ("Uranus", "Neptune"):
        j = jpl_elements(name, J2000)
        a = app_elements(name, J2000)
        print(
            f"{name}: app a/e/M={a['a']:.8f}/{a['e']:.8f}/{a['m']:.4f}; "
            f"JPL a/e/M={j['a']:.8f}/{j['e']:.8f}/{j['m']:.4f}"
        )

    max_delta_million_km = {
        "Mercury": 0.2,
        "Venus": 0.1,
        "Earth": 0.1,
        "Mars": 0.1,
        "Jupiter": 1.0,
        "Saturn": 3.5,
        "Uranus": 0.5,
        "Neptune": 0.5,
    }
    for name in APP:
        a = app_elements(name, CHECK_DATE)
        j = jpl_elements(name, CHECK_DATE)
        app_pos = position_au(a["a"], a["e"], a["i"], a["node"], a["arg"], a["m"])
        jpl_pos = position_au(j["a"], j["e"], j["i"], j["node"], j["arg"], j["m"])
        delta_million_km = vector_len(tuple(app_pos[index] - jpl_pos[index] for index in range(3))) * AU_KM / 1_000_000
        assert delta_million_km < max_delta_million_km[name], (name, delta_million_km)


if __name__ == "__main__":
    print_report()
