import { IEA22_AERO } from "../../data/index.js";
import { ROTOR_RADIUS } from "../../aero/physics.js";
import { powerCurve } from "../../aero/performance.js";
import { V236, annualEnergy, lcoe, shearSpeed } from "../../aero/site.js";
import { AERO_KEYS, on, set, state } from "../../state.js";
import { createWindow } from "../window-manager.js";
import { bind, button, note, panel, batched, readout } from "../controls.js";
import { LinePlot, plotTable } from "../plot.js";

// Site & energy (exercises 1 and 9): the wind shear profile across the
// rotor, the wind-speed distribution with annual energy / capacity factor,
// and the cost of energy. The hub-height wind is the shared wind speed.

const win = createWindow({ id: "site", title: "Site & energy", icon: "☁", width: 480, details: true });
win.el.classList.add("win-plot");
if (!win.el.style.height) win.el.style.height = "560px";

const H = IEA22_AERO.hubHeight, R = ROTOR_RADIUS;
const VIEWS = ["Wind shear profile", "Wind distribution & AEP", "Cost of energy (LCOE)"];
const view = { view: VIEWS[0] };

const gui = panel(win.main);
gui.add(view, "view", VIEWS).name("View").onChange(update);
const shearCtl = [
  bind(gui, "wind", 3, 25, 0.1).decimals(1).name("Wind at hub (m/s)"),
  bind(gui, "shearModel", { "Log law (roughness z0)": "log", "Power law (α)": "power" }).name("Profile"),
  bind(gui, "z0", { "Open sea (0.0002 m)": 0.0002, "Grass (0.03 m)": 0.03, "Forest (1.0 m)": 1.0 }).name("Roughness z0"),
  bind(gui, "shearAlpha", 0, 0.5, 0.01).decimals(2).name("Power-law α"),
  bind(gui, "showShear3D").name("Show profile in 3D"),
  bind(gui, "showStreamTube").name("Show Betz stream tube"),
];
const distCtl = [
  bind(gui, "meanWind", 4, 14, 0.05).decimals(2).name("Mean wind at hub (m/s)"),
  bind(gui, "weibullK", 1.2, 4, 0.1).decimals(1).name("Weibull k (2 = Rayleigh)"),
  bind(gui, "powerCurveSource", ["IEA 22 MW (BEM)", "Vestas V236-15 MW (Ex 9)"]).name("Power curve"),
];
const costCtl = [
  bind(gui, "capex", 1000, 6000, 50).decimals(0).name("CAPEX (€/kW)"),
  bind(gui, "opexFixed", 0, 200, 1).decimals(0).name("Fixed O&M (€/kW/yr)"),
  bind(gui, "opexVar", 0, 0.05, 0.001).decimals(3).name("Variable O&M (€/kWh)"),
  bind(gui, "rate", 0, 0.12, 0.005).decimals(3).name("Discount rate r"),
  bind(gui, "years", 10, 40, 1).decimals(0).name("Lifetime (years)"),
  bind(gui, "price", 0.02, 0.25, 0.005).decimals(3).name("Price (€/kWh)"),
];
const ratesBtn = [4, 6, 8].map(r => button(gui, `r = ${r} %`, () => set("rate", r / 100)));

const top = document.createElement("canvas"); top.className = "plot";
const bottom = document.createElement("canvas"); bottom.className = "plot";
win.main.append(top, bottom);
const topPlot = new LinePlot(top), bottomPlot = new LinePlot(bottom);
const out = readout(win.main);
const formulas = readout(win.details);
const table = document.createElement("div");
win.details.appendChild(table);

function source() {
  if (state.powerCurveSource.startsWith("Vestas")) return { name: "V236", curve: V236.curve, rated: V236.rated, cutIn: V236.cutIn, cutOut: V236.cutOut };
  return { name: "IEA 22 MW", curve: powerCurve().map(p => ({ U: p.U, P: p.P })), rated: IEA22_AERO.ratedPower, cutIn: IEA22_AERO.cutIn, cutOut: IEA22_AERO.cutOut };
}
const shear = () => ({ model: state.shearModel, z0: state.z0, alpha: state.shearAlpha, uHub: state.wind, H });

function update() {
  const v = view.view;
  shearCtl.forEach(c => c.show(v === VIEWS[0]));
  distCtl.forEach(c => c.show(v !== VIEWS[0]));
  costCtl.forEach(c => c.show(v === VIEWS[2]));
  ratesBtn.forEach(c => c.show(v === VIEWS[2]));
  shearCtl[2].show(v === VIEWS[0] && state.shearModel === "log");
  shearCtl[3].show(v === VIEWS[0] && state.shearModel === "power");
  bottom.style.display = v === VIEWS[1] ? "" : "none";
  redraw();
}

