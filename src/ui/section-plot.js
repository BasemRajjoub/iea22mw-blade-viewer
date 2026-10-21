import { N_S, leSign } from "../geometry/sections.js";
import { state } from "../state.js";
import { IEA22_AERO } from "../data/index.js";
import { AERO_COLORS, ROTOR_RADIUS, makeStation, opState, pitchYZ, sectionAero } from "../aero/physics.js";
import { hex } from "../aero/arrows.js";

// --- 2D section window: the section at the cut station, seen from the tip
// toward the root, with the velocity triangle at the LE and the forces at
// the quarter chord. Screen x = -Y (LE / blade motion to the left),
// screen y = +Z (wind blows down the window). ---
// Fixed drawing scales, so an arrow's length depends only on its own value
// (the wind arrow doesn't change when rpm or pitch do). They are tied to the
// window size: the fastest possible tip speed spans 45 % of the width, and
// 30 kN/m spans 34 % of the height. The window's sliders multiply them:
// state.velScale (whole velocity triangle), state.forceScale (all forces) and
// state.smallForceScale (drag and the driving force only, labelled ×n).
const V_REF = IEA22_AERO.maxRpm * 2*Math.PI / 60 * ROTOR_RADIUS;   // m/s
const F_REF = 30000;                                                 // N/m
// the largest "nice" value (1, 2, 5 × 10^n) whose bar fits in maxPx
function niceBar(pxPerUnit, maxPx) {
  let best = 0;
  for (let e = -2; e <= 6; e++) for (const m of [1, 2, 5]) {
    const v = m * 10 ** e;
    if (v * pxPerUnit <= maxPx) best = v;
  }
  return best;
}

