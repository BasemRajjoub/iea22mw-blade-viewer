# IEA 22 MW RWT — Blade Ply-Layup Viewer

Interactive 3D viewer of the [IEA 22 MW Reference Wind Turbine](https://github.com/IEAWindTask37/IEA-22-280-RWT) blade, showing its **real composite ply layup** — actual chord, twist, prebend, blended airfoils, and the 12 shell layers + 3 shear webs straight from the WindIO YAML.

**[▶ Live demo](https://basemrajjoub.github.io/iea22mw-blade-viewer/)** · single self-contained `index.html`, no build step.

## Run it

- **Online:** open the live demo link.
- **Local:** open `index.html` in any modern browser (needs internet on first load — three.js is pulled from a CDN).

## Controls

- **Mouse / touch** — orbit, zoom, pan.
- **Layer checkboxes** — show/hide each shell ply, shear web, reference curve, or the pitch axis.
- **Cut slider** — clip the blade along the span and fill the revealed cross-section live.
- **Exaggeration slider** — scale ply thickness 1×–10× (real plies are thin relative to the blade).
- **Wireframe** — overlay the mesh.
- The side panel lists the exact, unexaggerated ply stack (thickness in mm + fiber angle) at the current cut station.

## How it works

`index.html` embeds the blade definition as JSON (exported from the WindIO YAML) and builds every ply as an offset shell in [three.js](https://threejs.org/). Ply-drop edges render as genuine hard steps — this is a geometry-verification view, not a beautified render.

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. **Settings → Pages → Build from a branch → `main` / root.**
3. Open `https://<user>.github.io/<repo>/`.

## License

[MIT](LICENSE) © 2026 Basem Rajjoub. Blade geometry derives from the IEA 22 MW RWT (WindIO), also open-source.
