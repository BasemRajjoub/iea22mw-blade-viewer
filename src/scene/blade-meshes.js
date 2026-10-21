import * as THREE from "three";
import { state } from "../state.js";
import { MATERIAL_COLORS } from "../data/index.js";
import { BLADE_LENGTH, CHORD_MIRROR } from "../geometry/sections.js";
import { LAYERS, buildCapGeometry, buildPlyShell } from "../geometry/plies.js";
import { WEBS, buildWebCapGeometry, buildWebPly } from "../geometry/webs.js";
import { bladeRig, coneRig } from "./setup.js";

// =====================================================================
// build one group per layer
// =====================================================================

// the cut is defined in the blade frame (keep x <= cut) and mapped to
// world space for the detailed blade and for each turbine blade
const clipLocal = new THREE.Plane(new THREE.Vector3(-1, 0, 0), BLADE_LENGTH + 1);
const clipPlane = clipLocal.clone();
function syncClipPlane() {
  coneRig.updateMatrixWorld(true);
  clipPlane.copy(clipLocal).applyMatrix4(coneRig.matrixWorld);
}

const plyGroups = {};
const plyMeshes = {};
const capMeshes = {};
const endCapMeshes = {};
const capWireframes = {};
const plyWireframes = {};
const wireMat = new THREE.LineBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.3 });

// wireframes cost ~25 ms per ply surface to build and are hidden by default:
// remember each one's source geometry and only build it while shown
const _noWire = new THREE.BufferGeometry();
function setWireSource(lines, src) {
  if (lines.geometry !== _noWire) lines.geometry.dispose();
  lines.userData.src = src;
  lines.geometry = state.wireframe ? new THREE.WireframeGeometry(src) : _noWire;
}
function wireFor(src, mat) {
  const lines = new THREE.LineSegments(_noWire, mat);
  setWireSource(lines, src);
  return lines;
}

// LAYER_SEP alone can't keep a 0.5 mm gelcoat in front of the ply beneath
// it at a distance or at grazing angles, and logarithmic depth disables
// polygonOffset -- so do the same thing in the fragment shader: push each
// layer back by (constant + one pixel's depth slope) per layer step. Seen
// from outside, layers further in are pushed back; seen from inside (cut
// views), layers further out are. Only ever push away from the camera:
// pulling a surface forward makes the far wall pop through near the
// silhouette. Outer-surface meshes face outward and inner ones inward --
// unless the chordwise mirror flipped the winding (then the reverse).
const LAYER_DEPTH_BIAS = 2.5e-6;   // log-depth units per layer step, ~2e-5 of the view distance
function withLayerDepthBias(mat, layerIdx, frontIsOutward) {
  const stepsFromOutside = layerIdx, stepsFromInside = LAYERS.length - 1 - layerIdx;
  const front = { value: 0 }, back = { value: 0 };
  // called again when the rotation sense flips the winding
  mat.userData.setFrontIsOutward = (out) => {
    front.value = out ? stepsFromOutside : stepsFromInside;
    back.value = out ? stepsFromInside : stepsFromOutside;
  };
  mat.userData.setFrontIsOutward(frontIsOutward);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uStepsFront = front;
    shader.uniforms.uStepsBack = back;
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", "uniform float uStepsFront, uStepsBack;\nvoid main() {")
      .replace("#include <logdepthbuf_fragment>", [
        "#include <logdepthbuf_fragment>",
        "#if defined( USE_LOGDEPTHBUF ) && defined( USE_LOGDEPTHBUF_EXT )",
        "  float logZ = log2( vFragDepth ) * logDepthBufFC * 0.5;",
        "  float steps = gl_FrontFacing ? uStepsFront : uStepsBack;",
        `  gl_FragDepthEXT = logZ + steps * ( ${LAYER_DEPTH_BIAS.toExponential()} + fwidth( logZ ) );`,
        "#endif"].join("\n"));
  };
  return mat;
}

