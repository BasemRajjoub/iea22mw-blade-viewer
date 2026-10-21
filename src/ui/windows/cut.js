import { chordAt, sectionCurve } from "../../geometry/sections.js";
import { rthickAt, stackAt } from "../../scene/cut.js";
import { on, state } from "../../state.js";
import { createWindow, getWindow } from "../window-manager.js";
import { bind, button, panel, readout } from "../controls.js";

// Section cut: where the blade is cut, ply thickness exaggeration, and
// (Details) the real ply stack at the cut plus the t/c sanity check.

const win = createWindow({ id: "cut", title: "Section cut", icon: "✂", width: 300, details: true, open: true });

const gui = panel(win.main);
bind(gui, "cut", 0.02, 1, 0.001).decimals(3).name("Span position z");
bind(gui, "exag", 1, 10, 0.5).decimals(1).name("Ply thickness ×");
bind(gui, "turbineCut").name("Cut turbine blades too");
button(gui, "Open 2D section view", () => getWindow("section2d").open());
const where = readout(win.main);

const stack = readout(win.details);
const rthick = readout(win.details, "dim");

function show() {
  const z = state.cut;
  where.textContent = "z = " + z.toFixed(2) + "  (R=" + sectionCurve(z).X.toFixed(1) + "m, chord=" + chordAt(z).toFixed(2) + "m)";
  let html = "<b>Stack at this station (real, unexaggerated):</b><br/>";
  stackAt(z).forEach(r => {
    html += r.name.padEnd(20, " ") + r.mm.toFixed(1) + " mm&nbsp;&nbsp;" + r.deg.toFixed(0) + "°<br/>";
  });
  stack.innerHTML = html;
  const t = rthickAt(z);
  rthick.textContent = `rthick check: YAML=${(t.yaml*100).toFixed(1)}%  computed=${(t.computed*100).toFixed(1)}%  Δ=${((t.computed-t.yaml)*100).toFixed(2)}pp`;
}
on(["cut", "twist", "prebend", "sweep"], show);
show();
