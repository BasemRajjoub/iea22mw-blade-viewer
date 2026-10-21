import { IEA22, IEA22_AERO } from "../../data/index.js";
import { blendedShape } from "../../geometry/sections.js";
import { makeStation, polarAt, sectionAero } from "../../aero/physics.js";
import { AERO_KEYS, on, state } from "../../state.js";
import { createWindow } from "../window-manager.js";
import { note, panel, batched, readout } from "../controls.js";
import { LinePlot, plotTable } from "../plot.js";

// Airfoils: shapes and polars (Cl, Cd, Cm, Cl/Cd vs α) for every airfoil in
// the YAML, or the blend used at the cut; a second airfoil can be overlaid.
// On the polar, the dashed line marks the angle of attack at the cut.

const win = createWindow({ id: "airfoils", title: "Airfoils", icon: "⌓", width: 480, details: true });
win.el.classList.add("win-plot");
if (!win.el.style.height) win.el.style.height = "560px";

const BLEND = "Blended at cut";
const names = Object.keys(IEA22_AERO.polars);
const COEFFS = { "Lift Cl": "cl", "Drag Cd": "cd", "Moment Cm": "cm", "Glide ratio Cl/Cd": "ld" };
const RANGES = { "−20° … 25°": [-20, 25, 0.25], "Full ±180°": [-180, 180, 1] };
const view = { airfoil: BLEND, compare: "none", coeff: "Lift Cl", range: "−20° … 25°" };

const cutStation = () => makeStation(Math.min(Math.max(state.cut, 0.02), 0.995));

// coefficient at α for an airfoil name or the blend at the cut
function coeffAt(which, key, alpha) {
  const pick = (name) => { const p = polarAt(name, alpha); return key === "ld" ? p.cl / p.cd : p[key]; };
  if (which !== BLEND) return pick(which);
  const st = cutStation();
  return (1 - st.blend) * pick(st.airfoils[0]) + st.blend * pick(st.airfoils[1]);
}
function shapeOf(which) {
  if (which === BLEND) { const { x, y } = blendedShape(Math.min(Math.max(state.cut, 0.02), 0.995)); return { x: [...x], y: [...y] }; }
  const s = IEA22.airfoilShapes[which];
  return s ? { x: s.x, y: s.y } : null;
}

const gui = panel(win.main);
gui.add(view, "airfoil", [BLEND, ...names]).name("Airfoil").onChange(redraw);
gui.add(view, "compare", ["none", BLEND, ...names]).name("Compare with").onChange(redraw);
gui.add(view, "coeff", Object.keys(COEFFS)).name("Coefficient").onChange(redraw);
gui.add(view, "range", Object.keys(RANGES)).name("α range").onChange(redraw);
const shapeCanvas = document.createElement("canvas"); shapeCanvas.className = "plot plot-shape";
const polarCanvas = document.createElement("canvas"); polarCanvas.className = "plot";
win.main.append(shapeCanvas, polarCanvas);
const shapePlot = new LinePlot(shapeCanvas), polarPlot = new LinePlot(polarCanvas);
const info = readout(win.main, "dim");
const table = document.createElement("div");
win.details.appendChild(table);
note(win.details, "Polars: default configuration, first Reynolds-number set of each airfoil in IEA-22-280-RWT.yaml. " +
  "“Blended at cut” interpolates the two airfoils that bracket the cut station, as the 3D blade does.");

function redraw() {
  if (!win.isOpen()) return;
  const picks = [view.airfoil, view.compare].filter((w, i) => w !== "none" && (i === 0 || w !== view.airfoil));
  const label = w => w === BLEND ? `blend @ z=${Math.min(Math.max(state.cut, 0.02), 0.995).toFixed(2)}` : w;

  shapePlot.draw({
    series: picks.map(w => ({ label: label(w), ...shapeOf(w) })).filter(s => s.x),
    xLabel: "x/c", yLabel: "y/c", equal: true,
  });

  const [lo, hi, step] = RANGES[view.range], key = COEFFS[view.coeff];
  const alphas = []; for (let a = lo; a <= hi + 1e-9; a += step) alphas.push(+a.toFixed(3));
  const st = cutStation(), aCut = sectionAero(st).alpha;
  const opts = {
    series: picks.map(w => ({ label: label(w), x: alphas, y: alphas.map(a => coeffAt(w, key, a)) })),
    xLabel: "Angle of attack α [°]", yLabel: view.coeff,
    marker: { x: aCut, label: `α at cut ${aCut.toFixed(1)}°` },
  };
  polarPlot.draw(opts);
  const af = st.airfoils[0] === st.airfoils[1] ? st.airfoils[0] : `${st.airfoils[0]} → ${st.airfoils[1]} (${(st.blend*100).toFixed(0)}%)`;
  info.textContent = `cut z = ${st.z.toFixed(2)}: ${af} · α ${aCut.toFixed(1)}° · Cl ${coeffAt(BLEND, "cl", aCut).toFixed(3)} · Cd ${coeffAt(BLEND, "cd", aCut).toFixed(4)}`;
  if (win.showDetails) table.innerHTML = plotTable(opts);
}
const redrawSoon = batched(redraw);
win.onShow(redraw);
win.onDetails(redraw);
on(["cut", ...AERO_KEYS], redrawSoon);

// e.g. showAirfoils({ airfoil: "SNL-FFA-W3-420FB", compare: "FFA-W3-211", coeff: "Glide ratio Cl/Cd" })
function showAirfoils(opts) {
  Object.assign(view, opts);
  gui.controllersRecursive().forEach(c => c.updateDisplay());
  win.open(); redraw();
}

export { showAirfoils };
