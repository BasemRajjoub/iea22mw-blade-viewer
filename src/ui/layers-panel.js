import * as THREE from "three";
import { IEA22, MATERIAL_COLORS } from "../data/index.js";
import { field } from "../geometry/math.js";
import { BLADE_LENGTH, chordAt, sectionCurve } from "../geometry/sections.js";
import { EXAG, LAYERS, buildCapGeometry, buildPlyShell, setExag } from "../geometry/plies.js";
import { WEBS, buildWebCapGeometry, buildWebPly } from "../geometry/webs.js";
import { ANCHORS, ANCHOR_COLORS, buildAnchorCurve, buildRefAxisCurve, buildWebAttachCurve, computedRthick } from "../geometry/curves.js";
import { bladeRig } from "../scene/setup.js";
import { _noWire, capMeshes, capWireframes, clipLocal, endCapMeshes, plyGroups, plyMeshes, plyWireframes, setWireSource, syncClipPlane } from "../scene/blade-meshes.js";

// =====================================================================
// UI
// =====================================================================

const plyListEl = document.getElementById("plyList");
LAYERS.forEach((layer) => {
  const row = document.createElement("label");
  row.className = "row";
  const cb = document.createElement("input");
  cb.type = "checkbox"; cb.checked = true;
  cb.addEventListener("change", () => { plyGroups[layer.name].visible = cb.checked; });
  const sw = document.createElement("span");
  sw.className = "swatch";
  sw.style.background = MATERIAL_COLORS[layer.material] || "#999";
  const txt = document.createElement("span");
  txt.textContent = layer.name.replace(/_/g, " ");
  row.appendChild(cb); row.appendChild(sw); row.appendChild(txt);
  plyListEl.appendChild(row);
});

const webHeader = document.createElement("div");
webHeader.textContent = "Shear webs";
webHeader.style.cssText = "font-size:11px; color:#9aa3af; margin:8px 0 2px; text-transform:uppercase; letter-spacing:0.03em;";
plyListEl.appendChild(webHeader);

WEBS.forEach((webLayer) => {
  const row = document.createElement("label");
  row.className = "row";
  const cb = document.createElement("input");
  cb.type = "checkbox"; cb.checked = true;
  cb.addEventListener("change", () => { plyGroups[webLayer.name].visible = cb.checked; });
  const sw = document.createElement("span");
  sw.className = "swatch";
  sw.style.background = MATERIAL_COLORS[webLayer.material] || "#999";
  const txt = document.createElement("span");
  txt.textContent = webLayer.name.replace(/_/g, " ");
  row.appendChild(cb); row.appendChild(sw); row.appendChild(txt);
  plyListEl.appendChild(row);
});

const anchorLines = {};
Object.keys(ANCHORS).forEach(name => {
  const a = ANCHORS[name];
  const color = ANCHOR_COLORS[name] || 0xffffff;
  const group = new THREE.Group();
  if (a.start) {
    const line = new THREE.Line(buildAnchorCurve(a.start), new THREE.LineBasicMaterial({ color, linewidth: 2 }));
    group.add(line);
  }
  if (a.end) {
    const line = new THREE.Line(buildAnchorCurve(a.end), new THREE.LineBasicMaterial({ color, linewidth: 2 }));
    group.add(line);
  }
  group.visible = false;
  bladeRig.add(group);
  anchorLines[name] = group;
});

const anchorHeader = document.createElement("div");
anchorHeader.textContent = "Reference curves (anchors)";
anchorHeader.style.cssText = "font-size:11px; color:#9aa3af; margin:8px 0 2px; text-transform:uppercase; letter-spacing:0.03em;";
plyListEl.appendChild(anchorHeader);

