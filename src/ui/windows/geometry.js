import { IEA22, IEA22_AERO } from "../../data/index.js";
import { PRESWEEP_IN_YAML } from "../../aero/physics.js";
import { createWindow } from "../window-manager.js";
import { bind, note, panel } from "../controls.js";

// Blade geometry switches: turn each built-in shape feature off to see its effect.

const win = createWindow({ id: "geometry", title: "Geometry", icon: "⌇", width: 280, details: true });

const gui = panel(win.main);
bind(gui, "twist").name("Pre-twist");
bind(gui, "prebend").name("Prebend");
const sweep = bind(gui, "sweep").name(PRESWEEP_IN_YAML ? "Presweep" : "Presweep (none in YAML)");
if (!PRESWEEP_IN_YAML) sweep.disable();
bind(gui, "precone").name(`Precone (${IEA22_AERO.coneDeg.toFixed(1)}°, hub)`);

const range = v => `${Math.min(...v).toFixed(1)} … ${Math.max(...v).toFixed(1)}`;
note(win.details, `<b>Pre-twist</b> ${range(IEA22.twistDeg.values)}° along the span; it also enters the angle of attack (β = twist + pitch).`);
note(win.details, `<b>Prebend</b> bends the blade upwind, away from the tower: ${Math.abs(Math.min(...IEA22.refAxisX.values)).toFixed(1)} m at the tip.`);
note(win.details, `<b>Presweep</b> would bend the blade in the rotor plane; this blade has ${PRESWEEP_IN_YAML ? "some" : "none"}.`);
note(win.details, `<b>Precone</b> tilts the whole blade upwind at the hub by ${IEA22_AERO.coneDeg}°; the aero uses r·cos γ and U·cos γ.`);
