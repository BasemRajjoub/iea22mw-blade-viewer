import { BLADE_LENGTH } from "../../geometry/sections.js";
import { HUB_RADIUS } from "../../scene/turbine.js";
import { set, state } from "../../state.js";
import { createWindow, getWindow } from "../window-manager.js";
import { note, panel } from "../controls.js";
import { showQuantity } from "./plots.js";
import { showAirfoils } from "./airfoils.js";
import { showPlot } from "./performance.js";
import { showView } from "./site.js";
import { showDesign, tipBest } from "./design.js";

// Exercises: one-click presets for the Wind 1 exercise sheets. Each button
// sets values in the shared state and opens the windows that show the
// answer; nothing here computes anything itself.

const win = createWindow({ id: "exercises", title: "Exercises", icon: "✦", width: 330, details: true, open: true, first: true });

const defaults = { ...state };   // for "Reset all settings"
const zAt = r => Math.min(Math.max((r - HUB_RADIUS) / BLADE_LENGTH, 0.02), 1);   // r from the rotor axis -> span fraction
// windows a preset opened; the next preset closes them again (not ones the user opened)
let presetWindows = new Set();
const open = (...ids) => ids.forEach(id => { const w = getWindow(id); if (!w.isOpen()) { w.open(); presetWindows.add(id); } });
function apply(changes, ...windows) {
  Object.entries(changes).forEach(([k, v]) => set(k, v));
  open(...windows);
}
// wraps each preset: close what the previous preset opened, run, remember what opened now
function runPreset(fn) {
  presetWindows.forEach(id => { if (id !== "exercises") getWindow(id).close(); });
  presetWindows = new Set();
  const before = new Set([...document.querySelectorAll(".win:not([hidden])")].map(w => w.dataset.win));
  fn();
  document.querySelectorAll(".win:not([hidden])").forEach(w => {
    if (!before.has(w.dataset.win) || presetWindows.has(w.dataset.win)) presetWindows.add(w.dataset.win);
  });
}
const station = (r) => () => { apply({ cut: zAt(r), rpm: 7.061, wind: 11, followController: false }, "section2d"); showQuantity("Reynolds number"); };

