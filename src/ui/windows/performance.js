import { IEA22_AERO } from "../../data/index.js";
import { ROTOR_RADIUS, RHO_AIR } from "../../aero/physics.js";
import { controllerAt, cpLambda, powerCurve } from "../../aero/performance.js";
import { AERO_KEYS, on, set, state } from "../../state.js";
import { createWindow } from "../window-manager.js";
import { bind, button, note, panel, batched, readout } from "../controls.js";
import { LinePlot, plotTable } from "../plot.js";

// Performance: whole-rotor results from the blade-element model -- the
// power curve with the IEA controller (rpm and pitch schedule, regions),
// Cp / thrust / torque vs wind speed, and the Cp-λ curve (exercises 7, 8).

const win = createWindow({ id: "performance", title: "Performance", icon: "⚡", width: 500, details: true });
win.el.classList.add("win-plot");
if (!win.el.style.height) win.el.style.height = "520px";

const MW = 1e6, A = IEA22_AERO;
const PLOTS = {
  "Power curve": c => ({ series: [{ label: "aero power", x: c.map(p => p.U), y: c.map(p => p.P / MW) }], yLabel: "Power [MW]" }),
  "Power coefficient Cp": c => ({
    series: [{ label: "Cp", x: c.map(p => p.U), y: c.map(p => p.Cp) }, { label: "Betz limit 16/27", x: [3, 25], y: [16/27, 16/27], dashed: true }],
    yLabel: "Cp [-]",
  }),
  "Rotor speed": c => ({ series: [{ label: "rotor speed", x: c.map(p => p.U), y: c.map(p => p.rpm) }], yLabel: "Rotor speed [rpm]" }),
  "Pitch schedule": c => ({
    series: [{ label: "pitch (controller)", x: c.map(p => p.U), y: c.map(p => p.pitch) }, { label: "YAML min pitch", x: A.minPitchTable.wind, y: A.minPitchTable.pitch, dashed: true }],
    yLabel: "Blade pitch [°]",
  }),
  "Thrust": c => ({ series: [{ label: "thrust", x: c.map(p => p.U), y: c.map(p => p.T / MW) }], yLabel: "Rotor thrust [MN]" }),
  "Torque": c => ({ series: [{ label: "torque", x: c.map(p => p.U), y: c.map(p => p.Q / MW) }], yLabel: "Rotor torque [MN·m]" }),
  "Tip-speed ratio": c => ({ series: [{ label: "λ", x: c.map(p => p.U), y: c.map(p => p.lambda) }], yLabel: "Tip-speed ratio λ [-]" }),
  "Cp–λ (current pitch)": () => {
    const cl = cpLambda(state.pitch);
    return {
      series: [{ label: "Cp", x: cl.map(p => p.lambda), y: cl.map(p => p.Cp) }, { label: "Ct", x: cl.map(p => p.lambda), y: cl.map(p => p.Ct) },
        { label: "Betz 16/27", x: [2, 16], y: [16/27, 16/27], dashed: true }],
      yLabel: "Cp, Ct [-]", xLabel: "Tip-speed ratio λ [-]",
      lambda: true,
    };
  },
};
const view = { plot: "Power curve" };

const gui = panel(win.main);
gui.add(view, "plot", Object.keys(PLOTS)).name("Plot").onChange(redraw);
bind(gui, "wind", 3, 25, 0.1).decimals(1).name("Wind speed (m/s)");
bind(gui, "followController").name("Follow the controller");
button(gui, "Apply controller rpm & pitch", () => {
  const c = controllerAt(state.wind);
  set("rpm", +c.rpm.toFixed(3)); set("pitch", +c.pitch.toFixed(2));
});
const canvas = document.createElement("canvas");
canvas.className = "plot";
win.main.appendChild(canvas);
const plot = new LinePlot(canvas);
const op = readout(win.main, "dim");
const table = document.createElement("div");
const calc = readout(win.details);
win.details.appendChild(table);
note(win.details, "Controller (IEA 22 MW YAML): rotor speed follows λ_opt = " + A.optimalTsr +
  ` between ${A.minRpm} and ${A.ratedRpm} rpm; pitch follows the minimum-pitch (peak-shaving) table and above rated rises ` +
  "until aero power = 22 MW. Aero power from the blade-element model, no drivetrain losses, uniform wind.");

function redraw() {
  if (!win.isOpen()) return;
  const curve = powerCurve(), def = PLOTS[view.plot](curve);
  const omega = state.rpm * 2*Math.PI / 60, lamNow = state.wind > 0 ? omega * ROTOR_RADIUS / state.wind : 0;
  const opts = {
    ...def, xLabel: def.xLabel || "Wind speed [m/s]",
    marker: def.lambda ? { x: lamNow, label: `now λ ${lamNow.toFixed(2)}`, strong: true } : { x: state.wind, label: `${state.wind.toFixed(1)} m/s`, strong: true },
    markers: def.lambda ? [{ x: A.optimalTsr, label: "λ_opt" }] : [{ x: A.cutIn, label: "cut-in" }, { x: A.cutOut, label: "cut-out" }],
  };
  plot.draw(opts);
  const c = controllerAt(state.wind);
  op.textContent = `controller at ${state.wind.toFixed(1)} m/s: region ${c.region} · ${c.rpm.toFixed(2)} rpm · pitch ${c.pitch.toFixed(1)}° · ` +
    `P ${(c.P / MW).toFixed(2)} MW · Cp ${c.Cp.toFixed(3)} · T ${(c.T / MW).toFixed(2)} MN · λ ${c.lambda.toFixed(2)}`;
  if (!win.showDetails) return;
  // exercise-8 style numbers
  const R = ROTOR_RADIUS, wRated = A.ratedRpm * 2*Math.PI / 60, wMin = A.minRpm * 2*Math.PI / 60;
  const cpMax = Math.max(...curve.map(p => p.Cp));
  const kGen = cpMax * RHO_AIR * Math.PI * R ** 5 / (2 * A.optimalTsr ** 3);
  calc.innerHTML =
    `tip speed at rated: ${(wRated * R).toFixed(1)} m/s · Ω_min = ${wMin.toFixed(3)} rad/s, Ω_rated = ${wRated.toFixed(3)} rad/s<br/>` +
    `rated torque M = P/Ω = ${(A.ratedPower / wRated / MW).toFixed(1)} MN·m (YAML max generator torque ${(A.maxGenTorque / MW).toFixed(1)} MN·m)<br/>` +
    `K_gen = Cp·ρπR⁵/(2λ³) = ${(kGen / 1e3).toFixed(0)}·10³ N·m·s² (Cp_max ${cpMax.toFixed(3)}) · YAML region2_k ${(A.region2K / 1e3).toFixed(0)}·10³`;
  table.innerHTML = plotTable(opts);
}
const redrawSoon = batched(redraw);
win.onShow(redraw);
win.onDetails(redraw);
on(AERO_KEYS, redrawSoon);

function showPlot(name) { if (PLOTS[name]) { view.plot = name; gui.controllers[0].updateDisplay(); win.open(); redraw(); } }

export { showPlot };
