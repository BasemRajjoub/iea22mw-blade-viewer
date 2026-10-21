// Single source of truth for every user-controllable setting.
// Controls write with set() (or bind() in ui/controls.js), scene code reacts
// with on(). One key can be bound to controls in several windows; they all
// stay in sync because every change goes through emit().
import { IEA22_AERO } from "./data/index.js";

const state = {
  // layers window
  wireframe: false,
  // section cut
  cut: 1,              // span fraction z of the cut (1 = no cut)
  exag: 1,             // ply thickness exaggeration
  turbineCut: true,    // apply the cut to the turbine blades too
  // blade geometry switches
  twist: true, prebend: true, sweep: true, precone: true,
  // rotor
  turbine: false, paused: false, clockwise: true,
  rpm: IEA22_AERO.ratedRpm, pitch: IEA22_AERO.finePitchDeg,
  // wind & aero
  wind: 11, induction: 1/3,
  inductionModel: "bem",   // "bem" (solved a, a′) or "fixed" (induction slider, a′ = 0)
  tipLoss: true, hubLoss: true, glauert: true,
  followController: false, // rpm and pitch follow the IEA controller schedule as wind changes
  showVelocities: false, showForces: false, arrowsCutOnly: false, labels3d: false,
  // 2D section window
  suctionUp: true,
  showChordForces: false,  // normal / tangential-to-chord force components
  revealStep: 5,           // build-up: 1 velocities, 2 angles, 3 lift & drag, 4 resultant, 5 thrust & driving
  velScale: 1,          // 2D section: velocity triangle arrows ×
  forceScale: 1,        // 2D section: all force arrows ×
  smallForceScale: 1,   // 2D section: drag and driving force only × (labelled)
  // site & energy (exercises 1 and 9); state.wind is the hub-height speed
  shearModel: "log", z0: 0.0002, shearAlpha: 0.11,
  showShear3D: false, showStreamTube: false,
  meanWind: 10, weibullK: 2,            // k = 2 is the Rayleigh distribution
  powerCurveSource: "IEA 22 MW (BEM)",
  capex: 3000, opexFixed: 90, opexVar: 0.02, rate: 0.06, years: 25, price: 0.10,
  // blade design (exercises 4 and 5)
  designTSR: 9.15, designCl: 1.2, designAlpha: 6, ghostBlade: "none",
  // scale references
  car: false, human: false, field: false, eiffel: false,
  refStatus: "",       // informational: loading / error text for the glTF models
};

const listeners = new Map();   // key -> Set(fn)
const anyListeners = new Set();

// on("cut", fn) or on(["rpm", "pitch"], fn); fn(value, key). Returns an unsubscribe function.
function on(keys, fn) {
  const list = [].concat(keys);
  list.forEach(k => {
    if (!(k in state)) throw new Error(`unknown state key "${k}"`);
    if (!listeners.has(k)) listeners.set(k, new Set());
    listeners.get(k).add(fn);
  });
  return () => list.forEach(k => listeners.get(k).delete(fn));
}

function onAny(fn) { anyListeners.add(fn); }

function emit(key) {
  listeners.get(key)?.forEach(fn => fn(state[key], key));
  anyListeners.forEach(fn => fn(state[key], key));
}

function set(key, value) {
  if (!(key in state)) throw new Error(`unknown state key "${key}"`);
  if (state[key] === value) return;
  state[key] = value;
  emit(key);
}

// every key that changes the aerodynamics: windows showing aero numbers redraw on these
const AERO_KEYS = ["rpm", "pitch", "wind", "induction", "inductionModel", "tipLoss", "hubLoss", "glauert",
  "clockwise", "twist", "prebend", "sweep", "precone"];

export { AERO_KEYS, emit, on, onAny, set, state };
