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
import "./scene/curves-meshes.js";
import "./scene/cut.js";
import "./scene/references.js";
import "./scene/turbine.js";
import "./aero/physics.js";
import "./aero/arrows.js";
import "./aero/operating.js";
import "./nav/navigation.js";
import "./ui/window-manager.js";
// dock order = import order
import "./ui/windows/layers.js";
import "./ui/windows/cut.js";
import "./ui/windows/geometry.js";
import "./ui/windows/rotor.js";
import "./ui/windows/aero.js";
import "./ui/windows/section2d.js";
import "./ui/windows/plots.js";
import "./ui/windows/airfoils.js";
import "./ui/windows/scale.js";
import "./ui/windows/help.js";
import * as THREE from "three";
import { BLADE_LENGTH, leSign } from "./geometry/sections.js";
import { INITIAL_TARGET, camera, invalidate, renderUntil, renderer, scene } from "./scene/setup.js";
import { capMeshes, clipLocal, plyGroups, syncClipPlane } from "./scene/blade-meshes.js";
import { GROUND_Y, eiffelGroup } from "./scene/references.js";
import { HUB_HEIGHT, rotorArms, turbineBlades, turbineGroup } from "./scene/turbine.js";
import { on, onAny, set, state } from "./state.js";
import { opState } from "./aero/physics.js";
import { INITIAL_CAMERA, _v1, frameView, navMode, updateGizmo } from "./nav/navigation.js";

on("turbine", (shown) => {
  turbineGroup.visible = shown;
  syncTurbineCut();
  if (shown) {   // frame the whole rotor
    frameView(new THREE.Vector3(BLADE_LENGTH * 0.5, GROUND_Y + HUB_HEIGHT * 0.5, -200),
              new THREE.Vector3(BLADE_LENGTH * 0.5 + 250, GROUND_Y + 120, 330));
  }
});

on("eiffel", (shown) => {
  eiffelGroup.visible = shown;
  if (shown) {
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

const aboutDialog = document.getElementById("aboutDialog");
document.getElementById("aboutBtn").addEventListener("click", () => aboutDialog.showModal());
document.getElementById("aboutClose").addEventListener("click", () => aboutDialog.close());
// click on the backdrop (outside the dialog box) closes it; Esc is handled natively
aboutDialog.addEventListener("click", (e) => { if (e.target === aboutDialog) aboutDialog.close(); });

// --- hide the loading overlay once the scene is built ---
const overlay = document.getElementById("overlay");

// render on demand: only draw while something can change on screen (input,
// a moving rotor, a fading gizmo) -- an idle view costs no GPU time
["pointerdown", "pointermove", "pointerup", "wheel", "keydown", "input", "change", "click", "resize"]
  .forEach(ev => window.addEventListener(ev, () => invalidate(), { capture: true, passive: true }));
onAny(() => invalidate());   // any setting change, wherever it came from

const fpsEl = document.getElementById("fps");
let lastT = performance.now(), frames = 0;
const pauseBtn = document.getElementById("pauseBtn");
const showPaused = (p) => {
  pauseBtn.querySelector(".dock-icon").textContent = p ? "▶" : "⏸";
  pauseBtn.querySelector(".dock-label").textContent = p ? "Play" : "Pause";
  pauseBtn.setAttribute("aria-pressed", String(p));
};
on("paused", showPaused);
showPaused(state.paused);
pauseBtn.addEventListener("click", () => set("paused", !state.paused));
window.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(document.activeElement.tagName)) return;
  e.preventDefault(); set("paused", !state.paused);
});
document.getElementById("resetViewBtn").addEventListener("click", () => frameView(INITIAL_TARGET, INITIAL_CAMERA));

// turbine blades: same cut as the detailed blade, in each blade's own frame
function syncTurbineCut() {
  if (!turbineGroup.visible) return;
  const cutOn = state.turbineCut;
  turbineGroup.updateMatrixWorld(true);
  turbineBlades.forEach(b => {
    if (cutOn) b.clip.copy(clipLocal).applyMatrix4(b.mesh.matrixWorld);
    else b.clip.set(_v1.set(-1, 0, 0), 1e9);
    b.caps.visible = cutOn;
    if (cutOn) b.caps.children.forEach(m => {
      const src = capMeshes[m.userData.ply];
      m.geometry = src.geometry;
      m.visible = src.visible && plyGroups[m.userData.ply].visible;
    });
  });
}
on("turbineCut", syncTurbineCut);
let lastFrame = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const nowF = performance.now(), dt = Math.min((nowF - lastFrame) / 1000, 0.1);
  lastFrame = nowF;
  if (!state.paused && turbineGroup.visible) {
    // leading edge first: positive about the rotor axis (clockwise seen
    // from upwind) when the LE is at +Y; real time at the slider's rpm
    const dA = leSign() * opState.rpm * 2*Math.PI / 60 * dt;
    rotorArms.forEach(a => { a.rotation.z += dA; });
  }
  const gizmoNeedsFrame = updateGizmo(dt);
  const spinning = !state.paused && turbineGroup.visible;
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
window.viewer = { scene, camera, renderer, frameView, state, set, setPaused: (p) => set("paused", p) };
