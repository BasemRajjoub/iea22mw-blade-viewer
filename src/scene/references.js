import * as THREE from "three";
import { on, set, state } from "../state.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { lerp1D } from "../geometry/math.js";
import { BLADE_LENGTH } from "../geometry/sections.js";
import { invalidate, scene } from "./setup.js";

// =====================================================================
// scale-reference models (car + human), loaded from CDN on first tick.
// Each is normalised by bounding box to a real-world size in metres.
// =====================================================================
const GROUND_Y = -4; // grid height
const MODEL_BASE = "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/models/gltf/";
const gltfLoader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/gltf/");
gltfLoader.setDRACOLoader(dracoLoader);

function loadRef(file, fit, place, onDone) {
  gltfLoader.load(MODEL_BASE + file, (gltf) => {
    invalidate(1000);
    const obj = gltf.scene;
    obj.traverse(o => { if (o.isMesh) { o.frustumCulled = false; } });
    const wrap = new THREE.Group();
    wrap.add(obj);
    fit(obj);                       // rotate/scale in place
    const box = new THREE.Box3().setFromObject(obj);
    obj.position.x -= (box.min.x + box.max.x) / 2;   // centre on X/Z, feet on y=0
    obj.position.z -= (box.min.z + box.max.z) / 2;
    obj.position.y -= box.min.y;
    place(wrap);
    scene.add(wrap);
    onDone(wrap, gltf);
  }, undefined, () => { set("refStatus", "Could not load " + file + " (offline?)"); });
}

// loads the model the first time state[key] turns on, then just shows/hides it
function setupRefToggle(key, file, fit, place) {
  let model = null, loading = false;
  on(key, (shown) => {
    if (model) { model.visible = shown; return; }
    if (!shown || loading) return;
    loading = true; set("refStatus", "Loading " + file + "…");
    loadRef(file, fit, place, (m) => {
      model = m; m.visible = state[key]; loading = false; set("refStatus", "");
    });
  });
}

// human: Soldier.glb, upright along +Y, scaled to 1.75 m, standing beside the root
setupRefToggle("human", "Soldier.glb",
  (obj) => {
    const b = new THREE.Box3().setFromObject(obj);
    obj.scale.setScalar(1.75 / (b.max.y - b.min.y));
  },
  (wrap) => { wrap.position.set(2.5, GROUND_Y, 4.5); wrap.rotation.y = Math.PI / 2; }
);

// car: Ferrari, longest horizontal axis -> 4.5 m, parked parallel to the blade at mid-span
setupRefToggle("car", "ferrari.glb",
  (obj) => {
    const b = new THREE.Box3().setFromObject(obj);
    const len = Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
    if (b.max.z - b.min.z > b.max.x - b.min.x) obj.rotation.y = Math.PI / 2; // long axis -> X
    obj.scale.setScalar(4.5 / len);
    obj.updateMatrixWorld(true);
  },
  (wrap) => { wrap.position.set(BLADE_LENGTH * 0.2, GROUND_Y, 8); }
);

