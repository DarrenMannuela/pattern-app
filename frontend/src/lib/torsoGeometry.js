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
export function bodySilhouette(d, landmarks) {
  const cmds = parsePath(d);
  const byLandmarks = landmarkSilhouette(cmds, landmarks);
  if (byLandmarks) return byLandmarks;
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
    hemCF,
    // The hem's own curve controls (a shirttail), or null for a straight hem.
    hemCurve: hemCurve ? hemCurve.p : null,
    hemY,
    darts,
  };
}

// The silhouette found from the piece's named points: where the shoulder,
// armhole, side seam and hem each end. The drafts now draw the armhole as two
// curves and shape the side seam in and out at the waist, which the guesses
// in bodySilhouette (the armhole is the last curve, the side seam one line)
// can't follow. Darts are marked on the piece itself (piece.darts), not cut
// into the outline the drawing uses, so there are none to take out here.
function landmarkSilhouette(cmds, lm) {
  const top = lm?.shoulderTip || lm?.yokeArm;
  if (!top || !lm?.underarm || !lm?.hemSide) return null;
  const at = (cmd, p) => Math.abs(end(cmd)[0] - p.x) < 0.15 && Math.abs(end(cmd)[1] - p.y) < 0.15;
  const iShoulder = cmds.findIndex((c, i) => i > 0 && c.c === "L" && at(c, top));
  const iUnder = cmds.findIndex((c, i) => i > iShoulder && at(c, lm.underarm));
  const iHem = cmds.findIndex((c, i) => i > iUnder && at(c, lm.hemSide));
  if (iShoulder < 1 || iUnder < 0 || iHem < 0) return null;
  const hemCmd = cmds[iHem + 1];
  if (!hemCmd || hemCmd.c === "Z") return null;

  const start = cmds[0].p[0];
  const pre = cmds.slice(1, iShoulder);
  const neckC = pre.find((c) => c.c === "C") || null;
  const firstL = pre.find((c) => c.c === "L");
  const shoulder = end(cmds[iShoulder]);
  const underarm = end(cmds[iUnder]);
  const hemSide = end(cmds[iHem]);
  const hemCF = end(hemCmd);
  const hemCurve = hemCmd.c === "C" ? hemCmd.p : null;
  const write = (c) => `${c.c} ${c.p.map(fmt).join(" ")}`;
  const parts = [`M ${fmt(start)}`];
  if (neckC) parts.push(write(neckC));
  else if (firstL) parts.push(write(firstL)); // a V-neck runs to its neck point first
  parts.push(`L ${fmt(shoulder)}`);
  for (const c of cmds.slice(iShoulder + 1, iHem + 1)) parts.push(write(c));
  parts.push(write(hemCmd), "Z");
  return {
    d: parts.join(" "),
    start,
    neck: neckC ? end(neckC) : firstL ? end(firstL) : null,
    neckCurve: neckC ? [start, ...neckC.p] : null,
    shoulder,
    underarm,
    hemSide,
    hemCF,
    hemCurve,
    hemY: Math.max(hemSide[1], hemCF[1]),
    darts: [],
  };
}

// How far the sleeves swing out from vertical in the flat drawing. A shirt
// laid out with its arms hanging straight down looks stiff; the reference
// flats have the sleeves angled a little away from the body, opening from
// the armpit.
// A long sleeve hangs nearly straight beside the body, as shirt flats draw it.
export const SLEEVE_ANGLE = (6 * Math.PI) / 180;
// A short sleeve stands further out: flats draw it well away from the body
// (20-30 degrees), which is also how it sits when worn.
export const SHORT_SLEEVE_ANGLE = (22 * Math.PI) / 180;
// Shorter than this (cm, shoulder to hem) counts as a short sleeve.
export const SHORT_SLEEVE_MAX = 35;
export const sleeveAngle = (length) => (length && length < SHORT_SLEEVE_MAX ? SHORT_SLEEVE_ANGLE : SLEEVE_ANGLE);

