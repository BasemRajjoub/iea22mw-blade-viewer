// Floating windows opened from a dock on the left. Each window can be dragged
// by its title bar, resized from the corner, closed, and (optionally) show a
// "Details" part. Open state, position, size and details are remembered per
// viewer (localStorage, best effort).

const dock = document.getElementById("dock");
const dockWindows = dock.querySelector(".dock-windows");
const windows = new Map();   // id -> window api
let zTop = 20;

function load(id) {
  try { return JSON.parse(localStorage.getItem("iea22-win:" + id) || "null"); } catch (e) { return null; }
}
function save(id, data) {
  try { localStorage.setItem("iea22-win:" + id, JSON.stringify(data)); } catch (e) {}
}

// createWindow({ id, title, icon, width, details, open, top, resizable, first }) -> api
//   first: put the dock button at the top (for a window imported last)
//   api.main / api.details  -- containers to fill
//   api.isOpen(), api.open(), api.close(), api.toggle()
//   api.onShow(fn)          -- called when opened or resized (redraw canvases here)
//   api.showDetails         -- current state of the Details toggle
//   api.onDetails(fn)       -- called when the Details toggle changes
function createWindow({ id, title, icon, width = 300, details = false, open = false, top, resizable = "both", first = false }) {
  const el = document.createElement("section");
  el.className = "win";
  el.dataset.win = id;
  el.setAttribute("aria-label", title);
  el.style.width = width + "px";
  el.style.resize = resizable;
  el.innerHTML = `
    <header class="win-head">
      <span class="win-title">${title}</span>
      ${details ? '<button class="win-details" type="button" aria-pressed="false" title="Show more numbers and explanations">Details</button>' : ""}
      <button class="win-close" type="button" title="Close" aria-label="Close ${title}">✕</button>
    </header>
    <div class="win-body">
      <div class="win-main"></div>
      ${details ? '<div class="win-more" hidden></div>' : ""}
    </div>`;
  document.body.appendChild(el);

  const btn = document.createElement("button");
  btn.className = "dock-btn";
  btn.type = "button";
  btn.title = title;
  btn.setAttribute("aria-pressed", "false");
  btn.innerHTML = `<span class="dock-icon" aria-hidden="true">${icon}</span><span class="dock-label">${title}</span>`;
  if (first) dockWindows.prepend(btn); else dockWindows.appendChild(btn);

  const detailsBtn = el.querySelector(".win-details");
  const more = el.querySelector(".win-more");
  const showFns = [], detailFns = [];
  const api = {
    id, el,
    main: el.querySelector(".win-main"),
    details: more,
    showDetails: false,
    isOpen: () => !el.hidden,
    open() { setOpen(true); },
    close() { setOpen(false); },
    toggle() { setOpen(el.hidden); },
    onShow(fn) { showFns.push(fn); },
    onDetails(fn) { detailFns.push(fn); },
  };

  const persist = () => save(id, {
    open: !el.hidden, details: api.showDetails,
    left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height,
  });
  const front = () => { el.style.zIndex = ++zTop; };
  const clamp = () => {
    const r = el.getBoundingClientRect();
    el.style.left = Math.min(Math.max(r.left, 76), innerWidth - 80) + "px";
    el.style.top = Math.min(Math.max(r.top, 8), innerHeight - 40) + "px";
    // never taller than the space below the title bar (the body scrolls)
    el.style.maxHeight = Math.max(innerHeight - parseFloat(el.style.top) - 8, 90) + "px";
  };
  function setOpen(o) {
    el.hidden = !o;
    btn.setAttribute("aria-pressed", String(o));
    if (o) { front(); clamp(); showFns.forEach(fn => fn()); }
    persist();
  }
  function setDetails(d) {
    if (!more) return;
    api.showDetails = d;
    more.hidden = !d;
    detailsBtn.setAttribute("aria-pressed", String(d));
    detailFns.forEach(fn => fn(d));
    persist();
  }

  // restore (or default) placement
  const saved = load(id);
  const cascade = windows.size;
  el.style.left = saved?.left || (88 + cascade * 24) + "px";
  el.style.top = saved?.top || (top ?? 16 + cascade * 28) + "px";
  if (saved?.width) el.style.width = saved.width;
  if (saved?.height) el.style.height = saved.height;
  el.hidden = true;

  btn.addEventListener("click", () => api.toggle());
  el.querySelector(".win-close").addEventListener("click", () => api.close());
  detailsBtn?.addEventListener("click", () => setDetails(!api.showDetails));
  el.addEventListener("pointerdown", front);

  // drag from anywhere that isn't a control: title bar, padding, notes,
  // readouts, the plot -- but not inputs/buttons/lil-gui rows, the
  // scrollbar or the resize grip in the bottom-right corner
  let drag = null;
  const NO_DRAG = "button, input, select, textarea, a, label, .lil-controller, .lil-title, [data-nodrag]";
  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest(NO_DRAG)) return;
    // on touch, the body scrolls -- only the title bar moves the window
    if (e.pointerType !== "mouse" && !e.target.closest(".win-head")) return;
    const r = el.getBoundingClientRect();
    if (r.right - e.clientX < 18 && r.bottom - e.clientY < 18) return;           // resize grip
    const body = e.target.closest(".win-body");
    if (body && e.clientX > body.getBoundingClientRect().left + body.clientWidth) return;  // scrollbar
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    el.setPointerCapture(e.pointerId);
    document.body.classList.add("win-dragging");
    e.preventDefault();   // no text selection while dragging
  });
  el.addEventListener("pointermove", (e) => {
    if (!drag) return;
    el.style.left = (e.clientX - drag.dx) + "px";
    el.style.top = (e.clientY - drag.dy) + "px";
    clamp();
  });
  const endDrag = () => {
    if (!drag) return;
    drag = null; persist();
    document.body.classList.remove("win-dragging");
  };
  el.addEventListener("pointerup", endDrag);
  el.addEventListener("pointercancel", endDrag);

  // redraw on any size change; only the corner grip writes an inline height,
  // so that is when the size is worth remembering
  let lastSize = "";
  new ResizeObserver(() => {
    if (el.hidden) return;
    const size = el.offsetWidth + "x" + el.offsetHeight;
    if (size === lastSize) return;
    lastSize = size;
    if (el.style.height) persist();
    showFns.forEach(fn => fn());
  }).observe(el);
  window.addEventListener("resize", () => { if (!el.hidden) clamp(); });

  windows.set(id, api);
  // apply the saved / default state once callers have filled the window
  queueMicrotask(() => {
    if (saved?.details) setDetails(true);
    // first visit on a phone: start with the blade, not a window
    setOpen(saved ? saved.open : open && !matchMedia("(max-width: 640px)").matches);
  });
  return api;
}

function getWindow(id) { return windows.get(id); }

export { createWindow, getWindow };
