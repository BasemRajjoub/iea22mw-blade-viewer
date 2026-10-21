import { IEA22, STRUCTURE } from "../../data/index.js";
import { field } from "../../geometry/math.js";
import { BLADE_LENGTH } from "../../geometry/sections.js";
import { LAYERS } from "../../geometry/plies.js";
import { WEBS } from "../../geometry/webs.js";
import { computedRthick } from "../../geometry/curves.js";
import { makeStation, opState, sectionAero } from "../../aero/physics.js";
import { on, state } from "../../state.js";
import { createWindow } from "../window-manager.js";
import { note, panel, readout } from "../controls.js";
import { LinePlot, plotTable } from "../plot.js";

// Plots: spanwise blade data straight from the YAML (planform, structure,
// layup) plus the aero loads along the span at the current operating point.
// The dashed line marks the current cut.

const win = createWindow({ id: "plots", title: "Plots", icon: "∿", width: 500, details: true });
win.el.classList.add("win-plot");
if (!win.el.style.height) win.el.style.height = "420px";

const span = z => z * BLADE_LENGTH;   // span position from the root, m
const fromField = (f, k = 1) => ({ x: f.grid.map(span), y: f.values.map(v => v * k) });
const fromStructure = (key) => ({ x: STRUCTURE.grid.map(span), y: STRUCTURE[key] });
const sample = (fn, n = 120) => {
  const x = [], y = [];
  for (let i = 0; i <= n; i++) { const z = i / n; x.push(span(z)); y.push(fn(z)); }
  return { x, y };
};
const integrate = (x, y) => { let s = 0; for (let i = 1; i < x.length; i++) s += (x[i] - x[i-1]) * (y[i] + y[i-1]) / 2; return s; };
const plyNames = [...LAYERS, ...WEBS].map(l => l.name);

// aero along the span at the current operating point (cached per call of draw)
function aeroSpan() {
  const st = [];
  for (let z = 0.02; z <= 0.995; z += 0.01) { const s = makeStation(z); st.push({ s, a: sectionAero(s) }); }
  return st;
}

