// =====================================================================
// generic helpers
// =====================================================================

function lerp1D(x, xs, ys) {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length-1]) return ys[ys.length-1];
  let lo = 0, hi = xs.length - 1;
  while (hi - lo > 1) { const mid = (lo+hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
  const f = (x - xs[lo]) / (xs[hi] - xs[lo]);
  return ys[lo] + f * (ys[hi] - ys[lo]);
}
function field(f, z) { return lerp1D(z, f.grid, f.values); }

function inPlaneNormals(px, py) {
  // Orientation is decided ONCE via the polygon's overall winding direction
  // (shoelace/signed-area formula), then applied identically to every point.
  // A per-point "does this point away from the centroid" test is fragile:
  // near a trailing-edge cusp the true normal is dominated by its
  // perpendicular-to-chord component while the centroid sits far away
  // mostly along the chord direction, so a tiny floating-point wobble in
  // the local tangent can flip the per-point decision and invert a whole
  // run of ply offsets right at the TE. The global winding test has no
  // such failure mode.
  const n = px.length;
  let area2 = 0;
  for (let i = 0; i < n; i++) {
    const j = (i+1) % n;
    area2 += px[i]*py[j] - px[j]*py[i];
  }
  const sign = area2 > 0 ? 1 : -1;

  const nx = new Float64Array(n), ny = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const ip = (i - 1 + n) % n, iq = (i + 1) % n;
    let tx = px[iq] - px[ip], ty = py[iq] - py[ip];
    const norm = Math.hypot(tx, ty); tx /= norm; ty /= norm;
    nx[i] = sign*ty; ny[i] = -sign*tx;
  }
  return { nx, ny };
}

export { field, inPlaneNormals, lerp1D };
