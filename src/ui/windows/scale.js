import { on, state } from "../../state.js";
import { createWindow } from "../window-manager.js";
import { bind, panel, readout } from "../controls.js";

// Scale references next to the blade and the turbine.

const win = createWindow({ id: "scale", title: "Scale", icon: "⇔", width: 270 });

const gui = panel(win.main);
bind(gui, "car").name("Car (4.5 m)");
bind(gui, "human").name("Human (1.75 m)");
bind(gui, "field").name("Soccer field (105 × 68 m)");
bind(gui, "eiffel").name("Eiffel Tower (330 m)");
const status = readout(win.main, "dim");
on("refStatus", (t) => { status.textContent = t; });
status.textContent = state.refStatus;
