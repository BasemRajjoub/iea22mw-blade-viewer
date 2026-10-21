#!/usr/bin/env python3
"""Regenerate src/data/aero.json (rotor settings + airfoil polars) and
src/data/structure.json (spanwise mass, inertia and stiffness) from the
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
        assert grid == p["cd"]["grid"] == p["cm"]["grid"] and all(grid[i] < grid[i + 1] for i in range(len(grid) - 1))
        polars[a["name"]] = {
            "aoa": [round(x, 3) for x in grid],
            "cl": [round(v, 4) for v in p["cl"]["values"]],
            "cd": [round(v, 5) for v in p["cd"]["values"]],
            "cm": [round(v, 5) for v in p["cm"]["values"]],
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
        "ratedPower": d["assembly"]["rated_power"],
        "hubHeight": d["assembly"]["hub_height"],
        "cutIn": d["assembly"]["cut_in_wind_speed"],
        "cutOut": d["assembly"]["cut_out_wind_speed"],
        "region2K": c["region2_k"],                    # N·m/(rad/s)², generator torque = k·Ω²
        "maxGenTorque": c["max_gen_torque"],           # N·m
        "maxPitchRate": round(c["max_pitch_rate"], 3),  # °/s
        # the controller's minimum pitch (peak shaving) vs wind speed
        "minPitchTable": {"wind": [round(v, 4) for v in c["min_pitch_table"]["wind_speed"]],
                          "pitch": [round(v, 4) for v in c["min_pitch_table"]["min_pitch"]]},
        "polars": polars,
    }
    data_dir = pathlib.Path(__file__).resolve().parent.parent / "src" / "data"
    write(data_dir / "aero.json", aero)

    # spanwise structural properties (windIO 6x6 stiffness: K33 = EA,
    # K44 = EI about x = edgewise, K55 = EI about y = flapwise, K66 = GJ)
    ep = d["components"]["blade"]["structure"]["elastic_properties"]
    im, k = ep["inertia_matrix"], ep["stiffness_matrix"]
    assert im["grid"] == k["grid"]
    sig = lambda vals: [float(f"{v:.6g}") for v in vals]
    structure = {
        "grid": sig(im["grid"]),
        "mass": sig(im["mass"]),             # kg/m
        "iFlap": sig(im["i_flap"]),          # kg·m (mass moment of inertia per length)
        "iEdge": sig(im["i_edge"]),
        "EA": sig(k["K33"]),                 # N
        "EIedge": sig(k["K44"]),             # N·m²
        "EIflap": sig(k["K55"]),             # N·m²
        "GJ": sig(k["K66"]),                 # N·m²
    }
    write(data_dir / "structure.json", structure)


def write(path, obj):
    path.write_text(json.dumps(obj, separators=(",", ":")))
    print(f"wrote {path} ({path.stat().st_size} bytes)")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
