import * as THREE from "three";
import { INITIAL_TARGET, camera, renderer, scene } from "../scene/setup.js";
import { GROUND_Y } from "../scene/references.js";
import { _yAxis } from "../aero/arrows.js";

// =====================================================================
// navigation: left-drag orbits about the exact surface point under the
// cursor, right/middle/shift-drag grab-pans (the grabbed point stays glued
// to the cursor), wheel / pinch zooms toward the cursor. The camera is
// never re-aimed at a new pivot, so nothing jumps when a drag starts.
// =====================================================================
const MIN_DIST = 0.3, MAX_DIST = 1500;
const ROT_SPEED = 0.005;            // rad per pixel
const GIZMO_PX = 46;                // on-screen gizmo size
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const navUp = WORLD_UP.clone();     // "up" for orbiting; rolled along with the camera
const INITIAL_CAMERA = camera.position.clone();
const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -GROUND_Y);
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const navEl = renderer.domElement;
const navPivot = new THREE.Vector3().copy(INITIAL_TARGET);
let navDepth = camera.position.distanceTo(INITIAL_TARGET); // fallback depth over empty space
let navMode = null;      // "orbit" | "pan" | "roll" | null
let gizmoMode = "orbit", gizmoHold = 0;

function frameView(target, pos) {
  navUp.copy(WORLD_UP);
  camera.up.copy(WORLD_UP);
  camera.position.copy(pos);
  camera.lookAt(target);
  navPivot.copy(target);
  navDepth = pos.distanceTo(target);
}

function depthOf(p) {   // distance of p along the view direction
  return _v1.copy(p).sub(camera.position).dot(_v2.set(0, 0, -1).applyQuaternion(camera.quaternion));
}

function pickPoint(clientX, clientY) {
  const r = navEl.getBoundingClientRect();
  _ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  camera.updateMatrixWorld();      // the camera may have moved since the last render
  _ray.setFromCamera(_ndc, camera);
  const meshes = [];
  (function walk(o) {
    if (!o.visible || o.userData.noPick) return;
    if (o.isMesh) meshes.push(o);
    o.children.forEach(walk);
  })(scene);
  for (const h of _ray.intersectObjects(meshes, false)) {
    // the raycaster ignores clipping planes -- skip what the cut slider hides
    const planes = h.object.material.clippingPlanes;
    if (planes && planes.some(pl => pl.distanceToPoint(h.point) < 0)) continue;
    return h.point.clone();
  }
  const p = new THREE.Vector3();
  if (_ray.ray.intersectPlane(_groundPlane, p) && p.distanceTo(camera.position) < MAX_DIST) return p;
  return _ray.ray.at(navDepth, p);  // empty space: stay at the last working depth
}

function navOrbit(dx, dy) {
  const right = _v1.set(1, 0, 0).applyQuaternion(camera.quaternion);
  _q1.setFromAxisAngle(right, -dy * ROT_SPEED);
  // stop pitching just short of straight up/down so the view never flips
  const fwd = _v2.set(0, 0, -1).applyQuaternion(camera.quaternion).applyQuaternion(_q1);
  if (Math.abs(fwd.dot(navUp)) > 0.995) _q1.identity();
  _q2.setFromAxisAngle(navUp, -dx * ROT_SPEED);
  _q1.premultiply(_q2);            // yaw about "up" after pitch about camera right: no added roll
  camera.position.sub(navPivot).applyQuaternion(_q1).add(navPivot);
  camera.quaternion.premultiply(_q1).normalize();
}

// roll: turn the view about the line of sight through the pivot (picked at
// the screen centre), following the cursor around it like a dial
function navRoll(x0, y0, x1, y1) {
  const r = navEl.getBoundingClientRect(), v = navPivot.clone().project(camera);
  const cx = r.left + (v.x + 1) / 2 * r.width, cy = r.top + (1 - v.y) / 2 * r.height;
  // near the centre the angle is noise -- wait until both samples are clear of it
  if (Math.hypot(x0 - cx, y0 - cy) < 12 || Math.hypot(x1 - cx, y1 - cy) < 12) return;
  let da = Math.atan2(y1 - cy, x1 - cx) - Math.atan2(y0 - cy, x0 - cx);
  da = Math.atan2(Math.sin(da), Math.cos(da));          // wrap into (-π, π]
  const axis = _v1.copy(navPivot).sub(camera.position).normalize();
  _q1.setFromAxisAngle(axis, -da);   // turning the camera one way turns the image the other
  camera.quaternion.premultiply(_q1).normalize();
  navUp.applyQuaternion(_q1);
  camera.up.copy(navUp);
}