const EXERCISES = {
  "1 · Wind and site conditions": {
    goal: "Power in the wind, the u³ effect, wind shear across the rotor and the Rayleigh distribution.",
    formulas: "P = ½ρπR²u³ · c_P = P_el/P_wind · log law u₂ = u₁·ln(z₂/z0)/ln(z₁/z0) · α = ln(u₁/u₂)/ln(z₁/z₂) · Rayleigh h(u) = (π/2)(u/ū²)·exp(−(π/4)(u/ū)²)",
    presets: {
      "Q2–Q3: rotor at 11 m/s (power curve, Cp)": () => { apply({ turbine: true, wind: 11, followController: true }); showPlot("Power coefficient Cp"); },
      "Q6: shear over open sea (z0 = 0.0002 m)": () => { apply({ shearModel: "log", z0: 0.0002, wind: 8, showShear3D: true }); showView("Wind shear profile"); },
      "Q6: shear over grass (z0 = 0.03 m)": () => { apply({ shearModel: "log", z0: 0.03, wind: 8, showShear3D: true }); showView("Wind shear profile"); },
      "Q6: shear over forest (z0 = 1.0 m)": () => { apply({ shearModel: "log", z0: 1.0, wind: 8, showShear3D: true }); showView("Wind shear profile"); },
      "Q8: Rayleigh with ū = 10 m/s": () => { apply({ meanWind: 10, weibullK: 2, powerCurveSource: "IEA 22 MW (BEM)" }); showView("Wind distribution & AEP"); },
      "Thrust vs wind speed (peaks near rated)": () => { apply({ turbine: true, wind: 10, followController: true }); showPlot("Thrust"); },
    },
  },
  "2 · Aerodynamics I": {
    goal: "Relative velocity and Reynolds number along the blade, lift per metre, and normal/tangential force coefficients.",
    formulas: "u_rel = √(u² + (Ωr)²) · Re = u_rel·c/ν (ν = 1.464·10⁻⁵ m²/s) · F′_L = C_l·½ρu_rel²c · C_l = C_n cosα − C_a sinα, C_d = C_n sinα + C_a cosα",
    presets: {
      "Q2: station r = 11.09 m (root)": station(11.09),
      "Q2: station r = 73.10 m (mid-span)": station(73.10),
      "Q2: station r = 121.33 m (outboard)": station(121.33),
      "Q4: 90 % span, lift per metre": () => { apply({ cut: 0.9, rpm: 7.061, wind: 11, revealStep: 3 }, "section2d"); },
      "Q5: chord-normal and chord forces": () => { apply({ showChordForces: true, revealStep: 5 }, "section2d"); },
    },
  },
  "3 · Aerodynamics II": {
    goal: "Airfoil polars (C_L,max, C_D,min, glide ratio), thick vs thin airfoils along the span, rotor power coefficient.",
    formulas: "glide ratio C_L/C_D · Re = u_rel·c/ν · A = πR² · C_P = P/P_wind · τ = P/Ω · λ = ΩR/u",
    presets: {
      "Q1: glide ratio 420FB vs 211": () => showAirfoils({ airfoil: "SNL-FFA-W3-420FB", compare: "FFA-W3-211", coeff: "Glide ratio Cl/Cd", range: "−20° … 25°" }),
      "Q1: lift curves 330blend vs 211": () => showAirfoils({ airfoil: "FFA-W3-330blend", compare: "FFA-W3-211", coeff: "Lift Cl", range: "−20° … 25°" }),
      "Q2: station r = 26.25 m (420FB)": station(26.25),
      "Q2: station r = 45.54 m (330blend)": station(45.54),
      "Q2: station r = 139.24 m (211)": station(139.24),
      "Q2: thickness along the span": () => showQuantity("Relative thickness t/c"),
      "Q3: rotor at 11 m/s, 7.06 rpm": () => { apply({ wind: 11, rpm: 7.061, pitch: -4.011, followController: false, turbine: true }); showPlot("Power curve"); },
    },
  },
  "4 · Betz theory": {
    goal: "The Betz limit and stream tube, the blade-section sketch, and the Betz optimum chord and twist.",
    formulas: "C_P,max = 16/27 at a = 1/3 · tan φ = (1−a)/λ_r · θ = φ − α · c = 16πR/(9BC_lλ)·1/√(λ²(r/R)²+4/9)",
    presets: {
      "Q1: Betz stream tube (a = 1/3)": () => apply({ inductionModel: "fixed", induction: 1/3, showStreamTube: true }, "site"),
      "Q2: build the section sketch step by step": () => apply({ revealStep: 1, showChordForces: false }, "section2d"),
      "Q3: section at r = 90 m (λ 9.15, α 6°)": () => { apply({ designTSR: 9.15, designCl: +tipBest.cl.toFixed(2), designAlpha: +tipBest.alpha.toFixed(1), cut: zAt(90) }); showDesign("Twist"); },
      "Q4: Betz optimum blade at λ = 9.15": () => { apply({ designTSR: 9.15, designCl: +tipBest.cl.toFixed(2), designAlpha: +tipBest.alpha.toFixed(1), ghostBlade: "betz" }); showDesign("Chord"); },
      "Q4: slow rotor λ = 3": () => { apply({ designTSR: 3, ghostBlade: "betz" }); showDesign("Chord"); },
    },
  },
  "5 · Schmitz theory": {
    goal: "Wake rotation (a′), the Schmitz optimum blade vs Betz vs the real blade, and a, a′ along the span.",
    formulas: "φ = (2/3)·arctan(1/λ_r) · c = (16πr/(BC_l))·sin²(arctan(1/λ_r)/3) · σ = Bc/(2πr) · a = 1/(1 + 4sin²φ/(σC_l cosφ)) · a′ = 1/(4cosφ/(σC_l) − 1)",
    presets: {
      "Q2: Schmitz vs Betz vs IEA 22 (chord)": () => { apply({ ghostBlade: "schmitz" }); showDesign("Chord"); },
      "Q2: Schmitz vs Betz vs IEA 22 (twist)": () => { apply({ ghostBlade: "schmitz" }); showDesign("Twist"); },
      "Q1: wake rotation in the section (BEM)": () => apply({ inductionModel: "bem", revealStep: 1 }, "section2d"),
      "Q3: a and a′ along the span (BEM)": () => { apply({ inductionModel: "bem", followController: true }); showQuantity("Induction a, a′"); },
      "Q3: Schmitz a, a′ at r = 45 / 90 / 135 m": () => { apply({ designTSR: 9.15, designCl: +tipBest.cl.toFixed(2), designAlpha: +tipBest.alpha.toFixed(1), ghostBlade: "schmitz" }); showDesign("Chord"); const w = getWindow("design"); if (!w.showDetails) w.el.querySelector(".win-details").click(); },
    },
  },
  "6 · BEM theory": {
    goal: "Blade-element momentum: iterate a and a′ at a station, losses, and spanwise loads to rotor thrust and power.",
    formulas: "tan φ = (1−a)U/((1+a′)Ωr) · α = φ − θ · C_t = C_l cosφ + C_d sinφ · C_q = C_l sinφ − C_d cosφ · a = 1/(4F sin²φ/(σC_t)+1) · a′ = 1/(4F sinφ cosφ/(σC_q)−1)",
    presets: {
      "Q2: BEM station r = 73.10 m at 10 m/s": () => {
        apply({ inductionModel: "bem", cut: zAt(73.10), wind: 10, followController: true }, "aero", "section2d");
        const w = getWindow("aero"); if (!w.showDetails) w.el.querySelector(".win-details").click();
      },
      "BEM vs fixed a = 1/3": () => { apply({ inductionModel: "fixed", induction: 1/3 }); showQuantity("Aero loads"); },
      "BEM (solved)": () => { apply({ inductionModel: "bem" }); showQuantity("Aero loads"); },
      "Without tip loss": () => { apply({ inductionModel: "bem", tipLoss: false }); showQuantity("Aero loads"); },
      "With tip loss": () => { apply({ inductionModel: "bem", tipLoss: true }); showQuantity("Aero loads"); },
    },
  },
  "7 · QBlade design": {
    goal: "Polars, blade geometry, and the rotor Cp–λ / Ct–λ curves you would get from QBlade's BEM module.",
    formulas: "θ = φ − α · P = C_P·½ρπR²U³ · Betz C_P = 0.593",
    presets: {
      "Cp–λ and Ct–λ curves": () => showPlot("Cp–λ (current pitch)"),
      "Polars of the tip airfoil": () => showAirfoils({ airfoil: "FFA-W3-211", compare: "none", coeff: "Lift Cl", range: "Full ±180°" }),
      "Chord along the span": () => showQuantity("Chord"),
      "Twist along the span": () => showQuantity("Twist"),
    },
  },
  "8 · Control": {
    goal: "Operating regions, variable-speed operation, rated torque and pitch-to-feather control.",
    formulas: "Ω = λU/R · u_tip = ΩR · M = P/Ω · K_gen = C_P·ρπR⁵/(2λ³), M = K_gen·Ω²",
    presets: {
      "Cut-in 3 m/s": () => apply({ turbine: true, wind: 3, followController: true }, "performance"),
      "Region 2: 8 m/s (optimal λ)": () => apply({ turbine: true, wind: 8, followController: true }, "performance"),
      "Rated: 11 m/s": () => apply({ turbine: true, wind: 11, followController: true }, "performance"),
      "Region 3: 15 m/s (pitching)": () => apply({ turbine: true, wind: 15, followController: true }, "performance"),
      "Cut-out: 25 m/s": () => apply({ turbine: true, wind: 25, followController: true }, "performance"),
      "Feathered (90°)": () => apply({ turbine: true, followController: false, pitch: 90, rpm: 0.3 }, "section2d"),
      "Pitch schedule vs wind": () => showPlot("Pitch schedule"),
      "Rotor speed vs wind": () => showPlot("Rotor speed"),
    },
  },
  "9 · Energy and economics": {
    goal: "Hub-height wind, annual energy, capacity factor, full-load hours and the levelised cost of energy.",
    formulas: "u(z) log law · E = Σ P·f·Δu·8760 · CF = E/(P·8760) · CRF = r(1+r)ⁿ/((1+r)ⁿ−1) · LCOE = (CAPEX·CRF + OPEX)/E",
    presets: {
      "Q2: hub height 170 m (ū = 11.36 m/s)": () => { apply({ powerCurveSource: "IEA 22 MW (BEM)", meanWind: 11.36, weibullK: 2 }); showView("Wind distribution & AEP"); },
      "Q3: lower tower 150 m (ū = 11.25 m/s)": () => { apply({ powerCurveSource: "IEA 22 MW (BEM)", meanWind: 11.25, weibullK: 2 }); showView("Wind distribution & AEP"); },
      "Q4: costs (3000 €/kW, 25 yr, r = 6 %)": () => {
        apply({ powerCurveSource: "IEA 22 MW (BEM)", meanWind: 11.36, weibullK: 2, capex: 3000, opexFixed: 90, opexVar: 0.02, years: 25, rate: 0.06, price: 0.10 });
        showView("Cost of energy (LCOE)");
      },
      "Hub-height wind from u10 = 9 m/s (z0 = 0.0002)": () => { apply({ shearModel: "log", z0: 0.0002, wind: 11.36 }); showView("Wind shear profile"); },
      "Comparison: Vestas V236-15 MW at 150 m": () => { apply({ powerCurveSource: "Vestas V236-15 MW (Ex 9)", meanWind: 11.25, weibullK: 2 }); showView("Wind distribution & AEP"); },
    },
  },
};

