// Pure layout logic for the 2D "technical flat" illustrations, drawn from the
// drafted pattern pieces themselves: the panels' own outlines, the sleeve and
// collar sized from their pieces, and the design choices that change how the
// garment looks (collar style, straight vs. fitted body, dart position, the
// construction options) read from the order's mockup options, plus any
// number of pocket/embroidery/sablon accessories across the garment's named
// segments. Kept framework-free (no DOM/React) so it can be exercised
// directly, in the browser or from a plain Node script.

import { layoutMerchView } from "./merchFlat.js";
import { collarDims, frontLeaf, frontBand, backBand, backBandLine, backArch, frontBandEdge, backBandTop, vNeckBand, backNeckStrip } from "./collarGeometry.js";
import { bodySilhouette, sleeveTube, sleeveGeoFromPiece, SLEEVE_ANGLE } from "./torsoGeometry.js";
import { sideStrip, wrapMatrix, rectCorners, overlaps, svgMatrix } from "./sleeveWrap.js";

function findPiece(pieces, re) {
  return pieces.find((p) => re.test(p.name));
}

// The same "two mirrored halves" idea for a template path that
// already has its own meeting edge baked in at x=0 — no anchor shift
// needed, just the mirror itself.
function templateHalves() {
  return { main: "", mirror: "scale(-1 1)" };
}

const POCKET_VISUAL_SIZE = { width: 13, height: 15 };
// A shirt chest pocket, in pattern cm.
const SHIRT_POCKET_SIZE = { width: 10, height: 11.5 };
const PLACKET_HALF_WIDTH = 1.75;

// Matches the backend's own draft.defaultPocketAnchor exactly, so a
// just-added accessory (not yet sent to "Generate mockup", so there's
// no real generated piece/anchor to read from) previews at the same
// spot the backend will actually draft it at.
const DEFAULT_POCKET_FRACTION = {
  left_chest: { x: 0.42, y: 0.24 },
  right_chest: { x: 0.58, y: 0.24 },
  center_front: { x: 0.5, y: 0.3 },
  back: { x: 0.55, y: 0.15 },
  left_sleeve: { x: 0.5, y: 0.3 },
  right_sleeve: { x: 0.5, y: 0.3 },
};

// Segments whose accessories render on the mirrored (negative-x) half
// of the illustration — everything else renders on the main half.
// The angle (degrees clockwise on the drawing) that makes an extra follow the
// arm: the sleeves hang SLEEVE_ANGLE away from vertical, the wearer's left one
// on the right of the front view.
export function sleeveAlignment(segment, view) {
  if (view === "left" || view === "right") return 0; // the side drawing hangs the arm straight
  const deg = Math.round((SLEEVE_ANGLE * 180) / Math.PI);
  if (segment === "left_sleeve") return -deg;
  if (segment === "right_sleeve") return deg;
  return 0;
}

const MIRRORED_SEGMENTS = new Set(["right_chest", "right_sleeve", "right_leg", "right_hem"]);

// Segments that are on one particular side: a pocket there stores its distance
// from the center line and the segment says which side. Everywhere else a
// pocket stores a signed position, so it stays where it was put.
const SIDE_SEGMENTS = new Set(["left_chest", "right_chest", "left_sleeve", "right_sleeve", "left_leg", "right_leg"]);
export const isSideSegment = (segment) => SIDE_SEGMENTS.has(segment);
const isSleeveSegment = (segment) => segment === "left_sleeve" || segment === "right_sleeve";

// Which real piece (front/back/sleeve) a segment's pocket attaches
// to — matches the backend's draftAccessoryPockets exactly.
function segmentParent(segment, front, back, sleeve) {
  switch (segment) {
    case "left_chest":
    case "right_chest":
    case "center_front":
    case "left_leg":
    case "right_leg":
      return front;
    case "back":
      return back;
    case "left_sleeve":
    case "right_sleeve":
      return sleeve;
    default:
      return null;
  }
}

// Builds one drawable item for an accessory. accessory.position (a
// fraction — signed for embroidery/sablon, unsigned for pocket) is
// the single source of truth for where it sits, whenever the
// accessory carries one: dragging sets it directly (see
// GarmentFlatPreview), so the same field drives both the live drag
// and, unchanged, the "Generate mockup" payload — no separate
// in-progress-drag layer needed. Only a freshly-added accessory with
// no position yet falls back to the real generated piece's own
// anchor (pocket) or the segment's hit-region center (embroidery/
// sablon).
function accessoryItem(accessory, pieces, front, back, sleeve, frame, segments) {
  const mirror = MIRRORED_SEGMENTS.has(accessory.segment);
  const sign = mirror ? -1 : 1;
  const seg = segments[accessory.segment];
  const segCenter = seg ? { x: seg.x + seg.width / 2, y: seg.y + seg.height / 2 } : { x: 0, y: 0 };

  if (accessory.type === "pocket") {
    const parent = segmentParent(accessory.segment, front, back, sleeve);
    if (!parent) return null;
    const width = accessory.width || SHIRT_POCKET_SIZE.width;
    const height = accessory.height || SHIRT_POCKET_SIZE.height;
    // Where a pocket sits before it has been dragged: the real piece's
    // anchor when the mockup has one, else the middle of its segment.
    const realPiece = pieces.find((p) => p.segment === accessory.segment && /pocket/i.test(p.name));
    const isTrunk = ["left_chest", "right_chest", "center_front", "back"].includes(accessory.segment);
    let cx0 = Math.abs(segCenter.x);
    let cy0 = segCenter.y;
    if (isTrunk) {
      const fallback = DEFAULT_POCKET_FRACTION[accessory.segment] || { x: 0.5, y: 0.25 };
      cx0 = (realPiece?.anchor ? realPiece.anchor.x / parent.width : fallback.x) * parent.width;
      cy0 = (seg?.y ?? 0) + (realPiece?.anchor ? realPiece.anchor.y / parent.height : fallback.y) * parent.height * 0.5;
      cy0 = Math.min(cy0, (seg?.y ?? 0) + (seg?.height ?? 0) - height / 2);
    }
    const xFrac = accessory.position ? accessory.position.x : cx0 / frame.halfW;
    const yFrac = accessory.position ? accessory.position.y : cy0 / frame.height;
    // A chest pocket stays clear of the placket band down the middle.
    const minCx = PLACKET_HALF_WIDTH + 1 + width / 2;
    const sideBound = SIDE_SEGMENTS.has(accessory.segment);
    let cx = xFrac * frame.halfW;
    if (accessory.segment === "left_chest" || accessory.segment === "right_chest") cx = Math.max(minCx, cx);
    if (accessory.segment === "center_front") cx = (Math.sign(cx) || 1) * Math.max(minCx, Math.abs(cx));
    return {
      key: `acc-${accessory.id}`,
      accessoryId: accessory.id,
      segment: accessory.segment,
      kind: "rect",
      x: (sideBound ? sign * cx : cx) - width / 2,
      y: yFrac * frame.height - height / 2,
      width,
      height,
      shape: accessory.shape || "classic",
      category: "pocket",
      fabric: accessory.fabric,
      rotation: accessory.rotation || 0,
      fraction: { x: xFrac, y: yFrac },
      fractionKind: sideBound ? "unsigned" : "signed",
      mirror: sideBound && mirror,
    };
  }

  // embroidery / sablon — metadata only, no real piece to read a
  // position from. The default is the segment's own center, signed
  // left/right by the segment's own rect.
  const w = accessory.width || 6;
  const h = accessory.height || 6;
  const fracX = accessory.position ? accessory.position.x : segCenter.x / frame.halfW;
  const fracY = accessory.position ? accessory.position.y : segCenter.y / frame.height;
  return {
    key: `acc-${accessory.id}`,
    accessoryId: accessory.id,
    segment: accessory.segment,
    kind: "rect",
    x: fracX * frame.halfW - w / 2,
    y: fracY * frame.height - h / 2,
    width: w,
    height: h,
    category: accessory.type,
    label: accessory.label,
    rotation: accessory.rotation || 0,
    fraction: { x: fracX, y: fracY },
    fractionKind: "signed",
  };
}