function navPan(dx, dy) {
  // world size of one pixel at the pivot's depth -> the pivot tracks the cursor exactly
  const wpp = 2 * Math.max(depthOf(navPivot), camera.near) * Math.tan(camera.fov * Math.PI/360) / navEl.clientHeight;
  camera.position
    .addScaledVector(_v1.set(1, 0, 0).applyQuaternion(camera.quaternion), -dx * wpp)
    .addScaledVector(_v1.set(0, 1, 0).applyQuaternion(camera.quaternion), dy * wpp);
}

function navZoomAt(p, k) {
  const d = camera.position.distanceTo(p) * k;
  if (d < MIN_DIST || d > MAX_DIST) return;
  camera.position.sub(p).multiplyScalar(k).add(p);   // scaling about p keeps p under the cursor
  navDepth = Math.max(depthOf(p), MIN_DIST);
}

const _ptrs = new Map();
let _last = null, _pinch = 0;
const _mid = pts => ({ x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 });
const _span = pts => Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;

function beginGesture() {
  const pts = [..._ptrs.values()];
  if (pts.length === 1) {
    navMode = pts[0].roll ? "roll" : (pts[0].button !== 0 || pts[0].shift) ? "pan" : "orbit";
    _last = { x: pts[0].x, y: pts[0].y };
  } else {
    navMode = "pan";                  // two fingers: pan with the midpoint + pinch zoom
    _last = _mid(pts); _pinch = _span(pts);
  }
  if (navMode === "roll") {
    const r = navEl.getBoundingClientRect();
    navPivot.copy(pickPoint(r.left + r.width / 2, r.top + r.height / 2));
  } else navPivot.copy(pickPoint(_last.x, _last.y));
  navDepth = Math.max(depthOf(navPivot), MIN_DIST);
  gizmoMode = navMode;
}

navEl.style.touchAction = "none";
navEl.addEventListener("contextmenu", (e) => e.preventDefault());
navEl.addEventListener("pointerdown", (e) => {
  if (_ptrs.size >= 2) return;
  navEl.setPointerCapture(e.pointerId);
  _ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button, shift: e.shiftKey, roll: e.ctrlKey || e.altKey || e.metaKey });
  beginGesture();
});
navEl.addEventListener("pointermove", (e) => {
  const ptr = _ptrs.get(e.pointerId);
  if (!ptr) return;
  ptr.x = e.clientX; ptr.y = e.clientY;
  const pts = [..._ptrs.values()];
  if (pts.length === 1) {
    const dx = ptr.x - _last.x, dy = ptr.y - _last.y;
    if (navMode === "roll") navRoll(_last.x, _last.y, ptr.x, ptr.y);
    else if (navMode === "orbit") navOrbit(dx, dy); else navPan(dx, dy);
    _last = { x: ptr.x, y: ptr.y };
  } else {
    const m = _mid(pts), d = _span(pts);
    navPan(m.x - _last.x, m.y - _last.y);
    navZoomAt(navPivot, _pinch / d);
    _last = m; _pinch = d;
  }
});
function endPointer(e) {
  if (!_ptrs.delete(e.pointerId)) return;
  if (_ptrs.size) beginGesture(); else navMode = null;
}
navEl.addEventListener("pointerup", endPointer);
navEl.addEventListener("pointercancel", endPointer);

