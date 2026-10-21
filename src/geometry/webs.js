import * as THREE from "three";
import { IEA22 } from "../data/index.js";
import { field, lerp1D } from "./math.js";
import { sGrid, sectionCurve } from "./sections.js";
import { LAYERS, LAYER_SEP, N_Z, ZERO_EPS, layerThicknessHardAt, sectionCache, webThicknessAt, zGrid } from "./plies.js";

// =====================================================================
// shear webs: flat sandwich panels (skin/foam/skin) bonded to the shell's
// INNER cavity surface at two chordwise attachment points per span station.
// The sandwich is centered on the line connecting those two attachment
// points, consistent with how the web's reference/mid-plane is normally
// treated in blade structural models.
// =====================================================================

const WEBS = IEA22.webs;                 // 9 sublayers (3 webs x skin/foam/skin)
const WEB_ATTACH = IEA22.webAttachments; // { web0: {start:{grid,values}, end:{...}}, ... }

function cumShellThicknessAt(s, z) {
  let sum = 0;
  for (const layer of LAYERS) sum += layerThicknessHardAt(layer, s, z);
  return sum;
}

// shell-inner-surface attachment point (Y,Z) + local normal at arbitrary s
function attachPoint(sec, s) {
  const Y = lerp1D(s, sGrid, sec.Y), Z = lerp1D(s, sGrid, sec.Z);
  const nX = lerp1D(s, sGrid, sec.nx), nY = lerp1D(s, sGrid, sec.ny);
  const cum = cumShellThicknessAt(s, sec.zVal);
  return { Y: Y - nX*cum, Z: Z - nY*cum };
}

function buildWebPly(webLayer) {
  const webName = webLayer.web;                 // 'web0' | 'web1' | 'web2'
  const siblings = WEBS.filter(w => w.web === webName);
  const idx = siblings.findIndex(w => w.name === webLayer.name);
  const attach = WEB_ATTACH[webName];

  const positionsOuter = new Float32Array(N_Z * 2 * 3);
  const positionsInner = new Float32Array(N_Z * 2 * 3);
  const tGrid = new Float64Array(N_Z * 2);

  for (let iz = 0; iz < N_Z; iz++) {
    const z = zGrid[iz];
    const sec = sectionCache[iz]; sec.zVal = z;
    const s0 = field(attach.start, z), s1 = field(attach.end, z);
    const A = attachPoint(sec, s0), B = attachPoint(sec, s1);

    const dY = B.Y - A.Y, dZ = B.Z - A.Z;
    const len = Math.hypot(dY, dZ) || 1e-9;
    const webNY = -dZ/len, webNZ = dY/len; // perpendicular to AB, in the Y-Z plane

    let tBefore = 0, tThis = 0, tTotal = 0;
    for (let k = 0; k < siblings.length; k++) {
      const tk = webThicknessAt(siblings[k], z);
      if (k < idx) tBefore += tk;
      if (k === idx) tThis = tk;
      tTotal += tk;
    }
    // The web's reference/attach line represents its MIDPLANE (the
    // sandwich's center), not one skin's face -- standard convention for
    // where a shear web's reference surface sits relative to its skins.
    const centerShift = tTotal/2;
    const cumBefore = tBefore - centerShift + idx*LAYER_SEP; // see LAYER_SEP
    const cumAfter = cumBefore + tThis;
    tGrid[iz*2] = tThis; tGrid[iz*2+1] = tThis;

    const oIdx = (iz*2)*3;
    positionsOuter[oIdx]   = sec.X; positionsOuter[oIdx+1] = A.Y + webNY*cumBefore; positionsOuter[oIdx+2] = A.Z + webNZ*cumBefore;
    positionsOuter[oIdx+3] = sec.X; positionsOuter[oIdx+4] = B.Y + webNY*cumBefore; positionsOuter[oIdx+5] = B.Z + webNZ*cumBefore;
    positionsInner[oIdx]   = sec.X; positionsInner[oIdx+1] = A.Y + webNY*cumAfter;  positionsInner[oIdx+2] = A.Z + webNZ*cumAfter;
    positionsInner[oIdx+3] = sec.X; positionsInner[oIdx+4] = B.Y + webNY*cumAfter;  positionsInner[oIdx+5] = B.Z + webNZ*cumAfter;
  }

  function buildIndices(reverse) {
    const idxArr = [];
    for (let iz = 0; iz < N_Z-1; iz++) {
      const a = iz*2, b = iz*2+1, c = (iz+1)*2, d = (iz+1)*2+1;
      const maxT = Math.max(tGrid[a], tGrid[b], tGrid[c], tGrid[d]);
      if (maxT < ZERO_EPS) continue;
      if (!reverse) idxArr.push(a,b,c, b,d,c);
      else          idxArr.push(a,c,b, b,c,d);
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

function buildWebCapGeometry(webLayer, zCut, epsSign) {
  epsSign = epsSign === undefined ? -1 : epsSign;
  const webName = webLayer.web;
  const siblings = WEBS.filter(w => w.web === webName);
  const idx = siblings.findIndex(w => w.name === webLayer.name);
  const attach = WEB_ATTACH[webName];

  const sec = sectionCurve(zCut); sec.zVal = zCut;
  const s0 = field(attach.start, zCut), s1 = field(attach.end, zCut);
  const A = attachPoint(sec, s0), B = attachPoint(sec, s1);
  const dY = B.Y - A.Y, dZ = B.Z - A.Z;
  const len = Math.hypot(dY, dZ) || 1e-9;
  const webNY = -dZ/len, webNZ = dY/len;

  let tTotal = 0, tBefore = 0, tThis = 0;
  for (let k = 0; k < siblings.length; k++) {
    const tk = webThicknessAt(siblings[k], zCut);
    if (k < idx) tBefore += tk;
    if (k === idx) tThis = tk;
    tTotal += tk;
  }
  const centerShift = tTotal/2;
  const cumBefore = tBefore - centerShift + idx*LAYER_SEP;
  const cumAfter = cumBefore + tThis;
  const anyThickness = tThis > ZERO_EPS;
  const x = sec.X + epsSign*0.05;

  const positions = new Float32Array([
    x, A.Y + webNY*cumBefore, A.Z + webNZ*cumBefore,
    x, B.Y + webNY*cumBefore, B.Z + webNZ*cumBefore,
    x, A.Y + webNY*cumAfter,  A.Z + webNZ*cumAfter,
    x, B.Y + webNY*cumAfter,  B.Z + webNZ*cumAfter,
  ]);
  const indices = anyThickness ? [0,1,2, 1,3,2] : [];
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return { geom, anyThickness };
}

export { WEBS, WEB_ATTACH, attachPoint, buildWebCapGeometry, buildWebPly };
