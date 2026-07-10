#!/usr/bin/env python3
"""Independent arithmetic and contract checks for the rocket evidence catalog."""

from __future__ import annotations

import math
from pathlib import Path


POUND_TO_KG = 0.45359237


DIRECT_CURVES = {
    "saturn-v": (2.0, 11.0, 22.0, 420.0),
    "falcon-heavy": (2.0, 11.5, 24.0, 430.0),
    "starship": (1.5, 12.0, 22.0, 520.0),
    "sls": (2.0, 11.2, 22.0, 430.0),
    "nuclear-thermal": (3.0, 22.0, 9.0, 2_400.0),
    "ion-probe": (0.5, 18.5, 0.0006, 30_000_000.0),
    "fusion-drive": (5.0, 3_000.0, 2.5, 6_000_000.0),
    "solar-sail": (0.3, 54.3, 0.0009, 60_000_000.0),
}


def relative_error(actual: float, expected: float) -> float:
    return abs(actual - expected) / expected


def verify_published_unit_pairs() -> None:
    # The catalog stores publisher-rounded metric values. These checks use the
    # exact international avoirdupois conversion and tolerate source rounding.
    published_pairs = {
        "Saturn V LEO": (260_000.0, 117_900.0),
        "Saturn V lunar": (90_000.0, 40_800.0),
        "Falcon Heavy LEO": (140_660.0, 63_800.0),
        "Falcon Heavy Mars": (37_040.0, 16_800.0),
        "SLS Block 1 LEO": (209_439.0, 95_000.0),
        "SLS Block 1 TLI": (59_525.0, 27_000.0),
    }
    for label, (pounds, published_kg) in published_pairs.items():
        converted_kg = pounds * POUND_TO_KG
        error = relative_error(converted_kg, published_kg)
        assert error < 0.002, (label, converted_kg, published_kg, error)
        print(f"{label:24s} {converted_kg:10.1f} kg (published {published_kg:10.1f} kg)")


def verify_direct_curves() -> None:
    for profile_id, (initial_km_s, cap_km_s, acceleration_m_s2, burn_seconds) in DIRECT_CURVES.items():
        acceleration_km_s2 = acceleration_m_s2 / 1_000.0
        uncapped_burnout_km_s = initial_km_s + acceleration_km_s2 * burn_seconds
        assert cap_km_s >= initial_km_s, (profile_id, cap_km_s, initial_km_s)
        assert cap_km_s <= uncapped_burnout_km_s + 1e-12, (
            profile_id,
            cap_km_s,
            uncapped_burnout_km_s,
        )
        time_to_cap_seconds = (cap_km_s - initial_km_s) / acceleration_km_s2
        assert time_to_cap_seconds <= burn_seconds + 1e-9, (
            profile_id,
            time_to_cap_seconds,
            burn_seconds,
        )
        print(
            f"{profile_id:24s} cap={cap_km_s:9.3f} km/s "
            f"uncapped={uncapped_burnout_km_s:9.3f} km/s time-to-cap={time_to_cap_seconds:12.1f} s"
        )


def verify_c3_benchmark() -> None:
    falcon_heavy_uop_c3_km2_s2 = 29.36
    corresponding_v_infinity_km_s = math.sqrt(falcon_heavy_uop_c3_km2_s2)
    assert 5.41 < corresponding_v_infinity_km_s < 5.43, corresponding_v_infinity_km_s
    print(
        "Falcon Heavy UOP point   "
        f"C3={falcon_heavy_uop_c3_km2_s2:.2f} km^2/s^2 "
        f"v-infinity={corresponding_v_infinity_km_s:.4f} km/s"
    )


def verify_source_contract() -> None:
    repository = Path(__file__).resolve().parents[1]
    catalog_source = (repository / "src/features/rockets/rocketCatalog.ts").read_text()
    transfer_source = (repository / "src/features/rockets/transferModel.ts").read_text()
    flight_source = (repository / "src/features/rockets/flightModel.ts").read_text()

    assert "sourceConfidence" not in catalog_source
    assert catalog_source.count("\n    directCurve: {") == len(DIRECT_CURVES)
    assert catalog_source.count("\n    hardware: {") == len(DIRECT_CURVES)
    assert ".directCurve" not in transfer_source, "physical transfer model must not consume illustrative curves"
    assert "profile.directCurve" in flight_source, "direct/free model must consume the explicitly scoped curve"
    assert "c3Km2S2: 29.36" in catalog_source
    assert "payloadKg: 8_345" in catalog_source
    print("Catalog contract          hardware, curve, and transfer claims remain separated")


def main() -> None:
    verify_published_unit_pairs()
    verify_direct_curves()
    verify_c3_benchmark()
    verify_source_contract()
    print("Rocket catalog arithmetic and evidence contract checks passed.")


if __name__ == "__main__":
    main()
