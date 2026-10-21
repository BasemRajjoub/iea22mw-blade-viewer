import * as THREE from "three";
import { leSign } from "../geometry/sections.js";
import { coneRig } from "../scene/setup.js";
import { state } from "../state.js";
import { turbineWindGroups } from "../scene/turbine.js";
import { AERO_COLORS, ARROW_M_PER_KNPM, ARROW_M_PER_MPS, leStations, makeStation, pitchYZ, sectionAero } from "./physics.js";

const hex = c => "#" + c.toString(16).padStart(6, "0");

// solid arrows (cylinder shaft + cone head) -- line widths are always 1 px in WebGL
const _arrowShaft = new THREE.CylinderGeometry(1, 1, 1, 10).translate(0, 0.5, 0);
const _arrowHead = new THREE.ConeGeometry(1, 1, 14).translate(0, 0.5, 0);
const _arrowMats = {};
const _yAxis = new THREE.Vector3(0, 1, 0);
function makeArrow(from, dir, len, color) {
  const mat = _arrowMats[color] || (_arrowMats[color] = new THREE.MeshBasicMaterial({ color }));
  const r = Math.max(0.1, len * 0.012), headLen = Math.min(len * 0.3, r * 8), headR = r * 2.6;
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(_arrowShaft, mat);
  shaft.scale.set(r, len - headLen, r);
  const head = new THREE.Mesh(_arrowHead, mat);
  head.scale.set(headR, headLen, headR); head.position.y = len - headLen;
  g.add(shaft, head);
  g.position.copy(from);
  g.quaternion.setFromUnitVectors(_yAxis, dir);
  return g;
}

const windGroupMain = new THREE.Group();   // on coneRig, not bladeRig: the wind doesn't pitch
coneRig.add(windGroupMain);
[windGroupMain, ...turbineWindGroups].forEach(g => { g.userData.noPick = true; g.visible = false; });

// the fixed stations up to the cut, plus the cut station itself
// (or only the cut station)
function arrowStations() {
  const zc = state.cut;
  const cutSt = () => Object.assign(makeStation(Math.min(Math.max(zc, 0.02), 0.98)), { labelled: true });
  if (state.arrowsCutOnly) return [cutSt()];
  if (zc >= 0.995) return leStations.map((st, i) => i === leStations.length - 1 ? { ...st, labelled: true } : st);
  return [...leStations.filter(st => st.z < zc - 0.02), cutSt()];
}

// value labels: one camera-facing block per station (colour-coded lines,
// one per arrow), constant size on screen, drawn on top, beside the LE.
// Per-arrow labels pile up where several arrows share an end point.
function makeLabelBlock(lines) {
  const fs = 26, lh = 34, pad = 10, cv = document.createElement("canvas"), g = cv.getContext("2d");
  g.font = `600 ${fs}px system-ui, sans-serif`;
  cv.width = Math.ceil(Math.max(...lines.map(l => g.measureText(l.text).width))) + pad*2;
  cv.height = lines.length * lh + pad*2;
  g.font = `600 ${fs}px system-ui, sans-serif`;
  g.fillStyle = "rgba(14,16,21,0.8)"; g.fillRect(0, 0, cv.width, cv.height);
  g.textBaseline = "middle";
  lines.forEach((l, i) => { g.fillStyle = hex(l.color); g.fillText(l.text, pad, pad + lh*(i + 0.5)); });
  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: false, depthWrite: false }));
  const h = 0.024 * lines.length;          // ~0.024 of the view height per line
  sp.scale.set(h * cv.width / cv.height, h, 1);
  sp.center.set(-0.06, 0.5);               // just to the right of the anchor
  sp.renderOrder = 998;
  return sp;
}

function fillAeroArrows(group, stations, withLabels) {
  group.traverse(o => { if (o.isSprite) { o.material.map.dispose(); o.material.dispose(); } });
  group.clear();
  const showV = state.showVelocities, showF = state.showForces, labels = withLabels && state.labels3d;
  const sY = leSign();
  stations.forEach(st => {
    const a = sectionAero(st), lines = [];
    const [ly, lz] = pitchYZ(st.le), [ty, tz] = pitchYZ(st.te);
    const le = new THREE.Vector3(st.X, ly, lz);
    const qc = new THREE.Vector3(st.X, ly + 0.25*(ty - ly), lz + 0.25*(tz - lz));  // aerodynamic centre
    const add = (at, dy, dz, len, color, endAt, label) => {
      if (len < 0.05) return;
      const dir = new THREE.Vector3(0, dy, dz).normalize();
      const from = endAt ? at.clone().addScaledVector(dir, -len) : at;
      group.add(makeArrow(from, dir, len, color));
      if (label) lines.push({ text: label, color });
    };
    const kN = v => (v / 1000).toFixed(2) + " kN/m";
    if (showV) {
      add(le, 0, 1, a.ua * ARROW_M_PER_MPS, AERO_COLORS.axial, true, `U(1−a) ${a.ua.toFixed(1)} m/s`);
      add(le, -sY, 0, a.ut * ARROW_M_PER_MPS, AERO_COLORS.rot, true, `Ωr ${a.ut.toFixed(1)} m/s`);
      add(le, a.dirW[0], a.dirW[1], a.W * ARROW_M_PER_MPS, AERO_COLORS.rel, true, `W ${a.W.toFixed(1)} m/s`);
    }
    if (showF) {
      const k = ARROW_M_PER_KNPM / 1000, sgn = v => Math.sign(v) || 1;
      add(qc, a.dirL[0]*sgn(a.L), a.dirL[1]*sgn(a.L), Math.abs(a.L)*k, AERO_COLORS.lift, false, `L ${kN(a.L)}`);
      add(qc, a.dirD[0], a.dirD[1], Math.abs(a.D)*k, AERO_COLORS.drag, false, `D ${kN(a.D)}`);
      const Ry = a.L*a.dirL[0] + a.D*a.dirD[0], Rz = a.L*a.dirL[1] + a.D*a.dirD[1];
      add(qc, Ry, Rz, Math.hypot(Ry, Rz)*k, AERO_COLORS.res, false, `R ${kN(Math.hypot(Ry, Rz))}`);
      add(qc, 0, sgn(a.Fn), Math.abs(a.Fn)*k, AERO_COLORS.thrust, false, `Fn ${kN(a.Fn)}`);
      add(qc, sgn(a.Ft)*sY, 0, Math.abs(a.Ft)*k, AERO_COLORS.torque, false, `Ft ${kN(a.Ft)}`);
    }
    if (labels && st.labelled && lines.length) {   // one block only: more just pile up
      lines.unshift({ text: `r ${a.r.toFixed(1)} m · φ ${a.phi.toFixed(1)}° · α ${a.alpha.toFixed(1)}°`, color: 0xc7ccd4 });
      const sp = makeLabelBlock(lines);
      sp.position.copy(le);
      group.add(sp);
    }
  });
}

export { _yAxis, arrowStations, fillAeroArrows, hex, makeArrow, windGroupMain };