function redraw() {
  if (!win.isOpen()) return;
  const v = view.view;
  if (v === VIEWS[0]) {
    const s = shear(), z = [], u = [];
    for (let h = 1; h <= 330; h += 2) { z.push(h); u.push(shearSpeed(h, s)); }
    const uMax = Math.max(...u) * 1.05;
    const opts = {
      series: [{ label: "u(z)", x: u, y: z },
        { label: "rotor", x: [0, uMax], y0: [H - R, H - R], y1: [H + R, H + R], color: "#8b94a1", alpha: 0.12, hover: () => null }],
      legend: [], xLabel: "Wind speed [m/s]", yLabel: "Height [m]",
      markers: [{ x: state.wind, label: `hub ${H} m: ${state.wind.toFixed(1)} m/s` }],
    };
    topPlot.draw(opts);
    const lo = shearSpeed(H - R, s), hi = shearSpeed(H + R, s), at20 = shearSpeed(20, s);
    out.innerHTML = `bottom tip ${(H - R).toFixed(0)} m: ${lo.toFixed(2)} m/s · top tip ${(H + R).toFixed(0)} m: ${hi.toFixed(2)} m/s ` +
      `(${(((hi / lo) ** 3 - 1) * 100).toFixed(0)} % more power density) · at 20 m: ${at20.toFixed(2)} m/s · ` +
      `equivalent power-law α = ${(Math.log(hi / lo) / Math.log((H + R) / (H - R))).toFixed(3)}`;
    formulas.innerHTML = "log law u(z) = u_hub·ln(z/z0)/ln(H/z0) · power law u(z) = u_hub·(z/H)^α · α = ln(u₁/u₂)/ln(z₁/z₂)";
    if (win.showDetails) table.innerHTML = plotTable({ series: [{ label: "u [m/s]", x: z, y: u }], xLabel: "z [m]" }, 34);
    return;
  }
  const src = source(), e = annualEnergy(src.curve, state.meanWind, state.weibullK, src.rated, src.cutIn, src.cutOut);
  if (v === VIEWS[1]) {
    const uu = e.bins.filter((b, i) => i % 4 === 0);
    topPlot.draw({ series: [{ label: "probability", x: uu.map(b => b.u), y: uu.map(b => b.f * 100) }],
      xLabel: "Wind speed at hub [m/s]", yLabel: "Probability [% per m/s]",
      markers: [{ x: src.cutIn, label: "cut-in" }, { x: src.cutOut, label: "cut-out" }, { x: state.meanWind, label: "mean", strong: true }] });
    bottomPlot.draw({ series: [{ label: "energy", x: uu.map(b => b.u), y: uu.map(b => b.e / 0.05 / 1e9) }],
      xLabel: "Wind speed at hub [m/s]", yLabel: `${src.name} energy [GWh/yr per m/s]` });
  } else {
    const rs = [], ys = [];
    for (let r = 0; r <= 0.1201; r += 0.0025) { rs.push(r * 100); ys.push(lcoe({ ...state, rate: r }, src.rated / 1e3, e.E / 1e3).lcoe * 100); }
    topPlot.draw({
      series: [{ label: "LCOE", x: rs, y: ys }, { label: "price", x: [0, 12], y: [state.price * 100, state.price * 100], dashed: true }],
      xLabel: "Discount rate r [%]", yLabel: `${src.name} LCOE [ct/kWh]`,
      marker: { x: state.rate * 100, label: `r = ${(state.rate * 100).toFixed(1)} %`, strong: true },
    });
  }
  const c = lcoe(state, src.rated / 1e3, e.E / 1e3);
  out.innerHTML = `${src.name}: AEP <b>${(e.E / 1e9).toFixed(1)} GWh/yr</b> · capacity factor <b>${(e.CF * 100).toFixed(1)} %</b> · ` +
    `full-load hours ${e.FLH.toFixed(0)} h · operating ${(e.opFraction * 100).toFixed(1)} % of the time (${e.opHours.toFixed(0)} h/yr) · ` +
    `most frequent wind ${e.mode.toFixed(1)} m/s` +
    (v === VIEWS[2] ? `<br/>CRF ${c.crf.toFixed(4)} · annual cost ${(c.annual / 1e6).toFixed(2)} M€ · <b>LCOE ${(c.lcoe * 100).toFixed(2)} ct/kWh</b> · ` +
      `revenue ${(c.revenue / 1e6).toFixed(2)} M€/yr · simple payback ${isFinite(c.payback) ? c.payback.toFixed(1) + " yr" : "never"} · ` +
      `break-even CF ${(c.breakEvenCF * 100).toFixed(1)} %` : "");
  formulas.innerHTML = "Weibull f(u) = (k/A)(u/A)^(k−1)·exp(−(u/A)^k), A = ū/Γ(1+1/k) (k = 2: Rayleigh) · AEP = Σ P(u)·f(u)·Δu·8760 h · " +
    "CF = AEP/(P_rated·8760) · CRF = r(1+r)ⁿ/((1+r)ⁿ−1) · LCOE = (CAPEX·CRF + O&M)/AEP" +
    (src.name === "IEA 22 MW" ? " · IEA power curve = BEM aero power with the controller, no losses." : "");
  if (win.showDetails && v === VIEWS[1]) {
    const uu = e.bins.filter((b, i) => i % 20 === 10);
    table.innerHTML = plotTable({ series: [{ label: "f [%/(m/s)]", x: uu.map(b => b.u), y: uu.map(b => b.f * 100) },
      { label: "E [GWh/yr per m/s]", x: uu.map(b => b.u), y: uu.map(b => b.e / 0.05 / 1e9) }], xLabel: "u [m/s]" }, 40);
  } else table.innerHTML = "";
}
const redrawSoon = batched(redraw);
win.onShow(redraw);
win.onDetails(redraw);
on(["shearModel", "z0", "shearAlpha", "meanWind", "weibullK", "powerCurveSource", "capex", "opexFixed", "opexVar", "rate", "years", "price", ...AERO_KEYS], () => {
  if (view.view === VIEWS[0]) { shearCtl[2].show(state.shearModel === "log"); shearCtl[3].show(state.shearModel === "power"); }
  redrawSoon();
});
update();

function showView(name) { if (VIEWS.includes(name)) { view.view = name; gui.controllers[0].updateDisplay(); win.open(); update(); } }

export { showView };
