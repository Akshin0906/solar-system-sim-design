"""Verify the geometric safety envelope used by shared free-camera links."""

from __future__ import annotations

import math
import re
from pathlib import Path


SOURCE = (Path(__file__).parents[1] / "src/features/share/viewState.ts").read_text()


def read_constant(name: str) -> float:
    match = re.search(rf"const {name} = ([0-9.]+);", SOURCE)
    assert match, f"Missing {name} in viewState.ts"
    return float(match.group(1))


MAX_VIEW_DISTANCE = read_constant("MAX_SHARED_VIEW_DISTANCE")
MAX_TARGET_DISTANCE = read_constant("MAX_SHARED_TARGET_DISTANCE")
MAX_UP_ALIGNMENT = read_constant("MAX_SHARED_UP_ALIGNMENT")


def length(vector: tuple[float, float, float]) -> float:
    return math.sqrt(sum(component * component for component in vector))


def view_distance(position: tuple[float, float, float], target: tuple[float, float, float]) -> float:
    return length(tuple(position[index] - target[index] for index in range(3)))


authored_position = (24.0, 18.0, 36.0)
authored_target = (1.0, 2.0, 3.0)
malicious_position = (1_000.0, 1_000.0, 1_000.0)
malicious_target = (0.0, 0.0, 0.0)
off_system_target = (300.0, 300.0, 300.0)

assert view_distance(authored_position, authored_target) < MAX_VIEW_DISTANCE
assert view_distance(malicious_position, malicious_target) > MAX_VIEW_DISTANCE
assert length(off_system_target) > MAX_TARGET_DISTANCE

parallel_view = (0.0, 10.0, 0.0)
normalized_up = (0.0, 1.0, 0.0)
alignment = abs(sum(parallel_view[index] * normalized_up[index] for index in range(3))) / length(parallel_view)
assert alignment >= MAX_UP_ALIGNMENT

print("Shared-view camera distance, target, and up-vector bounds verified.")
