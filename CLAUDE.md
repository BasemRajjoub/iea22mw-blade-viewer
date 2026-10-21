# CLAUDE.md

Interactive three.js viewer of the IEA 22 MW reference wind turbine blade: real chord/twist/prebend, blended airfoils, 12 composite shell plies + shear webs, a full turbine, and quasi-steady blade-element aerodynamics. Plain JavaScript ES modules, built with Vite into **one standalone `dist/index.html`**.

## Commands

- `npm install` — once.
- `npm run dev` — dev server with live reload.
- `npm run build` — writes `dist/index.html`: all JS, CSS and JSON inlined and minified. It opens straight from disk (`file://`) with no network, except the optional car/human models and the Draco decoder, which load from a CDN.
- `python3 scripts/extract_yaml.py <IEA-22-280-RWT.yaml>` — regenerates `src/data/aero.json` and `src/data/structure.json`.

There is no test suite. Check changes in the browser. `window.viewer` exposes `{ scene, camera, renderer, frameView, state, set, setPaused }` for the console. `viewer.set("cut", 0.6)` drives the app exactly like the controls do.

## Layout

`src/main.js` imports every module **in a fixed order**: the order the original single-file script ran in. A module may use earlier modules at load time, never later ones. If a later module needs to call back, register the listener in a later module (see the turbine and Eiffel toggles in `main.js`).

| Module | What it holds |
|---|---|
| `state.js` | **every user setting** (`state`), `set(key, v)`, `on(keys, fn)`, `onAny(fn)`. The only link between the UI and the scene. |
| `data/` | `iea22.json` (blade geometry + layup), `aero.json` (rotor settings + cl/cd/cm polars), `structure.json` (spanwise mass, inertia, EA/EI/GJ), `MATERIAL_COLORS`. **Never read the JSON files whole**: they are single lines of 35–280 KB. |
| `geometry/math.js` | interpolation helpers (`lerp1D`, `field`), section normals |
| `geometry/sections.js` | blend table, `sectionCurve(z)`, geometry switches `BLADE_GEOM`, rotation sense `CHORD_MIRROR` / `leSign()` |
| `geometry/plies.js` | ply thickness (`EXAG`), the z/s grid, `sectionCache`, ply shell + cap geometry |
| `geometry/webs.js` | shear web sandwich panels and their caps |
| `geometry/curves.js` | anchor curves, web attachment curves, reference axis, rthick check |
| `scene/setup.js` | renderer (log depth buffer), camera, lights, grid, `coneRig` → `bladeRig`, `invalidate()` |
| `scene/blade-meshes.js` | cut plane (`clipLocal` → `clipPlane`), lazy wireframes, per-layer depth bias shader, ply/web meshes |
| `scene/curves-meshes.js` | line overlays: anchor curves, pitch axis, web attachment |
| `scene/cut.js` | reacts to `cut` / `exag` / `wireframe`: `updateCut`, `rebuildForExaggeration`, `stackAt`, `rthickAt` |
| `scene/references.js` | car / human (glTF), soccer field, Eiffel Tower |
| `scene/turbine.js` | full turbine: hub → arm → cone → pitch groups, per-blade clip planes + ply caps |
| `aero/physics.js` | polars, `makeStation`, `sectionAero(st, op, trace)` with the BEM solver (a, a′, Prandtl F, Glauert/Buhl) or fixed induction, `opState`, pitch |
| `aero/performance.js` | rotor integration (`rotorPerformance`: T, Q, P, Cp, Ct), the IEA controller (`controllerAt`: rpm + pitch vs wind, region 3 pitch by bisection), cached `powerCurve()`, `cpLambda()` |
| `aero/site.js` | wind shear, Weibull/Rayleigh, `annualEnergy`, `lcoe`, the V236 power curve (ex. 9) |
| `aero/design.js` | Betz / Schmitz optimum chord and twist (ex. 4, 5) |
| `aero/arrows.js` | solid 3D arrows, label sprites, which stations get arrows |
| `aero/operating.js` | reacts to rotor / wind / induction-model / geometry / rotation-sense keys: pitch, precone, `rebuildBladeGeometry`, arrows, "follow the controller" |
| `scene/teaching.js` | 3D teaching aids: wind-shear arrow column, Betz stream tube, ghost Betz/Schmitz blade |
| `nav/navigation.js` | picking, orbit/pan/roll/zoom, pivot gizmo |
| `ui/window-manager.js` | dock + floating windows (`createWindow`, `getWindow`): drag, resize, Details toggle, persistence |
| `ui/controls.js` | lil-gui helpers: `panel`, `bind(gui, key, ...)`, `button`, `readout`, `note`, `legend` |
| `ui/section-plot.js` | draws the 2D section (canvas + numbers), with zoom/pan view and arrow-scale sliders |
| `ui/plot.js` | `LinePlot` (canvas line chart: max 3 series in the validated palette, legend + end labels, hover tooltip, log axis, marker) and `plotTable` |
| `ui/windows/*.js` | one file per window (layers, cut, geometry, rotor, aero, performance, section2d, plots, airfoils, design, site, scale, help, exercises). Dock order = import order in `main.js`; `exercises.js` is imported last (it drives the others through their `show…()` exports) and puts its button on top with `first: true`. |
| `main.js` | turbine/Eiffel framing, dock actions (pause, reset view, About), render-on-demand loop, turbine cut sync |

