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

// opts: { series, xLabel, yLabel, logY, equal, xRange: [lo, hi],
//         marker: { x, label }, fmtX, fmtY,
//         legend: [{ color, label }]   -- overrides the automatic legend
//         yTicks: [{ v, label }] }     -- categorical rows instead of numbers
// series: { label, x: [], y: [] }                 a line (palette colour), or
//         { label, x, y0: [], y1: [], color }     a filled band between y0 and y1
//         optional: color (explicit, e.g. a material), hover(i) -> text | null
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

    // palette colours for uncoloured series (max 3); explicitly coloured ones (materials) pass through
    let slot = 0;
    const series = o.series.map(s => s.color ? s : (slot < SERIES.length ? { ...s, color: SERIES[slot++] } : null)).filter(Boolean);
    const band = s => Array.isArray(s.y0);
    const yAt = (s, i) => band(s) ? s.y1[i] : s.y[i];
    const legendItems = o.legend || (series.length > 1 ? series.map(s => ({ color: s.color, label: s.label })) : []);
    const multi = legendItems.length > 1;
    const endLabels = series.length > 1 && series.length <= 4 && !series.some(band) && !o.legend;
    const fy = o.logY ? (v => (v > 0 ? Math.log10(v) : NaN)) : (v => v);
    // data bounds
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    series.forEach(s => s.x.forEach((x, i) => {
      if (o.xRange && (x < o.xRange[0] || x > o.xRange[1])) return;
      (band(s) ? [s.y0[i], s.y1[i]] : [s.y[i]]).forEach(v => {
        const y = fy(v);
        if (!isFinite(y)) return;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      });
    }));
    if (o.yTicks) { y0 = Math.min(...o.yTicks.map(t => t.v)) - 0.6; y1 = Math.max(...o.yTicks.map(t => t.v)) + 0.6; }
    if (!isFinite(x0)) return;
    if (o.xRange) [x0, x1] = o.xRange;
    if (!o.logY && !o.equal && y0 > 0 && y0 < 0.25 * y1) y0 = 0;    // anchor near-zero data to the baseline
    if (y1 - y0 < 1e-12) { y0 -= 1; y1 += 1; }
    if (!o.yTicks) { const pad = (y1 - y0) * 0.06; y0 -= pad; y1 += pad; }

    const tickW = o.yTicks ? Math.max(...o.yTicks.map(t => g.measureText(t.label).width)) + 14 : 0;
    const ml = Math.max(56, tickW + 8);
    // legend layout: wrap onto more lines when it doesn't fit
    const legendRows = [];
    if (multi) {
      let lx = ml, row = 0;
      legendItems.forEach(s => {
        const w = 19 + g.measureText(s.label).width + 16;
        if (lx + w > W - 8 && lx > ml) { lx = ml; row++; }
        legendRows.push({ s, x: lx, row }); lx += w;
      });
    }
    const legendLines = legendRows.length ? legendRows[legendRows.length - 1].row + 1 : 0;
    const m = { l: ml, r: endLabels ? 86 : 14, t: multi ? 12 + 16 * legendLines : 12, b: 34 };
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
    g.textAlign = "right";
    if (o.yTicks) {
      g.fillStyle = TEXT;
      o.yTicks.forEach(t => g.fillText(t.label, m.l - 6, Y(t.v) + 4));
    } else {
      const yt = o.logY ? ticks(Math.ceil(y0), Math.floor(y1), Math.min(ph / 30, 8)).filter(Number.isInteger) : ticks(y0, y1, ph / 34);
      yt.forEach(v => {
        g.beginPath(); g.moveTo(m.l, Y(v)); g.lineTo(m.l + pw, Y(v)); g.stroke();
        g.fillText(o.logY ? "1e" + v : (o.fmtY || fmtAuto)(v), m.l - 6, Y(v) + 4);
      });
    }
    if (!o.logY && y0 < 0 && y1 > 0) {   // zero line, a little stronger than the grid
      g.strokeStyle = "rgba(255,255,255,0.2)"; g.beginPath(); g.moveTo(m.l, Y(0)); g.lineTo(m.l + pw, Y(0)); g.stroke();
    }
    g.fillStyle = TEXT; g.textAlign = "center";
    g.fillText(o.xLabel || "", m.l + pw / 2, H - 6);
    g.save(); g.translate(12, m.t + ph / 2); g.rotate(-Math.PI / 2); g.fillText(o.yLabel || "", 0, 0); g.restore();

    // markers (e.g. the current cut, cut-in / rated / cut-out)
    [o.marker, ...(o.markers || [])].filter(mk => mk && mk.x >= x0 && mk.x <= x1).forEach((mk, k) => {
      g.strokeStyle = mk.strong ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.3)"; g.setLineDash([4, 3]); g.lineWidth = 1;
      g.beginPath(); g.moveTo(X(mk.x), m.t); g.lineTo(X(mk.x), m.t + ph); g.stroke(); g.setLineDash([]);
      g.fillStyle = MUTED; g.textAlign = "left";
      g.fillText(mk.label || "", Math.min(X(mk.x) + 4, m.l + pw - g.measureText(mk.label || "").width - 2), m.t + 11 + (k % 2) * 12);
    });

    // series
    g.save(); g.beginPath(); g.rect(m.l, m.t, pw, ph); g.clip();
    // bands: filled between y0 and y1, split wherever the data is missing
    series.filter(band).forEach(s => {
      g.fillStyle = s.color; g.globalAlpha = s.alpha ?? 0.85;
      let seg = [];
      const flush = () => {
        if (seg.length > 1) {
          g.beginPath();
          seg.forEach((i, k) => k ? g.lineTo(X(s.x[i]), Y(fy(s.y1[i]))) : g.moveTo(X(s.x[i]), Y(fy(s.y1[i]))));
          for (let k = seg.length - 1; k >= 0; k--) g.lineTo(X(s.x[seg[k]]), Y(fy(s.y0[seg[k]])));
          g.closePath(); g.fill();
        }
        seg = [];
      };
      s.x.forEach((x, i) => (isFinite(fy(s.y0[i])) && isFinite(fy(s.y1[i])) ? seg.push(i) : flush()));
      flush();
      g.globalAlpha = 1;
    });
    series.filter(s => !band(s)).forEach(s => {
      g.strokeStyle = s.color; g.lineWidth = 2; g.lineJoin = "round"; g.setLineDash(s.dashed ? [6, 4] : []); g.beginPath();
      let pen = false;
      s.x.forEach((x, i) => {
        const y = fy(s.y[i]);
        if (!isFinite(y)) { pen = false; return; }
        pen ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)); pen = true;
      });
      g.stroke(); g.setLineDash([]);
    });
    g.restore();

    // legend (2+ series) and direct end labels, text in text colour
    g.textAlign = "left";
    legendRows.forEach(({ s, x, row }) => {
      const y = 13 + row * 16;
      g.strokeStyle = s.color; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 14, y); g.stroke();
      g.fillStyle = TEXT; g.fillText(s.label, x + 19, y + 4);
    });
    if (endLabels) {
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
        s.x.forEach((x, i) => { const d = Math.abs(x - xv); if (d < bd && isFinite(fy(yAt(s, i)))) { bd = d; best = i; } });
        if (best < 0) return null;
        const text = s.hover ? s.hover(best) : (band(s) ? null : (o.fmtY || fmtAuto)(s.y[best]));
        return text == null ? null : { s, x: s.x[best], y: yAt(s, best), text, isBand: band(s) };
      }).filter(Boolean);
      if (hits.length) {
        const hx = X(hits[0].x);
        g.strokeStyle = "rgba(255,255,255,0.35)"; g.lineWidth = 1;
        g.beginPath(); g.moveTo(hx, m.t); g.lineTo(hx, m.t + ph); g.stroke();
        hits.filter(h => !h.isBand).forEach(h => {
          g.fillStyle = h.s.color; g.strokeStyle = SURFACE; g.lineWidth = 2;
          g.beginPath(); g.arc(X(h.x), Y(fy(h.y)), 4.5, 0, 2 * Math.PI); g.fill(); g.stroke();
        });
        const lines = [`${o.xLabel || "x"}: ${(o.fmtX || fmtAuto)(hits[0].x)}`,
          ...hits.map(h => `${multi || h.isBand ? h.s.label + ": " : ""}${h.text}`)];
        const tw = Math.max(...lines.map(l => g.measureText(l).width)) + 30, th = lines.length * 15 + 8;
        let tx = this.hoverX + 12, ty = Math.max(m.t, Math.min(this.hoverY - th / 2, m.t + ph - th));
        if (tx + tw > W - 4) tx = this.hoverX - 12 - tw;
        g.fillStyle = "rgba(12,14,18,0.94)"; g.strokeStyle = "rgba(255,255,255,0.15)"; g.lineWidth = 1;
        g.beginPath(); g.roundRect(tx, ty, tw, th, 6); g.fill(); g.stroke();
        g.textAlign = "left";
        lines.forEach((l, i) => {
          const sw = i > 0 && (multi || hits[i - 1].isBand);
          if (sw) { g.fillStyle = hits[i - 1].s.color; g.fillRect(tx + 8, ty + 6 + i * 15, 9, 3); }
          g.fillStyle = i ? TEXT : MUTED;
          g.fillText(l, tx + (sw ? 22 : 8), ty + 15 + i * 15);
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
    html += `<tr><td>${fx(s0.x[i])}</td>${opts.series.map(s => { const v = s.value ? s.value(i) : (s.y ? s.y[i] : s.y1[i] - s.y0[i]); return `<td>${isFinite(v) ? fyv(v) : "–"}</td>`; }).join("")}</tr>`;
  }
  return html + "</tbody></table>";
}

export { LinePlot, plotTable };
