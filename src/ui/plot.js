// Small canvas line plots for the Plots and Airfoils windows.
// Style follows the data-viz rules used across the app: validated dark
// categorical slots in fixed order (max 3 series per chart), 2 px lines,
// recessive grid, text in text colours (never the series colour), a legend
// for 2+ series plus direct end labels, and a hover crosshair + tooltip.

// dark categorical slots 1-3 (validated against the window surface #15171d)
const SERIES = ["#3987e5", "#d95926", "#199e70"];
const TEXT = "#c7ccd4", MUTED = "#8b94a1", GRID = "rgba(255,255,255,0.07)", SURFACE = "#15171d";

function niceStep(span, target) {
  const raw = span / Math.max(target, 1), p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map(m => m * p).find(s => s >= raw) || 10 * p;
}
function ticks(lo, hi, target) {
  const step = niceStep(hi - lo, target), out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toPrecision(12));
  return out;
}
const fmtAuto = v => {
  const a = Math.abs(v);
  if (a === 0) return "0";
  if (a >= 1e5 || a < 1e-3) return v.toExponential(1).replace("e+", "e");
  return +v.toPrecision(4) + "";
};

// opts: { series: [{ label, x: [], y: [] }], xLabel, yLabel, logY, equal,
//         xRange: [lo, hi], marker: { x, label }, fmtX, fmtY }
class LinePlot {
  constructor(canvas) {
    this.canvas = canvas;
    this.opts = null;
    this.hoverX = null;   // css px inside the canvas, or null
    canvas.addEventListener("pointermove", (e) => {
      const r = canvas.getBoundingClientRect();
      this.hoverX = e.clientX - r.left; this.hoverY = e.clientY - r.top;
      this.render();
    });
    canvas.addEventListener("pointerleave", () => { this.hoverX = null; this.render(); });
  }

  draw(opts) { this.opts = opts; this.render(); }

  render() {
    const o = this.opts, cv = this.canvas;
    if (!o || !cv.clientWidth) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2), W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.font = "11px system-ui, sans-serif";

    const series = o.series.slice(0, SERIES.length).map((s, i) => ({ ...s, color: SERIES[i] }));
    const multi = series.length > 1;
    const fy = o.logY ? (v => (v > 0 ? Math.log10(v) : NaN)) : (v => v);
    // data bounds
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    series.forEach(s => s.x.forEach((x, i) => {
      const y = fy(s.y[i]);
      if (!isFinite(y) || (o.xRange && (x < o.xRange[0] || x > o.xRange[1]))) return;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }));
    if (!isFinite(x0)) return;
    if (o.xRange) [x0, x1] = o.xRange;
    if (!o.logY && !o.equal && y0 > 0 && y0 < 0.25 * y1) y0 = 0;    // anchor near-zero data to the baseline
    if (y1 - y0 < 1e-12) { y0 -= 1; y1 += 1; }
    const pad = (y1 - y0) * 0.06; y0 -= pad; y1 += pad;

