import * as THREE from "three";
import { IEA22_AERO } from "../data/index.js";
import { BLADE_LENGTH, N_S } from "../geometry/sections.js";
import { N_Z, sectionCache } from "../geometry/plies.js";
import { scene } from "./setup.js";
import { capMeshes } from "./blade-meshes.js";
import { ALL_PLY_NAMES } from "./curves-meshes.js";
import { GROUND_Y } from "./references.js";

// full turbine: 3 plain outer-surface blades on a hub + tower, for size only.
// Rotor 283 m, hub height 170 m (IEA 22 MW RWT). Tilt/precone ignored.
const rotorArms = [], turbineConeGroups = [], turbinePitchGroups = [], turbineWindGroups = [], turbineBlades = [];
const RATED_RPM = IEA22_AERO.ratedRpm;              // 7.06 rpm
const HUB_RADIUS = IEA22_AERO.hubDiameter / 2;      // 4.2 m -> rotor radius 142 m
const HUB_HEIGHT = 170, OVERHANG = 12;

// outer mould line of the blade (no plies), built from the cached sections
function buildOmlGeometry() {
  const pos = new Float32Array(N_Z * N_S * 3), idx = [];
  for (let iz = 0; iz < N_Z; iz++) for (let is = 0; is < N_S; is++) {
    const k = (iz*N_S + is) * 3, sec = sectionCache[iz];
    pos[k] = sec.X; pos[k+1] = sec.Y[is]; pos[k+2] = sec.Z[is];
  }
  for (let iz = 0; iz < N_Z-1; iz++) for (let is = 0; is < N_S; is++) {
    const is2 = (is+1) % N_S;
    const a = iz*N_S+is, b = iz*N_S+is2, c = (iz+1)*N_S+is, d = (iz+1)*N_S+is2;
    idx.push(a,b,c, b,d,c);
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  bg.setIndex(idx); bg.computeVertexNormals();
  return bg;
}

const turbineGroup = (() => {
  const bg = buildOmlGeometry();
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0xe6eaee, roughness: 0.5, metalness: 0.05, side: THREE.DoubleSide });
  const towerMat = new THREE.MeshStandardMaterial({ color: 0xcfd4da, roughness: 0.6, metalness: 0.1 });

  // local frame: rotor axis = Z, upwind = -Z (blade prebend points to -Z)
  const hub = new THREE.Group();
  hub.position.set(0, HUB_HEIGHT, 0);
  for (let i = 0; i < 3; i++) {
    const arm = new THREE.Group();
    arm.rotation.z = Math.PI/2 + i * 2*Math.PI/3;
    const coneGrp = new THREE.Group();    // precone: tilts the blade about the hub's tangential axis
    const pitchGrp = new THREE.Group();   // pitch bearing: turns the blade about its span axis
    pitchGrp.position.x = HUB_RADIUS;
    const clip = new THREE.Plane();
    const mat = bladeMat.clone(); mat.clippingPlanes = [clip];
    const blade = new THREE.Mesh(bg, mat);
    // ply section caps: the detailed blade's cap meshes, re-instanced (synced every frame)
    const caps = new THREE.Group();
    ALL_PLY_NAMES.forEach(name => {
      const m = new THREE.Mesh(capMeshes[name].geometry, capMeshes[name].material);
      m.userData.ply = name; caps.add(m);
    });
    pitchGrp.add(blade, caps);
    const windGrp = new THREE.Group();    // inflow arrows: blade frame, coned but not pitched
    windGrp.position.x = HUB_RADIUS;
    coneGrp.add(pitchGrp, windGrp); arm.add(coneGrp); hub.add(arm); rotorArms.push(arm);
    turbineConeGroups.push(coneGrp); turbinePitchGroups.push(pitchGrp); turbineWindGroups.push(windGrp);
    turbineBlades.push({ mesh: blade, clip, caps });
  }
  const spinner = new THREE.Mesh(new THREE.SphereGeometry(HUB_RADIUS, 32, 16), towerMat);
  spinner.scale.z = 1.5; spinner.position.z = -1.5;
  const nacelle = new THREE.Mesh(new THREE.BoxGeometry(8, 8, OVERHANG + 14), towerMat);
  nacelle.position.set(0, -1, (OVERHANG + 14)/2 - 4);
  hub.add(spinner, nacelle);

  const tower = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 5, HUB_HEIGHT - 6, 40), towerMat);
  tower.position.set(0, (HUB_HEIGHT - 6)/2, OVERHANG - 2);

  const grp = new THREE.Group();
  grp.add(hub, tower);
  const outer = new THREE.Group();     // flipped so the upwind (prebend) side faces +Z / the camera
  outer.add(grp); outer.rotation.y = Math.PI;
  outer.position.set(BLADE_LENGTH * 0.5, GROUND_Y, -200);
  outer.visible = false;
  scene.add(outer);
  return outer;
})();

export { HUB_HEIGHT, HUB_RADIUS, RATED_RPM, buildOmlGeometry, rotorArms, turbineBlades, turbineConeGroups, turbineGroup, turbinePitchGroups, turbineWindGroups };