function segmentItems(segments, view) {
  return Object.entries(segments)
    .filter(([, seg]) => seg.views.includes(view))
    .map(([key, seg]) => ({ key: `seg-${key}`, segment: key, x: seg.x, y: seg.y, width: seg.width, height: seg.height, label: seg.label, allowsPocket: seg.allowsPocket }));
}

// Pattern-space torso layout, drawn from the drafted pieces.
// Builds one torso view (front or back) from the drafted pieces: the
// front/back panel outlines are drawn as they are (mirrored across the
// center line), the sleeve hangs from the real shoulder and underarm
// points, and the collar is fitted to the real neckline. Coordinates are
// pattern cm with y = 0 at the neck point.
function torsoFrame(pieces, opts) {
  const front = findPiece(pieces, /front/i);
  const back = findPiece(pieces, /back/i);
  const yoke = findPiece(pieces, /^yoke$/i);
  const sleeve = findPiece(pieces, /sleeve/i);
  const frontSil = front && bodySilhouette(front.pathData);
  if (!frontSil || !frontSil.neck) return null;
  const backSil = back && bodySilhouette(back.pathData);
  const sleeveGeo = sleeveGeoFromPiece(sleeve);
  const tube = sleeveTube(frontSil.shoulder, frontSil.underarm, sleeveGeo, frontSil.neck);
  // The back's shoulder point comes from the yoke (the back panel starts below it).
  const yokeSil = yoke && bodySilhouette(yoke.pathData);
  const backTube = backSil ? sleeveTube(yokeSil ? yokeSil.shoulder : backSil.shoulder, backSil.underarm, sleeveGeo, backSil.neck || frontSil.neck) : tube;
  const cuff = findPiece(pieces, /^cuff$/i);
  const slit = findPiece(pieces, /cuff slit/i);
  const cuffH = cuff ? cuff.height : 6;
  const hemY = Math.max(frontSil.hemY, backSil ? backSil.hemY : 0);
  const halfW = Math.ceil(Math.max(tube.outerX, frontSil.underarm[0]) + 3);
  const height = Math.max(hemY, tube.dropTo);
  const U = frontSil.underarm;
  const cf = frontSil.start;
  const neck = frontSil.neck;
  const chestTop = cf[1] + 1.5;
  const S = frontSil.shoulder;
  const collarHalf = neck[0] * 1.8;
  const segments = {
    collar: { views: ["front", "back"], x: -collarHalf, y: -3.5, width: collarHalf * 2, height: cf[1] + 7, label: "Collar", allowsPocket: false },
    cuffs: { views: ["front", "back"], x: tube.cuffInnerX - 1, y: tube.dropTo - cuffH - 1, width: tube.cuffOuterX - tube.cuffInnerX + 2, height: cuffH + 1, label: "Cuffs", allowsPocket: false },
    left_chest: { views: ["front"], x: 2.5, y: chestTop, width: U[0] - 3.5, height: (hemY - chestTop) * 0.5, label: "Left chest", allowsPocket: true },
    right_chest: { views: ["front"], x: -(U[0] - 1), y: chestTop, width: U[0] - 3.5, height: (hemY - chestTop) * 0.5, label: "Right chest", allowsPocket: true },
    center_front: { views: ["front"], x: -3.5, y: chestTop, width: 7, height: hemY - chestTop, label: "Center front", allowsPocket: true },
    back: { views: ["back"], x: -U[0], y: 2, width: U[0] * 2, height: hemY - 2, label: "Back", allowsPocket: true },
    left_sleeve: { views: ["front", "back"], x: U[0] - 1, y: S[1], width: tube.outerX - U[0] + 2, height: Math.max(8, tube.dropTo - cuffH - S[1]), label: "Left sleeve", allowsPocket: true },
    right_sleeve: { views: ["front", "back"], x: -(tube.outerX + 1), y: S[1], width: tube.outerX - U[0] + 2, height: Math.max(8, tube.dropTo - cuffH - S[1]), label: "Right sleeve", allowsPocket: true },
  };
  return { front, back, yoke, sleeve, frontSil, backSil, sleeveGeo, tube, tubes: { front: tube, back: backTube }, cuff, slit, cuffH, hemY, halfW, height, segments };
}

