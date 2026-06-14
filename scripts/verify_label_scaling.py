#!/usr/bin/env python3
import math
import re
from pathlib import Path


CONSTANT_RE = re.compile(
    r"export const (REAL_LABEL_REFERENCE_DISTANCE|MIN_REAL_LABEL_SCALE|MAX_REAL_LABEL_SCALE) = ([0-9.]+);"
)


def load_constants() -> dict[str, float]:
    source = Path("src/scene/labelScaling.ts").read_text()
    constants = {name: float(value) for name, value in CONSTANT_RE.findall(source)}
    expected = {"REAL_LABEL_REFERENCE_DISTANCE", "MIN_REAL_LABEL_SCALE", "MAX_REAL_LABEL_SCALE"}

    if set(constants) != expected:
        missing = ", ".join(sorted(expected - set(constants)))
        extra = ", ".join(sorted(set(constants) - expected))
        raise AssertionError(f"Unexpected label scaling constants. Missing: {missing or 'none'}; extra: {extra or 'none'}")

    return constants


def real_label_scale(camera_distance: float, constants: dict[str, float]) -> float:
    scaled_distance = math.sqrt(max(camera_distance, 0) / constants["REAL_LABEL_REFERENCE_DISTANCE"])
    return min(constants["MAX_REAL_LABEL_SCALE"], max(constants["MIN_REAL_LABEL_SCALE"], scaled_distance))


def assert_close(actual: float, expected: float, label: str) -> None:
    if not math.isclose(actual, expected, rel_tol=1e-9, abs_tol=1e-9):
        raise AssertionError(f"{label}: expected {expected:.12f}, got {actual:.12f}")


def main() -> None:
    constants = load_constants()
    reference = constants["REAL_LABEL_REFERENCE_DISTANCE"]
    minimum = constants["MIN_REAL_LABEL_SCALE"]
    maximum = constants["MAX_REAL_LABEL_SCALE"]

    assert_close(real_label_scale(reference, constants), maximum, "reference distance")
    assert_close(real_label_scale(reference * 4, constants), maximum, "far distance clamps to max")
    assert_close(real_label_scale(0, constants), minimum, "zero distance clamps to min")
    assert_close(real_label_scale(reference * 0.25, constants), 0.5, "quarter distance halves label")

    previous = real_label_scale(0, constants)
    for step in range(1, 25):
        distance = reference * step / 24
        current = real_label_scale(distance, constants)
        if current < previous:
            raise AssertionError(f"Scale should not shrink as distance increases: {distance:.4f}")
        previous = current

    print("label scaling math ok")


if __name__ == "__main__":
    main()
