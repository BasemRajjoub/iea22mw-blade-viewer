import { IEA22_AERO } from "../data/index.js";
import { BLADE_GEOM, CHORD_MIRROR, sectionCurve, setChordMirror } from "../geometry/sections.js";
import { LAYERS, sectionCache, zGrid } from "../geometry/plies.js";
import { ANCHORS, buildAnchorCurve, buildRefAxisCurve, buildWebAttachCurve } from "../geometry/curves.js";
import { bladeRig, coneRig } from "../scene/setup.js";
import { plyMeshes } from "../scene/blade-meshes.js";
import { anchorLines, attachLines, rebuildForExaggeration, refAxisLine, slider } from "./layers-panel.js";
import { RATED_RPM, buildOmlGeometry, turbineBlades, turbineConeGroups, turbinePitchGroups, turbineWindGroups } from "../scene/turbine.js";
import { PRESWEEP_IN_YAML, ROTOR_RADIUS, computeLeStations, leStations, opState, pitchAngle, sectionAero } from "../aero/physics.js";
import { arrowStations, cutOnlyToggle, fillAeroArrows, forceToggle, labels3dToggle, windGroupMain, windToggle } from "../aero/arrows.js";
import { drawSectionView } from "./section-window.js";

const rpmSlider = document.getElementById("rpmSlider");
const pitchSlider = document.getElementById("pitchSlider");
const windSlider = document.getElementById("windSlider");
const inducSlider = document.getElementById("inducSlider");
rpmSlider.value = RATED_RPM;
pitchSlider.value = IEA22_AERO.finePitchDeg;

function updateOperatingPoint() {
  opState.rpm = parseFloat(rpmSlider.value);
  opState.pitchDeg = parseFloat(pitchSlider.value);
  opState.wind = parseFloat(windSlider.value);
  opState.induction = parseFloat(inducSlider.value);
  const omega = opState.rpm * 2*Math.PI / 60;

  document.getElementById("rpmValue").textContent =
    opState.rpm.toFixed(2) + " rpm" + (Math.abs(opState.rpm - RATED_RPM) < 0.005 ? " (rated)" : "");
  document.getElementById("pitchValue").textContent =
    opState.pitchDeg.toFixed(1) + "°" + (Math.abs(opState.pitchDeg - IEA22_AERO.finePitchDeg) < 0.05 ? " (fine pitch)" : "");
  document.getElementById("windValue").textContent = opState.wind.toFixed(1) + " m/s";
  document.getElementById("inducValue").textContent = opState.induction.toFixed(2);
  document.getElementById("opReadout").textContent =
    `tip speed ${(omega*ROTOR_RADIUS).toFixed(1)} m/s · TSR ${(omega*ROTOR_RADIUS/opState.wind).toFixed(2)} (optimum ${IEA22_AERO.optimalTsr})`;

  const st = leStations[leStations.length-1], a = sectionAero(st);
  document.getElementById("windReadout").innerHTML =
    `at r = ${a.r.toFixed(1)} m (r/R ${(a.r/ROTOR_RADIUS).toFixed(2)})<br/>` +
    `W ${a.W.toFixed(1)} m/s · inflow φ ${a.phi.toFixed(1)}°<br/>` +
    `twist+pitch ${a.beta.toFixed(1)}° → α ${a.alpha.toFixed(1)}° · Cl ${a.cl.toFixed(2)} · Cd ${a.cd.toFixed(3)}<br/>` +
    `thrust ${(a.Fn/1000).toFixed(2)} kN/m · driving ${(a.Ft/1000).toFixed(2)} kN/m`;

  bladeRig.rotation.x = pitchAngle();
  turbinePitchGroups.forEach(g => { g.rotation.x = pitchAngle(); });

  refreshAeroArrows();
  drawSectionView();
}
function refreshAeroArrows() {
  const stations = (windToggle.checked || forceToggle.checked) ? arrowStations() : [];
  [windGroupMain, ...turbineWindGroups].forEach(g => {
    g.visible = stations.length > 0;
    fillAeroArrows(g, stations, g === windGroupMain);
  });
}
[rpmSlider, pitchSlider, windSlider, inducSlider].forEach(el => el.addEventListener("input", updateOperatingPoint));
[windToggle, forceToggle, cutOnlyToggle, labels3dToggle].forEach(el => el.addEventListener("change", updateOperatingPoint));

document.getElementById("rotCW").addEventListener("change", (e) => {
  setChordMirror(e.target.checked ? -1 : 1);
  rebuildBladeGeometry();
  LAYERS.forEach(l => {   // the mirror flips the winding, so swap which face is "outside"
    plyMeshes[l.name].outer.material.userData.setFrontIsOutward(CHORD_MIRROR > 0);
    plyMeshes[l.name].inner.material.userData.setFrontIsOutward(CHORD_MIRROR < 0);
  });
  updateOperatingPoint();
});

// --- blade geometry toggles: twist / prebend / presweep rebuild every
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
[["geoTwist", "twist"], ["geoPrebend", "prebend"], ["geoSweep", "sweep"], ["geoPrecone", "precone"]].forEach(([id, key]) => {
  const cb = document.getElementById(id);
  cb.checked = BLADE_GEOM[key];
  cb.addEventListener("change", () => {
    BLADE_GEOM[key] = cb.checked;
    if (key === "precone") applyPrecone(); else rebuildBladeGeometry();
    updateOperatingPoint();
  });
});
if (!PRESWEEP_IN_YAML) {
  const cb = document.getElementById("geoSweep");
  cb.disabled = true;
  cb.parentElement.title = "The IEA 22 MW blade has no presweep (reference axis y = 0 along the span)";
  cb.nextElementSibling.textContent += " (none in YAML)";
}
document.getElementById("coneLabel").textContent = IEA22_AERO.coneDeg.toFixed(1);
applyPrecone();
slider.addEventListener("input", () => { refreshAeroArrows(); drawSectionView(); });
updateOperatingPoint();