function layoutTorsoView(pieces, view, opts) {
  const { accessories = [], sleeveStyle, collarStyle } = opts;
  const g = torsoFrame(pieces, opts);
  if (!g) return null;
  const body = view === "front" ? g.front : g.back;
  if (!body) return null;
  const sil = view === "front" ? g.frontSil : g.backSil;
  if (!sil) return null;

  const collar = findPiece(pieces, /collar/i);
  const isStanding = collarStyle === "standing";
  const isPolo = collarStyle === "polo";
  const piping = !!findPiece(pieces, /piping strip/i);
  const styleKey = isPolo ? "polo" : collarStyle || "convertible";
  const dims = collar ? collarDims(pieces, styleKey) : null;
  const backNeckCurve = (g.yoke ? bodySilhouette(g.yoke.pathData) : g.backSil)?.neckCurve;
  const polyline = (key, pts, category = "collar") => {
    for (let i = 1; i < pts.length; i++) {
      items.push({ key: `${key}-a-${i}`, kind: "line", x1: pts[i - 1][0], y1: pts[i - 1][1], x2: pts[i][0], y2: pts[i][1], category });
      items.push({ key: `${key}-b-${i}`, kind: "line", x1: -pts[i - 1][0], y1: pts[i - 1][1], x2: -pts[i][0], y2: pts[i][1], category });
    }
  };
  const placketPiece = findPiece(pieces, /placket/i);
  const hasPlacket = !!placketPiece;

  const items = [];
  const { main, mirror } = templateHalves();
  const both = (key, d, category = "body", extra = {}) => {
    items.push({ key: `${key}-main`, kind: "path", d, transform: main, category, half: "main", ...extra });
    items.push({ key: `${key}-mirror`, kind: "path", d, transform: mirror, category, half: "mirror", ...extra });
  };
  const line = (key, x1, y1, x2, y2, category = "seam") => {
    items.push({ key: `${key}-main`, kind: "line", x1, y1, x2, y2, category });
    items.push({ key: `${key}-mirror`, kind: "line", x1: -x1, y1, x2: -x2, y2, category });
  };

  // The neck opening seen from the front: the inside of the back of the shirt
  // (and collar) shows through it, so it is cloth, not empty space. Drawn first,
  // under the body, whose neckline edge outlines it.
  if (view === "front" && backNeckCurve) {
    const f = (p) => `${p[0]} ${p[1]}`;
    const fs = g.frontSil;
    const bc = backNeckCurve;
    const across = fs.neckCurve ? `M ${f(fs.neckCurve[0])} C ${f(fs.neckCurve[1])} ${f(fs.neckCurve[2])} ${f(fs.neckCurve[3])}` : `M ${f(fs.start)} L ${f(fs.neck)}`;
    const hole = `${across} L ${f(bc[3])} C ${f(bc[2])} ${f(bc[1])} ${f(bc[0])} Z`;
    both("neck-inner", hole, "inner", { noStroke: true });
    // With no collar to draw it, the back neckline is the top edge of that cloth.
    if (!collar) both("neck-inner-edge", `M ${f(bc[3])} C ${f(bc[2])} ${f(bc[1])} ${f(bc[0])}`, "inner", { noFill: true });
  }

  // The back of the collar rising behind the neck opening — drawn first so
  // the body's neckline cuts it.
  if (collar && view === "front") {
    const rise = isStanding ? dims.thick : isPolo ? dims.fall * 0.85 : styleKey === "peter_pan" ? 1.6 : dims.standH + dims.fall * 0.35;
    const arch = backArch(backNeckCurve, rise);
    if (arch) both("collar-arch", arch, "collar");
  }

  // The sleeve: from the shoulder point of THIS view's panel. Carries the
  // real sleeve piece's own fabric tag, so a sleeve cut from the contrast
  // fabric (opts.SleeveFabric) is filled with that colour, not the torso's.
  const tube = g.tubes[view];
  const S = tube.shoulder;
  both("sleeve", tube.d, "body", { fabric: g.sleeve?.fabric });

  // Body: the back is the yoke above the back panel.
  if (view === "back" && g.yoke) both("yoke", g.yoke.pathData, "body");
  both("body", sil.d, "body");

  // A polo's side seam is left open below this point as a vent — marked with
  // a short tick crossing the seam, at the real cut height the piece itself
  // carries (not a guessed fraction of the hem). A line drawn right on the
  // seam itself would just sit on top of the silhouette's own edge and
  // disappear.
  if (body.landmarks?.ventTop) {
    const { x: vx, y: vy } = body.landmarks.ventTop;
    line("vent", vx - 1.4, vy, vx + 1.4, vy, "seam");
  }

  // A contrast insert panel down one side of the front (the viewer's left, like
  // the reference uniform), shoulder to hem, from its own cutting piece.
  const panelPiece = findPiece(pieces, /^insert panel$/i);
  if (panelPiece && view === "front") {
    const off = panelPiece.landmarks?.offset || { x: 0, y: 0 };
    items.push({ key: "insert-panel", kind: "path", d: panelPiece.pathData, transform: `scale(-1 1) translate(${off.x} ${off.y})`, category: "panel", half: "mirror" });
  }

  // Motif bands, from the motif pieces the pattern carries: laid over the body
  // (or the arms) and cut off at the garment's edge, so they follow its curves.
  {
    const streak = findPiece(pieces, /^motif streak$/i);
    const chest = findPiece(pieces, /^chest band$/i);
    const shoulder = findPiece(pieces, /^shoulder band$/i);
    const hem = findPiece(pieces, /^hem band$/i);
    const arms = findPiece(pieces, /^arm motif band$/i);
    const rect = (x0, y0, x1, y1) => `M ${x0} ${y0} L ${x1} ${y0} L ${x1} ${y1} L ${x0} ${y1} Z`;
    // A shape drawn over the whole width, shown on each half of the body.
    const onBody = (key, d, orient) => {
      for (const [half, transform] of [["main", main], ["mirror", mirror]]) {
        items.push({ key: `${key}-${half}`, kind: "path", d, transform: "", category: "motif", orient, half, clipPath: { d: sil.d, transform } });
      }
    };
    const hemY = sil.hemY;
    if (streak && view === "front") {
      const start = sil.start[1];
      if (streak.qty === 2) {
        for (const sign of [1, -1]) onBody(`motif-streak${sign}`, rect(sign > 0 ? 3.2 : -6.8, -3, sign > 0 ? 6.8 : -3.2, hemY + 2), "v");
      } else {
        onBody("motif-streak", rect(-2.5, start - 0.5, 2.5, hemY + 2), "v");
      }
    }
    // Each band's drawn height comes straight from its own cutting piece
    // (not a guessed span), so the illustration can't drift from the pattern
    // the way a hand-tuned constant would if the draft's own height changed.
    const around = (name, y1, height) => onBody(name, rect(-60, y1 - height, 60, y1), "h");
    if (chest) around("motif-chest", sil.underarm[1] - 3, chest.height);
    if (shoulder) around("motif-shoulder", -4 + shoulder.height, shoulder.height);
    if (hem) around("motif-hem", hemY + 2, hem.height);
    if (arms) {
      const M = [(tube.underarm[0] + tube.bicepOuter[0]) / 2, (tube.underarm[1] + tube.bicepOuter[1]) / 2];
      const p = [M[0] + (tube.center[0] - M[0]) * 0.55, M[1] + (tube.center[1] - M[1]) * 0.55];
      const [ax, ay] = tube.axis;
      const [cx, cy] = tube.across;
      const corner = (s, t) => `${(p[0] + cx * s + ax * t).toFixed(2)} ${(p[1] + cy * s + ay * t).toFixed(2)}`;
      const d = `M ${corner(-16, -2.5)} L ${corner(16, -2.5)} L ${corner(16, 2.5)} L ${corner(-16, 2.5)} Z`;
      for (const [half, transform] of [["main", main], ["mirror", mirror]]) {
        items.push({ key: `motif-arms-${half}`, kind: "path", d, transform, category: "motif", orient: "h", half, clipPath: { d: tube.d, transform } });
      }
    }
  }

  // A V-neck: the trim (or the facing's stitch line) along the V, and the
  // back facing showing behind the neck.
  const isV = !g.frontSil.neckCurve;
  const neckTrim = !!findPiece(pieces, /neck trim/i);
  if (isV && view === "front" && !collar) {
    if (neckTrim) both("neck-trim", vNeckBand(g.frontSil.neck, g.frontSil.start, 3), "trim");
    else {
      const [nx, ny] = g.frontSil.neck;
      const [cx, cy] = g.frontSil.start;
      const len = Math.hypot(cx - nx, cy - ny) || 1;
      const ox = ((cy - ny) / len) * 3.5;
      const oy = (-(cx - nx) / len) * 3.5;
      line("facing", nx + ox, ny + oy, cx + ox, cy + oy, "seam");
    }
  }
  if (isV && !collar && neckTrim && backNeckCurve) {
    const back = view === "front" ? backNeckStrip(backNeckCurve, 1.2) : backBand(backNeckCurve, 2.8);
    if (back) both("neck-trim-back", back, "trim");
  }

  // Points along the sleeve's own axis: `back` cm up the arm from a hem point.
  const up = (p, back) => [p[0] - tube.axis[0] * back, p[1] - tube.axis[1] * back];
  const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  const cuffLine = (key, back, inset = 0.15) => {
    const p = up(lerp(tube.hemInner, tube.hemOuter, inset / 10), back);
    const q = up(lerp(tube.hemOuter, tube.hemInner, inset / 10), back);
    line(key, p[0], p[1], q[0], q[1], "seam");
  };
  if (isPolo && sleeveStyle === "half") {
    cuffLine("rib", 3.2, 0);
  }
  if (sleeveStyle !== "half" && !isPolo) {
    cuffLine("cuff-line", g.cuffH);
    // The slit above the cuff, near the back edge of the sleeve, and the button.
    const slitLen = g.slit ? g.slit.height : 10;
    const base = up(lerp(tube.hemInner, tube.hemOuter, 0.7), g.cuffH);
    const top = up(base, slitLen);
    line("cuff-slit", base[0], base[1], top[0], top[1], "seam");
    const button = up(tube.center, g.cuffH / 2);
    for (const sign of [1, -1]) items.push({ key: `cuff-button-${sign}`, kind: "circle", cx: sign * button[0], cy: button[1], r: 0.8, category: "button" });
  }

  // The armhole seam where the sleeve is sewn on.
  line("armhole", S[0] - 1, S[1] + 0.8, sil.underarm[0] - 0.6, sil.underarm[1], "seam");

  // Back yoke seam: the seam between the yoke and the back panel.
  if (view === "back" && g.yoke) {
    const topY = sil.start[1];
    line("yoke-seam", 0, topY, g.backSil.underarm[0] - 0.8, topY, "seam");
  }

  // Darts, drawn as the two legs of each wedge cut out of the panel.
  for (const [a, apex, b] of sil.darts) {
    line(`dart-a-${a[0]}-${a[1]}`, a[0], a[1], apex[0], apex[1], "dart");
    line(`dart-b-${b[0]}-${b[1]}`, apex[0], apex[1], b[0], b[1], "dart");
  }

  if (hasPlacket && view === "front") {
    const cfY = g.frontSil.start[1];
    const hidden = /hidden/i.test(placketPiece.name);
    // A normal placket is measured from the neck point; a V-neck's starts at the V.
    const bottom = isPolo ? cfY + 17 : isV ? Math.min(cfY + placketPiece.height, g.frontSil.hemY) : Math.min(placketPiece.height, g.frontSil.hemY);
    const top = isPolo ? cfY - 2 : cfY;
    items.push({ key: "placket", kind: "line", x1: 0, y1: top, x2: 0, y2: bottom, category: "placket" });
    if (isPolo) {
      items.push({ key: "placket-edge-a", kind: "line", x1: -3.2, y1: cfY - 2, x2: -3.2, y2: bottom, category: "placket" });
      items.push({ key: "placket-edge-b", kind: "line", x1: 3.2, y1: cfY - 2, x2: 3.2, y2: bottom, category: "placket" });
      items.push({ key: "placket-end", kind: "line", x1: -3.2, y1: bottom, x2: 3.2, y2: bottom, category: "placket" });
    } else if (hidden) {
      // The front edge lapping over a concealed closure: one stitched edge, no buttons.
      items.push({ key: "placket-edge", kind: "line", x1: 2.4, y1: cfY, x2: 2.4, y2: bottom, category: "placket" });
    } else {
      // The placket band (its piece is 3.5 wide), centered on the buttons.
      line("placket-edge", 1.75, cfY, 1.75, bottom, "placket");
    }
    const first = cfY + 3.5;
    const count = hidden ? 0 : isPolo ? 2 : Math.max(3, Math.round((bottom - 4 - first) / 8.5) + 1);
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : i / (count - 1);
      items.push({ key: `button-${i}`, kind: "circle", cx: 0, cy: isPolo ? first + t * 6 : first + t * (bottom - 4 - first), r: 1, category: "button" });
    }
  }

  if (collar) {
    if (view === "front") {
      if (isStanding) {
        const band = frontBand(g.frontSil.neckCurve, dims.thick);
        if (band) both("collar-band", band, "collar");
        if (piping) polyline("collar-pipe", frontBandEdge(g.frontSil.neckCurve, dims.thick), "trim");
      } else {
        const leaf = frontLeaf(styleKey, g.frontSil.neckCurve, dims);
        if (leaf) {
          both("collar-leaf", leaf.d, "collar");
          polyline("collar-roll", leaf.roll);
          if (piping) polyline("collar-pipe", leaf.edge || [], "trim");
        }
      }
    } else {
      // From behind: a flat Peter Pan collar lies on the back; the others
      // stand up (stand plus the fall over it), with the seam between them.
      const dist = styleKey === "peter_pan" ? dims.width * 0.9 : -(isStanding ? dims.thick * 1.1 : isPolo ? dims.fall * 0.9 : dims.standH + dims.fall * 0.7);
      const band = backBand(backNeckCurve, dist);
      if (band) both("collar-back", band, "collar");
      if (dist < 0 && !isStanding && !isPolo) polyline("collar-stand-seam", backBandLine(backNeckCurve, dims.standH));
      if (piping) polyline("collar-pipe", backBandTop(backNeckCurve, dist), "trim");
    }
  }

  const frame = { halfW: g.halfW, height: g.height };
  for (const acc of accessories) {
    const seg = g.segments[acc.segment];
    if (!seg) continue;
    if (isSleeveSegment(acc.segment)) {
      items.push(...sleeveExtraItems(acc, view, g, pieces, frame));
      continue;
    }
    // An extra is drawn only on the view it was placed on.
    if (!seg.views.includes(view) || (acc.view || seg.views[0]) !== view) continue;
    const item = accessoryItem(acc, pieces, g.front, g.back, g.sleeve, frame, g.segments);
    if (item) items.push(item);
  }

  return { items, segments: segmentItems(g.segments, view), width: g.halfW, height: g.height, topPadding: collar ? 6 : 2 };
}

