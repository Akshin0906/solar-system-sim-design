#!/usr/bin/env python3
"""Keep synchronous procedural texture work within the authored pixel budget."""

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "src/scene/planetVisuals.ts").read_text(encoding="utf-8")
CONSTANTS = {
    name: int(value)
    for name, value in re.findall(r"const ([A-Z][A-Z0-9_]+) = ([0-9]+);", SOURCE)
}

TEXTURE_PAIRS = {
    "surface star": ("SURFACE_STAR_WIDTH", "SURFACE_STAR_HEIGHT"),
    "surface moon": ("SURFACE_MOON_WIDTH", "SURFACE_MOON_HEIGHT"),
    "surface other": ("SURFACE_OTHER_WIDTH", "SURFACE_OTHER_HEIGHT"),
    "bump moon": ("BUMP_MOON_WIDTH", "BUMP_MOON_HEIGHT"),
    "bump other": ("BUMP_OTHER_WIDTH", "BUMP_OTHER_HEIGHT"),
    "roughness moon": ("ROUGHNESS_MOON_WIDTH", "ROUGHNESS_MOON_HEIGHT"),
    "roughness other": ("ROUGHNESS_OTHER_WIDTH", "ROUGHNESS_OTHER_HEIGHT"),
    "image roughness": ("IMAGE_ROUGHNESS_WIDTH", "IMAGE_ROUGHNESS_HEIGHT"),
    "cloud": ("CLOUD_WIDTH", "CLOUD_HEIGHT"),
}
MAX_PIXELS_PER_TEXTURE = 384 * 192

missing = {
    constant
    for pair in TEXTURE_PAIRS.values()
    for constant in pair
    if constant not in CONSTANTS
}
if "RING_SIZE" not in CONSTANTS:
    missing.add("RING_SIZE")
if missing:
    raise AssertionError(f"Missing texture budget constants: {sorted(missing)}")

pixel_counts = {
    label: CONSTANTS[width] * CONSTANTS[height]
    for label, (width, height) in TEXTURE_PAIRS.items()
}
pixel_counts["ring"] = CONSTANTS["RING_SIZE"] ** 2

over_budget = {
    label: pixels
    for label, pixels in pixel_counts.items()
    if pixels > MAX_PIXELS_PER_TEXTURE
}
if over_budget:
    raise AssertionError(
        f"Procedural textures exceed {MAX_PIXELS_PER_TEXTURE:,} pixels: {over_budget}"
    )

print(
    "Procedural texture budgets verified "
    f"({max(pixel_counts.values()):,} pixels maximum per generated map)."
)
