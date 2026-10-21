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
  showVelocities: false, showForces: false, arrowsCutOnly: false, labels3d: false,
  // 2D section window
  suctionUp: true,
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

export { emit, on, onAny, set, state };