// The outline of a sleeve in each drawing, as an SVG clip and as a polygon to
// test overlap against. `kind` is "front", "back" or "side".
function sleeveSilhouette(kind, sign, g) {
  if (kind === "side") {
    const st = sideStrip(g.tubes.front);
    return { d: sideStripPath(st), poly: [[-st.wBicep / 2, 0], [st.wBicep / 2, 0], [st.wBicep / 2, st.height], [-st.wBicep / 2, st.height]] };
  }
  const t = g.tubes[kind];
  const pts = [t.shoulder, t.bicepOuter, t.hemOuter, t.hemInner, t.underarm].map(([x, y]) => [sign * x, y]);
  return { d: t.d, transform: sign < 0 ? "scale(-1 1)" : undefined, poly: pts };
}

// The sleeve seen from the side, centred on its outer edge: a dome at the top,
// then straight down to the cuff.
function sideStripPath(st) {
  const hb = st.wBicep / 2;
  const hh = st.wHem / 2;
  const f = (v) => v.toFixed(2);
  return [
    `M ${f(-hb)} ${f(st.bicepY)}`,
    `C ${f(-hb)} ${f(st.bicepY * 0.3)} ${f(-hb * 0.75)} 0 0 0`,
    `C ${f(hb * 0.75)} 0 ${f(hb)} ${f(st.bicepY * 0.3)} ${f(hb)} ${f(st.bicepY)}`,
    `L ${f(hh)} ${f(st.hemY)}`,
    `L ${f(-hh)} ${f(st.hemY)}`,
    "Z",
  ].join(" ");
}

// An extra placed on the side drawing of a sleeve: fractions are signed, from
// the strip's center line (the outer edge) and its top.
function sideAccessoryItem(acc, side, g) {
  const st = sideStrip(g.tubes.front);
  const halfW = Math.ceil(st.wBicep / 2) + 1;
  const isPocket = acc.type === "pocket";
  const w = acc.width || (isPocket ? SHIRT_POCKET_SIZE.width : 6);
  const h = acc.height || (isPocket ? SHIRT_POCKET_SIZE.height : 6);
  const fx = acc.position ? acc.position.x : 0;
  const fy = acc.position ? acc.position.y : 0.3;
  return {
    key: `acc-${acc.id}`,
    accessoryId: acc.id,
    segment: acc.segment,
    kind: "rect",
    x: fx * halfW - w / 2,
    y: fy * st.height - h / 2,
    width: w,
    height: h,
    shape: isPocket ? acc.shape || "classic" : undefined,
    category: isPocket ? "pocket" : acc.type,
    fabric: isPocket ? acc.fabric : undefined,
    label: acc.label,
    rotation: acc.rotation || 0,
    fraction: { x: fx, y: fy },
    fractionKind: "signed",
    side,
  };
}

