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

const pt = (p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
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

// A flat (Peter Pan) collar seen from the front: a band of even width lying
// on the body along the neckline, its front end rounded into a petal that
// meets its twin at the centre line. `curve` is the front neckline, centre
// front to neck point. (Turn-down collars are turnDownCollar, below.)
export function flatCollarLeaf(curve, dims) {
  if (!curve) return null;
  const S = sampleCurve(curve, 18, 0.03, 1);
  const hole = 0.35;
  // Never across the center line (the twin collar is the mirror image).
  const inner = S.map((s) => [Math.max(0.15, s.x + s.hx * hole), s.y + s.hy * hole]);
  const C0 = inner[0];

  const W = dims.width;
  // Slightly narrower toward the neck point than at the front.
  const outerAt = (s) => [s.x + s.bx * W * (0.86 + 0.14 * (1 - s.t)), s.y + s.by * W * (0.86 + 0.14 * (1 - s.t))];
  // The front end rounds off into a petal that curves back to the neckline at
  // the centre line: the twins touch only there, leaving a small V between
  // their rounded ends below it.
  const cut = S.findIndex((s) => s.t >= 0.12);
  const A = outerAt(S[cut]);
  const E = C0;
  const r1 = [A[0] + 0.05 * W, A[1] + 0.6 * W];
  const r2 = [E[0] + 0.55 * W, E[1] + 0.8 * W];
  const round = `C ${pt(r1)} ${pt(r2)} ${pt(E)}`;
  const outer = S.slice(cut).map(outerAt).reverse();
  // The piping runs along the outer edge and round the petal.
  const petal = [];
  for (let i = 1; i <= 10; i++) petal.push(cubicAt([A, r1, r2, E], i / 10));
  return {
    d: `M ${fmt(inner)} L ${fmt(outer)} ${round} Z`,
    edge: [...outer, ...petal],
  };
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

// How far a turn-down collar stands above the neck point: the stand plus the
// fold of the leaf over it. Front and back views use the same height.
export function collarRise(style, dims) {
  if (style === "standing") return dims.thick;
  if (style === "polo") return Math.max(2.5, dims.fall * 0.7);
  return dims.standH + 1;
}


// A turn-down collar (point, spread or polo) seen from the front, drawn the
// way technical flats draw it (see the Wikimedia "Collars" and "Dress Shirt
// Features" flats):
//   - behind the neck, the back of the collar shows as a band whose top edge
//     arches up to centre back, with the stand seam a little way inside it;
//   - below that, the inside of the collar and back neck, down to a V at the
//     top button;
//   - each leaf runs from the band's top outer corner out and down to the
//     shoulder line, then in to its point, and back up to that V.
// frontCurve is the front neckline (centre front to neck point), shoulder the
// shoulder point. Returns SVG paths for the right half.
export function turnDownCollar(frontCurve, shoulder, dims, style = "point") {
  if (!frontCurve || !shoulder) return null;
  const CF = frontCurve[0];
  const N = frontCurve[3];
  const rise = collarRise(style, dims);
  const T = [N[0] * 1.02, N[1] - rise]; // top outer corner
  const peakY = T[1] - 0.45; // centre back is a little higher than the corners
  const seamDrop = Math.min(1.4, dims.standH * 0.45);
  const B = [T[0] * 0.86, T[1] + seamDrop + 0.1]; // inner corner, on the stand seam
  const seamPeakY = peakY + seamDrop;

  // Where the leaf's outer edge meets the shoulder line.
  const sl = Math.hypot(shoulder[0] - N[0], shoulder[1] - N[1]) || 1;
  const reach = N[0] * 0.28;
  const A = [N[0] + ((shoulder[0] - N[0]) / sl) * reach, N[1] + ((shoulder[1] - N[1]) / sl) * reach];

  const V = [0, CF[1]]; // the leaves meet at the top button
  // The point: its length and angle from the collar leaf piece, kept inside
  // the leaf's own outer edge.
  const P = [Math.min(A[0] - 0.6, V[0] + dims.pointLen * Math.sin(dims.alpha)), V[1] + dims.pointLen * Math.cos(dims.alpha)];

  const h = V[1] - B[1];
  const uc1 = [B[0], B[1] + h * 0.55];
  const uc2 = [V[0] + N[0] * 0.45, V[1] - h * 0.15];
  const topC1 = [T[0] * 0.5, peakY];
  const topC2 = [T[0] * 0.95, T[1] - 0.15];
  const seamC1 = [B[0] * 0.5, seamPeakY];
  const seamC2 = [B[0] * 0.95, B[1] - 0.15];
  const outC1 = [T[0] + (A[0] - T[0]) * 0.15, T[1] + (A[1] - T[1]) * 0.6];
  const outC2 = [A[0] - (A[0] - T[0]) * 0.1, A[1] - 0.4];
  const pointC1 = [A[0] - (A[0] - P[0]) * 0.1, A[1] + (P[1] - A[1]) * 0.35];
  const pointC2 = [P[0] + (A[0] - P[0]) * 0.15, P[1] - (P[1] - A[1]) * 0.25];
  const softP = style === "polo"; // a knit collar's points are softer

  const band = `M 0 ${peakY.toFixed(2)} C ${pt(topC1)} ${pt(topC2)} ${pt(T)} L ${pt(B)} C ${pt(seamC2)} ${pt(seamC1)} 0 ${seamPeakY.toFixed(2)} Z`;
  const inner = `M 0 ${seamPeakY.toFixed(2)} C ${pt(seamC1)} ${pt(seamC2)} ${pt(B)} C ${pt(uc1)} ${pt(uc2)} ${pt(V)} Z`;
  const pointEnd = softP ? `C ${pt([P[0] + 0.1, P[1] + 0.5])} ${pt([P[0] - 0.6, P[1] + 0.3])} ${pt([P[0] - 1, P[1] - 0.1])} L ${pt(V)}` : `L ${pt(V)}`;
  const leaf = `M ${pt(T)} C ${pt(outC1)} ${pt(outC2)} ${pt(A)} C ${pt(pointC1)} ${pt(pointC2)} ${pt(P)} ${pointEnd} C ${pt(uc2)} ${pt(uc1)} ${pt(B)} Z`;

  const seam = [];
  for (let i = 0; i <= 12; i++) seam.push(cubicAt([[0, seamPeakY], seamC1, seamC2, B], i / 12));
  // The collar's outer edge, for piping: over the top, down the outside, round
  // the point and back to the button.
  const edge = [];
  for (let i = 0; i <= 10; i++) edge.push(cubicAt([[0, peakY], topC1, topC2, T], i / 10));
  for (let i = 1; i <= 8; i++) edge.push(cubicAt([T, outC1, outC2, A], i / 8));
  for (let i = 1; i <= 8; i++) edge.push(cubicAt([A, pointC1, pointC2, P], i / 8));
  edge.push(V);
  return { band, inner, leaf, seam, edge, rise };
}

// The collar seen from behind: a band on the back neckline whose top edge
// arches up to centre back, its sides rising from the neck point. (Flats show
// no seam line on it: the stand is hidden under the fall.) backCurve is the
// back neckline, centre back to neck point.
export function backCollar(backCurve, rise) {
  if (!backCurve) return null;
  const N = backCurve[3];
  const T = [N[0] * 1.03, N[1] - rise];
  const peakY = T[1] - 0.45;
  const S = sampleCurve(backCurve, 18);
  const lower = S.map((s) => [s.x, s.y]);
  const sideC1 = [N[0] + 0.35, N[1] - rise * 0.35];
  const sideC2 = [T[0] + 0.1, T[1] + rise * 0.3];
  const topC1 = [T[0] * 0.95, T[1] - 0.15];
  const topC2 = [T[0] * 0.5, peakY];
  const d = `M ${fmt(lower)} C ${pt(sideC1)} ${pt(sideC2)} ${pt(T)} C ${pt(topC1)} ${pt(topC2)} 0 ${peakY.toFixed(2)} Z`;
  const top = [];
  for (let i = 0; i <= 12; i++) top.push(cubicAt([T, topC1, topC2, [0, peakY]], i / 12));
  // Only the sides and top are outlined: the fall hides the neckline seam.
  const edge = `M ${pt(N)} C ${pt(sideC1)} ${pt(sideC2)} ${pt(T)} C ${pt(topC1)} ${pt(topC2)} 0 ${peakY.toFixed(2)}`;
  return { d, edge, top: top.reverse() };
}

// A band (mandarin) collar seen from the front, as flats draw it: the band
// stands up from the neckline, its top edge the neckline raised by the band's
// height, the two front ends meeting at the top button; above and behind it,
// the inside of the back of the band, its top edge arched to centre back.
// frontCurve is the front neckline, centre front to neck point.
export function standingCollar(frontCurve, thick) {
  if (!frontCurve) return null;
  const CF = frontCurve[0];
  const N = frontCurve[3];
  const S = sampleCurve(frontCurve, 18);
  const lower = S.map((s) => [Math.max(0, s.x), s.y]);
  // The top edge: the neckline lifted straight up, a little less at the front
  // where the band's ends are usually rounded off.
  const upper = S.map((s) => [Math.max(0, s.x + 0.15 * s.t), s.y - thick * (0.85 + 0.15 * s.t)]);
  const Nt = upper[upper.length - 1];
  const T = [N[0] + 0.2, N[1] - thick];
  const peakY = T[1] - 0.35;
  const topC1 = [T[0] * 0.5, peakY];
  const topC2 = [T[0] * 0.95, T[1] - 0.1];
  const front = `M ${fmt(lower)} L ${fmt([...upper].reverse())} Z`;
  const back = `M 0 ${peakY.toFixed(2)} C ${pt(topC1)} ${pt(topC2)} ${pt(T)} L ${pt(Nt)} L ${fmt([...upper].reverse())} L 0 ${(CF[1] - thick).toFixed(2)} Z`;
  const top = [];
  for (let i = 0; i <= 10; i++) top.push(cubicAt([[0, peakY], topC1, topC2, T], i / 10));
  return { front, back, edge: [...upper].reverse(), top };
}