// soccer field: procedural FIFA-size pitch (105 x 68 m) with line markings,
// lying on the grid beside the blade, long side parallel to the span.
const fieldGroup = (() => {
  const L = 105, W = 68, PX = 12;           // PX = canvas pixels per metre
  const cv = document.createElement("canvas");
  cv.width = (L + 4) * PX; cv.height = (W + 4) * PX;
  const g = cv.getContext("2d");
  g.fillStyle = "#2e7d32"; g.fillRect(0, 0, cv.width, cv.height);
  for (let i = 0; i < 14; i++) {            // mowing stripes
    g.fillStyle = i % 2 ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)";
    g.fillRect((2 + i * L / 14) * PX, 2 * PX, L / 14 * PX, W * PX);
  }
  g.strokeStyle = "#fff"; g.lineWidth = 0.12 * PX;
  const X = m => (m + 2) * PX, Y = m => (m + 2) * PX;
  g.strokeRect(X(0), Y(0), L * PX, W * PX);
  g.beginPath(); g.moveTo(X(L/2), Y(0)); g.lineTo(X(L/2), Y(W)); g.stroke();
  g.beginPath(); g.arc(X(L/2), Y(W/2), 9.15 * PX, 0, 7); g.stroke();
  g.fillStyle = "#fff"; g.beginPath(); g.arc(X(L/2), Y(W/2), 0.25 * PX, 0, 7); g.fill();
  [0, 1].forEach(end => {
    const dir = end ? -1 : 1, x0 = end ? L : 0;
    g.strokeRect(end ? X(L - 16.5) : X(0), Y(W/2 - 20.15), 16.5 * PX, 40.3 * PX);   // penalty area
    g.strokeRect(end ? X(L - 5.5) : X(0), Y(W/2 - 9.16), 5.5 * PX, 18.32 * PX);     // goal area
    g.beginPath(); g.arc(X(x0 + dir * 11), Y(W/2), 0.25 * PX, 0, 7); g.fill();       // penalty spot
    g.beginPath(); g.arc(X(x0 + dir * 11), Y(W/2), 9.15 * PX, end ? -0.93 + Math.PI : -0.93, end ? 0.93 + Math.PI : 0.93); g.stroke(); // D
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 8;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(L + 4, W + 4),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = 0;
  const grp = new THREE.Group();
  grp.add(mesh);
  grp.position.set(BLADE_LENGTH * 0.5, GROUND_Y + 0.05, -((W + 4) / 2 + 10)); // opposite side from car
  grp.visible = false;
  scene.add(grp);
  return grp;
})();
on("field", (v) => { fieldGroup.visible = v; });


// Eiffel Tower: procedural wrought-iron lattice (324 m + antenna = 330 m,
// 125 m square base) with the three platforms, beside the turbine.
const eiffelGroup = (() => {
  const prof = [[0,62.5],[57,40],[115,30],[190,15],[276,6],[300,3],[324,1]]; // [height, half-width]
  const hw = h => lerp1D(h, prof.map(p => p[0]), prof.map(p => p[1]));
  const levels = [];
  for (let h = 0; h < 276; h += 12) levels.push(h);
  for (let h = 276; h < 324; h += 8) levels.push(h);
  levels.push(324);
  const v = [];
  const corner = (h, i) => { const w = hw(h), sx = (i === 0 || i === 3) ? -1 : 1, sz = i < 2 ? -1 : 1; return [sx*w, h, sz*w]; };
  const seg = (a, b) => v.push(...a, ...b);
  for (let l = 0; l < levels.length; l++) {
    for (let i = 0; i < 4; i++) {
      const a = corner(levels[l], i), b = corner(levels[l], (i+1) % 4);
      seg(a, b);                                            // horizontal ring
      if (l < levels.length - 1) {
        const h2 = levels[l+1];
        const a2 = corner(h2, i), b2 = corner(h2, (i+1) % 4);
        seg(a, a2);                                         // leg edge
        seg(a, b2); seg(b, a2);                             // X bracing
      }
    }
  }
  seg([0,324,0], [0,330,0]);                                // antenna
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  const lines = new THREE.LineSegments(geom, new THREE.LineBasicMaterial({ color: 0xb08a5e }));
  const grp = new THREE.Group();
  grp.add(lines);
  const slabMat = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.7 });
  [[57,6],[115,4],[276,3]].forEach(([h, t]) => {              // 1st, 2nd, 3rd floor
    const w = hw(h) * 2 + 4;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, t, w), slabMat);
    slab.position.y = h; grp.add(slab);
  });
  grp.position.set(BLADE_LENGTH * 0.5 - 235, GROUND_Y, -200);
  grp.visible = false;
  scene.add(grp);
  return grp;
})();

export { GROUND_Y, eiffelGroup };