// What to draw for an extra on a sleeve in one of the drawings. It is drawn where
// it was placed; any part of it that hangs over the sleeve's outer edge carries
// on in the other drawings (see sleeveWrap.js).
function sleeveExtraItems(acc, viewKey, g, pieces, frame) {
  const sign = acc.segment === "right_sleeve" ? -1 : 1;
  const side = sign > 0 ? "left" : "right";
  const kindOf = (v) => (v === "left" || v === "right" ? "side" : v);
  const kind = kindOf(viewKey);
  if (kind === "side" && viewKey !== side) return [];
  const home = kindOf(acc.view || "front");
  const homeItem = home === "side" ? sideAccessoryItem(acc, side, g) : accessoryItem(acc, pieces, g.front, g.back, g.sleeve, frame, g.segments);
  if (!homeItem) return [];
  const clip = sleeveSilhouette(kind, sign, g);
  const clipPath = { d: clip.d, transform: clip.transform };
  if (kind === home) return [{ ...homeItem, clipPath }];

  const m = wrapMatrix(g.tubes, side, home, kind);
  if (!overlaps(rectCorners(homeItem, m), clip.poly)) return [];
  const { fraction: _f, fractionKind: _k, accessoryId: _a, mirror: _m, label: _l, ...rest } = homeItem;
  return [{ ...rest, key: `${homeItem.key}-wrap-${kind}`, matrix: svgMatrix(m), clipPath, bleed: true }];
}

// One sleeve seen from the outside, for the wearer's left or right arm.
function layoutSleeveView(pieces, side, opts) {
  const { accessories = [], sleeveStyle, collarStyle } = opts;
  const g = torsoFrame(pieces, opts);
  if (!g) return null;
  const st = sideStrip(g.tubes.front);
  const sign = side === "left" ? 1 : -1;
  const hh = st.wHem / 2;
  const items = [{ key: "sleeve-side", kind: "path", d: sideStripPath(st), transform: "", category: "body", half: "main", fabric: g.sleeve?.fabric }];
  const line = (key, x1, y1, x2, y2) => items.push({ key, kind: "line", x1, y1, x2, y2, category: "seam" });
  const isPolo = collarStyle === "polo";
  // The cuff (or a polo's rib), with the slit near the back edge of the arm.
  if (isPolo && sleeveStyle === "half") {
    line("rib", -hh, st.hemY - 3.2, hh, st.hemY - 3.2);
  } else if (sleeveStyle !== "half" && !isPolo) {
    const cuffTop = st.hemY - g.cuffH;
    line("cuff-line", -hh, cuffTop, hh, cuffTop);
    const slitLen = g.slit ? g.slit.height : 10;
    const slitX = sign * hh * 0.55;
    line("cuff-slit", slitX, cuffTop, slitX, cuffTop - slitLen);
  }

  const segKey = `${side}_sleeve`;
  const halfW = Math.ceil(st.wBicep / 2) + 1;
  const frame = { halfW: g.halfW, height: g.height };
  for (const acc of accessories) {
    if (acc.segment === segKey) items.push(...sleeveExtraItems(acc, side, g, pieces, frame));
  }
  const segments = [{ key: `seg-${segKey}`, segment: segKey, x: -st.wBicep / 2, y: 0, width: st.wBicep, height: st.height, label: `${side === "left" ? "Left" : "Right"} sleeve (outside)`, allowsPocket: true }];
  return { items, segments, width: halfW, height: st.height, topPadding: 2 };
}

// The leg silhouette, drawn from the trouser panel's own construction points
// (backend/draft/bottoms.go). The pattern puts the crotch point at x = 0 and
// the center line at x = centerLine; here the center line is x = 0 so the two
// legs mirror across it. On a real garment the crotch extension folds under
// where it meets the other leg, so the inseam starts a hair off the center
// line, and the legs are swung apart a little (SPLAY) so the two are readable
// as two legs, as a garment laid out for a technical drawing is.
const LEG_SPLAY = 3;

function legGeometry(lm) {
  if (!lm?.centerLine) return null;
  const cf = lm.centerLine.x;
  const rise = lm.crotchPt.y;
  const legLen = lm.hemSide.y;
  const P = (k) => ({ x: lm[k].x - cf, y: lm[k].y });
  const swing = (p) => ({ x: p.x + (p.y > rise ? (LEG_SPLAY * (p.y - rise)) / Math.max(1, legLen - rise) : 0), y: p.y });
  const inner = (p) => ({ x: Math.max(0.4, p.x), y: p.y });
  // The back's center seam leans in the pattern; drawn flat it is the vertical center line.
  const waistCF = { x: Math.max(0, lm.waistCF.x - cf), y: lm.waistCF.y };
  const waistSide = P("waistSide");
  const hipSide = P("hipSide");
  const sideC1 = P("sideC1");
  const sideC2 = P("sideC2");
  const crotchStart = P("crotchStart");
  const crotch = { x: 0.4, y: rise };
  const kneeIn = inner(swing(P("kneeInseam")));
  const hemIn = inner(swing(P("hemInseam")));
  const kneeSide = swing(P("kneeSide"));
  const hemSide = swing(P("hemSide"));
  const d = [
    `M ${waistCF.x} ${waistCF.y}`,
    `L ${crotchStart.x} ${crotchStart.y}`,
    `C ${crotchStart.x} ${rise - 1} 0.16 ${rise} ${crotch.x} ${crotch.y}`,
    `L ${kneeIn.x} ${kneeIn.y}`,
    `L ${hemIn.x} ${hemIn.y}`,
    `L ${hemSide.x} ${hemSide.y}`,
    `L ${kneeSide.x} ${kneeSide.y}`,
    `L ${hipSide.x} ${hipSide.y}`,
    `C ${sideC2.x} ${sideC2.y} ${sideC1.x} ${sideC1.y} ${waistSide.x} ${waistSide.y}`,
    `L ${waistCF.x} ${waistCF.y}`,
    "Z",
  ].join(" ");
  // x of the outer (side) seam at depth y.
  const outerXAt = (y) => {
    if (y >= hipSide.y) {
      const lower = y <= kneeSide.y ? [hipSide, kneeSide] : [kneeSide, hemSide];
      const t = (y - lower[0].y) / Math.max(0.01, lower[1].y - lower[0].y);
      return lower[0].x + (lower[1].x - lower[0].x) * t;
    }
    let best = { d: Infinity, x: waistSide.x };
    for (let i = 0; i <= 120; i++) {
      const t = i / 120;
      const u = 1 - t;
      const x = u * u * u * waistSide.x + 3 * u * u * t * sideC1.x + 3 * u * t * t * sideC2.x + t * t * t * hipSide.x;
      const yy = u * u * u * waistSide.y + 3 * u * u * t * sideC1.y + 3 * u * t * t * sideC2.y + t * t * t * hipSide.y;
      if (Math.abs(yy - y) < best.d) best = { d: Math.abs(yy - y), x };
    }
    return best.x;
  };
  return { d, cf, rise, legLen, waistCF, waistSide, hipSide, crotchStart, crotch, kneeIn, hemIn, kneeSide, hemSide, outerXAt, width: Math.ceil(Math.max(hipSide.x, hemSide.x, kneeSide.x) + 1) };
}

