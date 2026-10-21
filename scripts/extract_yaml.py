#!/usr/bin/env python3
"""Regenerate src/data/aero.json (rotor settings + airfoil polars) from the
IEA 22 MW windIO YAML.

    python3 scripts/extract_yaml.py path/to/IEA-22-280-RWT.yaml

Get the YAML from
https://github.com/IEAWindSystems/IEA-22-280-RWT/blob/main/windIO/IEA-22-280-RWT.yaml
Needs PyYAML. Uses the "default" polar configuration and the first Re set of
each airfoil.

src/data/iea22.json (blade geometry + layup) was exported separately; its
exporter is not part of this repo yet (see TODO.md).
"""
import json
import pathlib
import sys

import yaml


def main(yaml_path):
    d = yaml.safe_load(open(yaml_path))
    polars = {}
    for a in d["airfoils"]:
        p = [p for p in a["polars"] if p["configuration"] == "default"][0]["re_sets"][0]
        grid = p["cl"]["grid"]
        assert grid == p["cd"]["grid"] and all(grid[i] < grid[i + 1] for i in range(len(grid) - 1))
        polars[a["name"]] = {
            "aoa": [round(x, 3) for x in grid],
            "cl": [round(v, 4) for v in p["cl"]["values"]],
            "cd": [round(v, 5) for v in p["cd"]["values"]],
        }
    c, hub = d["control"], d["components"]["hub"]
    aero = {
        "coneDeg": hub["cone_angle"],
        "uptiltDeg": d["components"]["drivetrain"]["outer_shape"]["uptilt"],
        "hubDiameter": hub["diameter"],
        "rotorDiameter": d["assembly"]["rotor_diameter"],
        "finePitchDeg": round(c["fine_pitch"], 3),
        "minRpm": round(c["min_rotor_speed"], 3),
        "ratedRpm": round(c["rated_rotor_speed"], 3),
        "maxRpm": round(c["max_rotor_speed"], 3),
        "optimalTsr": c["optimal_tsr"],
        "polars": polars,
    }
    out = pathlib.Path(__file__).resolve().parent.parent / "src" / "data" / "aero.json"
    out.write_text(json.dumps(aero, separators=(",", ":")))
    print(f"wrote {out} ({out.stat().st_size} bytes)")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