Object.keys(ANCHORS).forEach(name => {
  const row = document.createElement("label");
  row.className = "row";
  const cb = document.createElement("input");
  cb.type = "checkbox"; cb.checked = false;
  cb.addEventListener("change", () => { anchorLines[name].visible = cb.checked; });
  const sw = document.createElement("span");
  sw.className = "swatch";
  sw.style.background = "#" + (ANCHOR_COLORS[name]||0xffffff).toString(16).padStart(6,"0");
  const txt = document.createElement("span");
  txt.textContent = name.replace(/_/g, " ");
  row.appendChild(cb); row.appendChild(sw); row.appendChild(txt);
  plyListEl.appendChild(row);
});

const ALL_PLY_NAMES = [...LAYERS.map(l => l.name), ...WEBS.map(w => w.name)];

const refAxisGroup = new THREE.Group();
const refAxisLine = new THREE.Line(buildRefAxisCurve(), new THREE.LineBasicMaterial({ color: 0xff6b6b }));
refAxisGroup.add(refAxisLine);
refAxisGroup.visible = false;
bladeRig.add(refAxisGroup);
{
  const row = document.createElement("label");
  row.className = "row";
  const cb = document.createElement("input");
  cb.type = "checkbox"; cb.checked = false;
  cb.addEventListener("change", () => { refAxisGroup.visible = cb.checked; });
  const sw = document.createElement("span");
  sw.className = "swatch";
  sw.style.background = "#ff6b6b";
  const txt = document.createElement("span");
  txt.textContent = "reference (pitch) axis";
  row.appendChild(cb); row.appendChild(sw); row.appendChild(txt);
  plyListEl.appendChild(row);
}

const attachHeader = document.createElement("div");
attachHeader.textContent = "Web attachment points (actual, inside shell)";
attachHeader.style.cssText = "font-size:11px; color:#9aa3af; margin:8px 0 2px; text-transform:uppercase; letter-spacing:0.03em;";
plyListEl.appendChild(attachHeader);

const attachLines = {};
const ATTACH_COLORS = { web0: 0x00e5ff, web1: 0x00ff88, web2: 0xffee00 };
['web0', 'web1', 'web2'].forEach(webName => {
  const color = ATTACH_COLORS[webName];
  const group = new THREE.Group();
  ['A', 'B'].forEach(which => {
    const line = new THREE.Line(
      buildWebAttachCurve(webName, which),
      new THREE.LineBasicMaterial({ color })
    );
    group.add(line);
  });
  group.visible = false;
  bladeRig.add(group);
  attachLines[webName] = group;

  const row = document.createElement("label");
  row.className = "row";
  const cb = document.createElement("input");
  cb.type = "checkbox"; cb.checked = false;
  cb.addEventListener("change", () => { group.visible = cb.checked; });
  const sw = document.createElement("span");
  sw.className = "swatch";
  sw.style.background = "#" + color.toString(16).padStart(6, "0");
  const txt = document.createElement("span");
  txt.textContent = webName + " true attach (A+B)";
  row.appendChild(cb); row.appendChild(sw); row.appendChild(txt);
  plyListEl.appendChild(row);
});

const wireToggle = document.getElementById("wireToggle");
wireToggle.addEventListener("change", () => {
  ALL_PLY_NAMES.forEach(name => {
    // build any wireframe skipped while hidden (see setWireSource)
    [plyWireframes[name].outer, plyWireframes[name].inner, capWireframes[name]].forEach(l => {
      if (wireToggle.checked && l.geometry === _noWire && l.userData.src) setWireSource(l, l.userData.src);
    });
    plyWireframes[name].outer.visible = wireToggle.checked;
    plyWireframes[name].inner.visible = wireToggle.checked;
    capWireframes[name].visible = wireToggle.checked && capMeshes[name].visible;
  });
});

const slider = document.getElementById("cutSlider");
const cutValueLabel = document.getElementById("cutValue");
const statLine = document.getElementById("statLine");

