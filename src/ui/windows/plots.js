import { IEA22, MATERIAL_COLORS, STRUCTURE } from "../../data/index.js";
import { field } from "../../geometry/math.js";
import { BLADE_LENGTH } from "../../geometry/sections.js";
import { LAYERS } from "../../geometry/plies.js";
import { WEBS } from "../../geometry/webs.js";
import { computedRthick } from "../../geometry/curves.js";
import { makeStation, opState, sectionAero } from "../../aero/physics.js";
import { AERO_KEYS, on, state } from "../../state.js";
import { createWindow } from "../window-manager.js";
import { note, panel, batched, readout } from "../controls.js";
import { LinePlot, plotTable } from "../plot.js";

// Plots: spanwise blade data straight from the YAML (planform, structure,
// layup) plus the aero along the span at the current operating point.
// The dashed line marks the current cut.

const win = createWindow({ id: "plots", title: "Plots", icon: "∿", width: 520, details: true });
win.el.classList.add("win-plot");
if (!win.el.style.height) win.el.style.height = "460px";

const span = z => z * BLADE_LENGTH;   // span position from the root, m
const fromField = (f, k = 1) => ({ x: f.grid.map(span), y: f.values.map(v => v * k) });
const fromStructure = (key) => ({ x: STRUCTURE.grid.map(span), y: STRUCTURE[key] });
const sample = (fn, n = 120) => {
  const x = [], y = [];
  for (let i = 0; i <= n; i++) { const z = i / n; x.push(span(z)); y.push(fn(z)); }
  return { x, y };
};
const integrate = (x, y) => { let s = 0; for (let i = 1; i < x.length; i++) s += (x[i] - x[i-1]) * (y[i] + y[i-1]) / 2; return s; };
const pretty = n => n.replace(/_/g, " ");
const PLIES = [...LAYERS, ...WEBS];
const plyByName = n => PLIES.find(p => p.name === n);
const isShell = p => LAYERS.includes(p);
const materialLegend = (series) => [...new Set(series.map(s => s.color))].map(c => ({
  color: c, label: Object.keys(MATERIAL_COLORS).find(k => MATERIAL_COLORS[k] === c).replace(/_/g, " "),
}));

// a ply's real (unexaggerated) thickness at arc position s of station z, mm
function plyThicknessAt(p, s, z) {
  const t = field(p.thickness, z);
  if (t <= 1e-9) return 0;
  if (!isShell(p)) return t * 1000;
  const s0 = field(p.startNdArc, z), s1 = field(p.endNdArc, z);
  const inside = (s0 <= 1e-6 && s1 >= 1 - 1e-6) || (s >= s0 && s <= s1);
  return inside ? t * 1000 : 0;
}

// aero along the span at the current operating point
function aeroSpan() {
  const st = [];
  for (let z = 0.02; z <= 0.995; z += 0.01) { const s = makeStation(z); st.push({ s, a: sectionAero(s) }); }
  return st;
}
const aeroSeries = (label, fn) => {
  const st = aeroSpan();
  return { series: [{ label, x: st.map(p => span(p.s.z)), y: st.map(p => fn(p.a)) }] };
};

// chordwise positions for the laminate stack (s = 0 suction-side TE, ~0.5 LE, 1 pressure-side TE)
const A = IEA22.anchors;
const LOCATIONS = {
  "Spar cap, suction side": z => (field(A.spar_cap_ss.start, z) + field(A.spar_cap_ss.end, z)) / 2,
  "Spar cap, pressure side": z => (field(A.spar_cap_ps.start, z) + field(A.spar_cap_ps.end, z)) / 2,
  "Leading edge": z => field(A.LE.start, z),
  "Trailing edge, suction side": () => 0.03,
  "Custom arc position s": () => view.arc,
};
// palette slots for the (max 3) selected plies, in selection order -- the chips use the same
const SLOT = ["#3987e5", "#d95926", "#199e70"];
const slotOf = n => SLOT[order.indexOf(n)];
const STEPS = 140, zStations = Array.from({ length: STEPS + 1 }, (_, i) => i / STEPS), xStations = zStations.map(span);

