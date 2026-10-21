# CLAUDE.md

Interactive three.js viewer of the IEA 22 MW reference wind turbine blade: real chord/twist/prebend, blended airfoils, 12 composite shell plies + shear webs, a full turbine, and quasi-steady blade-element aerodynamics. Plain JavaScript ES modules, built with Vite into **one standalone `dist/index.html`**.

## Commands

- `npm install` — once.
- `npm run dev` — dev server with live reload.
- `npm run build` — writes `dist/index.html`: all JS, CSS and JSON inlined and minified. It opens straight from disk (`file://`) with no network, except the optional car/human models and the Draco decoder, which load from a CDN.
- `python3 scripts/extract_yaml.py <IEA-22-280-RWT.yaml>` — regenerates `src/data/aero.json`.

There is no test suite. Check changes in the browser. `window.viewer` exposes `{ scene, camera, renderer, setPaused, frameView }` for the console.

## Layout

`src/main.js` imports every module **in a fixed order**: the order the original single-file script ran in. A module may use earlier modules at load time, never later ones. If a later module needs to call back, register the listener in a later module (see the turbine and Eiffel toggles in `main.js`).

| Module | What it holds |
|---|---|
| `data/` | `iea22.json` (blade geometry + layup), `aero.json` (rotor settings + polars), `MATERIAL_COLORS`. **Never read the JSON files whole**: they are single lines of 35–280 KB. |
| `geometry/math.js` | interpolation helpers (`lerp1D`, `field`), section normals |
| `geometry/sections.js` | blend table, `sectionCurve(z)`, geometry switches `BLADE_GEOM`, rotation sense `CHORD_MIRROR` / `leSign()` |
| `geometry/plies.js` | ply thickness (`EXAG`), the z/s grid, `sectionCache`, ply shell + cap geometry |
| `geometry/webs.js` | shear web sandwich panels and their caps |
| `geometry/curves.js` | anchor curves, web attachment curves, reference axis, rthick check |
| `scene/setup.js` | renderer (log depth buffer), camera, lights, grid, `coneRig` → `bladeRig`, `invalidate()` |
| `scene/blade-meshes.js` | cut plane (`clipLocal` → `clipPlane`), lazy wireframes, per-layer depth bias shader, ply/web meshes |
| `ui/layers-panel.js` | layer checkboxes, reference curves, cut slider (`updateCut`), exaggeration rebuild |
| `scene/references.js` | car / human (glTF), soccer field, Eiffel Tower |
| `scene/turbine.js` | full turbine: hub → arm → cone → pitch groups, per-blade clip planes + ply caps |
| `aero/physics.js` | polars, `makeStation`, `sectionAero` (velocities, α, L/D, Fn/Ft), `opState`, pitch |
| `aero/arrows.js` | solid 3D arrows, label sprites, which stations get arrows |
| `ui/section-window.js` | floating 2D section window (canvas) |
| `ui/operating.js` | rotor/pitch/wind sliders, geometry toggles, rotation-sense toggle, `rebuildBladeGeometry` |
| `nav/navigation.js` | picking, orbit/pan/roll/zoom, pivot gizmo |
| `main.js` | turbine/Eiffel framing, panel chrome, render-on-demand loop, pause, turbine cut sync |

## Conventions and traps

- **Blade frame:** span +X, chordwise Y, downwind +Z; upwind is −Z, and prebend points upwind. The detailed blade lies along world X; turbine blades use the same local frame.
- **Rotation sense = chordwise mirror.** Clockwise from upwind ⇔ `CHORD_MIRROR = -1` ⇔ leading edge at +Y. Every Y direction in the aero code is multiplied by `leSign()`. Flipping the mirror requires rebuilding the geometry *and* calling `setFrontIsOutward` on the ply materials, because the mirror flips the triangle winding.
- **Pitch:** positive pitch turns the LE upwind (toward feather), the same sense as twist. `pitchAngle()` / `pitchYZ()` are the single source of the sign.
- **Depth bias** (`withLayerDepthBias`): per-layer push in the fragment shader with log depth. **Only ever push away from the camera.** Pulling a surface forward makes the far wall pop through at silhouettes.
- **Cut plane:** defined in the blade frame (`clipLocal`, keep x ≤ cut) and mapped to world space every frame, for the coned detailed blade and for each spinning turbine blade. `material.clone()` deep-copies `clippingPlanes`, so re-share the live plane after cloning.
- **Mutable module state:** ES modules can't assign another module's `let`. Use the setter (`setExag`, `setChordMirror`), or mutate an exported object (`opState`, `BLADE_GEOM`).
- **Render on demand:** the loop only draws while something changes. Anything that changes the picture without a DOM event (async loads, timers) must call `invalidate()`.
- **Performance budget:** a full blade rebuild is ~45 ms. Wireframes are built lazily; don't build them eagerly.
- **Aero honesty:** quasi-steady 2D blade element with user-set induction. No BEM iteration, tip loss or 3D effects. Keep UI text consistent with that.

## Deploy

`.github/workflows/deploy.yml` builds and publishes `dist/` to GitHub Pages on every push to `main`. The repo's Pages source must be set to **GitHub Actions**.
