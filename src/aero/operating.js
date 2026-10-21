import { IEA22_AERO } from "../data/index.js";
import { BLADE_GEOM, CHORD_MIRROR, sectionCurve, setChordMirror } from "../geometry/sections.js";
import { LAYERS, sectionCache, zGrid } from "../geometry/plies.js";
import { ANCHORS, buildAnchorCurve, buildRefAxisCurve, buildWebAttachCurve } from "../geometry/curves.js";
import { bladeRig, coneRig } from "../scene/setup.js";
import { plyMeshes } from "../scene/blade-meshes.js";
import { anchorLines, attachLines, refAxisLine } from "../scene/curves-meshes.js";
import { rebuildForExaggeration } from "../scene/cut.js";
import { buildOmlGeometry, turbineBlades, turbineConeGroups, turbinePitchGroups, turbineWindGroups } from "../scene/turbine.js";
import { computeLeStations, opState, pitchAngle } from "./physics.js";
import { arrowStations, fillAeroArrows, windGroupMain } from "./arrows.js";
import { on, state } from "../state.js";

// Applies the rotor / wind / geometry settings from the shared state to the
// scene: operating point, pitch of both blades, precone, rotation sense,
// geometry switches, and the 3D aero arrows. No DOM access here -- the
// windows in ui/windows/ own the controls and readouts.

function applyOperatingPoint() {
  opState.rpm = state.rpm;
  opState.pitchDeg = state.pitch;
  opState.wind = state.wind;
  opState.induction = state.induction;
  bladeRig.rotation.x = pitchAngle();
  turbinePitchGroups.forEach(g => { g.rotation.x = pitchAngle(); });
  refreshAeroArrows();
}

function refreshAeroArrows() {
  const stations = (state.showVelocities || state.showForces) ? arrowStations() : [];
  [windGroupMain, ...turbineWindGroups].forEach(g => {
    g.visible = stations.length > 0;
    fillAeroArrows(g, stations, g === windGroupMain);
  });
}

// --- blade geometry switches: twist / prebend / presweep rebuild every
// section; precone just tilts the blade about the hub's tangential axis ---
function applyPrecone() {
  const c = BLADE_GEOM.precone ? IEA22_AERO.coneDeg * Math.PI/180 : 0;   // tips move upwind (-Z)
  coneRig.rotation.y = c;
  turbineConeGroups.forEach(g => { g.rotation.y = c; });
}
function rebuildBladeGeometry() {
  zGrid.forEach((z, i) => { sectionCache[i] = sectionCurve(z); });
  rebuildForExaggeration();            // plies, webs, end caps and the cut caps
  Object.keys(ANCHORS).forEach(name => {
    let k = 0;
    ["start", "end"].forEach(w => {
      if (!ANCHORS[name][w]) return;
      const line = anchorLines[name].children[k++];
      line.geometry.dispose(); line.geometry = buildAnchorCurve(ANCHORS[name][w]);
    });
  });
  Object.keys(attachLines).forEach(web => attachLines[web].children.forEach((line, k) => {
    line.geometry.dispose(); line.geometry = buildWebAttachCurve(web, k ? "B" : "A");
  }));
  refAxisLine.geometry.dispose(); refAxisLine.geometry = buildRefAxisCurve();
  const oml = buildOmlGeometry();
  turbineBlades[0].mesh.geometry.dispose();
  turbineBlades.forEach(b => { b.mesh.geometry = oml; });
  computeLeStations();
}

on(["twist", "prebend", "sweep", "precone"], (v, key) => {
  BLADE_GEOM[key] = v;
  if (key === "precone") applyPrecone(); else rebuildBladeGeometry();
  applyOperatingPoint();
});

on("clockwise", (cw) => {
  setChordMirror(cw ? -1 : 1);
  rebuildBladeGeometry();
  LAYERS.forEach(l => {   // the mirror flips the winding, so swap which face is "outside"
    plyMeshes[l.name].outer.material.userData.setFrontIsOutward(CHORD_MIRROR > 0);
    plyMeshes[l.name].inner.material.userData.setFrontIsOutward(CHORD_MIRROR < 0);
  });
  applyOperatingPoint();
});

on(["rpm", "pitch", "wind", "induction"], applyOperatingPoint);
on(["showVelocities", "showForces", "arrowsCutOnly", "labels3d", "cut"], refreshAeroArrows);

Object.keys(BLADE_GEOM).forEach(k => { BLADE_GEOM[k] = state[k]; });
applyPrecone();
applyOperatingPoint();

export { rebuildBladeGeometry };
