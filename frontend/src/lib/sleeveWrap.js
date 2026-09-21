// A sleeve is a tube, so the same pocket or print can be seen from the front,
// the back and the side. Everything on a sleeve lives on the unrolled surface of
// that tube, and each drawing is a window onto it:
//   front  the front face, outer edge at the sleeve's outer side
//   back   the back face, drawn the same way round, so it meets the front at the
//          outer edge
//   side   the outside of the sleeve, centred on the outer edge: its front half
//          is the outer half of the front face, its back half that of the back
// An extra that overhangs the outer edge in one drawing therefore carries on in
// the next ("bleeds"), and these functions work out where.
//
// Matrices are SVG's [a b c d e f]. Everything below is written for the wearer's
// left sleeve (on the right of the front view); the right sleeve is its mirror.

const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

const inv = (m) => {
  const det = m[0] * m[3] - m[1] * m[2];
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
};

const MIRROR = [-1, 0, 0, 1, 0, 0];

export const svgMatrix = (m) => `matrix(${m.map((v) => v.toFixed(4)).join(" ")})`;

// The outer edge of a flat sleeve (from the outer bicep point to the outer
// cuff corner): its direction down the arm and its outward normal.
function edgeFrame(tube) {
  const B = tube.bicepOuter;
  const W = tube.hemOuter;
  const len = Math.hypot(W[0] - B[0], W[1] - B[1]) || 1;
  const a = [(W[0] - B[0]) / len, (W[1] - B[1]) / len];
  return { B, a, n: [a[1], -a[0]], len };
}

// The side drawing of a sleeve: a strip centred on the outer edge (x = 0) that
// runs from the top of the cap (y = 0) to the cuff.
export function sideStrip(tube) {
  const { B, a, len } = edgeFrame(tube);
  const S = tube.shoulder;
  const top = (S[0] - B[0]) * a[0] + (S[1] - B[1]) * a[1]; // negative: above the bicep point
  const wBicep = Math.hypot(tube.bicepOuter[0] - tube.underarm[0], tube.bicepOuter[1] - tube.underarm[1]);
  const wHem = Math.hypot(tube.hemOuter[0] - tube.hemInner[0], tube.hemOuter[1] - tube.hemInner[1]);
  return { wBicep, wHem, capTop: top, height: len - top, bicepY: -top, hemY: len - top };
}

// Front or back drawing -> side drawing, for the left sleeve. The back face runs
// the opposite way round the tube, hence the flip.
function toSideLeft(tube, view, bicepY) {
  const { B, a, n } = edgeFrame(tube);
  const k = view === "back" ? -1 : 1;
  return [k * n[0], a[0], k * n[1], a[1], -k * (n[0] * B[0] + n[1] * B[1]), bicepY - (a[0] * B[0] + a[1] * B[1])];
}

// The matrix taking points of `from` ("front" | "back" | "side") to `to`, for
// the sleeve on `side` ("left" | "right"). `tubes` holds the front and back
// drawings' own sleeve tubes.
export function wrapMatrix(tubes, side, from, to) {
  if (from === to) return [1, 0, 0, 1, 0, 0];
  const bicepY = sideStrip(tubes.front).bicepY; // the side drawing is laid out from the front tube
  const toSide = (view) => {
    if (view === "side") return [1, 0, 0, 1, 0, 0];
    const m = toSideLeft(tubes[view], view, bicepY);
    return side === "left" ? m : mul(MIRROR, mul(m, MIRROR)); // the right sleeve's drawings are mirror images
  };
  return mul(inv(toSide(to)), toSide(from));
}

// A rectangle's corners after its own rotation about its centre and then `m`.
export function rectCorners(item, m) {
  const cx = item.x + item.width / 2;
  const cy = item.y + item.height / 2;
  const r = ((item.rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [
    [-item.width / 2, -item.height / 2],
    [item.width / 2, -item.height / 2],
    [item.width / 2, item.height / 2],
    [-item.width / 2, item.height / 2],
  ].map(([x, y]) => {
    const px = cx + x * cos - y * sin;
    const py = cy + x * sin + y * cos;
    return [m[0] * px + m[2] * py + m[4], m[1] * px + m[3] * py + m[5]];
  });
}

// Whether two convex polygons overlap by more than `slop` (separating-axis test).
export function overlaps(p, q, slop = 0.4) {
  for (const poly of [p, q]) {
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i];
      const [x2, y2] = poly[(i + 1) % poly.length];
      const ax = y1 - y2;
      const ay = x2 - x1;
      const len = Math.hypot(ax, ay) || 1;
      const proj = (pts) => pts.map(([x, y]) => (x * ax + y * ay) / len);
      const a = proj(p);
      const b = proj(q);
      const depth = Math.min(Math.max(...a), Math.max(...b)) - Math.max(Math.min(...a), Math.min(...b));
      if (depth <= slop) return false;
    }
  }
  return true;
}
