import { IEA22 } from "../data/index.js";
import { field } from "../geometry/math.js";
import { sectionCurve } from "../geometry/sections.js";
import { LAYERS, buildCapGeometry, buildPlyShell, setExag } from "../geometry/plies.js";
import { WEBS, buildWebCapGeometry, buildWebPly } from "../geometry/webs.js";
import { computedRthick } from "../geometry/curves.js";
import { _noWire, capMeshes, capWireframes, clipLocal, endCapMeshes, plyMeshes, plyWireframes, setWireSource, syncClipPlane } from "./blade-meshes.js";
import { ALL_PLY_NAMES } from "./curves-meshes.js";
import { on, state } from "../state.js";

// The section cut (state.cut), ply thickness exaggeration (state.exag) and
// wireframe overlay (state.wireframe) of the detailed blade.

function updateCut(zCut) {
  clipLocal.constant = sectionCurve(zCut).X;
  syncClipPlane();

  LAYERS.forEach((layer, idx) => {
    const { geom, anyThickness } = buildCapGeometry(idx, zCut);
    capMeshes[layer.name].geometry.dispose();
    capMeshes[layer.name].geometry = geom;
    capMeshes[layer.name].visible = anyThickness;

    setWireSource(capWireframes[layer.name], geom);
    capWireframes[layer.name].visible = state.wireframe && anyThickness;
  });

  WEBS.forEach((webLayer) => {
    const { geom, anyThickness } = buildWebCapGeometry(webLayer, zCut);
    capMeshes[webLayer.name].geometry.dispose();
    capMeshes[webLayer.name].geometry = geom;
    capMeshes[webLayer.name].visible = anyThickness;

    setWireSource(capWireframes[webLayer.name], geom);
    capWireframes[webLayer.name].visible = state.wireframe && anyThickness;
  });
}

function rebuildForExaggeration() {
  LAYERS.forEach((layer, idx) => {
    const { outerGeom, innerGeom } = buildPlyShell(idx);
    const meshes = plyMeshes[layer.name];
    meshes.outer.geometry.dispose(); meshes.outer.geometry = outerGeom;
    meshes.inner.geometry.dispose(); meshes.inner.geometry = innerGeom;

    const wf = plyWireframes[layer.name];
    setWireSource(wf.outer, outerGeom);
    setWireSource(wf.inner, innerGeom);

    const ec = endCapMeshes[layer.name];
    const { geom: rootGeom, anyThickness: rootEx } = buildCapGeometry(idx, 0.0, -1);
    ec.root.geometry.dispose(); ec.root.geometry = rootGeom; ec.root.visible = rootEx;
    const { geom: tipGeom, anyThickness: tipEx } = buildCapGeometry(idx, 1.0, 1);
    ec.tip.geometry.dispose(); ec.tip.geometry = tipGeom; ec.tip.visible = tipEx;
  });

  WEBS.forEach((webLayer) => {
    const { outerGeom, innerGeom } = buildWebPly(webLayer);
    const meshes = plyMeshes[webLayer.name];
    meshes.outer.geometry.dispose(); meshes.outer.geometry = outerGeom;
    meshes.inner.geometry.dispose(); meshes.inner.geometry = innerGeom;

    const wf = plyWireframes[webLayer.name];
    setWireSource(wf.outer, outerGeom);
    setWireSource(wf.inner, innerGeom);

    const ec = endCapMeshes[webLayer.name];
    const { geom: rootGeom, anyThickness: rootEx } = buildWebCapGeometry(webLayer, 0.0, -1);
    ec.root.geometry.dispose(); ec.root.geometry = rootGeom; ec.root.visible = rootEx;
    const { geom: tipGeom, anyThickness: tipEx } = buildWebCapGeometry(webLayer, 1.0, 1);
    ec.tip.geometry.dispose(); ec.tip.geometry = tipGeom; ec.tip.visible = tipEx;
  });

  updateCut(state.cut); // caps depend on EXAG too -- refresh them
}

let _exagQueued = false;   // a drag fires many changes; rebuild at most once per frame
on("exag", (v) => {
  setExag(v);
  if (_exagQueued) return;
  _exagQueued = true;
  requestAnimationFrame(() => { _exagQueued = false; rebuildForExaggeration(); });
});
on("cut", (z) => updateCut(z));

on("wireframe", () => {
  ALL_PLY_NAMES.forEach(name => {
    // build any wireframe skipped while hidden (see setWireSource)
    [plyWireframes[name].outer, plyWireframes[name].inner, capWireframes[name]].forEach(l => {
      if (state.wireframe && l.geometry === _noWire && l.userData.src) setWireSource(l, l.userData.src);
    });
    plyWireframes[name].outer.visible = state.wireframe;
    plyWireframes[name].inner.visible = state.wireframe;
    capWireframes[name].visible = state.wireframe && capMeshes[name].visible;
  });
});

// every ply present at station z, with its real (unexaggerated) thickness
// and fibre angle straight from the YAML
function stackAt(z) {
  const rows = [];
  [...LAYERS, ...WEBS].forEach(l => {
    const t = field(l.thickness, z);
    if (t > 1e-6) rows.push({ name: l.name, mm: t*1000, deg: field(l.fiberOrientation, z) });
  });
  return rows;
}

// relative thickness t/c: YAML-stated vs. what the blended airfoils produce
function rthickAt(z) { return { yaml: field(IEA22.rthick, z), computed: computedRthick(z) }; }

updateCut(state.cut);

export { rebuildForExaggeration, rthickAt, stackAt, updateCut };
