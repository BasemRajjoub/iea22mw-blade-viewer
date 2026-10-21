import * as THREE from "three";
import { IEA22_AERO } from "../data/index.js";
import { BLADE_LENGTH, N_S, sectionCurve } from "../geometry/sections.js";
import { N_Z, zGrid } from "../geometry/plies.js";
import { bladeRig } from "./setup.js";
import { clipPlane } from "./blade-meshes.js";
import { HUB_HEIGHT, HUB_RADIUS, turbineGroup } from "./turbine.js";
import { ROTOR_RADIUS, opState } from "../aero/physics.js";
import { rotorPerformance } from "../aero/performance.js";
import { designSection } from "../aero/design.js";
import { shearSpeed } from "../aero/site.js";
import { makeArrow } from "../aero/arrows.js";
import { AERO_KEYS, on, set, state } from "../state.js";

// 3D teaching aids, all hidden by default:
// - wind shear profile: a column of arrows u(z) beside the turbine (ex. 1)
// - Betz stream tube through the rotor disk (ex. 4)
// - "ghost" Betz / Schmitz optimum blade over the detailed blade (ex. 4, 5)

// turbineGroup-local frame: ground y = 0, hub at y = HUB_HEIGHT, rotor axis
// along local Z with the wind blowing toward +Z
const R = ROTOR_RADIUS;

// --- wind shear arrows ---
const shearGroup = new THREE.Group();
shearGroup.userData.noPick = true;
turbineGroup.add(shearGroup);
function buildShear() {
  shearGroup.clear();
  shearGroup.visible = state.showShear3D && state.turbine;
  if (!shearGroup.visible) return;
  const s = { model: state.shearModel, z0: state.z0, alpha: state.shearAlpha, uHub: state.wind, H: HUB_HEIGHT };
  for (let h = 10; h <= HUB_HEIGHT + R + 10; h += 15) {
    const u = shearSpeed(h, s), len = u * 3;   // 3 m of arrow per m/s
    if (len > 0.3) shearGroup.add(makeArrow(new THREE.Vector3(R + 50, h, -len - 40), new THREE.Vector3(0, 0, 1), len, h > HUB_HEIGHT - R && h < HUB_HEIGHT + R ? 0x4fc3f7 : 0x5b7a8c));
  }
}

// --- Betz stream tube: actuator-disk expansion, r(x) from continuity ---
const tubeMat = new THREE.MeshStandardMaterial({ color: 0x4fc3f7, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false });
const ringMat = new THREE.LineBasicMaterial({ color: 0x4fc3f7, transparent: true, opacity: 0.55 });
const tube = new THREE.Mesh(new THREE.BufferGeometry(), tubeMat);
tube.userData.noPick = true;
tube.position.set(0, HUB_HEIGHT, 0);
tube.rotation.x = Math.PI / 2;     // lathe axis (Y) -> rotor axis (Z)
turbineGroup.add(tube);
let tubeA = 1/3;
function buildTube() {
  tube.visible = state.showStreamTube && state.turbine;
  if (!tube.visible) return;
  // rotor-average induction: the slider value, or from the BEM thrust coefficient
  let a = opState.induction;
  if (opState.model === "bem") {
    const ct = Math.min(rotorPerformance(opState).Ct, 0.99);
    a = (1 - Math.sqrt(1 - ct)) / 2;
  }
  tubeA = a = Math.min(Math.max(a, 0.01), 0.45);
  const radius = x => R * Math.sqrt((1 - a) / (1 - a * (1 + x / Math.hypot(x, R))));   // continuity, actuator-disk axial speed
  const pts = [];
  for (let x = -1.6 * R; x <= 2.4 * R; x += R / 20) pts.push(new THREE.Vector2(radius(x), x));
  tube.geometry.dispose();
  tube.geometry = new THREE.LatheGeometry(pts, 64);
  // rings every 0.4 R make the expansion readable through the faint surface
  tube.children.forEach(c => c.geometry.dispose());
  tube.clear();
  for (let x = -1.6 * R; x <= 2.4 * R + 1; x += 0.4 * R) {
    const ring = [];
    for (let k = 0; k <= 64; k++) { const t = k / 64 * 2 * Math.PI; ring.push(new THREE.Vector3(radius(x) * Math.cos(t), x, radius(x) * Math.sin(t))); }
    tube.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ring), ringMat));
  }
}

// --- ghost optimum blade on the detailed blade ---
const ghostMat = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false, clippingPlanes: [clipPlane] });
const ghost = new THREE.Mesh(new THREE.BufferGeometry(), ghostMat);
ghost.userData.noPick = true;
bladeRig.add(ghost);
const designParams = () => ({ R, lambda: state.designTSR, B: 3, cl: state.designCl, alphaDeg: state.designAlpha });
function buildGhost() {
  ghost.visible = state.ghostBlade !== "none";
  if (!ghost.visible) return;
  ghostMat.color.set(state.ghostBlade === "schmitz" ? 0x199e70 : 0xd95926);   // same colours as the design plots
  const p = designParams(), pos = new Float32Array(N_Z * N_S * 3), idx = [];
  zGrid.forEach((z, iz) => {
    const r = HUB_RADIUS + z * BLADE_LENGTH, d = designSection(state.ghostBlade, r, p);
    const sec = sectionCurve(z, { chord: d.chord, twistDeg: d.twist });
    for (let is = 0; is < N_S; is++) {
      const k = (iz * N_S + is) * 3;
      pos[k] = sec.X; pos[k+1] = sec.Y[is]; pos[k+2] = sec.Z[is];
    }
  });
  for (let iz = 0; iz < N_Z - 1; iz++) for (let is = 0; is < N_S; is++) {
    const is2 = (is + 1) % N_S, a = iz*N_S+is, b = iz*N_S+is2, c = (iz+1)*N_S+is, d = (iz+1)*N_S+is2;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  ghost.geometry.dispose();
  ghost.geometry = g;
}

on(["showShear3D", "turbine", "shearModel", "z0", "shearAlpha", "wind"], buildShear);
on(["showStreamTube", "turbine", ...AERO_KEYS], buildTube);
on(["ghostBlade", "designTSR", "designCl", "designAlpha", "clockwise", "prebend", "sweep"], buildGhost);
// the turbine-based aids need the turbine shown
on(["showShear3D", "showStreamTube"], (v) => { if (v && !state.turbine) set("turbine", true); });

const streamTubeInduction = () => tubeA;

export { streamTubeInduction };
