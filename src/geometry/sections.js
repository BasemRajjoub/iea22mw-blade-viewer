import { IEA22 } from "../data/index.js";
import { field, inPlaneNormals } from "./math.js";

// =====================================================================
// blade planform + blended airfoil shape
// =====================================================================

const N_S = IEA22.sCommon.length;
const sGrid = IEA22.sCommon;
const BLADE_LENGTH = IEA22.bladeLength;

function chordAt(z)         { return field(IEA22.chord, z); }
// geometry switches (Blade geometry panel); everything downstream reads these
const BLADE_GEOM = { twist: true, prebend: true, sweep: true, precone: true };
// Rotation sense. The section coordinates come out chordwise-mirrored
// relative to a rotor turning clockwise seen from upwind, so for clockwise
// we flip Y (LE at +Y, blade moving +Y); counter-clockwise keeps the raw
// coordinates (LE at -Y, moving -Y). Normals follow automatically (signed
// area). leSign() is the side the leading edge -- and the motion -- is on.
let CHORD_MIRROR = -1;
function setChordMirror(v) { CHORD_MIRROR = v; }
const leSign = () => -CHORD_MIRROR;
function twistDegAt(z)      { return BLADE_GEOM.twist ? field(IEA22.twistDeg, z) : 0; }
function sectionOffsetYAt(z){ return field(IEA22.sectionOffsetY, z); }
function refAxisAt(z) {   // [prebend (-> Z), presweep (-> Y), span (-> X)]
  return [BLADE_GEOM.prebend ? field(IEA22.refAxisX, z) : 0,
          BLADE_GEOM.sweep ? CHORD_MIRROR * field(IEA22.refAxisY, z) : 0,
          field(IEA22.refAxisZ, z)];
}

const blendTable = IEA22.blendTable; // sorted by z already (exported that way)

// the two airfoils bracketing z and the blend fraction between them
function blendAt(z) {
  const positions = blendTable.map(e => e.z);
  let e0, e1, f;
  if (z <= positions[0]) { e0 = e1 = blendTable[0]; f = 0; }
  else if (z >= positions[positions.length-1]) { e0 = e1 = blendTable[blendTable.length-1]; f = 0; }
  else {
    for (let i = 0; i < blendTable.length-1; i++) {
      if (blendTable[i].z <= z && z <= blendTable[i+1].z) {
        e0 = blendTable[i]; e1 = blendTable[i+1];
        f = (e1.z === e0.z) ? 0 : (z - e0.z) / (e1.z - e0.z);
        break;
      }
    }
  }
  return { e0, e1, f };
}

function blendedShape(z) {
  const { e0, e1, f } = blendAt(z);
  const s0 = IEA22.airfoilShapes[e0.name], s1 = IEA22.airfoilShapes[e1.name];
  const x = new Float64Array(N_S), y = new Float64Array(N_S);
  for (let i = 0; i < N_S; i++) {
    x[i] = (1-f)*s0.x[i] + f*s1.x[i];
    y[i] = (1-f)*s0.y[i] + f*s1.y[i];
  }
  return { x, y };
}

// full 3D section curve at span fraction z (chord/twist/offset/prebend applied)
// returns {X (span,m), Y (chordwise,m), Z (thickness dir,m), nx, ny (in Y-Z plane)}
// over: optional { chord, twistDeg } replacing the real values (used for the
// Betz / Schmitz "ghost" blades); the pitch-axis offset scales with the chord
function sectionCurve(z, over = {}) {
  const { x: xs, y: ys } = blendedShape(z);
  const c = over.chord ?? chordAt(z);
  const off = sectionOffsetYAt(z) * (over.chord != null ? over.chord / chordAt(z) : 1);
  const twist = (over.twistDeg ?? twistDegAt(z)) * Math.PI/180;
  const [rx, ry, rz] = refAxisAt(z);
  const cosT = Math.cos(twist), sinT = Math.sin(twist);

  const Y = new Float64Array(N_S), Z = new Float64Array(N_S);
  for (let i = 0; i < N_S; i++) {
    const cw = xs[i]*c - off;
    const th = ys[i]*c;
    const cwR = cw*cosT - th*sinT;
    const thR = cw*sinT + th*cosT;
    Y[i] = ry + CHORD_MIRROR * cwR;
    Z[i] = rx + thR;
  }
  const { nx, ny } = inPlaneNormals(Y, Z);
  return { X: rz, Y, Z, nx, ny };
}

export { BLADE_GEOM, BLADE_LENGTH, CHORD_MIRROR, N_S, blendAt, blendedShape, chordAt, leSign, refAxisAt, sGrid, sectionCurve, setChordMirror, twistDegAt };
