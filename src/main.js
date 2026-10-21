// Entry point. Modules are evaluated in this order (the order the original
// single-file script ran in); later modules may use earlier ones at load
// time, never the other way round.
import "./styles.css";
import "./geometry/math.js";
import "./geometry/sections.js";
import "./geometry/plies.js";
import "./geometry/webs.js";
import "./geometry/curves.js";
import "./scene/setup.js";
import "./scene/blade-meshes.js";
import "./ui/layers-panel.js";
import "./scene/references.js";
import "./scene/turbine.js";
import "./aero/physics.js";
import "./aero/arrows.js";
import "./ui/section-window.js";
import "./ui/operating.js";
import "./nav/navigation.js";
import * as THREE from "three";
import { BLADE_LENGTH, leSign } from "./geometry/sections.js";
import { INITIAL_TARGET, camera, invalidate, renderUntil, renderer, scene } from "./scene/setup.js";
import { capMeshes, clipLocal, plyGroups, syncClipPlane } from "./scene/blade-meshes.js";
import { GROUND_Y, eiffelGroup } from "./scene/references.js";
import { HUB_HEIGHT, rotorArms, turbineBlades, turbineCutToggle, turbineGroup } from "./scene/turbine.js";
import { opState } from "./aero/physics.js";
import { INITIAL_CAMERA, _v1, frameView, navMode, updateGizmo } from "./nav/navigation.js";

document.getElementById("turbineToggle").addEventListener("change", (e) => {
  turbineGroup.visible = e.target.checked;
  syncTurbineCut();
  if (e.target.checked) {   // frame the whole rotor
    frameView(new THREE.Vector3(BLADE_LENGTH * 0.5, GROUND_Y + HUB_HEIGHT * 0.5, -200),
              new THREE.Vector3(BLADE_LENGTH * 0.5 + 250, GROUND_Y + 120, 330));
  }
});

document.getElementById("eiffelToggle").addEventListener("change", (e) => {
  eiffelGroup.visible = e.target.checked;
  if (e.target.checked) {
    frameView(new THREE.Vector3(eiffelGroup.position.x, GROUND_Y + 150, -200),
              new THREE.Vector3(eiffelGroup.position.x + 250, GROUND_Y + 120, 330));
  }
});

// =====================================================================
// render loop
// =====================================================================

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- collapsible control panel (handy on small screens) ---
const panelCloseBtn = document.getElementById("panelClose");
const panelToggleBtn = document.getElementById("panelToggle");
panelCloseBtn.addEventListener("click", () => document.body.classList.add("panel-collapsed"));
panelToggleBtn.addEventListener("click", () => document.body.classList.remove("panel-collapsed"));

const aboutDialog = document.getElementById("aboutDialog");
document.getElementById("aboutBtn").addEventListener("click", () => aboutDialog.showModal());
document.getElementById("aboutClose").addEventListener("click", () => aboutDialog.close());
// click on the backdrop (outside the dialog box) closes it; Esc is handled natively
aboutDialog.addEventListener("click", (e) => { if (e.target === aboutDialog) aboutDialog.close(); });
// remember which panel sections are open (per viewer, best effort)
document.querySelectorAll("details.sec").forEach(d => {
  const key = "iea22-sec:" + d.dataset.sec;
  try { const v = localStorage.getItem(key); if (v !== null) d.open = v === "1"; } catch (e) {}
  d.addEventListener("toggle", () => { try { localStorage.setItem(key, d.open ? "1" : "0"); } catch (e) {} });
});

// start collapsed on narrow screens so the blade is visible first
if (window.matchMedia("(max-width: 640px)").matches) document.body.classList.add("panel-collapsed");

// --- hide the loading overlay once the scene is built ---
const overlay = document.getElementById("overlay");

// render on demand: only draw while something can change on screen (input,
// a moving rotor, a fading gizmo) -- an idle view costs no GPU time
["pointerdown", "pointermove", "pointerup", "wheel", "keydown", "input", "change", "click", "resize"]
  .forEach(ev => window.addEventListener(ev, () => invalidate(), { capture: true, passive: true }));

const fpsEl = document.getElementById("fps");
let lastT = performance.now(), frames = 0;
let rotorPaused = false;
const pauseBtns = [document.getElementById("pauseBtn"), document.getElementById("pauseBtnPanel")];
function setPaused(p) {
  rotorPaused = p;
  pauseBtns[0].textContent = p ? "▶ Play" : "⏸ Pause";
  pauseBtns[0].setAttribute("aria-pressed", String(p));
  pauseBtns[1].textContent = p ? "▶ Resume rotor" : "⏸ Pause rotor";
}
pauseBtns.forEach(b => b.addEventListener("click", () => setPaused(!rotorPaused)));
window.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(document.activeElement.tagName)) return;
  e.preventDefault(); setPaused(!rotorPaused);
});
document.getElementById("resetViewBtn").addEventListener("click", () => frameView(INITIAL_TARGET, INITIAL_CAMERA));

// turbine blades: same cut as the detailed blade, in each blade's own frame
function syncTurbineCut() {
  if (!turbineGroup.visible) return;
  const on = turbineCutToggle.checked;
  turbineGroup.updateMatrixWorld(true);
  turbineBlades.forEach(b => {
    if (on) b.clip.copy(clipLocal).applyMatrix4(b.mesh.matrixWorld);
    else b.clip.set(_v1.set(-1, 0, 0), 1e9);
    b.caps.visible = on;
    if (on) b.caps.children.forEach(m => {
      const src = capMeshes[m.userData.ply];
      m.geometry = src.geometry;
      m.visible = src.visible && plyGroups[m.userData.ply].visible;
    });
  });
}
turbineCutToggle.addEventListener("change", syncTurbineCut);
let lastFrame = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const nowF = performance.now(), dt = Math.min((nowF - lastFrame) / 1000, 0.1);
  lastFrame = nowF;
  if (!rotorPaused && turbineGroup.visible) {
    // leading edge first: positive about the rotor axis (clockwise seen
    // from upwind) when the LE is at +Y; real time at the slider's rpm
    const dA = leSign() * opState.rpm * 2*Math.PI / 60 * dt;
    rotorArms.forEach(a => { a.rotation.z += dA; });
  }
  const gizmoNeedsFrame = updateGizmo(dt);
  const spinning = !rotorPaused && turbineGroup.visible;
  if (!(spinning || navMode || gizmoNeedsFrame || nowF < renderUntil)) {
    fpsEl.textContent = "idle";
    return;
  }
  syncClipPlane();
  syncTurbineCut();
  renderer.render(scene, camera);
  frames++;
  if (frames === 1) overlay.classList.add("hidden"); // first frame drawn -> reveal
  const now = performance.now();
  if (now - lastT > 500) {
    fpsEl.textContent = Math.round(frames*1000/(now-lastT)) + " fps";
    frames = 0; lastT = now;
  }
}
animate();

// handle for the browser console and automated checks
window.viewer = { scene, camera, renderer, setPaused, frameView };