// each quantity -> { series, yLabel, logY?, yTicks?, legend?, notes() }
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
  "Ply thickness (compare)": () => {
    const sel = selectedPlies();
    return {
      series: sel.map(n => ({ label: pretty(n), color: slotOf(n), ...fromField(plyByName(n).thickness, 1000) })),
      yLabel: "Ply thickness [mm]",
      notes: () => (sel.length ? "" : "Tick up to three plies under “Plies to compare”."),
    };
  },
  "Laminate stack (all plies)": () => {
    const loc = LOCATIONS[view.location], cum = zStations.map(() => 0), series = [];
    LAYERS.forEach(p => {
      const t = zStations.map(z => plyThicknessAt(p, loc(z), z));
      if (!t.some(v => v > 0)) return;
      const y0 = cum.slice();
      t.forEach((v, i) => { cum[i] += v; });
      series.push({
        label: pretty(p.name), x: xStations, color: MATERIAL_COLORS[p.material] || "#999",
        y0: y0.map((v, i) => (t[i] > 0 ? v : NaN)), y1: cum.map((v, i) => (t[i] > 0 ? v : NaN)),
        hover: i => (t[i] > 0 ? `${t[i].toFixed(1)} mm` : null), value: i => t[i],
      });
    });
    return {
      series, yLabel: "Laminate thickness, outside → in [mm]", legend: materialLegend(series),
      notes: () => `Total laminate at the cut: <b>${cum[Math.round(Math.min(state.cut, 1) * STEPS)].toFixed(1)} mm</b> ` +
        `(${view.location.toLowerCase()}). Real thicknesses; the 3D view can exaggerate them.`,
    };
  },
  "Layup map (where each ply is)": () => {
    const series = PLIES.map((p, row) => {
      const t = zStations.map(z => field(p.thickness, z) * 1000), yv = -row;
      return {
        label: pretty(p.name), x: xStations, color: MATERIAL_COLORS[p.material] || "#999",
        y0: t.map(v => (v > 1e-6 ? yv - 0.36 : NaN)), y1: t.map(v => (v > 1e-6 ? yv + 0.36 : NaN)),
        hover: i => (t[i] > 1e-6 ? `${t[i].toFixed(1)} mm` : null), value: i => t[i],
      };
    });
    return {
      series, yLabel: "", yTicks: PLIES.map((p, row) => ({ v: -row, label: pretty(p.name) })), legend: materialLegend(series),
      notes: () => "Bars show where along the span each ply exists (hover for its thickness). Shell plies first, then the shear webs.",
    };
  },
  "Ply chordwise extent": () => {
    // widest band first, so full-wrap plies don't cover the narrow ones
    const width = p => zStations.reduce((w, z) => w + field(p.endNdArc, z) - field(p.startNdArc, z), 0);
    const sel = selectedPlies().map(plyByName).filter(isShell).sort((a, b) => width(b) - width(a));
    const series = sel.map(p => {
      const present = zStations.map(z => field(p.thickness, z) > 1e-6);
      return {
        label: pretty(p.name), x: xStations, alpha: 0.55, color: slotOf(p.name),
        y0: zStations.map((z, i) => (present[i] ? field(p.startNdArc, z) : NaN)),
        y1: zStations.map((z, i) => (present[i] ? field(p.endNdArc, z) : NaN)),
        hover: i => (present[i] ? `s ${field(p.startNdArc, zStations[i]).toFixed(3)} … ${field(p.endNdArc, zStations[i]).toFixed(3)}` : null),
      };
    });
    series.push({ label: "leading edge", x: xStations, y: zStations.map(z => field(A.LE.start, z)), color: "#c7ccd4", dashed: true });
    return {
      series, yLabel: "Arc position s (0 = TE suction, 1 = TE pressure)",
      notes: () => (sel.length ? "Each band is the chordwise range a ply covers around the airfoil." : "Tick up to three shell plies under “Plies to compare”."),
    };
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
          `aero power <b>${(Q*omega/1e6).toFixed(1)} MW</b> (${opState.model === "bem" ? "BEM" : "fixed a = " + opState.induction.toFixed(2)}, steady, no losses).`;
      },
    };
  },
  "Angle of attack": () => ({ ...aeroSeries("α", a => a.alpha), yLabel: "Angle of attack α [°]" }),
  "Inflow angle φ": () => ({ ...aeroSeries("φ", a => a.phi), yLabel: "Inflow angle φ [°]" }),
  "Lift coefficient": () => ({ ...aeroSeries("Cl", a => a.cl), yLabel: "Cl [-]" }),
  "Induction a, a′": () => {
    const st = aeroSpan(), x = st.map(p => span(p.s.z));
    return {
      series: [{ label: "axial a", x, y: st.map(p => p.a.a) }, { label: "tangential a′", x, y: st.map(p => p.a.ap) },
        { label: "Betz 1/3", x: [x[0], x[x.length - 1]], y: [1/3, 1/3], dashed: true }],
      yLabel: "Induction [-]",
    };
  },
  "Reynolds number": () => ({ ...aeroSeries("Re", a => a.Re / 1e6), yLabel: "Reynolds number [10⁶]" }),
};
const AERO_QUANTITIES = new Set(["Aero loads", "Angle of attack", "Inflow angle φ", "Lift coefficient", "Induction a, a′", "Reynolds number"]);
const PLY_SELECT = new Set(["Ply thickness (compare)", "Ply chordwise extent"]);

