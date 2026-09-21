// Reads the drafted shirt pieces and pulls out the points the 2D preview
// needs (neck, shoulder, underarm, hem, darts), so the illustration is
// drawn from the actual pattern instead of a separate hand-drawn shape.
// Everything is in pattern cm: x = 0 is center front/back, y = 0 is the
// neck point (the top of the front piece), y grows downward.

export function parsePath(d) {
  const tokens = d.match(/[MLCZ]|-?\d*\.?\d+/g) || [];
  const cmds = [];
  for (let i = 0; i < tokens.length; ) {
    const c = tokens[i++];
    const n = c === "C" ? 3 : c === "Z" ? 0 : 1;
    const p = [];
    for (let k = 0; k < n; k++) p.push([Number(tokens[i++]), Number(tokens[i++])]);
    cmds.push({ c, p });
  }
  return cmds;
}

const end = (cmd) => cmd.p[cmd.p.length - 1];
const fmt = (pt) => `${pt[0]} ${pt[1]}`;

// The outline of a front or back panel with any dart wedges cut out of
// it, so the silhouette stays one clean shape; the wedges come back as
// `darts` ([leg, apex, leg] triples) to be drawn as stitch lines.
export function bodySilhouette(d) {
  const cmds = parsePath(d);
  let armIdx = -1;
  // The armhole is the last curve that ends away from the center line
  // (a curved hem is a later curve that ends on it).
  cmds.forEach((c, i) => {
    if (c.c === "C" && end(c)[0] > 0.5) armIdx = i;
  });
  if (armIdx < 1) return null;

  const start = cmds[0].p[0];
  const pre = cmds.slice(1, armIdx);
  const neckC = pre.find((c) => c.c === "C") || null;
  const shoulderLs = pre.filter((c) => c.c === "L").map((c) => c.p[0]);
  const shoulder = shoulderLs[shoulderLs.length - 1];
  const darts = [];
  const shoulderExtras = neckC ? shoulderLs.slice(0, -1) : [];
  if (shoulderExtras.length === 3) darts.push(shoulderExtras);

  const arm = cmds[armIdx];
  const underarm = end(arm);
  const afterCmds = cmds.slice(armIdx + 1).filter((c) => c.c !== "Z");
  const hemCurve = afterCmds.find((c) => c.c === "C") || null;
  const after = afterCmds.map(end);
  const hemY = Math.max(...after.map((p) => p[1]));
  const onHem = after.filter((p) => p[1] >= hemY - (hemCurve ? 3 : 0.6));
  const hemSide = onHem.reduce((a, b) => (b[0] > a[0] ? b : a));
  const hemCF = after.filter((p) => p[0] === 0 && p[1] >= hemY - 0.6)[0] || [0, hemY];
  const isEdge = (p) => p === hemSide || p === hemCF;
  // The last point of `after` is the return to the start (top of center
  // line) — not part of a dart.
  const extras = after.filter((p) => !isEdge(p) && p[0] !== start[0]);
  if (extras.length === 3) darts.push(extras);

  const parts = [`M ${fmt(start)}`];
  if (neckC) parts.push(`C ${neckC.p.map(fmt).join(" ")}`);
  else if (shoulderLs.length >= 2) parts.push(`L ${fmt(shoulderLs[0])}`); // a V-neck runs to its neck point first
  parts.push(`L ${fmt(shoulder)}`);
  parts.push(`C ${arm.p.map(fmt).join(" ")}`);
  parts.push(`L ${fmt(hemSide)}`);
  parts.push(hemCurve ? `C ${hemCurve.p.map(fmt).join(" ")}` : `L ${fmt(hemCF)}`, "Z");

  return {
    d: parts.join(" "),
    start,
    // A V-neck has no neck curve: its neck point is the end of the first
    // straight line.
    neck: neckC ? end(neckC) : shoulderLs.length >= 2 ? shoulderLs[0] : null,
    neckCurve: neckC ? [start, ...neckC.p] : null,
    shoulder,
    underarm,
    hemSide,
    hemY,
    darts,
  };
}

// How far the sleeves swing out from vertical in the flat drawing. A shirt
// laid out with its arms hanging straight down looks stiff; the reference
// flats have the sleeves angled a little away from the body, opening from
// the armpit.
export const SLEEVE_ANGLE = (10 * Math.PI) / 180;

// The visible sleeve when the shirt lies flat, drawn from the drafted sleeve
// piece: it hangs from the shoulder point and is sewn to the armhole, and its
// width is the piece's own (bicep across the armhole line, opening at the
// cuff), with the whole sleeve swung out from the underarm. geo comes from
// the sleeve piece; neck is the neck point, giving the shoulder's direction.
export function sleeveTube(S, U, geo, neck) {
  const th = SLEEVE_ANGLE;
  const axis = [Math.sin(th), Math.cos(th)]; // down the arm, away from the body
  const across = [Math.cos(th), -Math.sin(th)]; // across the sleeve, outward
  const bicep = geo.halfBicep; // flat width at the bicep line
  const opening = Math.min(geo.wristHalf, bicep * 0.95); // flat width at the hem
  const B = [U[0] + across[0] * bicep * 0.92, U[1] + across[1] * bicep * 0.92];
  const run = Math.max(6, geo.length - (geo.capHeight || 12));
  const mid = [(U[0] + B[0]) / 2, (U[1] + B[1]) / 2];
  const C = [mid[0] + axis[0] * run, mid[1] + axis[1] * run];
  const WI = [C[0] - (across[0] * opening) / 2, C[1] - (across[1] * opening) / 2];
  const WO = [C[0] + (across[0] * opening) / 2, C[1] + (across[1] * opening) / 2];
  // The outer edge leaves the shoulder along the shoulder line and turns
  // into the arm.
  let sd = [1, 0.1];
  if (neck) {
    const len = Math.hypot(S[0] - neck[0], S[1] - neck[1]) || 1;
    sd = [(S[0] - neck[0]) / len, (S[1] - neck[1]) / len];
  }
  const reach = Math.hypot(B[0] - S[0], B[1] - S[1]);
  const c1 = [S[0] + sd[0] * reach * 0.3, S[1] + sd[1] * reach * 0.3];
  const c2 = [B[0] - axis[0] * reach * 0.55, B[1] - axis[1] * reach * 0.55];
  const f = (p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
  const d = [`M ${f(S)}`, `C ${f(c1)} ${f(c2)} ${f(B)}`, `L ${f(WO)}`, `L ${f(WI)}`, `L ${f(U)}`, `L ${f(S)}`, "Z"].join(" ");
  return {
    d,
    shoulder: S,
    underarm: U,
    bicepOuter: B,
    axis,
    across,
    center: C,
    hemInner: WI,
    hemOuter: WO,
    outerX: Math.max(B[0], WO[0]),
    cuffInnerX: Math.min(WI[0], WO[0]),
    cuffOuterX: Math.max(WI[0], WO[0]),
    dropTo: Math.max(WI[1], WO[1]),
  };
}

// The sleeve piece is M crown, C (cap), L backWrist, L frontWrist,
// L frontUnderarm, C ... so these numbers sit at fixed positions.
export function sleeveGeoFromPiece(sleeve) {
  const nums = sleeve?.pathData?.match(/-?\d*\.?\d+/g)?.map(Number);
  if (nums && nums.length >= 14) {
    return { halfBicep: (nums[12] - nums[6]) / 2, wristHalf: (nums[10] - nums[8]) / 2, length: sleeve.height, capHeight: nums[7] };
  }
  return { halfBicep: 14, wristHalf: 8, length: 56 };
}