function updateCut(zCut) {
  clipLocal.constant = sectionCurve(zCut).X;
  syncClipPlane();
  cutValueLabel.textContent = "z = " + zCut.toFixed(2) + "  (R=" + clipLocal.constant.toFixed(1) + "m, chord=" + chordAt(zCut).toFixed(2) + "m)";

  // --- stack readout: every ply actually present at this station, with
  // its REAL (non-exaggerated) thickness and fiber angle straight from
  // the YAML ---
  const rows = [];
  LAYERS.forEach(layer => {
    const t = field(layer.thickness, zCut);
    if (t > 1e-6) rows.push({ name: layer.name, mm: t*1000, deg: field(layer.fiberOrientation, zCut) });
  });
  WEBS.forEach(w => {
    const t = field(w.thickness, zCut);
    if (t > 1e-6) rows.push({ name: w.name, mm: t*1000, deg: field(w.fiberOrientation, zCut) });
  });
  let html = "<b>Stack at this station (real, unexaggerated):</b><br/>";
  rows.forEach(r => {
    html += r.name.padEnd(20,"\u00A0") + r.mm.toFixed(1) + "\u00A0mm&nbsp;&nbsp;" + r.deg.toFixed(0) + "\u00B0<br/>";
  });
  document.getElementById("stackReadout").innerHTML = html;

  // --- rthick sanity check: YAML-stated t/c vs. what the blended airfoil
  // geometry actually produces ---
  const rthickYaml = field(IEA22.rthick, zCut);
  const rthickComputed = computedRthick(zCut);
  document.getElementById("rthickCheck").textContent =
    `rthick check: YAML=${(rthickYaml*100).toFixed(1)}%  computed=${(rthickComputed*100).toFixed(1)}%  Δ=${((rthickComputed-rthickYaml)*100).toFixed(2)}pp`;

  LAYERS.forEach((layer, idx) => {
    const { geom, anyThickness } = buildCapGeometry(idx, zCut);
    capMeshes[layer.name].geometry.dispose();
    capMeshes[layer.name].geometry = geom;
    capMeshes[layer.name].visible = anyThickness;

    setWireSource(capWireframes[layer.name], geom);
    capWireframes[layer.name].visible = wireToggle.checked && anyThickness;
  });

  WEBS.forEach((webLayer) => {
    const { geom, anyThickness } = buildWebCapGeometry(webLayer, zCut);
    capMeshes[webLayer.name].geometry.dispose();
    capMeshes[webLayer.name].geometry = geom;
    capMeshes[webLayer.name].visible = anyThickness;

    setWireSource(capWireframes[webLayer.name], geom);
    capWireframes[webLayer.name].visible = wireToggle.checked && anyThickness;
  });
}
slider.addEventListener("input", () => updateCut(parseFloat(slider.value)));
updateCut(parseFloat(slider.value));

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

  updateCut(parseFloat(slider.value)); // caps depend on EXAG too -- refresh them
}

const exagSlider = document.getElementById("exagSlider");
const exagValueLabel = document.getElementById("exagValue");
let _exagQueued = false;   // a drag fires many input events; rebuild at most once per frame
exagSlider.addEventListener("input", () => {
  setExag(parseFloat(exagSlider.value));
  exagValueLabel.textContent = EXAG.toFixed(1) + "x";
  if (_exagQueued) return;
  _exagQueued = true;
  requestAnimationFrame(() => {
    _exagQueued = false;
    rebuildForExaggeration();
    statLine.textContent = `Blade length ${BLADE_LENGTH.toFixed(1)} m · ${LAYERS.length} shell layers + ${WEBS.length} web sublayers · thickness x${EXAG.toFixed(1)}`;
  });
});

statLine.textContent = `Blade length ${BLADE_LENGTH.toFixed(1)} m · ${LAYERS.length} shell layers + ${WEBS.length} web sublayers · thickness x${EXAG}`;

export { ALL_PLY_NAMES, anchorLines, attachLines, rebuildForExaggeration, refAxisLine, slider };
