import * as THREE from "three";
import { IEA22 } from "../data/index.js";
import { field, lerp1D } from "./math.js";
import { blendedShape, refAxisAt, sGrid } from "./sections.js";
import { N_Z, ZERO_EPS, sectionCache, webThicknessAt, zGrid } from "./plies.js";
import { WEBS, WEB_ATTACH, attachPoint } from "./webs.js";

// =====================================================================
// structural reference curves (anchors): spar cap edges, reinforcement
// edges, LE/TE -- these are the span-dependent curves ("splines") that
// define where each ply's chordwise boundary sits. Drawn on the OML,
// always visible (not affected by the clip plane), independently toggled.
// =====================================================================

const ANCHORS = IEA22.anchors;
const ANCHOR_COLORS = {
  TE: 0xffffff, LE: 0xffffff,
  spar_cap_ss: 0xffd54a, spar_cap_ps: 0xffd54a,
  le_reinforcement: 0x4ade80, te_reinforcement_ss: 0x60a5fa, te_reinforcement_ps: 0x60a5fa,
  web0: 0xf472b6, web1: 0xf472b6, web2: 0xf472b6,
};

function buildAnchorCurve(sField) {
  const pts = [];
  for (let iz = 0; iz < N_Z; iz++) {
    const sec = sectionCache[iz];
    const s = field(sField, zGrid[iz]);
    const Y = lerp1D(s, sGrid, sec.Y), Z = lerp1D(s, sGrid, sec.Z);
    pts.push(new THREE.Vector3(sec.X, Y, Z));
  }
  const geom = new THREE.BufferGeometry().setFromPoints(pts);
  return geom;
}

// The TRUE attachment point (offset inward through the shell, exactly what
// buildWebPly uses) -- as opposed to buildAnchorCurve above, which only
// shows the raw chordwise position projected onto the OUTER surface. These
// are genuinely different curves; overlaying both is what lets us see
// whether a web is really touching the shell where it should.
function buildWebAttachCurve(webName, which) {
  const attach = WEB_ATTACH[webName];
  const siblings = WEBS.filter(w => w.web === webName);
  const pts = [];
  for (let iz = 0; iz < N_Z; iz++) {
    const z = zGrid[iz];
    const anyThickness = siblings.some(w => webThicknessAt(w, z) > ZERO_EPS);
    if (!anyThickness) continue;
    const sec = sectionCache[iz]; sec.zVal = z;
    const s = field(which === 'A' ? attach.start : attach.end, z);
    const P = attachPoint(sec, s);
    pts.push(new THREE.Vector3(sec.X, P.Y, P.Z));
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

// The reference/pitch axis itself -- the actual 3D curve (prebend + sweep)
// that all the cross-sections are built relative to. Not on the OML; this
// is the blade's own central spline.
function buildRefAxisCurve() {
  const pts = [];
  for (let iz = 0; iz < N_Z; iz++) {
    const z = zGrid[iz];
    const [rx, ry, rz] = refAxisAt(z);
    pts.push(new THREE.Vector3(rz, ry, rx));
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

// Sanity check: relative thickness (t/c) as directly stated in the YAML's
// outer_shape.rthick vs. what our blended-airfoil geometry actually
// produces. They should track closely; a big divergence would mean the
// airfoil blending has drifted from what the YAML intends.
function computedRthick(z) {
  const { y } = blendedShape(z);
  let ymin = Infinity, ymax = -Infinity;
  for (let i = 0; i < y.length; i++) { if (y[i] < ymin) ymin = y[i]; if (y[i] > ymax) ymax = y[i]; }
  return ymax - ymin;
}

export { ANCHORS, ANCHOR_COLORS, buildAnchorCurve, buildRefAxisCurve, buildWebAttachCurve, computedRthick };
