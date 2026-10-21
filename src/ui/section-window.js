import { N_S, leSign } from "../geometry/sections.js";
import { slider } from "./layers-panel.js";
import { AERO_COLORS, makeStation, opState, pitchYZ, sectionAero } from "../aero/physics.js";
import { hex } from "../aero/arrows.js";

// --- 2D section window: the section at the cut station, seen from the tip
// toward the root, with the velocity triangle at the LE and the forces at
// the quarter chord. Screen x = -Y (LE / blade motion to the left),
// screen y = +Z (wind blows down the window). ---
const secWin = document.getElementById("secWin");
const secCanvas = document.getElementById("secCanvas");
const secToggle = document.getElementById("secToggle");
const secInfo = document.getElementById("secInfo");

function drawSectionView() {
  secWin.hidden = !secToggle.checked;
  if (secWin.hidden) return;
  const z = Math.min(Math.max(parseFloat(slider.value), 0.02), 0.995);
  const st = makeStation(z), a = sectionAero(st);

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = secCanvas.clientWidth, H = secCanvas.clientHeight;
  secCanvas.width = W * dpr; secCanvas.height = H * dpr;
  const ctx = secCanvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.font = "11px system-ui, sans-serif";

  // Everything below is drawn in one canonical layout (LE / motion to the
  // left, wind blowing down); a mirror transform then gives the true view
  // from the tip (LE on the right for counter-clockwise) and the optional
  // suction-side-up flip. Text is placed through M() so it never mirrors.
  const sY = leSign();
  const hx = sY > 0 ? 1 : -1, vy = secFlip.checked ? -1 : 1;
  const M = (x, y) => [hx > 0 ? x : W - x, vy > 0 ? y : H - y];
  const mirrored = () => ctx.setTransform(dpr*hx, 0, 0, dpr*vy, hx > 0 ? 0 : W*dpr, vy > 0 ? 0 : H*dpr);
  const plain = () => ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const text = (str, x, y, centred) => {
    const [mx, my] = M(x, y);
    plain();
    ctx.fillText(str, centred ? mx - ctx.measureText(str).width/2 : (hx > 0 ? mx : mx - ctx.measureText(str).width), my);
    mirrored();
  };

  const le = pitchYZ(st.le), te = pitchYZ(st.te);
  const qcY = le[0] + 0.25*(te[0] - le[0]), qcZ = le[1] + 0.25*(te[1] - le[1]);
  const s = 0.36 * W / st.chord;                       // px per metre of section
  const cx = 0.6 * W, cy = 0.52 * H;
  const P = (y, z) => [cx - sY*(y - qcY) * s, cy + (z - qcZ) * s];

  // rotor plane through the LE + axis labels
  const LE = P(le[0], le[1]), TE = P(te[0], te[1]);
  mirrored();
  ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(8, LE[1]); ctx.lineTo(W - 8, LE[1]); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#7d8693";
  plain();
  ctx.fillText("rotor plane", 10, M(0, LE[1] + (vy > 0 ? 14 : -14))[1] + 4);
  ctx.fillText(`wind ${vy > 0 ? "↓" : "↑"}  ·  blade moves ${hx > 0 ? "←" : "→"}  ·  seen from tip`, 10, 16);
  mirrored();

  // section outline (pitched)
  ctx.beginPath();
  for (let i = 0; i < N_S; i++) {
    const [y, zz] = pitchYZ([st.sec.Y[i], st.sec.Z[i]]);
    const [px, py] = P(y, zz);
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(207,184,140,0.85)"; ctx.fill();
  ctx.strokeStyle = "#f3e2bf"; ctx.lineWidth = 1; ctx.stroke();

  // chord line, extended ahead of the LE
  const cdx = (LE[0] - TE[0]), cdy = (LE[1] - TE[1]), cl = Math.hypot(cdx, cdy) || 1;
  ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.setLineDash([6, 3]);
  ctx.beginPath(); ctx.moveTo(TE[0], TE[1]); ctx.lineTo(LE[0] + cdx/cl*70, LE[1] + cdy/cl*70); ctx.stroke();
  ctx.setLineDash([]);

  // pitch axis marker
  const ax = P(...pitchYZ(st.axis));
  ctx.strokeStyle = "#ff6b6b"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(ax[0]-5, ax[1]); ctx.lineTo(ax[0]+5, ax[1]); ctx.moveTo(ax[0], ax[1]-5); ctx.lineTo(ax[0], ax[1]+5); ctx.stroke();

  const arrow2d = (x0, y0, x1, y1, color, label, dashed, labelSide) => {
    const L = Math.hypot(x1 - x0, y1 - y0);
    if (L < 2) return;
    const ux = (x1 - x0) / L, uy = (y1 - y0) / L, h = Math.min(9, L * 0.4);
    ctx.strokeStyle = ctx.fillStyle = hex(color); ctx.lineWidth = dashed ? 1.5 : 2.5;
    ctx.setLineDash(dashed ? [5, 3] : []);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - ux*h*0.8, y1 - uy*h*0.8); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - ux*h - uy*h*0.45, y1 - uy*h + ux*h*0.45);
    ctx.lineTo(x1 - ux*h + uy*h*0.45, y1 - uy*h - ux*h*0.45); ctx.closePath(); ctx.fill();
    if (label) {
      ctx.font = "600 11px system-ui, sans-serif";
      const side = labelSide || 1;
      text(label, (x0 + x1)/2 - uy*12*side, (y0 + y1)/2 + ux*12*side + 4*vy, true);
      ctx.font = "11px system-ui, sans-serif";
    }
  };

  // velocity triangle ending at the LE (screen: x = -Y, y = +Z)
  const sv = 0.42 * W / a.W;
  const S0 = [LE[0] - a.ut*sv, LE[1] - a.ua*sv];
  arrow2d(S0[0], S0[1], S0[0] + a.ut*sv, S0[1], AERO_COLORS.rot, "Ωr", false, -1);
  arrow2d(LE[0], S0[1], LE[0], LE[1], AERO_COLORS.axial, "U(1−a)", false, -1);
  arrow2d(S0[0], S0[1], LE[0], LE[1], AERO_COLORS.rel, "W", false, 1);

  // angle arcs at the LE, measured upward from the rotor plane (left side)
  const arc = (r, a0, a1, color, label) => {
    const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
    ctx.strokeStyle = ctx.fillStyle = color; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(LE[0], LE[1], r, Math.PI + lo, Math.PI + hi); ctx.stroke();
    const m = Math.PI + (lo + hi) / 2;
    text(label, LE[0] + Math.cos(m)*(r + 9), LE[1] + Math.sin(m)*(r + 9) + 4*vy, true);
  };
  const rad = d => d * Math.PI/180;
  arc(34, 0, rad(a.beta), "#c7ccd4", "β");
  arc(52, rad(a.beta), rad(a.phi), "#ffd54f", "α");
  arc(70, 0, rad(a.phi), "#ffffff", "φ");

  // forces at the quarter chord
  const QC = P(qcY, qcZ);
  const fMax = Math.max(Math.abs(a.L), Math.abs(a.D), Math.abs(a.Fn), Math.abs(a.Ft), 1);
  const sf = 0.3 * H / fMax;
  const F = (fy, fz) => [QC[0] - sY*fy*sf, QC[1] + fz*sf];
  const Lp = F(a.L*a.dirL[0], a.L*a.dirL[1]), Dp = F(a.D*a.dirD[0], a.D*a.dirD[1]);
  const Ry = a.L*a.dirL[0] + a.D*a.dirD[0], Rz = a.L*a.dirL[1] + a.D*a.dirD[1], Rp = F(Ry, Rz);
  arrow2d(QC[0], QC[1], ...F(0, a.Fn), AERO_COLORS.thrust, "Fn", true, -1);
  arrow2d(QC[0], QC[1], ...F(a.Ft, 0), AERO_COLORS.torque, "Ft", true, 1);
  ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.setLineDash([2, 3]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(Rp[0], Rp[1]); ctx.lineTo(...F(0, a.Fn)); ctx.moveTo(Rp[0], Rp[1]); ctx.lineTo(...F(a.Ft, 0)); ctx.stroke();
  ctx.setLineDash([]);
  arrow2d(QC[0], QC[1], Lp[0], Lp[1], AERO_COLORS.lift, "L", false, 1);
  arrow2d(QC[0], QC[1], Dp[0], Dp[1], AERO_COLORS.drag, "D", false, 1);
  arrow2d(QC[0], QC[1], Rp[0], Rp[1], AERO_COLORS.res, "R", false, -1);

  plain();
  const kN = v => (v / 1000).toFixed(2);
  const af = st.airfoils[0] === st.airfoils[1] ? st.airfoils[0]
    : `${st.airfoils[0]} → ${st.airfoils[1]} (${(st.blend*100).toFixed(0)}%)`;
  secInfo.innerHTML =
    `<b>z = ${z.toFixed(3)}</b> · r = ${a.r.toFixed(1)} m · chord ${st.chord.toFixed(2)} m · ${af}<br/>` +
    `U(1−a) ${a.ua.toFixed(1)} · Ωr ${a.ut.toFixed(1)} · W ${a.W.toFixed(1)} m/s<br/>` +
    `φ ${a.phi.toFixed(1)}° · β = twist ${st.twist.toFixed(1)}° + pitch ${opState.pitchDeg.toFixed(1)}° · α ${a.alpha.toFixed(1)}°<br/>` +
    `Cl ${a.cl.toFixed(3)} · Cd ${a.cd.toFixed(4)} · L ${kN(a.L)} · D ${kN(a.D)} kN/m<br/>` +
    `Fn (thrust) ${kN(a.Fn)} · Ft (driving) ${kN(a.Ft)} kN/m`;
}
secToggle.addEventListener("change", drawSectionView);

