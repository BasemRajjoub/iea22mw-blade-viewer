import { MATERIAL_COLORS } from "../../data/index.js";
import { BLADE_LENGTH } from "../../geometry/sections.js";
import { LAYERS } from "../../geometry/plies.js";
import { WEBS } from "../../geometry/webs.js";
import { ANCHORS, ANCHOR_COLORS } from "../../geometry/curves.js";
import { plyGroups } from "../../scene/blade-meshes.js";
import { ATTACH_COLORS, anchorLines, attachLines, refAxisGroup } from "../../scene/curves-meshes.js";
import { hex } from "../../aero/arrows.js";
import { on, state } from "../../state.js";
import { createWindow } from "../window-manager.js";
import { bind, panel, readout } from "../controls.js";

// Layers: show/hide each shell ply and web sublayer; Details adds the
// line overlays (ply-boundary anchors, pitch axis, web attachment curves).

const win = createWindow({ id: "layers", title: "Layers", icon: "▤", width: 280, details: true });

// checkList(container, heading, [{ label, color, checked, set }]) -- rows with a colour swatch
function checkList(container, heading, items) {
  const box = document.createElement("div");
  box.className = "check-list";
  box.innerHTML = `<div class="list-head"><span>${heading}</span>
    <span class="list-all"><button type="button" data-all="1">all</button><button type="button" data-all="0">none</button></span></div>`;
  const boxes = items.map(it => {
    const row = document.createElement("label");
    row.className = "row";
    row.innerHTML = `<input type="checkbox" ${it.checked ? "checked" : ""}/><span class="swatch" style="background:${it.color}"></span><span></span>`;
    row.lastChild.textContent = it.label;
    const cb = row.firstChild;
    cb.addEventListener("change", () => it.set(cb.checked));
    box.appendChild(row);
    return { cb, it };
  });
  box.querySelectorAll("[data-all]").forEach(b => b.addEventListener("click", () => {
    const on = b.dataset.all === "1";
    boxes.forEach(({ cb, it }) => { cb.checked = on; it.set(on); });
  }));
  container.appendChild(box);
}

const pretty = n => n.replace(/_/g, " ");
checkList(win.main, "Shell plies (outside → in)", LAYERS.map(l => ({
  label: pretty(l.name), color: MATERIAL_COLORS[l.material] || "#999", checked: true,
  set: v => { plyGroups[l.name].visible = v; },
})));
checkList(win.main, "Shear webs", WEBS.map(w => ({
  label: pretty(w.name), color: MATERIAL_COLORS[w.material] || "#999", checked: true,
  set: v => { plyGroups[w.name].visible = v; },
})));
bind(panel(win.main), "wireframe").name("Show mesh (wireframe)");

checkList(win.details, "Ply boundary curves (on the outer surface)", Object.keys(ANCHORS).map(name => ({
  label: pretty(name), color: hex(ANCHOR_COLORS[name] || 0xffffff), checked: false,
  set: v => { anchorLines[name].visible = v; },
})));
checkList(win.details, "Axes and web attachment", [
  { label: "reference (pitch) axis", color: "#ff6b6b", checked: false, set: v => { refAxisGroup.visible = v; } },
  ...Object.keys(attachLines).map(web => ({
    label: `${web} true attach (A+B, inside shell)`, color: hex(ATTACH_COLORS[web]), checked: false,
    set: v => { attachLines[web].visible = v; },
  })),
]);
const stats = readout(win.details);
const showStats = () => {
  stats.textContent = `Blade length ${BLADE_LENGTH.toFixed(1)} m · ${LAYERS.length} shell layers + ${WEBS.length} web sublayers · thickness x${state.exag.toFixed(1)}`;
};
on("exag", showStats);
showStats();
