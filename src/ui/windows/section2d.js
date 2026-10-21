import { drawSection } from "../section-plot.js";
import { AERO_KEYS, on } from "../../state.js";
import { createWindow } from "../window-manager.js";
import { bind, panel, batched } from "../controls.js";

// 2D section: the blade section at the cut with the velocity triangle and
// forces; Details adds the numbers. Wheel zooms toward the cursor, drag pans,
// double-click resets. The cut and pitch sliders here are the same state
// keys as in the Section cut and Rotor windows.

const win = createWindow({ id: "section2d", title: "2D section", icon: "◩", width: 440, details: true });
win.el.classList.add("win-plot");
if (!win.el.style.height) win.el.style.height = "520px";

const canvas = document.createElement("canvas");
canvas.className = "plot";
canvas.dataset.nodrag = "";   // the plot pans itself instead of moving the window
win.main.appendChild(canvas);
const gui = panel(win.main);
bind(gui, "suctionUp").name("Suction side up");
bind(gui, "cut", 0.02, 1, 0.001).decimals(3).name("Span position z");
bind(gui, "pitch", -5, 90, 0.1).decimals(1).name("Blade pitch (°)");
bind(gui, "revealStep", 1, 5, 1).name("Build-up step (1–5)");
bind(gui, "showChordForces").name("Chord-normal / chord forces");
const ex = gui.addFolder("Arrow exaggeration");
bind(ex, "velScale", 1, 10, 0.1).decimals(1).name("Velocity triangle ×");
bind(ex, "forceScale", 0.2, 10, 0.1).decimals(1).name("All forces ×");
bind(ex, "smallForceScale", 1, 100, 1).decimals(0).name("Drag & Ft only ×");
const info = document.createElement("div");
info.className = "readout";
win.details.appendChild(info);

// zoom / pan (css px of the canvas); not persisted -- double-click resets
const view = { zoom: 1, tx: 0, ty: 0 };
const redraw = () => { if (win.isOpen()) drawSection(canvas, info, view); };
const redrawSoon = batched(redraw);
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const r = canvas.getBoundingClientRect(), cx = e.clientX - r.left, cy = e.clientY - r.top;
  const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
  const k = Math.min(Math.max(Math.exp(-dy * 0.0015), 0.5 / view.zoom), 60 / view.zoom);
  view.tx = cx - (cx - view.tx) * k;   // keep the point under the cursor fixed
  view.ty = cy - (cy - view.ty) * k;
  view.zoom *= k;
  redraw();
}, { passive: false });
let pan = null;
canvas.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  pan = { x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
  canvas.style.cursor = "grabbing";
});
canvas.addEventListener("pointermove", (e) => {
  if (!pan) return;
  view.tx += e.clientX - pan.x; view.ty += e.clientY - pan.y;
  pan = { x: e.clientX, y: e.clientY };
  redraw();
});
const endPan = () => { pan = null; canvas.style.cursor = ""; };
canvas.addEventListener("pointerup", endPan);
canvas.addEventListener("pointercancel", endPan);
canvas.addEventListener("dblclick", () => { Object.assign(view, { zoom: 1, tx: 0, ty: 0 }); redraw(); });

win.onShow(redraw);
win.onDetails(redraw);
on(["cut", "suctionUp", "velScale", "forceScale", "smallForceScale", "showChordForces", "revealStep", ...AERO_KEYS], redrawSoon);
