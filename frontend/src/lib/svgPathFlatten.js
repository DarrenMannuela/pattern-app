// An SVG path ("d") as polylines: every command (M L H V C S Q T A Z, absolute
// or relative), curves and arcs cut into short straight steps. Corners stay
// exact; only the curves are approximated, to within `tolerance` (in the
// path's own units).

const NUM = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;
const ARGS = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

function tokenize(d) {
  const out = [];
  const re = /([MLHVCSQTAZ])([^MLHVCSQTAZ]*)/gi;
  let m;
  while ((m = re.exec(d))) {
    const cmd = m[1];
    const nums = (m[2].match(NUM) || []).map(Number);
    const n = ARGS[cmd.toUpperCase()];
    if (n === 0) {
      out.push([cmd, []]);
      continue;
    }
    for (let i = 0; i < nums.length; i += n) {
      // Extra pairs after a moveto are linetos.
      const c = i > 0 && cmd.toUpperCase() === "M" ? (cmd === "m" ? "l" : "L") : cmd;
      out.push([c, nums.slice(i, i + n)]);
    }
  }
  return out;
}

function steps(len, tolerance) {
  return Math.max(2, Math.min(200, Math.ceil(len / Math.max(tolerance, 0.001))));
}

function cubic(p0, p1, p2, p3, tolerance, pts) {
  const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) + Math.hypot(p3[0] - p2[0], p3[1] - p2[1]);
  const n = steps(len, tolerance * 4);
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
}

// The SVG arc from p0 to p1 (endpoint form), as points after p0.
function arc(p0, rx, ry, angle, large, sweep, p1, tolerance, pts) {
  if (rx === 0 || ry === 0 || (p0[0] === p1[0] && p0[1] === p1[1])) {
    pts.push(p1);
    return;
  }
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const phi = (angle * Math.PI) / 180;
  const cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (p0[0] - p1[0]) / 2, dy = (p0[1] - p1[1]) / 2;
  const x1 = cos * dx + sin * dy, y1 = -sin * dx + cos * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  let k = Math.sqrt(Math.max(0, num / den));
  if (large === sweep) k = -k;
  const cx1 = (k * rx * y1) / ry, cy1 = (-k * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (p0[0] + p1[0]) / 2;
  const cy = sin * cx1 + cos * cy1 + (p0[1] + p1[1]) / 2;
  const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = steps(Math.abs(dt) * Math.max(rx, ry), tolerance * 4);
  for (let i = 1; i <= n; i++) {
    const t = t1 + (dt * i) / n;
    const ex = rx * Math.cos(t), ey = ry * Math.sin(t);
    pts.push([cos * ex - sin * ey + cx, sin * ex + cos * ey + cy]);
  }
  pts[pts.length - 1] = p1;
}

/** [{ points: [[x, y], ...], closed }] for each subpath of `d`. */
export function flattenPath(d, tolerance = 0.02) {
  const subpaths = [];
  let cur = [0, 0], start = [0, 0];
  let pts = null;
  let lastCtrl = null, lastCmd = "";
  const begin = (p) => {
    if (pts && pts.length > 1) subpaths.push({ points: pts, closed: false });
    pts = [p];
    start = p;
  };
  for (const [raw, a] of tokenize(d || "")) {
    const rel = raw === raw.toLowerCase();
    const C = raw.toUpperCase();
    const ox = rel ? cur[0] : 0, oy = rel ? cur[1] : 0;
    if (C !== "M" && !pts) begin(cur);
    switch (C) {
      case "M": cur = [ox + a[0], oy + a[1]]; begin(cur); break;
      case "L": cur = [ox + a[0], oy + a[1]]; pts.push(cur); break;
      case "H": cur = [ox + a[0], cur[1]]; pts.push(cur); break;
      case "V": cur = [cur[0], oy + a[0]]; pts.push(cur); break;
      case "C": {
        const c1 = [ox + a[0], oy + a[1]], c2 = [ox + a[2], oy + a[3]], e = [ox + a[4], oy + a[5]];
        cubic(cur, c1, c2, e, tolerance, pts);
        lastCtrl = c2; cur = e; break;
      }
      case "S": {
        const c1 = lastCmd === "C" || lastCmd === "S" ? [2 * cur[0] - lastCtrl[0], 2 * cur[1] - lastCtrl[1]] : cur;
        const c2 = [ox + a[0], oy + a[1]], e = [ox + a[2], oy + a[3]];
        cubic(cur, c1, c2, e, tolerance, pts);
        lastCtrl = c2; cur = e; break;
      }
      case "Q": case "T": {
        const q = C === "Q" ? [ox + a[0], oy + a[1]] : lastCmd === "Q" || lastCmd === "T" ? [2 * cur[0] - lastCtrl[0], 2 * cur[1] - lastCtrl[1]] : cur;
        const e = C === "Q" ? [ox + a[2], oy + a[3]] : [ox + a[0], oy + a[1]];
        // A quadratic is a cubic with these control points.
        cubic(cur, [cur[0] + (2 / 3) * (q[0] - cur[0]), cur[1] + (2 / 3) * (q[1] - cur[1])], [e[0] + (2 / 3) * (q[0] - e[0]), e[1] + (2 / 3) * (q[1] - e[1])], e, tolerance, pts);
        lastCtrl = q; cur = e; break;
      }
      case "A": {
        const e = [ox + a[5], oy + a[6]];
        arc(cur, a[0], a[1], a[2], !!a[3], !!a[4], e, tolerance, pts);
        cur = e; break;
      }
      case "Z":
        if (pts && pts.length > 1) subpaths.push({ points: pts, closed: true });
        pts = null;
        cur = start;
        break;
    }
    lastCmd = C;
  }
  if (pts && pts.length > 1) subpaths.push({ points: pts, closed: false });
  return subpaths;
}

/** The bounding box of polylines: { minX, minY, maxX, maxY }. */
export function bounds(subpaths) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of subpaths) for (const [x, y] of s.points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}