let _lastPick = { x: -1, y: -1, t: 0, p: null };
navEl.addEventListener("wheel", (e) => {
  e.preventDefault();
  const now = performance.now();
  // re-pick only when the cursor moved or the wheel paused, so a fast scroll
  // keeps zooming toward one fixed point instead of creeping across the surface
  if (!(_lastPick.p && Math.abs(e.clientX - _lastPick.x) < 3 && Math.abs(e.clientY - _lastPick.y) < 3 && now - _lastPick.t < 400)) {
    _lastPick = { x: e.clientX, y: e.clientY, t: now, p: pickPoint(e.clientX, e.clientY) };
  }
  _lastPick.t = now;
  const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
  navZoomAt(_lastPick.p, Math.exp(dy * 0.0012));
  if (!navMode) { navPivot.copy(_lastPick.p); gizmoMode = "zoom"; gizmoHold = 0.6; }
}, { passive: false });

// pivot gizmo: world axes + orbit ring (orbit) or a screen-aligned cross
// (pan), drawn on top, constant size on screen, fades out after release
const gizmo = (() => {
  const g = new THREE.Group();
  g.userData.noPick = true;
  g.visible = false;
  const mats = [];
  const mat = (props, base) => {
    const m = props instanceof THREE.Material ? props : new THREE.LineBasicMaterial(props);
    Object.assign(m, { transparent: true, depthTest: false, depthWrite: false });
    m.userData.base = base; mats.push(m); return m;
  };
  const top = o => { o.renderOrder = 999; return o; };

  const axesGeom = new THREE.BufferGeometry();
  axesGeom.setAttribute("position", new THREE.Float32BufferAttribute([0,0,0, 1,0,0, 0,0,0, 0,1,0, 0,0,0, 0,0,1], 3));
  axesGeom.setAttribute("color", new THREE.Float32BufferAttribute([1,.35,.35, 1,.35,.35, .4,1,.45, .4,1,.45, .35,.6,1, .35,.6,1], 3));
  const axes = top(new THREE.LineSegments(axesGeom, mat({ vertexColors: true }, 1)));

  const ringPts = [];
  for (let i = 0; i < 64; i++) { const t = i / 64 * 2*Math.PI; ringPts.push(new THREE.Vector3(Math.cos(t)*0.75, 0, Math.sin(t)*0.75)); }
  const ring = top(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(ringPts), mat({ color: 0xffffff }, 0.45)));

  const c = 0.15, crossGeom = new THREE.BufferGeometry();
  crossGeom.setAttribute("position", new THREE.Float32BufferAttribute([
    -1,0,0, 1,0,0,  0,-1,0, 0,1,0,
    1,0,0, 1-c,c,0,  1,0,0, 1-c,-c,0,   -1,0,0, -1+c,c,0,  -1,0,0, -1+c,-c,0,
    0,1,0, c,1-c,0,  0,1,0, -c,1-c,0,   0,-1,0, c,-1+c,0,  0,-1,0, -c,-1+c,0,
  ], 3));
  const cross = top(new THREE.LineSegments(crossGeom, mat({ color: 0xffffff }, 0.7)));

  const dot = top(new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 8),
    mat(new THREE.MeshBasicMaterial({ color: 0xffd54f }), 1)));

  g.add(axes, ring, cross, dot);
  scene.add(g);
  return { g, ring, cross, mats };
})();

function updateGizmo(dt) {
  if (navMode) gizmoHold = 0.5; else gizmoHold = Math.max(0, gizmoHold - dt);
  const alpha = navMode ? 1 : Math.min(1, gizmoHold / 0.3);
  gizmo.g.visible = alpha > 0;
  if (!gizmo.g.visible) return;
  gizmo.g.position.copy(navPivot);
  const depth = Math.max(depthOf(navPivot), camera.near);
  gizmo.g.scale.setScalar(depth * 2 * Math.tan(camera.fov * Math.PI/360) * GIZMO_PX / navEl.clientHeight);
  gizmo.ring.visible = gizmoMode === "orbit" || gizmoMode === "roll";
  if (gizmoMode === "roll") gizmo.ring.quaternion.setFromUnitVectors(_yAxis, _v1.copy(camera.position).sub(navPivot).normalize());
  else gizmo.ring.quaternion.setFromUnitVectors(_yAxis, navUp);
  gizmo.cross.visible = gizmoMode === "pan";
  gizmo.cross.quaternion.copy(camera.quaternion);
  gizmo.mats.forEach(m => { m.opacity = alpha * m.userData.base; });
}

export { INITIAL_CAMERA, _v1, frameView, gizmoHold, navMode, updateGizmo };
