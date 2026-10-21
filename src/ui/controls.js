// Controls (lil-gui) bound to the shared state. bind() is the only way a
// window should create a control for a state key: the same key bound in two
// windows stays in sync both ways.
import GUI from "lil-gui";
import { emit, on, state } from "../state.js";

// a lil-gui panel filling a window container
function panel(container) {
  const gui = new GUI({ container, title: "" });
  gui.domElement.classList.add("pane");
  return gui;
}

// bind(gui, "rpm", 0, 9, 0.01) -- arguments after the key are lil-gui's add() arguments
function bind(gui, key, ...args) {
  const c = gui.add(state, key, ...args);
  c.onChange(() => emit(key));       // lil-gui has already written state[key]
  on(key, () => c.updateDisplay());  // reflect changes made elsewhere
  return c;
}

// a push button: button(gui, "Rated speed", () => set("rpm", ...))
function button(gui, label, fn) {
  return gui.add({ fn }, "fn").name(label);
}

// a block of monospace text for readouts; returns the element
function readout(container, className = "") {
  const el = document.createElement("div");
  el.className = "readout " + className;
  container.appendChild(el);
  return el;
}

// a short explanatory paragraph
function note(container, html) {
  const el = document.createElement("p");
  el.className = "win-note";
  el.innerHTML = html;
  container.appendChild(el);
  return el;
}

// a colour legend: legend(container, [["#4fc3f7", "axial U(1−a)"], ...])
function legend(container, items) {
  const el = document.createElement("div");
  el.className = "legend";
  el.innerHTML = items.map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join("");
  container.appendChild(el);
  return el;
}

export { bind, button, legend, note, panel, readout };