// drag the window by its title bar; resize with the corner grip (CSS
// resize). Position and size are remembered per viewer, best effort.
(() => {
  const head = secWin.querySelector("header"), KEY = "iea22-secwin";
  const clamp = () => {
    const r = secWin.getBoundingClientRect();
    secWin.style.left = Math.min(Math.max(r.left, 8 - r.width + 80), innerWidth - 80) + "px";
    secWin.style.top = Math.min(Math.max(r.top, 8), innerHeight - 40) + "px";
  };
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify({ l: secWin.style.left, t: secWin.style.top, w: secWin.style.width, h: secWin.style.height })); } catch (e) {}
  };
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    if (v) Object.assign(secWin.style, { left: v.l, top: v.t, width: v.w, height: v.h });
  } catch (e) {}
  let drag = null;
  head.addEventListener("pointerdown", (e) => {
    if (e.target.closest("input, label, button")) return;
    const r = secWin.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    head.setPointerCapture(e.pointerId);
  });
  head.addEventListener("pointermove", (e) => {
    if (!drag) return;
    secWin.style.left = (e.clientX - drag.dx) + "px";
    secWin.style.top = (e.clientY - drag.dy) + "px";
    clamp();
  });
  head.addEventListener("pointerup", () => { if (drag) { drag = null; save(); } });
  // redraw at the new size while resizing (and remember it)
  let lastSize = "";
  new ResizeObserver(() => {
    const size = secWin.offsetWidth + "x" + secWin.offsetHeight;
    if (size === lastSize || secWin.hidden) return;
    lastSize = size;
    secWin.style.width = secWin.offsetWidth + "px"; secWin.style.height = secWin.offsetHeight + "px";
    drawSectionView(); save();
  }).observe(secWin);
  window.addEventListener("resize", clamp);
})();
const secFlip = document.getElementById("secFlip");
secFlip.addEventListener("change", drawSectionView);
document.getElementById("secClose").addEventListener("click", () => { secToggle.checked = false; drawSectionView(); });
window.addEventListener("resize", drawSectionView);

export { drawSectionView };
