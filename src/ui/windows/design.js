import { IEA22 } from "../../data/index.js";
import { field } from "../../geometry/math.js";
import { BLADE_LENGTH } from "../../geometry/sections.js";
import { HUB_RADIUS } from "../../scene/turbine.js";
import { ROTOR_RADIUS, polarAt } from "../../aero/physics.js";
import { betzSection, schmitzSection } from "../../aero/design.js";
import { on, set, state } from "../../state.js";
import { createWindow } from "../window-manager.js";
import { bind, button, note, panel, batched, readout } from "../controls.js";
import { LinePlot, plotTable } from "../plot.js";

// Blade design (exercises 4 and 5): the Betz and Schmitz optimum chord and
// twist for a design tip-speed ratio, lift coefficient and angle of attack,
// against the real IEA 22 MW blade -- and as a ghost blade in 3D.

const win = createWindow({ id: "design", title: "Blade design", icon: "✎", width: 480, details: true });
win.el.classList.add("win-plot");
if (!win.el.style.height) win.el.style.height = "520px";

const R = ROTOR_RADIUS;
// the tip airfoil's best glide ratio sets a sensible default design point
function bestGlide(name) {
  let best = { ld: -Infinity };
  for (let a = -2; a <= 14; a += 0.1) { const p = polarAt(name, a); if (p.cl / p.cd > best.ld) best = { ld: p.cl / p.cd, alpha: a, cl: p.cl }; }
  return best;
}
const tipBest = bestGlide("FFA-W3-211");

const view = { plot: "Chord" };
const gui = panel(win.main);
gui.add(view, "plot", ["Chord", "Twist"]).name("Plot").onChange(redraw);
bind(gui, "designTSR", 2, 14, 0.05).decimals(2).name("Design λ");
bind(gui, "designCl", 0.3, 2, 0.01).decimals(2).name("Design Cl");
bind(gui, "designAlpha", -2, 14, 0.1).decimals(1).name("Design α (°)");
bind(gui, "ghostBlade", { "none": "none", "Betz optimum": "betz", "Schmitz optimum": "schmitz" }).name("Ghost blade in 3D");
button(gui, `IEA 22 design point (λ 9.15, max Cl/Cd of FFA-W3-211)`, () => {
  set("designTSR", 9.15); set("designCl", +tipBest.cl.toFixed(2)); set("designAlpha", +tipBest.alpha.toFixed(1));
});
button(gui, "Exercise 4/5 inputs (λ 7, Cl 1.5, α 5°)", () => { set("designTSR", 7); set("designCl", 1.5); set("designAlpha", 5); });
button(gui, "Slow-running rotor (λ 3)", () => set("designTSR", 3));

const canvas = document.createElement("canvas"); canvas.className = "plot";
win.main.appendChild(canvas);
const plot = new LinePlot(canvas);
const out = readout(win.main, "dim");
const table = document.createElement("div");
win.details.appendChild(table);
note(win.details, "Betz (no wake rotation, a = 1/3): tan φ = 2/(3λ_r), c = 16πR/(9BC_lλ)·1/√(λ²(r/R)²+4/9). " +
  "Schmitz (with wake rotation): φ = (2/3)·arctan(1/λ_r), c = (16πr/(BC_l))·sin²(arctan(1/λ_r)/3). " +
  "Twist θ = φ − α, λ_r = λr/R, B = 3, R = 142 m, r from the rotor axis. The real blade is narrower at the root " +
  "(transport and manufacturing limits) and uses thick airfoils there.");

function redraw() {
  const p = { R, lambda: state.designTSR, B: 3, cl: state.designCl, alphaDeg: state.designAlpha };
  const rs = [], real = [], betz = [], schmitz = [];
  for (let i = 0; i <= 120; i++) {
    const z = i / 120, r = HUB_RADIUS + z * BLADE_LENGTH;
    rs.push(r);
    const b = betzSection(r, p), s = schmitzSection(r, p);
    if (view.plot === "Chord") { real.push(field(IEA22.chord, z)); betz.push(b.chord); schmitz.push(s.chord); }
    else { real.push(field(IEA22.twistDeg, z)); betz.push(b.twist); schmitz.push(s.twist); }
  }
  const opts = {
    series: [{ label: "IEA 22 MW", x: rs, y: real }, { label: "Betz", x: rs, y: betz }, { label: "Schmitz", x: rs, y: schmitz }],
    xLabel: "Radius r [m]", yLabel: view.plot === "Chord" ? "Chord [m]" : "Twist θ [°]",
    marker: state.cut < 0.999 ? { x: HUB_RADIUS + state.cut * BLADE_LENGTH, label: "cut", strong: true } : null,
  };
  if (win.isOpen()) plot.draw(opts);
  // section calculator at the cut
  const z = Math.min(Math.max(state.cut, 0.02), 1), r = HUB_RADIUS + z * BLADE_LENGTH;
  const b = betzSection(r, p), s = schmitzSection(r, p);
  out.innerHTML = `at r = ${r.toFixed(1)} m: λ_r = ${b.lr.toFixed(2)} · ` +
    `Betz φ ${b.phi.toFixed(2)}°, θ ${b.twist.toFixed(2)}°, c ${b.chord.toFixed(2)} m · ` +
    `Schmitz φ ${s.phi.toFixed(2)}°, θ ${s.twist.toFixed(2)}°, c ${s.chord.toFixed(2)} m · ` +
    `real θ ${field(IEA22.twistDeg, z).toFixed(2)}°, c ${field(IEA22.chord, z).toFixed(2)} m`;
  if (win.showDetails) {
    const rows = [15, 30, 45, 60, 75, 90, 105, 120, 135, 142];   // the exercise sheets' radii
    table.innerHTML = plotTable({
      series: [
        { label: "Betz c", x: rows, y: rows.map(rr => betzSection(rr, p).chord) },
        { label: "Betz θ", x: rows, y: rows.map(rr => betzSection(rr, p).twist) },
        { label: "Schmitz c", x: rows, y: rows.map(rr => schmitzSection(rr, p).chord) },
        { label: "Schmitz θ", x: rows, y: rows.map(rr => schmitzSection(rr, p).twist) },
        { label: "Schmitz a", x: rows, y: rows.map(rr => schmitzSection(rr, p).a) },
        { label: "Schmitz a′", x: rows, y: rows.map(rr => schmitzSection(rr, p).ap) },
      ], xLabel: "r [m]", fmtX: v => v.toFixed(0), fmtY: v => (Math.abs(v) < 1 ? v.toFixed(4) : v.toFixed(2)),
    }, 12);
  }
}
const redrawSoon = batched(redraw);
win.onShow(redraw);
win.onDetails(redraw);
on(["designTSR", "designCl", "designAlpha", "cut"], redrawSoon);

function showDesign(plotName) { view.plot = plotName; gui.controllers[0].updateDisplay(); win.open(); redraw(); }

export { showDesign, tipBest };
