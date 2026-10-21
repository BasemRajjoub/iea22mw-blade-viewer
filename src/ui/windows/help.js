import { createWindow } from "../window-manager.js";
import { note } from "../controls.js";

// Help: navigation and how the windows work.

const win = createWindow({ id: "help", title: "Help", icon: "?", width: 300 });

note(win.main, "<b>Left-drag</b> orbits about the point under the cursor · <b>right/shift-drag</b> pans · " +
  "<b>Ctrl/Alt-drag</b> rolls · <b>wheel</b> zooms to the cursor · <b>Space</b> pauses the rotor.");
note(win.main, "Touch: one finger orbits, two fingers pan and pinch-zoom.");
note(win.main, "Open windows from the dock on the left; drag them by the title bar, resize from the corner. " +
  "<b>Details</b> shows extra numbers and overlays. Controls that appear in several windows stay in sync.");
note(win.main, "Real chord/twist/prebend, blended airfoils and the 12 composite shell layers + shear webs come straight from the IEA 22 MW WindIO YAML.");
