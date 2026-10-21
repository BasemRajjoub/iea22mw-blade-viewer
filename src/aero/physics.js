import { IEA22, IEA22_AERO } from "../data/index.js";
import { lerp1D } from "../geometry/math.js";
import { BLADE_GEOM, BLADE_LENGTH, N_S, blendAt, blendedShape, chordAt, leSign, refAxisAt, sectionCurve, twistDegAt } from "../geometry/sections.js";
import { HUB_RADIUS, RATED_RPM } from "../scene/turbine.js";

// =====================================================================
// rotor operating point + quasi-steady 2D blade-element aerodynamics.
// Blade frame: span +X, leading edge on the leSign() side of Y (the blade
// moves LE-first that way), downwind +Z. Written below for clockwise
// (LE at +Y); every Y direction is multiplied by leSign(). At each station:
//   axial      U(1-a)·cosγ   air arriving along +Z            (γ = precone)
//   rotational Ωr            air arriving along -Y (blade moves +Y)
//   relative   W             their sum, hitting the leading edge
//   lift L ⟂ W, drag D ∥ W, from the YAML polars at α = φ - (twist + pitch)
//   thrust Fn (+Z) and driving force Ft (+Y) are the projections of L + D
// User-set induction, no BEM iteration, tip loss or 3D effects.
// =====================================================================
const RHO_AIR = 1.225;
const WIND_STATIONS = [0.3, 0.5, 0.7, 0.9, 0.98];   // span fractions
const ARROW_M_PER_MPS = 0.25;                        // velocity arrow length per m/s
const ARROW_M_PER_KNPM = 0.6;                        // force arrow length per kN/m
const AERO_COLORS = {
  axial: 0x4fc3f7, rot: 0xffb74d, rel: 0xffffff,
  lift: 0x66bb6a, drag: 0xef5350, res: 0xe040fb, thrust: 0x26c6da, torque: 0xffee58,
};
const ROTOR_RADIUS = HUB_RADIUS + BLADE_LENGTH;
const PRESWEEP_IN_YAML = IEA22.refAxisY.values.some(v => Math.abs(v) > 1e-6);

function polarAt(name, aoaDeg) {
  const p = IEA22_AERO.polars[name];
  const a = ((aoaDeg + 180) % 360 + 360) % 360 - 180;   // wrap into [-180, 180)
  return { cl: lerp1D(a, p.aoa, p.cl), cd: lerp1D(a, p.aoa, p.cd), cm: lerp1D(a, p.aoa, p.cm) };
}

// everything the aero needs about one spanwise station, in the (unpitched) blade frame
function makeStation(z) {
  const sec = sectionCurve(z), { x } = blendedShape(z), b = blendAt(z);
  let ile = 0;
  for (let i = 1; i < N_S; i++) if (x[i] < x[ile]) ile = i;   // LE = min chordwise coordinate
  const teY = (sec.Y[0] + sec.Y[N_S-1]) / 2, teZ = (sec.Z[0] + sec.Z[N_S-1]) / 2;
  return {
    z, X: sec.X, sec, chord: chordAt(z), twist: twistDegAt(z),
    le: [sec.Y[ile], sec.Z[ile]], te: [teY, teZ], axis: [refAxisAt(z)[1], refAxisAt(z)[0]],
    airfoils: [b.e0.name, b.e1.name], blend: b.f,
  };
}
let leStations = [];
function computeLeStations() { leStations = WIND_STATIONS.map(makeStation); }
computeLeStations();

const opState = { rpm: RATED_RPM, pitchDeg: IEA22_AERO.finePitchDeg, wind: 11, induction: 1/3 };

// pitch turns the section about the pitch axis (blade X); positive pitch
// turns the LE upwind (-Z), i.e. toward feather -- the same sense as twist.
// This is the same rotation as setting rotation.x = pitchAngle() on the rig.
const pitchAngle = () => -leSign() * opState.pitchDeg * Math.PI/180;
function pitchYZ([y, z]) {
  const t = pitchAngle(), c = Math.cos(t), s = Math.sin(t);
  return [y*c - z*s, y*s + z*c];
}

function sectionAero(st) {
  const cone = BLADE_GEOM.precone ? IEA22_AERO.coneDeg * Math.PI/180 : 0;
  const omega = opState.rpm * 2*Math.PI / 60;
  const r = (HUB_RADIUS + st.X) * Math.cos(cone);               // distance from the rotor axis
  const ua = opState.wind * (1 - opState.induction) * Math.cos(cone);
  const ut = omega * r;
  const W = Math.hypot(ua, ut) || 1e-9;
  const phi = Math.atan2(ua, ut) * 180/Math.PI;
  const beta = st.twist + opState.pitchDeg;
  const alpha = phi - beta;
  const p0 = polarAt(st.airfoils[0], alpha), p1 = polarAt(st.airfoils[1], alpha);
  const cl = (1 - st.blend) * p0.cl + st.blend * p1.cl, cd = (1 - st.blend) * p0.cd + st.blend * p1.cd;
  const q = 0.5 * RHO_AIR * W * W * st.chord;                   // N/m per unit coefficient
  const L = q * cl, D = q * cd;
  const cphi = ut / W, sphi = ua / W, sY = leSign();
  return {
    r, ua, ut, W, phi, beta, alpha, cl, cd, L, D,
    Fn: L*cphi + D*sphi, Ft: L*sphi - D*cphi,
    // unit directions in the blade (Y, Z) plane
    dirW: [-cphi*sY, sphi], dirL: [sphi*sY, cphi], dirD: [-cphi*sY, sphi],
  };
}

export { AERO_COLORS, ARROW_M_PER_KNPM, ARROW_M_PER_MPS, PRESWEEP_IN_YAML, ROTOR_RADIUS, computeLeStations, leStations, makeStation, opState, pitchAngle, pitchYZ, polarAt, sectionAero };
