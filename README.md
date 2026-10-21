# IEA 22 MW RWT — Blade Ply-Layup Viewer

Interactive 3D viewer of the [IEA 22 MW Reference Wind Turbine](https://github.com/IEAWindTask37/IEA-22-280-RWT) blade, showing its **real composite ply layup** — actual chord, twist, prebend, blended airfoils, and the 12 shell layers + 3 shear webs straight from the WindIO YAML.

**[▶ Live demo](https://basemrajjoub.github.io/iea22mw-blade-viewer/)** · builds to a single self-contained `index.html` that also works offline from disk.




https://github.com/user-attachments/assets/88ad2781-a8b6-405f-81f3-a04ad9e11a13



![IEA 22MW blade clipped at z=0.30, showing spar caps, shear webs, TE filler and the full composite ply stack](image.png)

## Run it

- **Online:** open the live demo link.
- **Standalone file:** run `npm install && npm run build`, then open `dist/index.html` in any modern browser — everything (three.js, data, styles) is inlined, so it works offline and can be shared as one file.
- **Develop:** `npm run dev` starts a live-reloading dev server.

## Controls

- **Navigation** — left-drag orbits about the exact surface point under the cursor, right/shift-drag pans (the grabbed point stays under the cursor), Ctrl/Alt-drag rolls the view about the screen centre, wheel zooms toward the cursor. Touch: one finger orbits, two fingers pan and pinch-zoom. A small gizmo marks the pivot while you move; **Reset view** levels everything again.
- **Layer checkboxes** — show/hide each shell ply, shear web, reference curve, or the pitch axis.
- **Cut slider** — clip the blade along the span and fill the revealed cross-section live; optionally applied to the three turbine blades too.
- **Exaggeration slider** — scale ply thickness 1×–10× (real plies are thin relative to the blade).
- **Wireframe** — overlay the mesh.
- **Blade geometry** — switch pre-twist, prebend, presweep (zero for this blade) and the 4° hub precone on/off to see each one's effect.
- **Rotor & pitch** — rotor speed and blade pitch (defaults: rated 7.06 rpm, fine pitch −4.0°); the rotor turns clockwise seen from upwind, leading edge first (a checkbox flips it to counter-clockwise, mirroring the blade). **Pause** (or Space) freezes it so the arrows can be inspected.
- **Wind & aero** — leading-edge velocity triangles (axial U(1−a), rotational Ωr, relative W) and quarter-chord forces (lift, drag, resultant, thrust and driving components) from the YAML airfoil polars, at five span stations plus the cut station — or only at the cut, optionally with a value-label block.
- **2D section window** — the section at the cut, seen from the tip, with the velocity triangle, the φ / β / α angles, the forces and their values. Drag it by its title bar, resize it from the corner, and flip it to put the suction side on top.
- The side panel lists the exact, unexaggerated ply stack (thickness in mm + fiber angle) at the current cut station.

The aerodynamics are quasi-steady 2D blade-element estimates with a user-set axial induction (default 1/3) — no BEM iteration, tip loss or 3D effects.

## How it works

The source is plain JavaScript ES modules under `src/` (geometry, scene, aero, UI, navigation), with the blade definition and airfoil polars as JSON in `src/data/` (extracted from the WindIO YAML; `scripts/extract_yaml.py` regenerates the polars). Every ply is built as an offset shell in [three.js](https://threejs.org/); ply-drop edges render as genuine hard steps — this is a geometry-verification view, not a beautified render. [Vite](https://vitejs.dev/) with `vite-plugin-singlefile` bundles it all into one minified HTML file. See [CLAUDE.md](CLAUDE.md) for the module map and conventions.

## Deploy to GitHub Pages

The workflow in `.github/workflows/deploy.yml` builds and publishes on every push to `main`:

1. **Settings → Pages → Source: GitHub Actions.**
2. Push to `main`, then open `https://<user>.github.io/<repo>/`.

## License

[MIT](LICENSE) © 2026 Basem Rajjoub. Blade geometry derives from the IEA 22 MW RWT (WindIO), also open-source.
