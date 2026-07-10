#!/usr/bin/env python3
"""Compare representative app positions with frozen geometric Horizons vectors.

References were generated with ``fetch_horizons_vectors.py`` using no aberration
correction, ICRF, and the IAU76/80 ecliptic of J2000.  The app scene swaps the
astronomical Y/Z axes, so this verifier applies that documented mapping before
computing Euclidean error.  No network access is required.
"""

from __future__ import annotations

import json
import math
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

# Standard ecliptic X/Y/Z, kilometres.  Official source:
# https://ssd.jpl.nasa.gov/api/horizons.api
HORIZONS = {
    "2000-01-01T12:00:00.000Z": {
        "moon": (-291_608.3841877129, -274_979.7416731504, 36_271.19662699287),
        "io": (399_714.236329573, 129_266.6509466162, 10_663.25607327993),
        "titan": (-946_802.9384488795, 766_868.0317005697, -302_959.9876766361),
        "titania": (-63_107.0017574001, -46_441.09442004217, -428_906.4648943231),
        "triton": (-205_696.4744679369, 124_061.5238227584, 261_000.7739897959),
    },
    "2025-01-01T00:00:00.000Z": {
        "ceres": (325_671_036.9438993, -295_655_449.115863, -69_353_333.42738655),
        "pluto": (2_726_992_107.850441, -4_489_134_839.615366, -308_144_055.594269),
        "eris": (12_773_683_919.31712, 5_856_600_462.714375, -2_669_044_802.883836),
        "haumea": (-5_613_083_810.276931, -3_435_518_783.64535, 3_529_861_440.324489),
        "makemake": (-6_888_593_025.494615, -1_236_961_620.346078, 3_628_793_258.679506),
    },
    "2026-07-10T00:00:00.000Z": {
        "ceres": (168_215_321.6089228, 373_381_997.7907589, -19_168_447.4988151),
        "pluto": (2_953_263_247.851274, -4_406_753_167.95695, -382_565_533.994499),
        "eris": (12_734_181_500.25854, 5_927_965_894.143647, -2_591_256_987.671376),
        "haumea": (-5_499_018_532.609067, -3_581_363_287.791127, 3_519_098_120.235182),
        "makemake": (-6_873_687_493.994514, -1_414_806_578.871413, 3_602_285_894.598996),
        "moon": (255_178.7936264554, 262_767.4158282889, 31_981.69183438824),
        "io": (-172_479.7744376242, 383_088.1474531187, 11_369.96091837654),
        "titan": (733_970.1505550568, -865_631.8734998758, 373_346.0058165092),
        "titania": (363_472.3362309995, -46_568.25292872491, 236_895.820475672),
        "triton": (225_245.281655321, 268_641.5801665492, 54_166.50504719894),
    },
}


def vector_length(vector: tuple[float, float, float]) -> float:
    return math.sqrt(sum(component * component for component in vector))


def scene_vector(ecliptic: tuple[float, float, float]) -> tuple[float, float, float]:
    x, y, z = ecliptic
    return x, z, y


def load_app_positions() -> dict[str, dict[str, list[float]]]:
    tsx = ROOT / "node_modules" / ".bin" / "tsx"
    if not tsx.exists():
        command = shutil.which("tsx")
        if not command:
            raise RuntimeError("tsx is required; run npm install before verify:math")
        tsx = Path(command)

    requests = {
        date: sorted(reference.keys())
        for date, reference in HORIZONS.items()
    }
    code = f"""
      import {{ bodiesById }} from "./src/data";
      import {{ getOrbitPositionKm }} from "./src/simulation/solveOrbit";
      const requests = {json.dumps(requests)};
      const output = Object.fromEntries(Object.entries(requests).map(([date, ids]) => [
        date,
        Object.fromEntries(ids.map((id) => {{
          const body = bodiesById.get(id);
          if (!body?.orbit) throw new Error(`missing orbit for ${{id}}`);
          return [id, getOrbitPositionKm(body.orbit, new Date(date))];
        }})),
      ]));
      console.log(JSON.stringify(output));
    """
    result = subprocess.run(
        [str(tsx), "--eval", code],
        cwd=ROOT,
        check=True,
        text=True,
        capture_output=True,
    )
    return json.loads(result.stdout)


def main() -> None:
    app_positions = load_app_positions()
    print("Reference: JPL Horizons geometric vectors, ecliptic J2000")
    print("date        body       error(km)   error/orbit")
    errors: dict[tuple[str, str], float] = {}
    fractions: dict[tuple[str, str], float] = {}

    for date, reference_by_body in HORIZONS.items():
        for body_id, ecliptic_reference in reference_by_body.items():
            reference = scene_vector(ecliptic_reference)
            actual = tuple(app_positions[date][body_id])
            delta = tuple(actual[index] - reference[index] for index in range(3))
            error = vector_length(delta)
            fraction = error / vector_length(reference)
            errors[(date, body_id)] = error
            fractions[(date, body_id)] = fraction
            print(f"{date[:10]}  {body_id:<9} {error:>11,.0f}   {fraction:>10.5f}")

    # Horizons snapshots must reconstruct their own epoch to numerical precision.
    for body_id in HORIZONS["2025-01-01T00:00:00.000Z"]:
        assert errors[("2025-01-01T00:00:00.000Z", body_id)] < 2.0, body_id

    # Published mean satellite elements are not an SPK.  At the source epoch they
    # should nevertheless reproduce system geometry and phase to within 10% of the
    # orbital radius; the explicit plane transform is essential to pass this gate.
    for body_id in HORIZONS["2000-01-01T12:00:00.000Z"]:
        assert fractions[("2000-01-01T12:00:00.000Z", body_id)] < 0.01, body_id

    # A two-body snapshot should remain a useful placement model over 18 months.
    for body_id in ("ceres", "pluto", "eris", "haumea", "makemake"):
        assert fractions[("2026-07-10T00:00:00.000Z", body_id)] < 0.001, body_id

    # Current-date moon comparisons deliberately use a looser whole-orbit bound:
    # this catches decorative/random phase or a missing frame rotation without
    # misrepresenting fixed mean elements as the underlying JPL SPK.
    for body_id in ("moon", "io", "titan", "titania", "triton"):
        assert fractions[("2026-07-10T00:00:00.000Z", body_id)] < 0.25, body_id

    print("Ephemeris fidelity checks passed")


if __name__ == "__main__":
    main()
