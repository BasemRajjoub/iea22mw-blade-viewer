import * as THREE from "three";
import { BLADE_LENGTH } from "../geometry/sections.js";

// =====================================================================
// =====================================================================
// =====================================================================
// scene setup (scaled for a real ~138 m blade)
// =====================================================================
const container = document.getElementById("canvas-container");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x12151a);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth/window.innerHeight, 0.1, 2000);
camera.position.set(150, 55, 85);

const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true }); // mm-thick plies on a 138 m blade need far more depth precision than a linear buffer gives
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // clamp: raw DPR tanks perf on retina/mobile
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.localClippingEnabled = true;
container.appendChild(renderer.domElement);

const INITIAL_TARGET = new THREE.Vector3(BLADE_LENGTH*0.35, 0, -1.5);
camera.lookAt(INITIAL_TARGET);

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const dir1 = new THREE.DirectionalLight(0xffffff, 0.9); dir1.position.set(100, 120, 60); scene.add(dir1);
const dir2 = new THREE.DirectionalLight(0xffffff, 0.35); dir2.position.set(-60,-30,-90); scene.add(dir2);

const grid = new THREE.GridHelper(200, 40, 0x2a2f3a, 0x1c2028);
grid.position.set(BLADE_LENGTH/2, -4, 0);
scene.add(grid);

// everything that belongs to the detailed blade hangs off this rig so the
// pitch slider can turn it about the pitch axis (world X through the root)
const coneRig = new THREE.Group();     // precone (rotation about Y at the root)
scene.add(coneRig);
const bladeRig = new THREE.Group();   // pitch (rotation about the span axis)
coneRig.add(bladeRig);


// render on demand: anything that changes the picture calls invalidate();
// the loop in main.js only draws while renderUntil is in the future
let renderUntil = 0;
function invalidate(ms = 500) { renderUntil = Math.max(renderUntil, performance.now() + ms); }
invalidate(1500);   // first frames (and the loading overlay fade)

export { INITIAL_TARGET, bladeRig, camera, coneRig, invalidate, renderUntil, renderer, scene };