// A pocket on the back of trousers or a skirt, from the real pocket piece when
// the mockup has one. It is drawn once, where it was put (a pair is two extras).
function backPocketItems(acc, { pieces, frameW, height, cfShift }) {
  const realPiece = pieces.find((p) => p.segment === "back" && /pocket/i.test(p.name));
  const posX = acc.position ? acc.position.x * frameW : realPiece?.anchor ? realPiece.anchor.x - cfShift : frameW * 0.55;
  const posY = acc.position ? acc.position.y * height : realPiece?.anchor ? realPiece.anchor.y : height * 0.15;
  const fraction = { x: posX / frameW, y: posY / height };
  const size = acc.width && acc.height ? { width: acc.width, height: acc.height } : POCKET_VISUAL_SIZE;
  const base = { key: `acc-${acc.id}`, category: "pocket", accessoryId: acc.id, segment: "back", fraction, fractionKind: "signed", rotation: acc.rotation || 0, fabric: acc.fabric };
  if (realPiece?.pathData && !acc.width) {
    const rot = acc.rotation || 0;
    return [{ ...base, kind: "path", d: realPiece.pathData, transform: `translate(${posX - realPiece.width / 2} ${posY}) rotate(${rot} ${realPiece.width / 2} ${realPiece.height / 2})` }];
  }
  return [{ ...base, kind: "rect", x: posX - size.width / 2, y: posY - size.height / 2, width: size.width, height: size.height, rx: 1.5, shape: acc.shape || "classic" }];
}

// Accessories on a trouser or skirt view: back pockets as above, everything
// else placed once on its segment. Each is drawn only on the view it was placed on.
function bottomAccessoryItems({ accessories, pieces, view, segments, frame, front, back, cfShift }) {
  const items = [];
  for (const acc of accessories) {
    const seg = segments[acc.segment];
    if (!seg?.views.includes(view) || (acc.view || seg.views[0]) !== view) continue;
    if (acc.segment === "back" && acc.type === "pocket") {
      items.push(...backPocketItems(acc, { pieces, frameW: frame.halfW, height: frame.height, cfShift }));
    } else {
      const item = accessoryItem(acc, pieces, front, back, null, frame, segments);
      if (item) items.push(item);
    }
  }
  return items;
}

