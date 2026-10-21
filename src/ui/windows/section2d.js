import { drawSection } from "../section-plot.js";
import { on } from "../../state.js";
import { createWindow } from "../window-manager.js";
import { bind, panel } from "../controls.js";

// 2D section: the blade section at the cut with the velocity triangle and
// forces; Details adds the numbers. The cut and pitch sliders here are the
// same state keys as in the Section cut and Rotor windows.

const win = createWindow({ id: "section2d", title: "2D section", icon: "◩", width: 440, details: true });
win.el.classList.add("win-plot");
if (!win.el.style.height) win.el.style.height = "430px";

const canvas = document.createElement("canvas");
canvas.className = "plot";
win.main.appendChild(canvas);
const gui = panel(win.main);
bind(gui, "suctionUp").name("Suction side up");
bind(gui, "cut", 0.02, 1, 0.001).decimals(3).name("Span position z");
bind(gui, "pitch", -5, 90, 0.1).decimals(1).name("Blade pitch (°)");
const info = document.createElement("div");
info.className = "readout";
win.details.appendChild(info);

const redraw = () => { if (win.isOpen()) drawSection(canvas, info); };
win.onShow(redraw);
win.onDetails(redraw);
on(["cut", "suctionUp", "rpm", "pitch", "wind", "induction", "clockwise", "twist", "prebend", "sweep", "precone"], redraw);
