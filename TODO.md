# TODO

Ideas and known issues for the IEA 22 MW blade viewer, roughly in order of value.

## Feature ideas

- [x] **Spanwise load plot** — Plots → Aero loads integrates thrust, torque and power (needs the BEM solve below to become realistic).
- [ ] **BEM induction solve** — iterate axial and tangential induction per station (with Prandtl tip loss) instead of the user-set induction slider. Would make α, loads and power realistic without tuning.
- [x] **Polar plots** — Airfoils window: Cl, Cd, Cm, Cl/Cd vs α, blended airfoil at the cut, α marked.
- [ ] **Plies in the 2D section** — draw the coloured ply stack inside the section outline (the cap geometry already exists).
- [ ] **Shaft tilt** — 6° uptilt toggle from the YAML (`components.drivetrain.outer_shape.uptilt`), next to precone.
- [ ] **Shareable URL state** — keep camera and slider settings in the URL hash, so a link reopens the same view.

## Known issues / checks

- [ ] **TE ply crossover** — at the sharp trailing edge, offsetting plies along the normals makes inner plies poke slightly through the gelcoat (geometry, not z-fighting).
- [ ] **Repo link** — the IEA repository moved to `github.com/IEAWindSystems/IEA-22-280-RWT`; the About dialog and README still use the old `IEAWindTask37` URL (it redirects).
- [ ] **Touch navigation untested** — one-finger orbit and two-finger pan/pinch have only been checked with mouse events.
- [ ] **Real-GPU check** — the depth-bias z-fighting fix was tuned in a software renderer (SwiftShader); confirm on real hardware.
- [ ] **Blade JSON exporter** — `src/data/iea22.json` (resampled airfoils, blend table, layup grids) was exported by a tool that isn't in the repo; add it to `scripts/` so the blade data can be regenerated from the YAML like `aero.json`.
- [ ] **Presweep** — the toggle is disabled because this blade has no presweep (reference axis y = 0); it would only matter for other blades.

## Notes

- The aerodynamics are quasi-steady 2D blade-element estimates: user-set axial induction (default 1/3), no BEM iteration, tip loss or 3D effects.
- Polars and rotor settings are embedded from `IEA-22-280-RWT.yaml` (windIO 2.0): default polar configuration, first Re set.