// front/back leg panel + waistband + optional accessories on the "back"
// segment (the only one pants/shorts currently expose). Each panel is one leg,
// mirrored across the center line for the other.
function layoutLegsView(pieces, view, opts) {
  const { accessories = [] } = opts;
  const front = findPiece(pieces, /front/i);
  const back = findPiece(pieces, /back/i);
  const body = view === "front" ? front : back;
  if (!body) return null;

  const waistband = findPiece(pieces, /waistband/i);
  // The construction choices show up as which detail pieces exist.
  const elastic = !!waistband && /elastic/i.test(waistband.name);
  const bandH = waistband ? (elastic ? 4 : waistband.height) : 0;
  const hasLoops = !!findPiece(pieces, /belt loop/i);
  const hasSlant = !!findPiece(pieces, /slant pocket/i);
  const hasFly = !!findPiece(pieces, /fly facing/i);
  const hasStripe = !!findPiece(pieces, /side stripe/i);
  const backPocket = findPiece(pieces, /welt strip/i) ? "welt" : findPiece(pieces, /^patch pocket$/i) ? "patch" : "none";
  const geo = legGeometry(body.landmarks);
  const frameW = geo ? geo.width : body.width;
  const lm = body.landmarks;

  const items = [];
  const { main, mirror } = templateHalves();
  // A line or open curve drawn on both legs (the second is the mirror image).
  const pair = (key, d, category = "seam") => {
    items.push({ key: `${key}-main`, kind: "path", d, transform: main, category, half: "main", noFill: true });
    items.push({ key: `${key}-mirror`, kind: "path", d, transform: mirror, category, half: "mirror", noFill: true });
  };
  const legPathD = geo ? geo.d : `M 0 0 L ${body.width} 0 L ${body.width * 0.85} ${body.height} L ${body.width * 0.25} ${body.height} Z`;
  items.push({ key: "leg-main", kind: "path", d: legPathD, transform: main, category: "body", half: "main" });
  items.push({ key: "leg-mirror", kind: "path", d: legPathD, transform: mirror, category: "body", half: "mirror" });

  if (geo && hasStripe) {
    // A contrast stripe down the outer side seam, following its curve.
    const ys = [];
    for (let i = 0; i <= 14; i++) ys.push((geo.hemSide.y * i) / 14);
    const outer = ys.map((y) => [geo.outerXAt(y) - 0.2, y]);
    const inner = ys.map((y) => [geo.outerXAt(y) - 3.4, y]).reverse();
    const d = `M ${[...outer, ...inner].map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L ")} Z`;
    items.push({ key: "stripe-main", kind: "path", d, transform: main, category: "trim", half: "main" });
    items.push({ key: "stripe-mirror", kind: "path", d, transform: mirror, category: "trim", half: "mirror" });
  }

  const bandBottom = geo ? Math.max(geo.waistSide.y, geo.waistCF.y) : 0;
  const bandTop = bandBottom - bandH;
  if (waistband && geo) {
    // The band across this view's two legs: from one side seam to the other.
    const span = geo.waistSide.x * 2;
    items.push({ key: "waistband", kind: "rect", x: -span / 2, y: bandTop, width: span, height: bandH, category: "waistband" });
    if (elastic) {
      // Two rows of stitching hold the elastic; at the front two eyelets let the
      // drawstring out, its ends knotted and hanging.
      for (const f of [0.33, 0.67]) items.push({ key: `elastic-row-${f}`, kind: "line", x1: -span / 2, y1: bandTop + bandH * f, x2: span / 2, y2: bandTop + bandH * f, category: "seam" });
      if (view === "front") {
        const ey = bandTop + bandH / 2;
        for (const sign of [1, -1]) {
          items.push({ key: `eyelet-${sign}`, kind: "circle", cx: sign * 1.7, cy: ey, r: 0.5, category: "button" });
          const ex = sign * 2.6;
          items.push({ key: `cord-${sign}`, kind: "path", d: `M ${sign * 1.7} ${ey} C ${sign * 3.4} ${ey + 3} ${sign * 1.4} ${ey + 6} ${ex} ${ey + 9}`, transform: main, category: "seam", half: "main", noFill: true });
          items.push({ key: `cord-knot-${sign}`, kind: "circle", cx: ex, cy: ey + 9.4, r: 0.55, category: "button" });
        }
      }
    } else if (view === "front") {
      // The waistband's button extension over the fly: its end and the button.
      items.push({ key: "tab-end", kind: "line", x1: 3.4, y1: bandTop, x2: 3.4, y2: bandBottom, category: "seam" });
      items.push({ key: "tab-button", kind: "circle", cx: 1.9, cy: bandTop + bandH / 2, r: 0.75, category: "button" });
    }
  }

  if (geo) {
    const { hipSide, hemIn, hemSide, waistSide } = geo;
    const flat = geo.kneeIn.y >= geo.hemIn.y; // no knee on shorts

    // The pleat and the crease below it sit in the middle of each visible front
    // leg (the crotch extension folds under, so the visible leg starts at the
    // center line), the crease running from the dart tip to the hem.
    const pleatX = (geo.crotch.x + hipSide.x) / 2;
    if (view === "front" && !elastic) {
      const dartY = lm.dart1 ? lm.dart1.y : hipSide.y;
      const bottom = { x: (hemIn.x + hemSide.x) / 2, y: hemIn.y };
      items.push({ key: "crease-main", kind: "line", x1: pleatX, y1: dartY, x2: bottom.x, y2: bottom.y, category: "seam" });
      items.push({ key: "crease-mirror", kind: "line", x1: -pleatX, y1: dartY, x2: -bottom.x, y2: bottom.y, category: "seam" });
    }

    // Belt loops sit on the waistband, their tops level with its top edge and
    // their ends showing just below it: two at the front, two at the side seams,
    // two at the back and one at center back (seven in all).
    if (waistband && hasLoops && !elastic) {
      const side = waistSide.x - 1.1;
      const frontX = pleatX;
      const xs = view === "front" ? [frontX, side] : [0, waistSide.x * 0.5, side];
      for (const x of xs) {
        for (const sign of x === 0 ? [1] : [1, -1]) {
          items.push({ key: `loop-${view}-${x.toFixed(1)}-${sign}`, kind: "rect", x: sign * x - 0.65, y: bandTop, width: 1.3, height: bandH + 1.3, category: "waistband" });
        }
      }
    }

    // Waist darts: a slim wedge from the waist edge to the marked length.
    for (const k of ["dart1", "dart2"]) {
      if (!lm[k]) continue;
      const x = view === "front" ? pleatX : lm[k].x - geo.cf;
      const w = lm[`${k}w`]?.x || 0;
      for (const sign of [1, -1]) {
        if (w < 0.4) {
          items.push({ key: `dart-${k}-${sign}`, kind: "line", x1: sign * x, y1: 0.4, x2: sign * x, y2: lm[k].y, category: "dart" });
        } else {
          items.push({ key: `dart-${k}-${sign}-a`, kind: "line", x1: sign * (x - w / 2), y1: 0.4, x2: sign * x, y2: lm[k].y, category: "dart" });
          items.push({ key: `dart-${k}-${sign}-b`, kind: "line", x1: sign * (x + w / 2), y1: 0.4, x2: sign * x, y2: lm[k].y, category: "dart" });
        }
      }
    }

    if (view === "front") {
      if (hasFly) {
        // The fly: the opening at center front, and the J of topstitching 3.2cm
        // beside it curling back to meet it at the bottom of the zip.
        const fb = Math.min(geo.crotchStart.y - 1, 17);
        items.push({ key: "fly", kind: "line", x1: 0, y1: 0, x2: 0, y2: fb + 1.2, category: "placket" });
        items.push({ key: "fly-stitch", kind: "path", d: `M 3.2 0 L 3.2 ${fb - 4} C 3.2 ${fb - 1} 2.2 ${fb + 0.7} 0 ${fb + 1.2}`, transform: main, category: "placket", noFill: true });
      } else {
        // A plain front: just the center seam.
        items.push({ key: "cf-seam", kind: "line", x1: 0, y1: 0, x2: 0, y2: geo.crotchStart.y, category: "seam" });
      }
      if (hasSlant) {
        // Slanted front pockets: open at the waistline a hand-width in from the
        // side seam and curve out to meet the side seam about 16cm down.
        const endY = 16;
        const start = { x: waistSide.x - 5.5, y: 0 };
        const end = { x: geo.outerXAt(endY) - 0.2, y: endY };
        const ctrl = { x: (start.x + end.x) / 2 - 1.4, y: endY * 0.5 };
        pair("slant", `M ${start.x.toFixed(2)} ${start.y} Q ${ctrl.x.toFixed(2)} ${ctrl.y} ${end.x.toFixed(2)} ${end.y}`);
      }
    } else {
      // Back pockets: a double-welt opening about 13cm wide and 1.6cm deep, its top
      // edge 11.5cm below the waist (just under the darts), with a button.
      const px = waistSide.x * 0.52;
      if (backPocket === "welt") {
        for (const sign of [1, -1]) {
          const x0 = sign * (px - 6.5);
          const x1 = sign * (px + 6.5);
          items.push({ key: `welt-${sign}`, kind: "line", x1: x0, y1: 11.5, x2: x1, y2: 11.5, category: "seam" });
          items.push({ key: `welt-lo-${sign}`, kind: "line", x1: x0, y1: 13.1, x2: x1, y2: 13.1, category: "seam" });
          items.push({ key: `welt-l-${sign}`, kind: "line", x1: x0, y1: 11.5, x2: x0, y2: 13.1, category: "seam" });
          items.push({ key: `welt-r-${sign}`, kind: "line", x1: x1, y1: 11.5, x2: x1, y2: 13.1, category: "seam" });
          items.push({ key: `welt-btn-${sign}`, kind: "circle", cx: sign * px, cy: 12.3, r: 0.6, category: "button" });
        }
      } else if (backPocket === "patch") {
        // A patch pocket, its outline drawn in the pocket piece's own size.
        const patch = findPiece(pieces, /^patch pocket$/i);
        for (const sign of [1, -1]) {
          items.push({ key: `patch-${sign}`, kind: "path", d: patch.pathData, transform: `translate(${sign * px - patch.width / 2} 10)`, category: "seam", half: sign === 1 ? "main" : "mirror" });
        }
      }
    }

    // The hem: a stitch line 3.2cm up, both views, kept on the leg edges (which
    // run from the knee to the hem, or from the crotch and hip on shorts).
    const hy = hemIn.y - 3.2;
    const along = (from, to) => from.x + ((to.x - from.x) * (hy - from.y)) / Math.max(1, to.y - from.y);
    const hx0 = along(flat ? geo.crotch : geo.kneeIn, hemIn);
    const hx1 = along(flat ? hipSide : geo.kneeSide, hemSide);
    items.push({ key: "hem-stitch-main", kind: "line", x1: hx0, y1: hy, x2: hx1, y2: hy, category: "seam" });
    items.push({ key: "hem-stitch-mirror", kind: "line", x1: -hx0, y1: hy, x2: -hx1, y2: hy, category: "seam" });
  }

  // Segments a print, pocket or embroidery can go on. Legs are front-only (the
  // back has its own "back" region for pockets); the waistband and hems show
  // from both sides.
  const segs = {};
  if (geo) {
    const both = ["front", "back"];
    segs.waistband = { views: both, x: -geo.waistSide.x, y: bandBottom - bandH, width: geo.waistSide.x * 2, height: bandH, label: "Waistband", allowsPocket: false };
    const hemTop = geo.hemSide.y - 9;
    segs.left_hem = { views: both, x: geo.hemIn.x, y: hemTop, width: geo.hemSide.x - geo.hemIn.x, height: 9, label: "Left hem", allowsPocket: false };
    segs.right_hem = { views: both, x: -geo.hemSide.x, y: hemTop, width: geo.hemSide.x - geo.hemIn.x, height: 9, label: "Right hem", allowsPocket: false };
    segs.back = { views: ["back"], x: -frameW, y: 0, width: frameW * 2, height: body.height * 0.5, label: "Back", allowsPocket: true };
    segs.left_leg = { views: ["front"], x: 0.6, y: 3, width: geo.hipSide.x - 0.6, height: hemTop - 3, label: "Left leg", allowsPocket: true };
    segs.right_leg = { views: ["front"], x: -geo.hipSide.x, y: 3, width: geo.hipSide.x - 0.6, height: hemTop - 3, label: "Right leg", allowsPocket: true };
  } else {
    segs.back = { views: ["back"], x: -frameW, y: 0, width: frameW * 2, height: body.height * 0.5, label: "Back", allowsPocket: true };
  }
  items.push(...bottomAccessoryItems({ accessories, pieces, view, segments: segs, frame: { halfW: frameW, height: body.height }, front, back, cfShift: geo ? geo.cf : 0 }));

  return { items, segments: segmentItems(segs, view), width: frameW, height: body.height, topPadding: bandH };
}

