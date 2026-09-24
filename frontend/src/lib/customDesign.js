// Geometry for the custom-design editor: turning the points a user places
// into a cuttable outline, and splitting an outline with a line. Everything is
// in cm.

// A closed path through the points. A "corner" point (c falsy) is a sharp
// turn; a "curve" point (c true) makes the outline flow smoothly through it
// (Catmull-Rom tangents turned into cubic segments).
export function pointsToPath(points) {
  const n = points.length;
  if (n < 3) return "";
  const P = (i) => points[(i + n) % n];
  const tangent = (i) => {
    const p = P(i);
    if (!p.c) return [0, 0];
    const a = P(i - 1);
    const b = P(i + 1);
    return [(b.x - a.x) / 6, (b.y - a.y) / 6];
  };
  const f = (v) => v.toFixed(2);
  let d = `M ${f(points[0].x)},${f(points[0].y)}`;
  for (let i = 0; i < n; i++) {
    const p = P(i);
    const q = P(i + 1);
    if (!p.c && !q.c) {
      d += ` L ${f(q.x)},${f(q.y)}`;
    } else {
      const tp = tangent(i);
      const tq = tangent(i + 1);
      d += ` C ${f(p.x + tp[0])},${f(p.y + tp[1])} ${f(q.x - tq[0])},${f(q.y - tq[1])} ${f(q.x)},${f(q.y)}`;
    }
  }
  return `${d} Z`;
}

export function bounds(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

// Douglas-Peucker on a closed ring of {x,y}: fewer points, same shape within eps.
export function simplifyRing(points, eps) {
  if (points.length < 4) return points;
  // Anchor on the two points farthest apart so the ring splits into two chains.
  let a = 0;
  let b = 0;
  let best = -1;
  for (let i = 0; i < points.length; i += Math.max(1, Math.floor(points.length / 60))) {
    for (let j = i + 1; j < points.length; j += Math.max(1, Math.floor(points.length / 60))) {
      const d = (points[i].x - points[j].x) ** 2 + (points[i].y - points[j].y) ** 2;
      if (d > best) {
        best = d;
        a = i;
        b = j;
      }
    }
  }
  const chain = (from, to) => {
    const out = [];
    for (let i = from; i !== to; i = (i + 1) % points.length) out.push(points[i]);
    out.push(points[to]);
    return out;
  };
  const rdp = (pts) => {
    if (pts.length < 3) return pts;
    const p0 = pts[0];
    const p1 = pts[pts.length - 1];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy) || 1;
    let idx = -1;
    let far = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = Math.abs(dy * pts[i].x - dx * pts[i].y + p1.x * p0.y - p1.y * p0.x) / len;
      if (d > far) {
        far = d;
        idx = i;
      }
    }
    if (far <= eps) return [p0, p1];
    return [...rdp(pts.slice(0, idx + 1)).slice(0, -1), ...rdp(pts.slice(idx))];
  };
  const first = rdp(chain(a, b));
  const second = rdp(chain(b, a));
  return [...first.slice(0, -1), ...second.slice(0, -1)];
}

// Splits a closed outline along the straight line between two points on it.
// h1 and h2 are {x, y, edge}: points on the outline, each on outline edge
// `edge` (the edge from points[edge] to the next point) — nearestOnOutline
// gives exactly that. Returns the two outlines, or an error message.
export function splitBetween(points, h1, h2) {
  const n = points.length;
  if (h1.edge === h2.edge) {
    return { error: "Pick two points on different edges of the outline — a cut inside one edge would leave nothing to split." };
  }
  const [a, b] = h1.edge < h2.edge ? [h1, h2] : [h2, h1];
  const cutA = { x: a.x, y: a.y, c: false };
  const cutB = { x: b.x, y: b.y, c: false };
  // Walk the outline from one cut to the other, and back round.
  const one = [cutA];
  for (let i = a.edge + 1; i <= b.edge; i++) one.push({ ...points[i] });
  one.push(cutB);
  const two = [cutB];
  for (let i = b.edge + 1; i <= a.edge + n; i++) two.push({ ...points[i % n] });
  two.push(cutA);
  return { pieces: [one, two] };
}

// Nearest point on the closed outline to p: {x, y, edge, dist}.
export function nearestOnOutline(points, p) {
  let best = { dist: Infinity };
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    const x = a.x + dx * t;
    const y = a.y + dy * t;
    const dist = Math.hypot(p.x - x, p.y - y);
    if (dist < best.dist) best = { dist, x, y, edge: i };
  }
  return best;
}

// The pieces the backend needs, from the working drawing.
export function customPayload(design) {
  return {
    pieces: (design?.pieces || [])
      .filter((p) => p.points.length >= 3)
      .map((p) => ({ name: p.name, pathData: pointsToPath(p.points), foldEdge: p.fold || "", qty: Math.max(1, Number(p.qty) || 1) })),
  };
}