const view = { quantity: "Chord", log: false, location: "Spar cap, suction side", arc: 0.5 };
// ply selection: max three (the palette); ticking a fourth unticks the oldest
const picked = Object.fromEntries(PLIES.map(p => [p.name, false]));
let order = ["spar_cap_ss", "shell_triax_outer", "te_reinforcement_ss"];
order.forEach(n => { picked[n] = true; });
const selectedPlies = () => order.slice();

const gui = panel(win.main);
const qCtl = gui.add(view, "quantity", Object.keys(QUANTITIES)).name("Quantity");
const logCtl = gui.add(view, "log").name("Log scale");
const locCtl = gui.add(view, "location", Object.keys(LOCATIONS)).name("Chordwise location");
const arcCtl = gui.add(view, "arc", 0, 1, 0.005).name("Arc position s");
// compact toggle chips (21 checkbox rows would push the plot out of view)
const chips = document.createElement("div");
chips.className = "chips";
chips.innerHTML = `<span class="chips-head">Plies to compare (max 3)</span>`;
const chipEls = PLIES.map(p => {
  const b = document.createElement("button");
  b.type = "button"; b.className = "chip"; b.textContent = pretty(p.name);
  b.addEventListener("click", () => {
    const on = !picked[p.name];
    picked[p.name] = on;
    order = order.filter(n => n !== p.name);
    if (on) { order.push(p.name); if (order.length > 3) picked[order.shift()] = false; }
    showChips(); redraw();
  });
  chips.appendChild(b);
  return { b, name: p.name };
});
function showChips() {
  chipEls.forEach(({ b, name }) => {
    const i = order.indexOf(name);
    b.setAttribute("aria-pressed", String(i >= 0));
    b.style.borderColor = i >= 0 ? SLOT[i] : "";
  });
}
win.main.appendChild(chips);
showChips();
const plyFolder = { show: (v) => { chips.style.display = v ? "" : "none"; } };
const canvas = document.createElement("canvas");
canvas.className = "plot";
win.main.appendChild(canvas);
const plot = new LinePlot(canvas);
const summary = readout(win.main, "dim");
const table = document.createElement("div");
win.details.appendChild(table);
note(win.details, "Spanwise data from IEA-22-280-RWT.yaml: outer shape, layup, and the beam properties " +
  "(mass, inertia, 6×6 stiffness: EA = K33, edgewise EI = K44, flapwise EI = K55, GJ = K66). Reynolds number with ν = 1.464·10⁻⁵ m²/s.");

function redraw() {
  if (!win.isOpen()) return;
  const q = view.quantity, current = QUANTITIES[q]();
  plyFolder.show(PLY_SELECT.has(q));
  locCtl.show(q.startsWith("Laminate"));
  arcCtl.show(q.startsWith("Laminate") && view.location.startsWith("Custom"));
  logCtl.show(!current.yTicks && !current.legend && !q.startsWith("Ply"));
  const opts = {
    ...current, xLabel: "Span position [m]", logY: view.log && !current.yTicks,
    marker: state.cut < 0.999 ? { x: span(state.cut), label: "cut" } : null,
  };
  plot.draw(opts);
  summary.innerHTML = current.notes ? current.notes() : "";
  table.innerHTML = win.showDetails && opts.series.length ? plotTable(opts) : "";
}
qCtl.onChange(() => { view.log = !!QUANTITIES[view.quantity]().logY; logCtl.updateDisplay(); redraw(); });
[logCtl, locCtl, arcCtl].forEach(c => c.onChange(redraw));
const redrawSoon = batched(redraw);
win.onShow(redraw);
win.onDetails(redraw);
on("cut", redrawSoon);
on(AERO_KEYS, () => { if (AERO_QUANTITIES.has(view.quantity)) redrawSoon(); });

function showQuantity(name) {
  if (!QUANTITIES[name]) return;
  view.quantity = name; view.log = !!QUANTITIES[name]().logY;
  qCtl.updateDisplay(); logCtl.updateDisplay(); win.open(); redraw();
}

export { showQuantity };