// front/back panel + waistband + optional accessories on "back" —
// skirts.
function layoutSkirtView(pieces, view, opts) {
  const { accessories = [] } = opts;
  const front = findPiece(pieces, /front/i);
  const back = findPiece(pieces, /back/i);
  const body = view === "front" ? front : back;
  if (!body) return null;

  const waistband = findPiece(pieces, /waistband/i);
  const hasPocket = !!findPiece(pieces, /side pocket/i);
  const lm = body.landmarks;

  const items = [];
  // The panel is one half on the fold (x = 0 is center front/back), mirrored.
  const { main, mirror } = templateHalves();
  items.push({ key: "skirt-main", kind: "path", d: body.pathData, transform: main, category: "body", half: "main" });
  items.push({ key: "skirt-mirror", kind: "path", d: body.pathData, transform: mirror, category: "body", half: "mirror" });

  const both = (key, x1, y1, x2, y2, category = "seam") => {
    items.push({ key: `${key}-main`, kind: "line", x1, y1, x2, y2, category });
    items.push({ key: `${key}-mirror`, kind: "line", x1: -x1, y1, x2: -x2, y2, category });
  };

  if (lm?.waistSide) {
    const sideX = lm.waistSide.x;
    const elastic = !!lm.casing;
    if (waistband && !elastic) {
      // The band across the waist, sitting on the lowest point of the waistline.
      const bottom = Math.max(lm.waistCF.y, lm.waistSide.y);
      items.push({ key: "waistband", kind: "rect", x: -sideX, y: bottom - waistband.height, width: sideX * 2, height: waistband.height, category: "waistband" });
      // The waistband's own seam is the top of the panel; a stitch line just below.
    }
    if (elastic) {
      // The elastic casing: a stitched line under the top edge.
      both("casing", 0, lm.casing.y, sideX, lm.casing.y);
    }

    // Waist darts as V's from the waist edge down to their tips.
    const waistYAt = (x) => {
      let best = { d: Infinity, y: lm.waistCF.y };
      for (let i = 0; i <= 60; i++) {
        const t = i / 60;
        const u = 1 - t;
        const px = 3 * u * t * t * lm.waistC2.x + t * t * t * lm.waistSide.x + 3 * u * u * t * lm.waistC1.x;
        const py = u * u * u * lm.waistCF.y + 3 * u * u * t * lm.waistC1.y + 3 * u * t * t * lm.waistC2.y + t * t * t * lm.waistSide.y;
        if (Math.abs(px - x) < best.d) best = { d: Math.abs(px - x), y: py };
      }
      return best.y;
    };
    for (const k of ["dart1", "dart2"]) {
      const tip = lm[k];
      const w = lm[`${k}w`]?.x;
      if (!tip || !w) continue;
      const xa = tip.x - w / 2;
      const xb = tip.x + w / 2;
      both(`${k}-a`, xa, waistYAt(xa), tip.x, tip.y, "dart");
      both(`${k}-b`, xb, waistYAt(xb), tip.x, tip.y, "dart");
    }

    // A back zip at center back; a hem stitch line 3cm up.
    if (view === "back" && !elastic) {
      items.push({ key: "zip", kind: "line", x1: 0, y1: lm.waistCF.y, x2: 0, y2: lm.waistCF.y + 18, category: "placket" });
      items.push({ key: "zip-pull", kind: "circle", cx: 0, cy: lm.waistCF.y + 3, r: 0.8, category: "button" });
    }
    both("hem-stitch", lm.hemSide.x - 0.6, lm.hemSide.y - 3, 0, lm.hemCF.y - 3);

    // Side pockets: the mouth of each, parallel to and just inside the side seam.
    if (hasPocket && view === "front") {
      const seamX = (y) => lm.waistSide.x + ((lm.hipSide.x - lm.waistSide.x) * (y - lm.waistSide.y)) / Math.max(1, lm.hipSide.y - lm.waistSide.y) + 0.3;
      const y0 = lm.waistSide.y + 3;
      const y1 = y0 + 14;
      both("pocket", seamX(y0) - 1.4, y0, seamX(y1) - 1.4, y1);
    }
  } else if (waistband) {
    items.push({ key: "waistband", kind: "rect", x: -waistband.width / 2, y: -waistband.height, width: waistband.width, height: waistband.height, category: "waistband" });
  }

  const frameW = body.width;
  const bandH = waistband && !lm?.casing ? waistband.height : 4;
  const segs = {
    waistband: { views: ["front", "back"], x: -(lm?.waistSide?.x ?? frameW), y: -bandH, width: (lm?.waistSide?.x ?? frameW) * 2, height: bandH + 1, label: "Waistband", allowsPocket: false },
    hem: { views: ["front", "back"], x: -frameW, y: body.height - 9, width: frameW * 2, height: 9, label: "Hem", allowsPocket: false },
    center_front: { views: ["front"], x: -frameW, y: 3, width: frameW * 2, height: body.height - 12, label: "Front", allowsPocket: true },
    back: { views: ["back"], x: -frameW, y: 3, width: frameW * 2, height: body.height - 12, label: "Back", allowsPocket: true },
  };
  items.push(...bottomAccessoryItems({ accessories, pieces, view, segments: segs, frame: { halfW: frameW, height: body.height }, front, back, cfShift: 0 }));

  return { items, segments: segmentItems(segs, view), width: frameW, height: body.height, topPadding: waistband ? waistband.height : 0 };
}

// Returns { kind, front, back } (and left/right sleeve drawings of a shirt when
// opts.sides is set) — front/back are each either null (no
// front/back piece found) or { items, segments, width, height,
// topPadding } ready for an SVG renderer to lay out on a canvas
// centered at x=0, y=0 being the top edge of the main body panel.
//
// opts: { accessories, gender, dartPosition, sleeveStyle } — accessories is the
// full list from the order's mockup options, each carrying its own
// position once dragged (see accessoryItem above); items without a
// position yet fall back to the real generated anchor or segment
// default.
export function layoutGarmentViews(pieces, opts = {}) {
  if (opts.merchItem) {
    return { kind: "merch", front: layoutMerchView(pieces, "front", opts), back: layoutMerchView(pieces, "back", opts) };
  }
  const frontName = (findPiece(pieces, /front/i)?.name || "").toLowerCase();
  const kind = /pants|shorts/.test(frontName) ? "legs" : /skirt/.test(frontName) ? "skirt" : "torso";

  const layoutFn = kind === "legs" ? layoutLegsView : kind === "skirt" ? layoutSkirtView : layoutTorsoView;

  const views = { kind, front: layoutFn(pieces, "front", opts), back: layoutFn(pieces, "back", opts) };
  if (kind === "torso" && opts.sides) {
    views.left = layoutSleeveView(pieces, "left", opts);
    views.right = layoutSleeveView(pieces, "right", opts);
  }
  return views;
}


