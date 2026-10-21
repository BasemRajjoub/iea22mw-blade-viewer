import { IEA22_AERO } from "../data/index.js";
import { lerp1D } from "../geometry/math.js";
import { BLADE_GEOM } from "../geometry/sections.js";
import { N_BLADES, RHO_AIR, ROTOR_RADIUS, makeStation, opState, sectionAero } from "./physics.js";

// Whole-rotor performance from the blade-element model: thrust, torque,
// power, Cp, Ct for any operating point, the IEA controller's schedule
// (rpm and pitch vs wind speed) and the resulting power curve.
// Aero power only (no drivetrain/generator losses); steady, no shear.

const AREA = Math.PI * ROTOR_RADIUS ** 2;
const MIN_PITCH = IEA22_AERO.minPitchTable;
const rpmOf = (omega) => omega * 60 / (2 * Math.PI);

let stationCache = null;   // ~45 stations along the span (rebuilt with the geometry)
let curveCache = null;
const controllerCache = new Map();   // "U|model|geometry" -> controllerAt result
function perfStations() {
  if (!stationCache) {
    stationCache = [];
    for (let i = 0; i <= 44; i++) stationCache.push(makeStation(0.005 + 0.99 * i / 44));
  }
  return stationCache;
}
// call after any geometry change (aero/operating.js does)
function invalidatePerformance() { stationCache = null; curveCache = null; controllerCache.clear(); }

// op: { wind, rpm, pitchDeg, model, induction, tipLoss, hubLoss, glauert }
function rotorPerformance(op) {
  const st = perfStations(), cone = BLADE_GEOM.precone ? IEA22_AERO.coneDeg * Math.PI/180 : 0;
  const rows = st.map(s => ({ s, a: sectionAero(s, op) }));
  let T = 0, Q = 0;
  for (let i = 1; i < rows.length; i++) {
    const dx = rows[i].s.X - rows[i-1].s.X, p = rows[i-1].a, q = rows[i].a;
    T += dx * (p.Fn + q.Fn) / 2 * Math.cos(cone);
    Q += dx * (p.Ft * p.r + q.Ft * q.r) / 2;
  }
  T *= N_BLADES; Q *= N_BLADES;
  const omega = op.rpm * 2*Math.PI / 60, P = Q * omega;
  const qA = 0.5 * RHO_AIR * AREA;
  return {
    T, Q, P, rows,
    Cp: op.wind > 0 ? P / (qA * op.wind ** 3) : 0,
    Ct: op.wind > 0 ? T / (qA * op.wind ** 2) : 0,
    lambda: op.wind > 0 ? omega * ROTOR_RADIUS / op.wind : 0,
  };
}

// induction-model settings currently chosen (shared with the scene)
const modelOf = () => ({ model: opState.model, induction: opState.induction, tipLoss: opState.tipLoss, hubLoss: opState.hubLoss, glauert: opState.glauert });

// The controller at wind speed U: rotor speed tracks the optimal tip-speed
// ratio between min and rated rpm; pitch follows the YAML minimum-pitch
// table, and above rated it rises until aero power = rated power.
function controllerAt(U, model = modelOf()) {
  const key = `${U}|${JSON.stringify(model)}|${BLADE_GEOM.twist}${BLADE_GEOM.precone}`;
  if (controllerCache.has(key)) return controllerCache.get(key);
  const result = computeController(U, model);
  if (controllerCache.size > 200) controllerCache.clear();
  controllerCache.set(key, result);
  return result;
}
function computeController(U, model) {
  const minR = IEA22_AERO.minRpm, ratedR = IEA22_AERO.ratedRpm;
  const rpm = Math.min(Math.max(rpmOf(IEA22_AERO.optimalTsr * U / ROTOR_RADIUS), minR), ratedR);
  const minPitch = lerp1D(U, MIN_PITCH.wind, MIN_PITCH.pitch);
  const op = { ...model, wind: U, rpm, pitchDeg: minPitch };
  let perf = rotorPerformance(op), pitch = minPitch;
  const Prated = IEA22_AERO.ratedPower;
  if (perf.P > Prated) {               // region 3: bisection on pitch (power falls as pitch rises)
    let lo = minPitch, hi = 45;
    for (let k = 0; k < 18; k++) {
      pitch = (lo + hi) / 2;
      perf = rotorPerformance({ ...op, pitchDeg: pitch });
      if (perf.P > Prated) lo = pitch; else hi = pitch;
    }
  }
  const region = U < IEA22_AERO.cutIn || U > IEA22_AERO.cutOut ? "parked"
    : pitch > minPitch + 0.05 ? "3 (pitch control)"
    : rpm >= ratedR - 1e-6 ? "2½ (rated speed)"
    : rpm <= minR + 1e-6 ? "1½ (min speed)" : "2 (optimal TSR)";
  return { U, rpm, pitch, region, ...perf };
}

// power curve 3…25 m/s (cached until geometry or model settings change)
function powerCurve() {
  const model = modelOf(), key = JSON.stringify(model) + BLADE_GEOM.twist + BLADE_GEOM.precone;
  if (curveCache?.key === key) return curveCache.points;
  const points = [];
  for (let U = IEA22_AERO.cutIn; U <= IEA22_AERO.cutOut + 1e-9; U += 0.5) {
    const c = controllerAt(U, model);
    points.push({ U, rpm: c.rpm, pitch: c.pitch, P: c.P, T: c.T, Q: c.Q, Cp: c.Cp, Ct: c.Ct, lambda: c.lambda, region: c.region });
  }
  curveCache = { key, points };
  return points;
}

// Cp and Ct vs tip-speed ratio at a fixed pitch (the classic Cp-λ curve)
function cpLambda(pitchDeg, U = 10) {
  const out = [];
  for (let lam = 2; lam <= 16 + 1e-9; lam += 0.25) {
    const rpm = rpmOf(lam * U / ROTOR_RADIUS);
    const p = rotorPerformance({ ...modelOf(), wind: U, rpm, pitchDeg });
    out.push({ lambda: lam, Cp: p.Cp, Ct: p.Ct });
  }
  return out;
}

export { AREA, controllerAt, cpLambda, invalidatePerformance, powerCurve, rotorPerformance };