const view = { exercise: Object.keys(EXERCISES)[0] };
const gui = panel(win.main);
gui.add(view, "exercise", Object.keys(EXERCISES)).name("Exercise").onChange(showExercise);
const goal = note(win.main, "");
const folders = Object.entries(EXERCISES).map(([name, ex]) => {
  const f = gui.addFolder("Presets");
  Object.entries(ex.presets).forEach(([label, fn]) => f.add({ fn: () => runPreset(fn) }, "fn").name(label));
  return { name, f };
});
gui.add({ reset: () => Object.entries(defaults).forEach(([k, v]) => set(k, v)) }, "reset").name("Reset all settings");
const formulas = note(win.details, "");
note(win.details, "Presets only set values and open windows; every number comes from the same models as the rest of the viewer " +
  "(IEA 22 MW geometry and polars, BEM, the controller schedule) — the same values as the exercise sheets' reference " +
  "(figures/iea22/iea22_reference.py). Sheet 6 iterates with a constant F = 0.98; the viewer's BEM uses the full Prandtl loss, so its a, a′ differ slightly.");

function showExercise() {
  const ex = EXERCISES[view.exercise];
  folders.forEach(({ name, f }) => f.show(name === view.exercise));
  goal.textContent = ex.goal;
  formulas.innerHTML = `<b>Key formulas:</b> ${ex.formulas}`;
}
showExercise();