## UI pattern

- **Scene modules never touch the DOM.** They read `state` and subscribe with `on()`. Windows only create controls and readouts.
- **A control is `bind(gui, "key", ...)`.** The same key can be bound in several windows (cut, pitch and rpm already are) and stays in sync automatically. A new setting means: add the key to `state.js`, react to it in a scene module, and bind it in a window.
- **Details:** the essentials go in `win.main`; numbers, explanations and advanced overlays go in `win.details`, shown by the window's Details toggle.
- **New window:** `createWindow({ id, title, icon, width, details })` in a new `ui/windows/x.js`, imported from `main.js` after the other windows.

## Conventions and traps

- **Blade frame:** span +X, chordwise Y, downwind +Z; upwind is −Z, and prebend points upwind. The detailed blade lies along world X; turbine blades use the same local frame.
- **Rotation sense = chordwise mirror.** Clockwise from upwind ⇔ `CHORD_MIRROR = -1` ⇔ leading edge at +Y. Every Y direction in the aero code is multiplied by `leSign()`. Flipping the mirror requires rebuilding the geometry *and* calling `setFrontIsOutward` on the ply materials, because the mirror flips the triangle winding.
- **Pitch:** positive pitch turns the LE upwind (toward feather), the same sense as twist. `pitchAngle()` / `pitchYZ()` are the single source of the sign.
- **Depth bias** (`withLayerDepthBias`): per-layer push in the fragment shader with log depth. **Only ever push away from the camera.** Pulling a surface forward makes the far wall pop through at silhouettes.
- **Cut plane:** defined in the blade frame (`clipLocal`, keep x ≤ cut) and mapped to world space every frame, for the coned detailed blade and for each spinning turbine blade. `material.clone()` deep-copies `clippingPlanes`, so re-share the live plane after cloning.
- **Mutable module state:** ES modules can't assign another module's `let`. User settings live in `state.js`; geometry internals use setters (`setExag`, `setChordMirror`) or exported objects (`opState`, `BLADE_GEOM`), which `aero/operating.js` and `scene/cut.js` keep in sync with `state`.
- **Render on demand:** the loop only draws while something changes. Every `state` change and DOM event triggers a redraw; anything else that changes the picture (async loads, timers) must call `invalidate()`.
- **Performance budget:** a full blade rebuild is ~45 ms. Wireframes are built lazily; don't build them eagerly.
- **Aero model:** steady BEM by default (`state.inductionModel = "bem"`), fixed induction as a teaching option. Region-2 Cp ≈ 0.48, rated reached just above 10 m/s, 24° pitch at 25 m/s. Aero power only (no drivetrain losses), uniform inflow. Keep UI text consistent with that.
- **Redraws:** windows with heavy plots subscribe with `batched(redraw)` (ui/controls.js), so a preset that sets ten keys redraws once. Anything aero-dependent listens to `AERO_KEYS` (state.js).
- **Exercise presets** only call `set()` and open windows; they never compute. Numbers were checked against the sheets' solutions (ex. 1 shear/Rayleigh, ex. 4/5 Betz/Schmitz, ex. 9 AEP/LCOE).
- **Charts:** use `LinePlot`; at most 3 series per chart (palette validated for 3); a quantity with more lines becomes a selector, not more colours.

## Deploy

`.github/workflows/deploy.yml` builds and publishes `dist/` to GitHub Pages on every push to `main`. The repo's Pages source must be set to **GitHub Actions**.
