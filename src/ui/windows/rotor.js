import { IEA22_AERO } from "../../data/index.js";
import { RATED_RPM } from "../../scene/turbine.js";
import { ROTOR_RADIUS } from "../../aero/physics.js";
import { on, set, state } from "../../state.js";
import { createWindow } from "../window-manager.js";
import { bind, button, note, panel, readout } from "../controls.js";

// Rotor: full turbine, rotation sense, speed and pitch.

const win = createWindow({ id: "rotor", title: "Rotor", icon: "⟳", width: 300, details: true });

const gui = panel(win.main);
bind(gui, "turbine").name("Show full turbine");
bind(gui, "paused").name("Pause rotor (Space)");
bind(gui, "clockwise").name("Clockwise from upwind");
bind(gui, "rpm", 0, 9, 0.01).decimals(2).name("Rotor speed (rpm)");
bind(gui, "pitch", -5, 90, 0.1).decimals(1).name("Blade pitch (°)");
button(gui, `Rated speed (${RATED_RPM.toFixed(2)} rpm)`, () => set("rpm", RATED_RPM));
button(gui, `Fine pitch (${IEA22_AERO.finePitchDeg.toFixed(1)}°)`, () => set("pitch", IEA22_AERO.finePitchDeg));
const tip = readout(win.main);

note(win.details, `Operating range from the YAML: ${IEA22_AERO.minRpm}–${IEA22_AERO.maxRpm} rpm, rated ${RATED_RPM} rpm, ` +
  `fine pitch ${IEA22_AERO.finePitchDeg}°, rotor diameter ${IEA22_AERO.rotorDiameter} m.`);
note(win.details, "Positive pitch turns the leading edge into the wind (toward feather). The blade always moves leading edge first; " +
  "counter-clockwise mirrors the blade to keep it that way.");

function show() {
  const omega = state.rpm * 2*Math.PI / 60;
  tip.textContent = `tip speed ${(omega*ROTOR_RADIUS).toFixed(1)} m/s · TSR ${(omega*ROTOR_RADIUS/state.wind).toFixed(2)} (optimum ${IEA22_AERO.optimalTsr})`;
}
on(["rpm", "wind"], show);
show();