// The visible sleeve when the shirt lies flat, drawn from the drafted sleeve
// piece: it hangs from the shoulder point and is sewn to the armhole, and its
// width is the piece's own (bicep across the armhole line, opening at the
// cuff), with the whole sleeve swung out from the underarm. geo comes from
// the sleeve piece; neck is the neck point, giving the shoulder's direction.
//
// armhole, when given, is the body's armhole from S down to U (commands
// from armholeCurves): the sleeve is sewn along it, so its inner edge
// follows it back up instead of cutting straight across to the shoulder.
export function sleeveTube(S, U, geo, neck, armhole) {
  const th = sleeveAngle(geo.length);
  const axis = [Math.sin(th), Math.cos(th)]; // down the arm, away from the body
  const across = [Math.cos(th), -Math.sin(th)]; // across the sleeve, outward
  // How wide to draw the sleeve. Pressed completely flat it would show half
  // the way round the arm (geo.halfBicep, half the sleeve piece's width); as a
  // tube round the arm, seen from the front, only about a third (the round
  // over pi). Flats of shirts draw it between the two, since the sleeve hangs
  // round the arm rather than lying spread out: 80% of flat, about 0.4 of the
  // round. At the full flat width the top of the sleeve fans out from the
  // shoulder and looks too big for the body; at half of it (as this once
  // was) the sleeves looked shrunken.
  const SLEEVE_DRAWN = 0.8;
  const bicep = geo.halfBicep * SLEEVE_DRAWN; // drawn width at the bicep line
  const opening = Math.min(geo.wristHalf * SLEEVE_DRAWN, bicep * 0.95); // drawn width at the hem
  const B = [U[0] + across[0] * bicep * 0.92, U[1] + across[1] * bicep * 0.92];
  const run = Math.max(6, geo.length - (geo.capHeight || 12));
  const mid = [(U[0] + B[0]) / 2, (U[1] + B[1]) / 2];
  const C = [mid[0] + axis[0] * run, mid[1] + axis[1] * run];
  const WI = [C[0] - (across[0] * opening) / 2, C[1] - (across[1] * opening) / 2];
  const WO = [C[0] + (across[0] * opening) / 2, C[1] + (across[1] * opening) / 2];
  // The outer edge: flats draw a set-in sleeve with a clear shoulder point and
  // an almost straight line from there out to the bicep (the cap is seen side
  // on, not as a dome), then down the arm. It leaves the shoulder point along
  // the shoulder line for a moment, so the corner is softened, not rounded off.
  let sd = [1, 0.1];
  if (neck) {
    const len = Math.hypot(S[0] - neck[0], S[1] - neck[1]) || 1;
    sd = [(S[0] - neck[0]) / len, (S[1] - neck[1]) / len];
  }
  const reach = Math.hypot(B[0] - S[0], B[1] - S[1]) || 1;
  const outward = [(B[1] - S[1]) / reach, -(B[0] - S[0]) / reach]; // away from the body
  const c1 = [S[0] + sd[0] * reach * 0.14, S[1] + sd[1] * reach * 0.14];
  const c2 = [B[0] - (B[0] - S[0]) * 0.3 + outward[0] * 0.45, B[1] - (B[1] - S[1]) * 0.3 + outward[1] * 0.45];
  const f = (p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
  const back = [];
  if (armhole?.length) {
    // The armhole walked backwards, underarm to shoulder.
    const starts = [S, ...armhole.map((c) => end(c)).slice(0, -1)];
    for (let i = armhole.length - 1; i >= 0; i--) {
      const c = armhole[i];
      back.push(c.c === "C" ? `C ${f(c.p[1])} ${f(c.p[0])} ${f(starts[i])}` : `L ${f(starts[i])}`);
    }
  } else back.push(`L ${f(S)}`);
  const d = [`M ${f(S)}`, `C ${f(c1)} ${f(c2)} ${f(B)}`, `L ${f(WO)}`, `L ${f(WI)}`, `L ${f(U)}`, ...back, "Z"].join(" ");
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

// The part of a panel's outline between two of its points, as path commands
// ({ c, p }): an armhole from the shoulder point down to the underarm, or a
// yoke's share of it down to the yoke seam. Empty if either point isn't on it.
export function armholeCurves(d, from, to) {
  if (!d || !from || !to) return [];
  const cmds = parsePath(d);
  const at = (cmd, p) => cmd.p.length && Math.abs(end(cmd)[0] - p.x) < 0.15 && Math.abs(end(cmd)[1] - p.y) < 0.15;
  const i = cmds.findIndex((c) => at(c, from));
  const j = cmds.findIndex((c, k) => k > i && at(c, to));
  return i < 0 || j < 0 ? [] : cmds.slice(i + 1, j + 1);
}

// The sleeve piece is M crown, C (cap), L backWrist, L frontWrist,
// L frontUnderarm, C ... so these numbers sit at fixed positions.
export function sleeveGeoFromPiece(sleeve) {
  const lm = sleeve?.landmarks;
  if (lm?.backUnderarm && lm?.frontWrist) {
    return {
      halfBicep: (lm.frontUnderarm.x - lm.backUnderarm.x) / 2,
      wristHalf: (lm.frontWrist.x - lm.backWrist.x) / 2,
      length: sleeve.height,
      capHeight: lm.backUnderarm.y,
    };
  }
  const nums = sleeve?.pathData?.match(/-?\d*\.?\d+/g)?.map(Number);
  if (nums && nums.length >= 14) {
    return { halfBicep: (nums[12] - nums[6]) / 2, wristHalf: (nums[10] - nums[8]) / 2, length: sleeve.height, capHeight: nums[7] };
  }
  return { halfBicep: 14, wristHalf: 8, length: 56 };
}
