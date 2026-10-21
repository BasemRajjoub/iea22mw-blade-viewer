import { ROTOR_RADIUS, leStations, sectionAero } from "../../aero/physics.js";
import { on } from "../../state.js";
import { createWindow } from "../window-manager.js";
import { bind, legend, note, panel, readout } from "../controls.js";

// Wind & aero: inflow and the 3D arrows (velocity triangles at the leading
// edge, forces at the quarter chord). Rotor speed and pitch are repeated
// here -- they are the same state keys as in the Rotor window.

const win = createWindow({ id: "aero", title: "Wind & aero", icon: "≋", width: 310, details: true });

const gui = panel(win.main);
bind(gui, "wind", 3, 25, 0.1).decimals(1).name("Wind speed (m/s)");
bind(gui, "induction", 0, 0.5, 0.01).decimals(2).name("Axial induction a");
bind(gui, "showVelocities").name("Velocity triangles");
bind(gui, "showForces").name("Aero forces");
bind(gui, "arrowsCutOnly").name("Only at the cut station");
bind(gui, "labels3d").name("3D value labels");
const op = gui.addFolder("Operating point").close();
bind(op, "rpm", 0, 9, 0.01).decimals(2).name("Rotor speed (rpm)");
bind(op, "pitch", -5, 90, 0.1).decimals(1).name("Blade pitch (°)");

legend(win.main, [["#4fc3f7", "axial U(1−a)"], ["#ffb74d", "rotational Ωr"], ["#ffffff", "relative W"]]);
legend(win.main, [["#66bb6a", "lift L"], ["#ef5350", "drag D"], ["#e040fb", "resultant R"], ["#26c6da", "thrust Fn"], ["#ffee58", "driving Ft"]]);

const tip = readout(win.details);
note(win.details, "Quasi-steady 2D blade element: user-set axial induction, airfoil polars from the YAML, " +
  "no BEM iteration, tip loss or 3D effects. Forces are per metre of span.");

function show() {
  const st = leStations[leStations.length-1], a = sectionAero(st);
  tip.innerHTML =
    `at r = ${a.r.toFixed(1)} m (r/R ${(a.r/ROTOR_RADIUS).toFixed(2)})<br/>` +
    `W ${a.W.toFixed(1)} m/s · inflow φ ${a.phi.toFixed(1)}°<br/>` +
    `twist+pitch ${a.beta.toFixed(1)}° → α ${a.alpha.toFixed(1)}° · Cl ${a.cl.toFixed(2)} · Cd ${a.cd.toFixed(3)}<br/>` +
    `thrust ${(a.Fn/1000).toFixed(2)} kN/m · driving ${(a.Ft/1000).toFixed(2)} kN/m`;
}
on(["rpm", "pitch", "wind", "induction", "clockwise", "twist", "prebend", "sweep", "precone"], show);
show();