    const m = { l: 56, r: multi ? 86 : 14, t: multi ? 26 : 12, b: 34 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    if (pw < 40 || ph < 30) return;
    if (o.equal) {   // same scale on both axes (airfoil shapes)
      const sx = pw / (x1 - x0), sy = ph / (y1 - y0);
      if (sx < sy) { const c = (y0 + y1) / 2, h = ph / sx / 2; y0 = c - h; y1 = c + h; }
      else { const c = (x0 + x1) / 2, w = pw / sy / 2; x0 = c - w; x1 = c + w; }
    }
    const X = x => m.l + (x - x0) / (x1 - x0) * pw;
    const Y = y => m.t + ph - (y - y0) / (y1 - y0) * ph;

    // grid + tick labels
    g.strokeStyle = GRID; g.lineWidth = 1; g.fillStyle = MUTED;
    const xt = ticks(x0, x1, pw / 70);
    g.textAlign = "center";
    xt.forEach(v => { g.beginPath(); g.moveTo(X(v), m.t); g.lineTo(X(v), m.t + ph); g.stroke(); g.fillText((o.fmtX || fmtAuto)(v), X(v), m.t + ph + 14); });
    const yt = o.logY ? ticks(Math.ceil(y0), Math.floor(y1), Math.min(ph / 30, 8)).filter(Number.isInteger) : ticks(y0, y1, ph / 34);
    g.textAlign = "right";
    yt.forEach(v => {
      g.beginPath(); g.moveTo(m.l, Y(v)); g.lineTo(m.l + pw, Y(v)); g.stroke();
      g.fillText(o.logY ? "1e" + v : (o.fmtY || fmtAuto)(v), m.l - 6, Y(v) + 4);
    });
    if (!o.logY && y0 < 0 && y1 > 0) {   // zero line, a little stronger than the grid
      g.strokeStyle = "rgba(255,255,255,0.2)"; g.beginPath(); g.moveTo(m.l, Y(0)); g.lineTo(m.l + pw, Y(0)); g.stroke();
    }
    g.fillStyle = TEXT; g.textAlign = "center";
    g.fillText(o.xLabel || "", m.l + pw / 2, H - 6);
    g.save(); g.translate(12, m.t + ph / 2); g.rotate(-Math.PI / 2); g.fillText(o.yLabel || "", 0, 0); g.restore();

    // marker (e.g. the current cut)
    if (o.marker && o.marker.x >= x0 && o.marker.x <= x1) {
      g.strokeStyle = "rgba(255,255,255,0.45)"; g.setLineDash([4, 3]);
      g.beginPath(); g.moveTo(X(o.marker.x), m.t); g.lineTo(X(o.marker.x), m.t + ph); g.stroke(); g.setLineDash([]);
      g.fillStyle = MUTED; g.textAlign = "left";
      g.fillText(o.marker.label || "", Math.min(X(o.marker.x) + 4, m.l + pw - 60), m.t + 11);
    }

    // series
    g.save(); g.beginPath(); g.rect(m.l, m.t, pw, ph); g.clip();
    series.forEach(s => {
      g.strokeStyle = s.color; g.lineWidth = 2; g.lineJoin = "round"; g.beginPath();
      let pen = false;
      s.x.forEach((x, i) => {
        const y = fy(s.y[i]);
        if (!isFinite(y)) { pen = false; return; }
        pen ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)); pen = true;
      });
      g.stroke();
    });
    g.restore();

    // legend (2+ series) and direct end labels, text in text colour
    if (multi) {
      g.textAlign = "left"; let lx = m.l;
      series.forEach(s => {
        g.strokeStyle = s.color; g.lineWidth = 2; g.beginPath(); g.moveTo(lx, 13); g.lineTo(lx + 14, 13); g.stroke();
        g.fillStyle = TEXT; g.fillText(s.label, lx + 19, 17); lx += 19 + g.measureText(s.label).width + 16;
      });
      const ends = series.map(s => {
        let i = s.x.length - 1;
        while (i > 0 && (!isFinite(fy(s.y[i])) || (o.xRange && s.x[i] > x1))) i--;
        return { s, y: Math.min(Math.max(Y(fy(s.y[i])), m.t + 6), m.t + ph - 2) };
      }).sort((a, b) => a.y - b.y);
      for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 13);
      ends.forEach(e => {
        g.strokeStyle = e.s.color; g.lineWidth = 2; g.beginPath(); g.moveTo(m.l + pw + 4, e.y); g.lineTo(m.l + pw + 12, e.y); g.stroke();
        g.fillStyle = TEXT; g.fillText(e.s.label.length > 11 ? e.s.label.slice(0, 10) + "…" : e.s.label, m.l + pw + 15, e.y + 4);
      });
    }

    // hover: crosshair, ringed dots on each series, tooltip
    if (this.hoverX != null && this.hoverX >= m.l && this.hoverX <= m.l + pw) {
      const xv = x0 + (this.hoverX - m.l) / pw * (x1 - x0);
      const hits = series.map(s => {
        let best = -1, bd = Infinity;
        s.x.forEach((x, i) => { const d = Math.abs(x - xv); if (d < bd && isFinite(fy(s.y[i]))) { bd = d; best = i; } });
        return best < 0 ? null : { s, x: s.x[best], y: s.y[best] };
      }).filter(Boolean);
      if (hits.length) {
        const hx = X(hits[0].x);
        g.strokeStyle = "rgba(255,255,255,0.35)"; g.lineWidth = 1;
        g.beginPath(); g.moveTo(hx, m.t); g.lineTo(hx, m.t + ph); g.stroke();
        hits.forEach(h => {
          g.fillStyle = h.s.color; g.strokeStyle = SURFACE; g.lineWidth = 2;
          g.beginPath(); g.arc(X(h.x), Y(fy(h.y)), 4.5, 0, 2 * Math.PI); g.fill(); g.stroke();
        });
        const lines = [`${o.xLabel || "x"}: ${(o.fmtX || fmtAuto)(hits[0].x)}`,
          ...hits.map(h => `${multi ? h.s.label + ": " : ""}${(o.fmtY || fmtAuto)(h.y)}`)];
        const tw = Math.max(...lines.map(l => g.measureText(l).width)) + (multi ? 30 : 16), th = lines.length * 15 + 8;
        let tx = this.hoverX + 12, ty = Math.max(m.t, Math.min(this.hoverY - th / 2, m.t + ph - th));
        if (tx + tw > W - 4) tx = this.hoverX - 12 - tw;
        g.fillStyle = "rgba(12,14,18,0.94)"; g.strokeStyle = "rgba(255,255,255,0.15)"; g.lineWidth = 1;
        g.beginPath(); g.roundRect(tx, ty, tw, th, 6); g.fill(); g.stroke();
        g.textAlign = "left";
        lines.forEach((l, i) => {
          if (multi && i > 0) { g.fillStyle = hits[i - 1].s.color; g.fillRect(tx + 8, ty + 6 + i * 15, 9, 3); }
          g.fillStyle = i ? TEXT : MUTED;
          g.fillText(l, tx + (multi && i > 0 ? 22 : 8), ty + 15 + i * 15);
        });
      }
    }
  }
}

// a data table of the same series (the accessible view), sampled to ~maxRows rows
function plotTable(opts, maxRows = 40) {
  const s0 = opts.series[0], step = Math.max(1, Math.ceil(s0.x.length / maxRows));
  const fx = opts.fmtX || fmtAuto, fyv = opts.fmtY || fmtAuto;
  let html = `<table class="data-table"><thead><tr><th>${opts.xLabel || "x"}</th>${opts.series.map(s => `<th>${s.label}</th>`).join("")}</tr></thead><tbody>`;
  for (let i = 0; i < s0.x.length; i += step) {
    html += `<tr><td>${fx(s0.x[i])}</td>${opts.series.map(s => `<td>${isFinite(s.y[i]) ? fyv(s.y[i]) : "–"}</td>`).join("")}</tr>`;
  }
  return html + "</tbody></table>";
}

export { LinePlot, plotTable };