LAYERS.forEach((layer, idx) => {
  const color = MATERIAL_COLORS[layer.material] || 0x999999;
  const mat = new THREE.MeshStandardMaterial({
    color, side: THREE.DoubleSide, metalness: 0.05, roughness: 0.55,
    clippingPlanes: [clipPlane], clipShadows: true,
  });

  const { outerGeom, innerGeom } = buildPlyShell(idx);
  const outerMesh = new THREE.Mesh(outerGeom, withLayerDepthBias(mat, idx, CHORD_MIRROR > 0));
  // clone() deep-copies clippingPlanes -- re-share the live cut plane
  const innerMat = mat.clone(); innerMat.clippingPlanes = [clipPlane];
  const innerMesh = new THREE.Mesh(innerGeom, withLayerDepthBias(innerMat, idx, CHORD_MIRROR < 0));

  const outerWireMat = wireMat.clone(); outerWireMat.clippingPlanes = [clipPlane];
  const innerWireMat = wireMat.clone(); innerWireMat.clippingPlanes = [clipPlane];
  const outerWire = wireFor(outerGeom, outerWireMat);
  const innerWire = wireFor(innerGeom, innerWireMat);
  outerWire.visible = false; innerWire.visible = false;

  const capMat = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, metalness: 0.05, roughness: 0.5 });
  const { geom: capGeom } = buildCapGeometry(idx, 1.0);
  const capMesh = new THREE.Mesh(capGeom, capMat);
  capMeshes[layer.name] = capMesh;

  const capWire = wireFor(capGeom, wireMat.clone());
  capWire.visible = false;
  capWireframes[layer.name] = capWire;
  plyWireframes[layer.name] = { outer: outerWire, inner: innerWire };
  plyMeshes[layer.name] = { outer: outerMesh, inner: innerMesh, isWeb: false };

  // static end caps at the true root (z=0) and tip (z=1) -- always on,
  // independent of the interactive cut slider. anyThickness naturally
  // hides these where a ply doesn't reach that end (e.g. spar caps don't
  // reach the very tip), no extra logic needed.
  const rootCapMat = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, metalness: 0.05, roughness: 0.5 });
  const { geom: rootCapGeom, anyThickness: rootExists } = buildCapGeometry(idx, 0.0, -1);
  const rootCapMesh = new THREE.Mesh(rootCapGeom, rootCapMat);
  rootCapMesh.visible = rootExists;

  const tipCapMat = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, metalness: 0.05, roughness: 0.5 });
  const { geom: tipCapGeom, anyThickness: tipExists } = buildCapGeometry(idx, 1.0, 1);
  const tipCapMesh = new THREE.Mesh(tipCapGeom, tipCapMat);
  tipCapMesh.visible = tipExists;
  endCapMeshes[layer.name] = { root: rootCapMesh, tip: tipCapMesh };

  const group = new THREE.Group();
  group.add(outerMesh, innerMesh, capMesh, outerWire, innerWire, capWire, rootCapMesh, tipCapMesh);
  bladeRig.add(group);
  plyGroups[layer.name] = group;
});

WEBS.forEach((webLayer) => {
  const color = MATERIAL_COLORS[webLayer.material] || 0x999999;
  const mat = new THREE.MeshStandardMaterial({
    color, side: THREE.DoubleSide, metalness: 0.05, roughness: 0.55,
    clippingPlanes: [clipPlane], clipShadows: true,
  });

  const { outerGeom, innerGeom } = buildWebPly(webLayer);
  const outerMesh = new THREE.Mesh(outerGeom, mat);
  const innerMesh = new THREE.Mesh(innerGeom, mat);

  const outerWireMat = wireMat.clone(); outerWireMat.clippingPlanes = [clipPlane];
  const innerWireMat = wireMat.clone(); innerWireMat.clippingPlanes = [clipPlane];
  const outerWire = wireFor(outerGeom, outerWireMat);
  const innerWire = wireFor(innerGeom, innerWireMat);
  outerWire.visible = false; innerWire.visible = false;

  const capMat = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, metalness: 0.05, roughness: 0.5 });
  const { geom: capGeom } = buildWebCapGeometry(webLayer, 1.0);
  const capMesh = new THREE.Mesh(capGeom, capMat);
  capMeshes[webLayer.name] = capMesh;

  const capWire = wireFor(capGeom, wireMat.clone());
  capWire.visible = false;
  capWireframes[webLayer.name] = capWire;
  plyWireframes[webLayer.name] = { outer: outerWire, inner: innerWire };
  plyMeshes[webLayer.name] = { outer: outerMesh, inner: innerMesh, isWeb: true };

  const rootCapMat = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, metalness: 0.05, roughness: 0.5 });
  const { geom: rootCapGeom, anyThickness: rootExists } = buildWebCapGeometry(webLayer, 0.0, -1);
  const rootCapMesh = new THREE.Mesh(rootCapGeom, rootCapMat);
  rootCapMesh.visible = rootExists;

  const tipCapMat = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, metalness: 0.05, roughness: 0.5 });
  const { geom: tipCapGeom, anyThickness: tipExists } = buildWebCapGeometry(webLayer, 1.0, 1);
  const tipCapMesh = new THREE.Mesh(tipCapGeom, tipCapMat);
  tipCapMesh.visible = tipExists;
  endCapMeshes[webLayer.name] = { root: rootCapMesh, tip: tipCapMesh };

  const group = new THREE.Group();
  group.add(outerMesh, innerMesh, capMesh, outerWire, innerWire, capWire, rootCapMesh, tipCapMesh);
  bladeRig.add(group);
  plyGroups[webLayer.name] = group;
});

export { _noWire, capMeshes, capWireframes, clipLocal, endCapMeshes, plyGroups, plyMeshes, plyWireframes, setWireSource, syncClipPlane };
