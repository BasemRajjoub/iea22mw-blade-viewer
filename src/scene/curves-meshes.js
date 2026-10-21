import * as THREE from "three";
import { LAYERS } from "../geometry/plies.js";
import { WEBS } from "../geometry/webs.js";
import { ANCHORS, ANCHOR_COLORS, buildAnchorCurve, buildRefAxisCurve, buildWebAttachCurve } from "../geometry/curves.js";
import { bladeRig } from "./setup.js";

// Line overlays on the detailed blade (all hidden until toggled in the
// Layers window): ply-boundary anchor curves, the reference/pitch axis and
// the true web attachment curves.

const anchorLines = {};
Object.keys(ANCHORS).forEach(name => {
  const a = ANCHORS[name];
  const color = ANCHOR_COLORS[name] || 0xffffff;
  const group = new THREE.Group();
  if (a.start) {
    const line = new THREE.Line(buildAnchorCurve(a.start), new THREE.LineBasicMaterial({ color, linewidth: 2 }));
    group.add(line);
  }
  if (a.end) {
    const line = new THREE.Line(buildAnchorCurve(a.end), new THREE.LineBasicMaterial({ color, linewidth: 2 }));
    group.add(line);
  }
  group.visible = false;
  bladeRig.add(group);
  anchorLines[name] = group;
});

const ALL_PLY_NAMES = [...LAYERS.map(l => l.name), ...WEBS.map(w => w.name)];

const refAxisGroup = new THREE.Group();
const refAxisLine = new THREE.Line(buildRefAxisCurve(), new THREE.LineBasicMaterial({ color: 0xff6b6b }));
refAxisGroup.add(refAxisLine);
refAxisGroup.visible = false;
bladeRig.add(refAxisGroup);

const attachLines = {};
const ATTACH_COLORS = { web0: 0x00e5ff, web1: 0x00ff88, web2: 0xffee00 };
['web0', 'web1', 'web2'].forEach(webName => {
  const color = ATTACH_COLORS[webName];
  const group = new THREE.Group();
  ['A', 'B'].forEach(which => {
    const line = new THREE.Line(
      buildWebAttachCurve(webName, which),
      new THREE.LineBasicMaterial({ color })
    );
    group.add(line);
  });
  group.visible = false;
  bladeRig.add(group);
  attachLines[webName] = group;

});

export { ALL_PLY_NAMES, ATTACH_COLORS, anchorLines, attachLines, refAxisGroup, refAxisLine };
