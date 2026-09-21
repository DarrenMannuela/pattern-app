// Shirt collars drawn from the real neckline and the collar pieces'
// measurements, using the proportions of a real shirt collar:
//   - a point collar has points 7-8cm long, lying 2.5-7.5cm apart on the
//     chest (a 50-70 degree opening); a spread collar 10-15cm apart
//   - the collar stand is about 3cm tall and the collar "fall" over it
//     4-5cm at center back
//   - a Peter Pan collar is a flat band of even width (about 7cm) following
//     the neckline all the way round, with rounded front ends
// The collar pieces (backend/draft/shirt.go) carry those measurements; this
// reads them and builds the outlines on the drafted neckline.
//
// Everything is for the right half; the other half is the mirror image.
// Coordinates are pattern cm: x = 0 is the center line, y = 0 the neck point.

import { parsePath } from "./torsoGeometry.js";

const cubicAt = (c, t) => {
  const u = 1 - t;
  return [
    u * u * u * c[0][0] + 3 * u * u * t * c[1][0] + 3 * u * t * t * c[2][0] + t * t * t * c[3][0],
    u * u * u * c[0][1] + 3 * u * u * t * c[1][1] + 3 * u * t * t * c[2][1] + t * t * t * c[3][1],
  ];
};

// Points along a neckline curve, each with the unit normal pointing onto the
// body (`b`) and the opposite one, toward the neck opening (`h`). For a curve
// read center-to-shoulder those are (-ty, tx) and (ty, -tx).
function sampleCurve(curve, steps, t0 = 0, t1 = 1) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = t0 + ((t1 - t0) * i) / steps;
    const p = cubicAt(curve, t);
    const a = cubicAt(curve, Math.max(0, t - 0.01));
    const c = cubicAt(curve, Math.min(1, t + 0.01));
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
    const tx = (c[0] - a[0]) / len;
    const ty = (c[1] - a[1]) / len;
    out.push({ t, x: p[0], y: p[1], bx: -ty, by: tx, hx: ty, hy: -tx });
  }
  return out;
}

const fmt = (pts) => pts.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" L ");
const find = (pieces, re) => pieces.find((p) => re.test(p.name));

// What the collar pieces say about the collar.
export function collarDims(pieces, style) {
  const dims = { standH: 3, fall: 5, pointLen: 7.5, alpha: (27 * Math.PI) / 180, width: 7, thick: 3.8 };
  const stand = find(pieces, /collar stand/i);
  const leaf = find(pieces, /collar leaf/i);
  const band = find(pieces, /standing collar/i);
  const polo = find(pieces, /polo collar/i);
  if (stand) {
    const cmds = parsePath(stand.pathData);
    const first = cmds[0].p[0];
    const last = [...cmds].reverse().find((c) => c.c === "L");
    if (last) dims.standH = Math.abs(last.p[0][1] - first[1]);
  }
  if (band) dims.thick = band.height * 0.46;
  if (polo) {
    dims.pointLen = 8;
    dims.fall = polo.height * 0.7;
    dims.alpha = (30 * Math.PI) / 180;
  }
  if (leaf && style === "peter_pan") {
    dims.width = leaf.height * 0.5;
    dims.fall = dims.width;
  } else if (leaf) {
    const cmds = parsePath(leaf.pathData);
    const neckEdge = cmds[1]?.p[0]?.[0] || leaf.width;
    const tip = cmds[2]?.p[0];
    if (tip) {
      const overhang = Math.max(0, tip[0] - neckEdge);
      dims.pointLen = Math.hypot(overhang, tip[1]);
      // The point's edge leans further out from the center line on a spread
      // collar (a wider opening between the points).
      dims.alpha = Math.min((62 * Math.PI) / 180, Math.max((18 * Math.PI) / 180, 1.15 * Math.atan2(overhang, tip[1])));
    }
    const back = [...cmds].reverse().find((c) => c.c === "C");
    if (back) dims.fall = back.p[2][1];
  }
  return dims;
}

// The turned-down leaf seen from the front, and the roll line where it
// folds over its stand. `curve` is the front neckline, center front to neck
// point.
export function frontLeaf(style, curve, dims) {
  if (!curve) return null;
  const N = curve[3];
  const S = sampleCurve(curve, 18, 0.03, 1);
  const hole = 0.35;
  // Never across the center line (the twin collar is the mirror image).
  const inner = S.map((s) => [Math.max(0.15, s.x + s.hx * hole), s.y + s.hy * hole]);
  const C0 = inner[0];

  if (style === "peter_pan") {
    const W = dims.width;
    // Slightly narrower toward the neck point than at the front.
    const outerAt = (s) => [s.x + s.bx * W * (0.86 + 0.14 * (1 - s.t)), s.y + s.by * W * (0.86 + 0.14 * (1 - s.t))];
    // The front end rounds off into a petal that meets its twin at the center line.
    const cut = S.findIndex((s) => s.t >= 0.12);
    const A = outerAt(S[cut]);
    const E = [C0[0] + 0.2, C0[1] + W * 0.78];
    const round = `C ${(A[0] + 0.05 * W).toFixed(2)} ${(A[1] + 0.55 * W).toFixed(2)} ${(E[0] + 0.7 * W).toFixed(2)} ${(E[1] + 0.02 * W).toFixed(2)} ${E[0].toFixed(2)} ${E[1].toFixed(2)}`;
    const outer = S.slice(cut).map(outerAt).reverse();
    // The piping runs along the outer edge and round the petal.
    const petal = [];
    for (let i = 1; i <= 10; i++) petal.push(cubicAt([A, [A[0] + 0.05 * W, A[1] + 0.55 * W], [E[0] + 0.7 * W, E[1] + 0.02 * W], E], i / 10));
    return {
      d: `M ${fmt(inner)} L ${fmt(outer)} ${round} Z`,
      roll: [],
      edge: [...outer, ...petal],
    };
  }

  // A point collar: neck edge along the neckline, the outer edge standing up
  // beside the neck and running down to the point, and the front edge back
  // to the center line.
  const K = [N[0] + 0.118 * N[0], N[1] - 0.17 * N[0]];
  const T = [C0[0] + dims.pointLen * Math.sin(dims.alpha), C0[1] + dims.pointLen * Math.cos(dims.alpha)];
  const c1 = [K[0] + (T[0] - K[0]) * 0.15, K[1] + (T[1] - K[1]) * 0.4];
  const c2 = [T[0] + (K[0] - T[0]) * 0.25, T[1] - (T[1] - K[1]) * 0.35];
  const d = `M ${fmt(inner)} L ${K[0].toFixed(2)} ${K[1].toFixed(2)} C ${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${T[0].toFixed(2)} ${T[1].toFixed(2)} Z`;
  const roll = S.filter((s) => s.t > 0.12 && s.t < 0.95).map((s) => [s.x + s.bx * 1.4 + s.hx * hole, s.y + s.by * 1.4 + s.hy * hole]);
  // The piping runs down the outer edge to the point and back along the front edge.
  const edge = [K];
  for (let i = 1; i <= 12; i++) edge.push(cubicAt([K, c1, c2, T], i / 12));
  edge.push(C0);
  return { d, roll, edge };
}

