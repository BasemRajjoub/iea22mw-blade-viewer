import { ROTOR_RADIUS, leStations, makeStation, opState, sectionAero } from "../../aero/physics.js";
import { AERO_KEYS, on, state } from "../../state.js";
import { createWindow } from "../window-manager.js";
import { bind, legend, note, panel, readout } from "../controls.js";

// Wind & aero: inflow, the induction model (BEM or a fixed a) and the 3D
// arrows (velocity triangles at the leading edge, forces at the quarter
// chord). Rotor speed and pitch are repeated here -- the same state keys as
// in the Rotor window. Details: the BEM iteration at the cut (exercise 6).

const win = createWindow({ id: "aero", title: "Wind & aero", icon: "≋", width: 320, details: true });

const gui = panel(win.main);
bind(gui, "wind", 3, 25, 0.1).decimals(1).name("Wind speed (m/s)");
bind(gui, "followController").name("Follow the controller");
bind(gui, "inductionModel", { "BEM (solved a, a′)": "bem", "Fixed a (slider)": "fixed" }).name("Induction");
const ind = bind(gui, "induction", 0, 0.5, 0.01).decimals(2).name("Axial induction a");
bind(gui, "showVelocities").name("Velocity triangles");
bind(gui, "showForces").name("Aero forces");
bind(gui, "arrowsCutOnly").name("Only at the cut station");
bind(gui, "labels3d").name("3D value labels");
const op = gui.addFolder("Operating point").close();
bind(op, "rpm", 0, 9, 0.01).decimals(2).name("Rotor speed (rpm)");
bind(op, "pitch", -5, 90, 0.1).decimals(1).name("Blade pitch (°)");
const corr = gui.addFolder("BEM corrections").close();
bind(corr, "tipLoss").name("Prandtl tip loss");
bind(corr, "hubLoss").name("Prandtl hub loss");
bind(corr, "glauert").name("Glauert correction (a > 0.4)");
const showModel = () => (state.inductionModel === "bem" ? ind.disable() : ind.enable());
on("inductionModel", showModel);
showModel();

legend(win.main, [["#4fc3f7", "axial U(1−a)"], ["#ffb74d", "rotational Ωr(1+a′)"], ["#ffffff", "relative W"]]);
legend(win.main, [["#66bb6a", "lift L"], ["#ef5350", "drag D"], ["#e040fb", "resultant R"], ["#26c6da", "thrust Fn"], ["#ffee58", "driving Ft"]]);

const tip = readout(win.details);
const iterTable = document.createElement("div");
win.details.appendChild(iterTable);
note(win.details, "BEM: momentum and blade-element thrust/torque are equated per annulus, iterating " +
  "tan φ = (1−a)U / ((1+a′)Ωr), a = 1/(4F sin²φ/(σ c_n) + 1), a′ = 1/(4F sinφ cosφ/(σ c_t) − 1) " +
  "with σ = Bc/(2πr), F = Prandtl tip × hub loss, and Buhl's Glauert fit above a = 0.4. " +
  "“Follow the controller” sets rpm and pitch from the IEA controller schedule (see Performance).");

function show() {
  const st = leStations[leStations.length-1], a = sectionAero(st);
  tip.innerHTML =
    `outer station r = ${a.r.toFixed(1)} m (r/R ${(a.r/ROTOR_RADIUS).toFixed(2)})<br/>` +
    `W ${a.W.toFixed(1)} m/s · inflow φ ${a.phi.toFixed(1)}° · a ${a.a.toFixed(3)} · a′ ${a.ap.toFixed(4)}<br/>` +
    `twist+pitch ${a.beta.toFixed(1)}° → α ${a.alpha.toFixed(1)}° · Cl ${a.cl.toFixed(2)} · Cd ${a.cd.toFixed(3)}<br/>` +
    `thrust ${(a.Fn/1000).toFixed(2)} kN/m · driving ${(a.Ft/1000).toFixed(2)} kN/m`;
  if (!win.showDetails) return;
  // the BEM iteration at the cut station, one row per iteration
  if (opState.model !== "bem") { iterTable.innerHTML = ""; return; }
  const cutSt = makeStation(Math.min(Math.max(state.cut, 0.02), 0.995)), trace = [];
  const res = sectionAero(cutSt, opState, trace);
  const f = (v, d) => v.toFixed(d);
  iterTable.innerHTML = `<div class="readout">BEM at the cut: r = ${res.r.toFixed(2)} m, c = ${cutSt.chord.toFixed(2)} m, ` +
    `σ = ${res.bem.sigma.toFixed(4)}, ${res.bem.converged ? "converged" : "not converged"} in ${res.bem.iter} iterations</div>` +
    `<table class="data-table"><thead><tr><th>it</th><th>a</th><th>a′</th><th>φ°</th><th>α°</th><th>Cl</th><th>Cd</th><th>F</th></tr></thead><tbody>` +
    trace.slice(0, 25).map(t => `<tr><td>${t.iter}</td><td>${f(t.a, 4)}</td><td>${f(t.ap, 4)}</td><td>${f(t.phi, 2)}</td>` +
      `<td>${f(t.alpha, 2)}</td><td>${f(t.cl, 3)}</td><td>${f(t.cd, 4)}</td><td>${f(t.F, 3)}</td></tr>`).join("") +
    (trace.length > 25 ? `<tr><td colspan="8">… ${trace.length - 25} more</td></tr>` : "") + "</tbody></table>";
}
on([...AERO_KEYS, "cut"], show);
win.onDetails(show);
show();