// view = { zoom, tx, ty }: wheel zoom / drag pan from the 2D window (css px)
function drawSection(secCanvas, secInfo, view = { zoom: 1, tx: 0, ty: 0 }) {
  const z = Math.min(Math.max(state.cut, 0.02), 0.995);
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
  const hx = sY > 0 ? 1 : -1, vy = state.suctionUp ? -1 : 1;
  const zm = view.zoom, px1 = 1 / zm;   // px1: one screen pixel in drawing units
  const M = (x, y) => [(hx > 0 ? x : W - x) * zm + view.tx, (vy > 0 ? y : H - y) * zm + view.ty];
  const mirrored = () => ctx.setTransform(dpr*hx*zm, 0, 0, dpr*vy*zm,
    dpr*((hx > 0 ? 0 : W)*zm + view.tx), dpr*((vy > 0 ? 0 : H)*zm + view.ty));
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
  plain();
  const planeY = M(0, LE[1])[1];
  ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(8, planeY); ctx.lineTo(W - 8, planeY); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#7d8693";
  ctx.fillText("rotor plane", 10, planeY + 14);
  ctx.fillText(`wind ${vy > 0 ? "↓" : "↑"}  ·  blade moves ${hx > 0 ? "←" : "→"}  ·  seen from tip`, 10, 16);
  ctx.fillText("wheel: zoom · drag: pan · double-click: reset", 10, 30);
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
  ctx.strokeStyle = "#f3e2bf"; ctx.lineWidth = px1; ctx.stroke();

  // chord line, extended ahead of the LE
  const cdx = (LE[0] - TE[0]), cdy = (LE[1] - TE[1]), cl = Math.hypot(cdx, cdy) || 1;
  ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.setLineDash([6*px1, 3*px1]); ctx.lineWidth = px1;
  ctx.beginPath(); ctx.moveTo(TE[0], TE[1]); ctx.lineTo(LE[0] + cdx/cl*70, LE[1] + cdy/cl*70); ctx.stroke();
  ctx.setLineDash([]);

  // pitch axis marker
  const ax = P(...pitchYZ(st.axis));
  const mk = 5 * px1;
  ctx.strokeStyle = "#ff6b6b"; ctx.lineWidth = 1.5 * px1;
  ctx.beginPath(); ctx.moveTo(ax[0]-mk, ax[1]); ctx.lineTo(ax[0]+mk, ax[1]); ctx.moveTo(ax[0], ax[1]-mk); ctx.lineTo(ax[0], ax[1]+mk); ctx.stroke();

  const arrow2d = (x0, y0, x1, y1, color, label, dashed, labelSide) => {
    const L = Math.hypot(x1 - x0, y1 - y0);
    if (L < 2 * px1) return;
    const ux = (x1 - x0) / L, uy = (y1 - y0) / L, h = Math.min(9 * px1, L * 0.4);
    ctx.strokeStyle = ctx.fillStyle = hex(color); ctx.lineWidth = (dashed ? 1.5 : 2.5) * px1;
    ctx.setLineDash(dashed ? [5*px1, 3*px1] : []);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - ux*h*0.8, y1 - uy*h*0.8); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - ux*h - uy*h*0.45, y1 - uy*h + ux*h*0.45);
    ctx.lineTo(x1 - ux*h + uy*h*0.45, y1 - uy*h - ux*h*0.45); ctx.closePath(); ctx.fill();
    if (label) {
      ctx.font = "600 11px system-ui, sans-serif";
      const side = labelSide || 1;
      text(label, (x0 + x1)/2 - uy*12*px1*side, (y0 + y1)/2 + ux*12*px1*side + 4*px1*vy, true);
      ctx.font = "11px system-ui, sans-serif";
    }
  };

  // velocity triangle ending at the LE (screen: x = -Y, y = +Z)
  const sv = 0.45 * W / V_REF * state.velScale;        // px per m/s (fixed, × slider)
  const S0 = [LE[0] - a.ut*sv, LE[1] - a.ua*sv];
  const step = state.revealStep;   // build-up: 1 velocities, 2 angles, 3 L & D, 4 resultant, 5 thrust & driving
  arrow2d(S0[0], S0[1], S0[0] + a.ut*sv, S0[1], AERO_COLORS.rot, Math.abs(a.ap) > 1e-4 ? "Ωr(1+a′)" : "Ωr", false, -1);
  arrow2d(LE[0], S0[1], LE[0], LE[1], AERO_COLORS.axial, "U(1−a)", false, -1);
  arrow2d(S0[0], S0[1], LE[0], LE[1], AERO_COLORS.rel, "W", false, 1);

  // angle arcs at the LE, measured upward from the rotor plane (left side)
  const arc = (r, a0, a1, color, label) => {
    const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
    ctx.strokeStyle = ctx.fillStyle = color; ctx.lineWidth = 1.2 * px1;
    ctx.beginPath(); ctx.arc(LE[0], LE[1], r, Math.PI + lo, Math.PI + hi); ctx.stroke();
    const m = Math.PI + (lo + hi) / 2;
    text(label, LE[0] + Math.cos(m)*(r + 9), LE[1] + Math.sin(m)*(r + 9) + 4*vy, true);
  };
  const rad = d => d * Math.PI/180;
  if (step >= 2) {
    arc(34, 0, rad(a.beta), "#c7ccd4", "β");
    arc(52, rad(a.beta), rad(a.phi), "#ffd54f", "α");
    arc(70, 0, rad(a.phi), "#ffffff", "φ");
  }

  // forces at the quarter chord
  const QC = P(qcY, qcZ);
  const sf = 0.34 * H / F_REF * state.forceScale;      // px per N/m (fixed, × slider)
  const F = (fy, fz, k = 1) => [QC[0] - sY*fy*sf*k, QC[1] + fz*sf*k];
  const Ry = a.L*a.dirL[0] + a.D*a.dirD[0], Rz = a.L*a.dirL[1] + a.D*a.dirD[1], Rp = F(Ry, Rz);
  const kL = 1, kFn = 1, kD = state.smallForceScale, kFt = state.smallForceScale;
  const tag = (name, k) => k !== 1 ? `${name} ×${+k.toFixed(1)}` : name;
  if (step >= 5) {
    arrow2d(QC[0], QC[1], ...F(0, a.Fn, kFn), AERO_COLORS.thrust, tag("Fn", kFn), true, -1);
    arrow2d(QC[0], QC[1], ...F(a.Ft, 0, kFt), AERO_COLORS.torque, tag("Ft", kFt), true, 1);
    // projections of R onto the axes (true scale, so they meet the unmagnified components)
    ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.setLineDash([2*px1, 3*px1]); ctx.lineWidth = px1;
    ctx.beginPath(); ctx.moveTo(Rp[0], Rp[1]); ctx.lineTo(...F(0, a.Fn)); ctx.moveTo(Rp[0], Rp[1]); ctx.lineTo(...F(a.Ft, 0)); ctx.stroke();
    ctx.setLineDash([]);
  }
  if (step >= 3) {
    arrow2d(QC[0], QC[1], ...F(a.L*a.dirL[0], a.L*a.dirL[1], kL), AERO_COLORS.lift, tag("L", kL), false, 1);
    arrow2d(QC[0], QC[1], ...F(a.D*a.dirD[0], a.D*a.dirD[1], kD), AERO_COLORS.drag, tag("D", kD), false, 1);
  }
  if (step >= 4) arrow2d(QC[0], QC[1], Rp[0], Rp[1], AERO_COLORS.res, "R", false, -1);
  // components normal and parallel to the chord (exercise 2: C_n, C_a)
  if (state.showChordForces && step >= 3) {
    const ar = rad(a.alpha), Nn = a.L * Math.cos(ar) + a.D * Math.sin(ar), Aa = a.D * Math.cos(ar) - a.L * Math.sin(ar);
    const cu = [(te[0] - le[0]) / st.chord, (te[1] - le[1]) / st.chord];   // LE -> TE, blade frame (pitched)
    let nu = [-cu[1], cu[0]];
    if (nu[0] * a.dirL[0] + nu[1] * a.dirL[1] < 0) nu = [-nu[0], -nu[1]];   // toward the suction side, like lift
    arrow2d(QC[0], QC[1], ...F(nu[0] * Nn, nu[1] * Nn), 0xb39ddb, "N ⊥ chord", true, -1);
    arrow2d(QC[0], QC[1], ...F(cu[0] * Aa * kD, cu[1] * Aa * kD), 0x90a4ae, tag("A ∥ chord", kD), true, 1);
  }

  // scale bars (screen space, bottom left)
  plain();
  const bar = (y, value, px, label) => {
    ctx.strokeStyle = ctx.fillStyle = "#9aa3af"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(10, y - 3); ctx.lineTo(10, y + 3); ctx.moveTo(10, y); ctx.lineTo(10 + px, y);
    ctx.moveTo(10 + px, y - 3); ctx.lineTo(10 + px, y + 3); ctx.stroke();
    ctx.fillText(label, 16 + px, y + 4);
  };
  const vBar = niceBar(sv * zm, 90), fBar = niceBar(sf * zm, 90);
  const times = k => k !== 1 ? `  (arrows ×${+k.toFixed(2)})` : "";
  bar(H - 26, vBar, vBar * sv * zm, `${vBar} m/s` + times(state.velScale));
  bar(H - 12, fBar, fBar * sf * zm, `${fBar >= 1000 ? fBar / 1000 + " kN/m" : fBar + " N/m"}` + times(state.forceScale) +
    (state.smallForceScale !== 1 ? `  · D, Ft ×${+state.smallForceScale.toFixed(1)}` : ""));
  mirrored();

  plain();
  const kN = v => (v / 1000).toFixed(2);
  const af = st.airfoils[0] === st.airfoils[1] ? st.airfoils[0]
    : `${st.airfoils[0]} → ${st.airfoils[1]} (${(st.blend*100).toFixed(0)}%)`;
  secInfo.innerHTML =
    `<b>z = ${z.toFixed(3)}</b> · r = ${a.r.toFixed(1)} m · chord ${st.chord.toFixed(2)} m · ${af}<br/>` +
    `U(1−a) ${a.ua.toFixed(1)} · Ωr ${a.ut.toFixed(1)} · W ${a.W.toFixed(1)} m/s<br/>` +
    `φ ${a.phi.toFixed(1)}° · β = twist ${st.twist.toFixed(1)}° + pitch ${opState.pitchDeg.toFixed(1)}° · α ${a.alpha.toFixed(1)}°<br/>` +
    `Cl ${a.cl.toFixed(3)} · Cd ${a.cd.toFixed(4)} · L ${kN(a.L)} · D ${kN(a.D)} kN/m<br/>` +
    `Fn (thrust) ${kN(a.Fn)} · Ft (driving) ${kN(a.Ft)} kN/m<br/>` +
    `Re ${(a.Re / 1e6).toFixed(2)}·10⁶ · ` + (a.bem
      ? `BEM: a ${a.a.toFixed(3)} · a′ ${a.ap.toFixed(4)} · F ${a.F.toFixed(3)} · ${a.bem.iter} it.`
      : `fixed a ${a.a.toFixed(2)}, a′ = 0`);
}

export { drawSection };