// A band standing up from the front neckline (band/mandarin collar): its
// lower edge is the neckline, its upper edge the same curve pushed toward the
// neck opening by `thick`.
export function frontBand(curve, thick) {
  if (!curve) return null;
  const S = sampleCurve(curve, 18);
  const lower = S.map((s) => [Math.max(0.3, s.x), s.y]);
  const upper = S.map((s) => {
    const grow = 0.75 + 0.25 * s.t;
    return [Math.max(0.3, s.x + s.hx * thick * grow), s.y + s.hy * thick * grow];
  });
  return `M ${fmt([...lower, ...upper.reverse()])} Z`;
}

// A band on the back neckline: `dist` > 0 hangs onto the back (a flat collar),
// < 0 rises above the neckline (stand and fall). Ends taper a little.
export function backBand(curve, dist) {
  if (!curve) return null;
  const S = sampleCurve(curve, 18);
  const lower = S.map((s) => [s.x, s.y]);
  // Straight up (or down): the back neckline leaves center back going
  // vertically, so its own normal there points sideways across the center.
  const upper = S.map((s) => [s.x + (dist < 0 ? s.t * 0.8 : 0), s.y + dist * (1 - 0.18 * s.t)]);
  return `M ${fmt([...lower, ...upper.reverse()])} Z`;
}

// A line along the back band at height `h` above the neckline (the seam
// between stand and fall).
export function backBandLine(curve, h) {
  if (!curve) return [];
  return sampleCurve(curve, 14).map((s) => [s.x + s.t * 0.8 * 0.9, s.y - h * (1 - 0.18 * s.t)]);
}

// The back of the collar seen through the neck opening from the front: a
// dome standing `rise` above the neck point, peaked at center back.
export function backArch(backCurve, rise) {
  if (!backCurve) return null;
  const N = backCurve[3];
  const CB = backCurve[0];
  const top = N[1] - rise;
  const S = sampleCurve(backCurve, 14);
  const lower = S.map((s) => [s.x, s.y]);
  const side = [N[0] + 0.9, N[1] - rise * 0.5];
  const dome = `C ${(N[0] + 0.9).toFixed(2)} ${(top + 0.2).toFixed(2)} ${(N[0] * 0.55).toFixed(2)} ${(top - 0.1).toFixed(2)} 0 ${(top - 0.15).toFixed(2)}`;
  return `M ${fmt(lower)} L ${side[0].toFixed(2)} ${side[1].toFixed(2)} ${dome} L 0 ${CB[1].toFixed(2)} Z`;
}

// The top edge of a band standing up from the front neckline (for piping), from
// the front down to the shoulder end.
export function frontBandEdge(curve, thick) {
  if (!curve) return [];
  return sampleCurve(curve, 18).map((s) => {
    const grow = 0.75 + 0.25 * s.t;
    return [Math.max(0.3, s.x + s.hx * thick * grow), s.y + s.hy * thick * grow];
  });
}

// The top edge of a back band (see backBand), for piping.
export function backBandTop(curve, dist) {
  if (!curve) return [];
  return sampleCurve(curve, 18).map((s) => [s.x + (dist < 0 ? s.t * 0.8 : 0), s.y + dist * (1 - 0.18 * s.t)]);
}

// A V-neck's trim or facing: a band of width w along the V edge (neck point
// to center front), on the body side.
export function vNeckBand(neck, cf, w) {
  const dx = cf[0] - neck[0];
  const dy = cf[1] - neck[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = dy / len; // toward the body (right and down)
  const ny = -dx / len;
  const pts = [neck, cf, [cf[0] + nx * w, cf[1] + ny * w], [neck[0] + nx * w, neck[1] + ny * w]];
  return `M ${fmt(pts)} Z`;
}

// The back neck binding seen through a V-neck's opening: a strip of height h
// standing straight up from the back neckline.
export function backNeckStrip(curve, h) {
  if (!curve) return null;
  const S = sampleCurve(curve, 14);
  const lower = S.map((s) => [s.x, s.y]);
  const upper = S.map((s) => [s.x, s.y - h]);
  return `M ${fmt([...lower, ...upper.reverse()])} Z`;
}
