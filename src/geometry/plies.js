import * as THREE from "three";
import { IEA22 } from "../data/index.js";
import { field } from "./math.js";
import { N_S, sGrid, sectionCurve } from "./sections.js";

// =====================================================================
// ply schedule: 12 real composite shell layers
// =====================================================================

const LAYERS = IEA22.layers; // stacking order OML -> inward, as given by the YAML
let EXAG = 1.0;
function setExag(v) { EXAG = v; }              // modest exaggeration (real stack is already up to ~12% of half-thickness)
const ZERO_EPS = 1e-9;
// adjacent plies share a surface (layer k's inner == layer k+1's outer), and a
// ply tapering to t=0 collapses onto its neighbours -- coplanar faces of
// different colours z-fight. Nudge each layer inward by a sub-mm amount so
// touching surfaces never sit at identical depth (outer layer still wins
// from outside, inner layer wins when looking from inside / at a cut).
const LAYER_SEP = 2.5e-4; // m per layer index

// The exact YAML-defined thickness: a hard rectangular on/off window
// (s0 <= s <= s1), no cosmetic smoothing of any kind. Ply-drop edges will
// render as genuine hard steps -- that's deliberate: this view is for
// verifying the real geometry, not for a "prettied up" render.
// split into the per-station part (three table lookups) and the cheap
// per-point test, so loops over the chordwise points look up once per station
function layerParamsAt(layer, z) {
  return { tmax: field(layer.thickness, z), s0: field(layer.startNdArc, z), s1: field(layer.endNdArc, z) };
}
function thicknessFromParams(p, s) {
  if (p.tmax <= ZERO_EPS) return 0;
  const inside = (p.s0 <= 1e-6 && p.s1 >= 1-1e-6) ? true : (s >= p.s0 && s <= p.s1);
  return inside ? p.tmax * EXAG : 0;
}
function layerThicknessAt(layer, s, z) { return thicknessFromParams(layerParamsAt(layer, z), s); }
const layerThicknessHardAt = layerThicknessAt; // kept as an alias: everything is "hard" now

// =====================================================================
// grid + geometry building (same approach as the synthetic version)
// =====================================================================

const N_Z = 90;
const zGrid = Array.from({length:N_Z}, (_,i) => i/(N_Z-1));
const sectionCache = zGrid.map(sectionCurve); // precompute once, reused across layers

function buildPlyShell(layerIdx) {
  const layer = LAYERS[layerIdx];
  const positionsOuter = new Float32Array(N_Z * N_S * 3);
  const positionsInner = new Float32Array(N_Z * N_S * 3);
  const tGrid = new Float64Array(N_Z * N_S);

  for (let iz = 0; iz < N_Z; iz++) {
    const z = zGrid[iz];
    const sec = sectionCache[iz];
    const prm = LAYERS.slice(0, layerIdx + 1).map(l => layerParamsAt(l, z));
    for (let is = 0; is < N_S; is++) {
      const s = sGrid[is];
      let cumBefore = 0;
      for (let k = 0; k < layerIdx; k++) cumBefore += thicknessFromParams(prm[k], s);
      const t = thicknessFromParams(prm[layerIdx], s);
      cumBefore += layerIdx * LAYER_SEP;
      const cumAfter = cumBefore + t;
      tGrid[iz*N_S + is] = t;

      const nX = sec.nx[is], nY = sec.ny[is];
      const idx = (iz*N_S + is) * 3;
      positionsOuter[idx]   = sec.X;
      positionsOuter[idx+1] = sec.Y[is] - nX*cumBefore;
      positionsOuter[idx+2] = sec.Z[is] - nY*cumBefore;

      positionsInner[idx]   = sec.X;
      positionsInner[idx+1] = sec.Y[is] - nX*cumAfter;
      positionsInner[idx+2] = sec.Z[is] - nY*cumAfter;
    }
  }

  // NOTE: is loops through N_S (not N_S-1) and wraps via %N_S -- this closes
  // the small physical gap between the first point (s=0, upper TE) and last
  // point (s=1, lower TE) with real geometry instead of leaving it open. For
  // thick flatback root sections this gap is a genuine blunt TE face; near
  // the tip it's the thin TE bond line -- both fall out naturally here.
  function buildIndices(reverse) {
    const idxArr = [];
    for (let iz = 0; iz < N_Z-1; iz++) {
      for (let is = 0; is < N_S; is++) {
        const is2 = (is+1) % N_S;
        const a = iz*N_S+is, b = iz*N_S+is2, c = (iz+1)*N_S+is, d = (iz+1)*N_S+is2;
        const maxT = Math.max(tGrid[a], tGrid[b], tGrid[c], tGrid[d]);
        if (maxT < ZERO_EPS) continue;
        if (!reverse) idxArr.push(a,b,c, b,d,c);
        else          idxArr.push(a,c,b, b,c,d);
      }
    }
    return idxArr;
  }

  const outerGeom = new THREE.BufferGeometry();
  outerGeom.setAttribute("position", new THREE.BufferAttribute(positionsOuter, 3));
  outerGeom.setIndex(buildIndices(false));
  outerGeom.computeVertexNormals();

  const innerGeom = new THREE.BufferGeometry();
  innerGeom.setAttribute("position", new THREE.BufferAttribute(positionsInner, 3));
  innerGeom.setIndex(buildIndices(true));
  innerGeom.computeVertexNormals();

  return { outerGeom, innerGeom };
}

function buildCapGeometry(layerIdx, zCut, epsSign) {
  epsSign = epsSign === undefined ? -1 : epsSign; // -1: offset toward root (interactive cut, root cap); +1: tip cap
  const layer = LAYERS[layerIdx];
  const sec = sectionCurve(zCut);
  const n = N_S;
  const positions = new Float32Array(n * 2 * 3);
  const tVals = new Float64Array(n);
  let anyThickness = false;

  for (let is = 0; is < n; is++) {
    const s = sGrid[is];
    let cumBefore = 0;
    for (let k = 0; k < layerIdx; k++) cumBefore += layerThicknessAt(LAYERS[k], s, zCut);
    cumBefore += layerIdx * LAYER_SEP;
    const t = layerThicknessAt(layer, s, zCut);
    tVals[is] = t;
    if (t > ZERO_EPS) anyThickness = true;
    const cumAfter = cumBefore + t;
    const nX = sec.nx[is], nY = sec.ny[is];
    const x = sec.X + epsSign*0.05; // tiny offset to avoid z-fighting (blade-scale epsilon)

    positions[is*3]     = x;
    positions[is*3+1]   = sec.Y[is] - nX*cumBefore;
    positions[is*3+2]   = sec.Z[is] - nY*cumBefore;
    positions[(n+is)*3]   = x;
    positions[(n+is)*3+1] = sec.Y[is] - nX*cumAfter;
    positions[(n+is)*3+2] = sec.Z[is] - nY*cumAfter;
  }

  const indices = [];
  for (let i = 0; i < n; i++) {
    const i2 = (i+1) % n;
    if (Math.max(tVals[i], tVals[i2]) < ZERO_EPS) continue;
    const o0=i, o1=i2, i0=n+i, i1=n+i2;
    indices.push(o0,o1,i0, o1,i1,i0);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return { geom, anyThickness };
}

function webThicknessAt(webSubLayer, z) {
  return field(webSubLayer.thickness, z) * EXAG;
}

export { EXAG, LAYERS, LAYER_SEP, N_Z, ZERO_EPS, buildCapGeometry, buildPlyShell, layerThicknessHardAt, sectionCache, setExag, webThicknessAt, zGrid };
