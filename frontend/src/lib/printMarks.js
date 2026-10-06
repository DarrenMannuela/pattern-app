// Where each logo goes on the cut pieces. Logos are embroidered or printed on
// the cut panels before anything is sewn, so the pattern sheet marks each one
// on the piece it belongs to.
//
// The 2D drawing of a shirt draws its body pieces exactly as drafted (pattern
// cm, x = 0 the centre line, the wearer's left half at x > 0 on the front), so
// a logo's place on the drawing is its place on the piece. Logos on the
// mirrored half land on the other piece of the pair. Sleeve logos follow a
// drawn sleeve, not the sleeve piece, so they aren't marked.

import { layoutGarmentViews } from "./garmentFlat.js";
import { parsePath } from "./torsoGeometry.js";

// A piece outline as a polygon, curves flattened.
function outlinePoints(d) {
  const pts = [];
  let cur = [0, 0];
  for (const { c, p } of parsePath(d || "")) {
    if (c === "M" || c === "L") {
      cur = p[0];
      pts.push(cur);
    } else if (c === "C") {
      const [c1, c2, e] = p;
      for (let i = 1; i <= 8; i++) {
        const t = i / 8;
        const m = 1 - t;
        pts.push([m * m * m * cur[0] + 3 * m * m * t * c1[0] + 3 * m * t * t * c2[0] + t * t * t * e[0], m * m * m * cur[1] + 3 * m * m * t * c1[1] + 3 * m * t * t * c2[1] + t * t * t * e[1]]);
      }
      cur = e;
    }
  }
  return pts;
}

function inside(pts, [x, y]) {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

// The body pieces a logo on each drawing can sit on, the most specific first:
// a colour block's upper part or the yoke before the panel under it.
const CANDIDATES = {
  front: [/^upper front$/i, /^(?!upper ).*front$/i],
  back: [/^yoke$/i, /^upper back$/i, /^(?!upper ).*back$/i],
};

// Marks per piece name: { [name]: [{ id, type, image, label, x, y, width,
// height, rotation, side }] }, in the piece's own sewing-line coordinates.
// side is "left" or "right" (the wearer's) for a logo on one piece of a cut
// pair, "fold" for one across a piece cut on the fold, or "" otherwise.
export function printMarks(pieces, accessories, opts = {}) {
  const prints = (accessories || []).filter((a) => a.type === "embroidery" || a.type === "sablon");
  if (!prints.length || !pieces?.length) return {};
  const views = layoutGarmentViews(pieces, { ...opts, accessories: prints });
  if (views.kind !== "torso") return {};
  const out = {};
  for (const view of ["front", "back"]) {
    const layout = views[view];
    if (!layout) continue;
    const candidates = CANDIDATES[view]
      .map((re) => pieces.find((p) => re.test(p.name)))
      .filter(Boolean)
      .map((p) => ({ piece: p, pts: outlinePoints(p.outline || p.pathData) }));
    for (const item of layout.items) {
      if (!item.accessoryId || (item.category !== "embroidery" && item.category !== "sablon")) continue;
      if (/sleeve|cuff/.test(item.segment)) continue;
      const a = prints.find((p) => p.id === item.accessoryId);
      const cx = item.x + item.width / 2;
      const cy = item.y + item.height / 2;
      // The half the logo's centre is on: x > 0 is the drafted piece itself.
      const flip = cx < 0;
      const centre = [Math.abs(cx), cy];
      const home = candidates.find((c) => inside(c.pts, centre)) || null;
      if (!home) continue;
      const fold = home.piece.foldEdge === "left";
      const across = Math.abs(cx) < item.width / 2;
      // Seen from the front, the wearer's left is the drawing's right (x > 0);
      // seen from the back it is the other way round.
      const wearerLeft = view === "front" ? !flip : flip;
      const side = fold ? (across ? "fold" : "") : across ? "" : wearerLeft ? "left" : "right";
      (out[home.piece.name] ||= []).push({
        id: a.id,
        type: a.type,
        image: a.image,
        label: a.label,
        x: centre[0] - item.width / 2,
        // Where it sits on a piece drawn whole: its own side of the centre line.
        fullX: cx - item.width / 2,
        fullRotation: item.rotation || 0,
        y: cy - item.height / 2,
        width: item.width,
        height: item.height,
        rotation: flip ? -(item.rotation || 0) : item.rotation || 0,
        side,
      });
    }
  }
  return out;
}