// each quantity -> { series, yLabel, logY?, notes() }
const QUANTITIES = {
  "Chord": () => ({ series: [{ label: "chord", ...fromField(IEA22.chord) }], yLabel: "Chord [m]" }),
  "Twist": () => ({ series: [{ label: "twist", ...fromField(IEA22.twistDeg) }], yLabel: "Twist [°]" }),
  "Relative thickness t/c": () => ({
    series: [{ label: "YAML", ...fromField(IEA22.rthick, 100) }, { label: "blended airfoils", ...sample(z => computedRthick(z) * 100) }],
    yLabel: "t/c [%]",
  }),
  "Prebend": () => ({ series: [{ label: "prebend", ...fromField(IEA22.refAxisX) }], yLabel: "Prebend (− = upwind) [m]" }),
  "Pitch axis position": () => ({
    series: [{ label: "pitch axis", ...sample(z => field(IEA22.sectionOffsetY, z) / field(IEA22.chord, z)) }],
    yLabel: "Pitch axis from LE [chord fraction]",
  }),
  "Mass per length": () => ({
    series: [{ label: "mass", ...fromStructure("mass") }], yLabel: "Mass [kg/m]",
    notes: () => `Blade mass (integrated): <b>${(integrate(STRUCTURE.grid.map(span), STRUCTURE.mass) / 1000).toFixed(1)} t</b>`,
  }),
  "Bending stiffness": () => ({
    series: [{ label: "flapwise EI", ...fromStructure("EIflap") }, { label: "edgewise EI", ...fromStructure("EIedge") }],
    yLabel: "EI [N·m²]", logY: true,
  }),
  "Torsional stiffness": () => ({ series: [{ label: "GJ", ...fromStructure("GJ") }], yLabel: "GJ [N·m²]", logY: true }),
  "Axial stiffness": () => ({ series: [{ label: "EA", ...fromStructure("EA") }], yLabel: "EA [N]", logY: true }),
  "Mass moment of inertia": () => ({
    series: [{ label: "flap", ...fromStructure("iFlap") }, { label: "edge", ...fromStructure("iEdge") }],
    yLabel: "Inertia per length [kg·m]", logY: true,
  }),
  "Ply thickness": () => {
    const l = [...LAYERS, ...WEBS].find(p => p.name === view.ply);
    return { series: [{ label: l.name, ...fromField(l.thickness, 1000) }], yLabel: `${l.name.replace(/_/g, " ")} thickness [mm]` };
  },
  "Aero loads": () => {
    const st = aeroSpan(), x = st.map(p => span(p.s.z));
    return {
      series: [{ label: "thrust Fn", x, y: st.map(p => p.a.Fn / 1000) }, { label: "driving Ft", x, y: st.map(p => p.a.Ft / 1000) }],
      yLabel: "Load per metre [kN/m]",
      notes: () => {
        const r = st.map(p => p.a.r), omega = opState.rpm * 2*Math.PI / 60;
        const T = 3 * integrate(x, st.map(p => p.a.Fn)), Q = 3 * integrate(x, st.map((p, i) => p.a.Ft * r[i]));
        return `Three blades, integrated: thrust <b>${(T/1e6).toFixed(2)} MN</b> · torque <b>${(Q/1e6).toFixed(1)} MN·m</b> · ` +
          `aero power <b>${(Q*omega/1e6).toFixed(1)} MW</b>. Quasi-steady blade element with the induction you set ` +
          `(no BEM, tip loss or 3D effects), so treat these as rough.`;
      },
    };
  },
  "Angle of attack": () => {
    const st = aeroSpan();
    return { series: [{ label: "α", x: st.map(p => span(p.s.z)), y: st.map(p => p.a.alpha) }], yLabel: "Angle of attack α [°]" };
  },
  "Lift coefficient": () => {
    const st = aeroSpan();
    return { series: [{ label: "Cl", x: st.map(p => span(p.s.z)), y: st.map(p => p.a.cl) }], yLabel: "Cl [-]" };
  },
};
const AERO_QUANTITIES = new Set(["Aero loads", "Angle of attack", "Lift coefficient"]);

const view = { quantity: "Chord", ply: plyNames[0], log: false };
const gui = panel(win.main);
const qCtl = gui.add(view, "quantity", Object.keys(QUANTITIES)).name("Quantity");
const plyCtl = gui.add(view, "ply", plyNames).name("Ply");
const logCtl = gui.add(view, "log").name("Log scale");
const canvas = document.createElement("canvas");
canvas.className = "plot";
win.main.appendChild(canvas);
const plot = new LinePlot(canvas);
const summary = readout(win.main, "dim");
const table = document.createElement("div");
win.details.appendChild(table);
note(win.details, "Spanwise data from IEA-22-280-RWT.yaml: outer shape, layup, and the beam properties " +
  "(mass, inertia, 6×6 stiffness: EA = K33, edgewise EI = K44, flapwise EI = K55, GJ = K66).");

let current = null;
function redraw() {
  if (!win.isOpen()) return;
  current = QUANTITIES[view.quantity]();
  plyCtl.show(view.quantity === "Ply thickness");
  const opts = {
    ...current, xLabel: "Span position [m]", logY: view.log,
    marker: state.cut < 0.999 ? { x: span(state.cut), label: "cut" } : null,
  };
  plot.draw(opts);
  summary.innerHTML = current.notes ? current.notes() : "";
  if (win.showDetails) table.innerHTML = plotTable(opts);
}
qCtl.onChange(() => { view.log = !!QUANTITIES[view.quantity]().logY; logCtl.updateDisplay(); redraw(); });
plyCtl.onChange(redraw);
logCtl.onChange(redraw);
win.onShow(redraw);
win.onDetails(redraw);
on("cut", redraw);
on(["rpm", "pitch", "wind", "induction", "clockwise", "twist", "prebend", "sweep", "precone"], () => {
  if (AERO_QUANTITIES.has(view.quantity)) redraw();
});
