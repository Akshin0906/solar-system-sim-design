#!/usr/bin/env python3
import math
import re
from pathlib import Path


LABEL_CONSTANT_NAMES = (
    "REAL_LABEL_REFERENCE_DISTANCE",
    "MIN_REAL_LABEL_SCALE",
    "MAX_REAL_LABEL_SCALE",
    "BODY_LABEL_DISTANCE_FACTOR",
    "MIN_PROJECTED_LABEL_DISTANCE",
    "MIN_PROJECTED_LABEL_SCALE",
    "MAX_PROJECTED_LABEL_SCALE",
)
CONSTANT_NAMES = (*LABEL_CONSTANT_NAMES, "DEFAULT_LABEL_CAMERA_FOV_DEG")
CONSTANT_RE = re.compile(r"export const (" + "|".join(LABEL_CONSTANT_NAMES) + r") = ([0-9.]+);")
CAMERA_FOV_RE = re.compile(r"export const CAMERA_FOV_DEG = ([0-9.]+);")


def load_constants() -> dict[str, float]:
    source = Path("src/scene/labelScaling.ts").read_text()
    constants = {name: float(value) for name, value in CONSTANT_RE.findall(source)}
    camera_source = Path("src/scene/cameraFraming.ts").read_text()
    camera_fov_match = CAMERA_FOV_RE.search(camera_source)
    if camera_fov_match:
        constants["DEFAULT_LABEL_CAMERA_FOV_DEG"] = float(camera_fov_match.group(1))
    expected = set(CONSTANT_NAMES)

    if set(constants) != expected:
        missing = ", ".join(sorted(expected - set(constants)))
        extra = ", ".join(sorted(set(constants) - expected))
        raise AssertionError(f"Unexpected label scaling constants. Missing: {missing or 'none'}; extra: {extra or 'none'}")

    return constants


def real_label_scale(camera_distance: float, constants: dict[str, float]) -> float:
    scaled_distance = math.sqrt(max(camera_distance, 0) / constants["REAL_LABEL_REFERENCE_DISTANCE"])
    return min(constants["MAX_REAL_LABEL_SCALE"], max(constants["MIN_REAL_LABEL_SCALE"], scaled_distance))


def projected_html_scale(camera_distance: float, constants: dict[str, float]) -> float:
    safe_distance = max(camera_distance, constants["MIN_PROJECTED_LABEL_DISTANCE"])
    fov_rad = math.radians(constants["DEFAULT_LABEL_CAMERA_FOV_DEG"])
    return constants["BODY_LABEL_DISTANCE_FACTOR"] / (2 * math.tan(fov_rad / 2) * safe_distance)


def projected_label_css_scale(camera_distance: float, constants: dict[str, float]) -> float:
    projected = projected_html_scale(camera_distance, constants)
    clamped = min(
        constants["MAX_PROJECTED_LABEL_SCALE"],
        max(constants["MIN_PROJECTED_LABEL_SCALE"], projected),
    )
    return clamped / projected


def projected_effective_scale(camera_distance: float, constants: dict[str, float]) -> float:
    return projected_html_scale(camera_distance, constants) * projected_label_css_scale(camera_distance, constants)


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

    assert_close(
        projected_effective_scale(0.35, constants),
        constants["MAX_PROJECTED_LABEL_SCALE"],
        "close projected scale clamps to max",
    )
    assert_close(
        projected_effective_scale(520, constants),
        constants["MIN_PROJECTED_LABEL_SCALE"],
        "far projected scale clamps to min",
    )

    neutral_distance = constants["BODY_LABEL_DISTANCE_FACTOR"] / (
        2 * math.tan(math.radians(constants["DEFAULT_LABEL_CAMERA_FOV_DEG"]) / 2)
    )
    assert_close(projected_label_css_scale(neutral_distance, constants), 1, "neutral projected css scale")
    assert_close(projected_effective_scale(neutral_distance, constants), 1, "neutral projected effective scale")

    previous = projected_effective_scale(0.35, constants)
    for step in range(1, 49):
        distance = 0.35 + (520 - 0.35) * step / 48
        current = projected_effective_scale(distance, constants)
        if current > previous + 1e-9:
            raise AssertionError(f"Projected scale should not grow with distance: {distance:.4f}")
        previous = current

    print("label scaling math ok")


if __name__ == "__main__":
    main()
