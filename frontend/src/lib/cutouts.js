// Full-size (1:1) paper patterns for cutting: every piece of a size drawn at
// real size with its cutting line, sewing line, grainline, fold and label,
// either tiled over A4 sheets to tape together or laid out on one plotter
// roll. The PDF prints at real size when printed at "Actual size" (100%);
// each file carries a 10 cm square to check that.

import { flattenPath, bounds } from "./svgPathFlatten.js";
import { PdfDocument, textWidth } from "./pdfWriter.js";
import { cutLabel } from "./patternSheet.js";
import { foldOutline } from "./garmentFlat.js";

const GAP = 1.5; // cm between pieces
export const A4 = { width: 21, height: 29.7, margin: 1, overlap: 1 };
// Plotter rolls print shops carry, in cm (24", 36", 42", 60").
export const ROLL_WIDTHS = [61, 91.4, 106.7, 152.4];
const MAX_PAGE = 500; // PDF pages top out at 508 cm

const shift = (pts, dx, dy) => pts.map(([x, y]) => [x + dx, y + dy]);

/** One piece as drawable geometry in its own cut coordinates (cm). */
export function pieceTemplate(piece, size, orderRef) {
  const off = piece.cutOffset || { x: 0, y: 0 };
  const cut = flattenPath(piece.cutPathData || piece.pathData);
  // A half cut whole (the shop's back): both halves of the sewing line, minus
  // the edge that was the fold, mirrored about the piece's centre.
  const whole = !!piece.cutFull && !!piece.cutPathData;
  const cw = piece.cutWidth || 0;
  const mirror = (pts) => pts.map(([x, y]) => [cw - x, y]);
  const sewHalf = piece.cutPathData
    ? flattenPath(whole ? foldOutline(piece.pathData) || piece.pathData : piece.pathData).map((s) => ({ ...s, points: shift(s.points, off.x, off.y) }))
    : [];
  const sew = whole ? [...sewHalf, ...sewHalf.map((s) => ({ ...s, points: mirror(s.points) }))] : sewHalf;
  const dartsHalf = (piece.darts || []).map((d) => shift(d.map((p) => [p.x, p.y]), off.x, off.y));
  const darts = whole ? [...dartsHalf, ...dartsHalf.map(mirror)] : dartsHalf;
  const g = piece.grainline;
  const grain = g ? [[g[0] + off.x, g[1] + off.y], [g[2] + off.x, g[3] + off.y]] : null;
  const fold = piece.foldEdge === "left" && !whole ? [[0, piece.height * 0.15 + off.y], [0, piece.height * 0.85 + off.y]] : null;
  const b = bounds(cut);
  // Labels sit at the middle of the outline's area.
  let ax = 0, ay = 0, area = 0;
  const poly = cut[0]?.points || [];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const cross = poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
    area += cross;
    ax += (poly[j][0] + poly[i][0]) * cross;
    ay += (poly[j][1] + poly[i][1]) * cross;
  }
  const centre = Math.abs(area) > 1e-6 ? [ax / (3 * area), ay / (3 * area)] : [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
  const lines = [
    piece.name,
    `Size ${size}${orderRef ? ` - ${orderRef}` : ""}`,
    cutLabel(piece),
    piece.cutPathData ? "Seam allowance included" : "No seam allowance",
  ];
  return {
    name: piece.name, size, cut, sew, darts, grain, fold, lines, centre,
    minX: b.minX, minY: b.minY, width: b.maxX - b.minX, height: b.maxY - b.minY,
  };
}

// The template turned a quarter turn clockwise (for a piece too wide to fit).
function rotate(t) {
  const h = t.height, mx = t.minX, my = t.minY;
  const r = ([x, y]) => [h - (y - my), x - mx];
  const rs = (subs) => subs.map((s) => ({ ...s, points: s.points.map(r) }));
  return {
    ...t, rotated: true,
    cut: rs(t.cut), sew: rs(t.sew), darts: t.darts.map((d) => d.map(r)),
    grain: t.grain && t.grain.map(r), fold: t.fold && t.fold.map(r), centre: r(t.centre),
    minX: 0, minY: 0, width: t.height, height: t.width,
  };
}

/**
 * Packs templates into a strip `width` cm wide, lowest-first along a skyline,
 * each piece upright or on its side (the grainline is printed, so paper can
 * turn). Each placed template gets { x, y } (where its own coordinates go)
 * and { bx, by } (its box's top-left).
 */
export function pack(templates, width) {
  const out = [];
  const problems = [];
  // The skyline: [x, w, y] segments covering the strip's width.
  let sky = [[0, width, 0]];
  const items = [...templates].sort((a, b) => Math.max(b.width, b.height) - Math.max(a.width, a.height));
  for (const t of items) {
    let best = null;
    for (const cand of t.width === t.height ? [t] : [t, rotate(t)]) {
      const w = cand.width + GAP;
      if (cand.width > width) continue;
      for (let i = 0; i < sky.length; i++) {
        const x = sky[i][0];
        if (x + cand.width > width + 1e-6) break;
        // The highest skyline under [x, x + w).
        let y = 0;
        for (let j = i; j < sky.length && sky[j][0] < x + Math.min(w, width - x); j++) y = Math.max(y, sky[j][2]);
        const score = y + cand.height;
        if (!best || score < best.score - 1e-6 || (Math.abs(score - best.score) < 1e-6 && x < best.x)) best = { cand, x, y, score };
      }
    }
    if (!best) {
      problems.push(`${t.name} (size ${t.size}) is ${Math.round(Math.min(t.width, t.height))} cm across at its narrowest, wider than the ${Math.round(width)} cm paper`);
      continue;
    }
    const { cand, x, y } = best;
    out.push({ ...cand, x: x - cand.minX, y: y - cand.minY, bx: x, by: y });
    // Raise the skyline over the piece (plus the gap).
    const x2 = Math.min(width, x + cand.width + GAP), top = y + cand.height + GAP;
    const next = [];
    for (const [sx, sw, sy] of sky) {
      const ex = sx + sw;
      if (ex <= x || sx >= x2) { next.push([sx, sw, sy]); continue; }
      if (sx < x) next.push([sx, x - sx, sy]);
      if (ex > x2) next.push([x2, ex - x2, sy]);
    }
    next.push([x, x2 - x, top]);
    next.sort((p, q) => p[0] - q[0]);
    // Merge neighbours at the same height.
    sky = next.reduce((acc, seg) => {
      const last = acc[acc.length - 1];
      if (last && Math.abs(last[2] - seg[2]) < 1e-6 && Math.abs(last[0] + last[1] - seg[0]) < 1e-6) last[1] += seg[1];
      else acc.push([...seg]);
      return acc;
    }, []);
  }
  const height = Math.max(0, ...out.map((t) => t.by + t.height));
  return { placed: out, height, problems };
}

// Draws placed templates on a page, shifted by (dx, dy); with `view`
// ({ x, y, w, h } in layout cm), only those that show in it.
function drawTemplates(page, placed, dx, dy, view) {
  for (const t of placed) {
    if (view && !(t.bx < view.x + view.w && t.bx + t.width > view.x && t.by < view.y + view.h && t.by + t.height > view.y)) continue;
    const ox = t.x + dx, oy = t.y + dy;
    const at = (pts) => shift(pts, ox, oy);
    page.style({ widthMm: 0.25, dash: [0.3, 0.2] });
    for (const s of t.sew) page.polyline(at(s.points), s.closed);
    page.style({ widthMm: 0.25 });
    for (const d of t.darts) page.polyline(at(d));
    page.style({ widthMm: 0.5 });
    for (const s of t.cut) page.polyline(at(s.points), s.closed);
    if (t.grain) {
      const [[x1, y1], [x2, y2]] = at(t.grain);
      page.style({ widthMm: 0.35 }).line(x1, y1, x2, y2);
      for (const [ex, ey, fx, fy] of [[x1, y1, x2, y2], [x2, y2, x1, y1]]) {
        const a = Math.atan2(fy - ey, fx - ex);
        page.polygonFill([[ex, ey], [ex + Math.cos(a + 0.35) * 1.2, ey + Math.sin(a + 0.35) * 1.2], [ex + Math.cos(a - 0.35) * 1.2, ey + Math.sin(a - 0.35) * 1.2]]);
      }
    }
    if (t.fold) {
      const [[x1, y1], [x2, y2]] = at(t.fold);
      // The fold arrows: a bracket stepping in from the folded edge.
      const inX = t.rotated ? 0 : 1.2, inY = t.rotated ? 1.2 : 0;
      page.style({ widthMm: 0.35 }).polyline([[x1, y1], [x1 + inX, y1 + inY], [x2 + inX, y2 + inY], [x2, y2]]);
      page.text((x1 + x2) / 2 + inX + (t.rotated ? 0 : 0.6), (y1 + y2) / 2 + inY + (t.rotated ? 0.9 : 0), "PLACE ON FOLD", { size: 0.4, bold: true, align: "center", angle: t.rotated ? 0 : 90 });
    }
    // The label, turned with a narrow piece so it fits.
    const [cx, cy] = at([t.centre])[0];
    const big = Math.min(0.7, Math.max(0.3, Math.min(t.width, t.height) / 14));
    const longest = Math.max(...t.lines.map((l, i) => textWidth(l, i ? big * 0.7 : big)));
    const angle = longest > t.width * 0.9 && t.height > t.width ? 90 : 0;
    t.lines.forEach((l, i) => {
      const size = i ? big * 0.7 : big;
      const along = (i - (t.lines.length - 1) / 2) * big * 1.25;
      const x = angle ? cx - along : cx, y = angle ? cy : cy + along;
      page.text(x, y, l, { size, bold: i === 0, align: "center", angle });
    });
  }
}

function checkSquare(page, x, y) {
  page.style({ widthMm: 0.4 }).rect(x, y, 10, 10);
  page.style({ widthMm: 0.2 });
  for (let i = 1; i < 10; i++) page.line(x + i, y, x + i, y + (i % 5 ? 0.4 : 0.8));
  page.text(x + 5, y + 5.2, "10 cm × 10 cm", { size: 0.5, bold: true, align: "center" });
  page.text(x + 5, y + 6, "Measure it: if it isn't 10 cm,", { size: 0.3, align: "center" });
  page.text(x + 5, y + 6.5, "print again at Actual size / 100%", { size: 0.3, align: "center" });
}

function ruler(page, x, y) {
  page.style({ widthMm: 0.2 }).line(x, y, x + 5, y);
  for (let i = 0; i <= 5; i++) page.line(x + i, y, x + i, y - (i % 5 ? 0.15 : 0.3));
  page.text(x + 5.3, y, "5 cm", { size: 0.22 });
}

const rowName = (r) => String.fromCharCode(65 + (r % 26)) + (r >= 26 ? Math.floor(r / 26) : "");

/** A4 sheets to tape together: { doc, pages, problems } for one size. */
function tilesForSize(doc, title, size, templates) {
  const pw = A4.width - 2 * A4.margin, ph = A4.height - 2 * A4.margin;
  const sx = pw - A4.overlap, sy = ph - A4.overlap;
  // Two to four sheets across: whichever needs the fewest sheets.
  const tileCount = (cols, packed) => {
    const rows = Math.max(1, Math.ceil(packed.height / sy));
    let n = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (packed.placed.some((t) => t.bx < c * sx + pw && t.bx + t.width > c * sx && t.by < r * sy + ph && t.by + t.height > r * sy)) n++;
    }
    return n;
  };
  let best = null;
  for (let cols = 2; cols <= 4; cols++) {
    const packed = pack(templates, cols * sx);
    if (packed.problems.length && cols < 4) continue;
    const n = tileCount(cols, packed);
    if (!best || n < best.n) best = { cols, packed, n };
  }
  const { cols } = best;
  const { placed, height, problems } = best.packed;
  const rows = Math.max(1, Math.ceil(height / sy));
  const used = (r, c) => placed.some((t) => t.bx < c * sx + pw && t.bx + t.width > c * sx && t.by < r * sy + ph && t.by + t.height > r * sy);

  // Cover: how to print and put it together.
  const cover = doc.addPage(A4.width, A4.height);
  cover.text(1.5, 2.5, title, { size: 0.6, bold: true });
  cover.text(1.5, 3.3, `Size ${size}  |  ${placed.length} pieces  |  full size (1:1)`, { size: 0.4 });
  const steps = [
    "1. Print at Actual size / 100% (not \"Fit to page\"). Check the square below is exactly 10 cm.",
    "2. Lay the pages out as in the map. Pages that would be blank aren't printed.",
    "3. Trim each page's left and top margin along its solid line, lay it over the page",
    "   to its left / above so the trimmed edge sits on that page's dashed line, and tape.",
    "4. Cut the pieces out along the thick line. The dashed line is where it's sewn.",
  ];
  steps.forEach((s, i) => cover.text(1.5, 4.6 + i * 0.6, s, { size: 0.32 }));
  checkSquare(cover, 1.5, 8.2);
  // The assembly map, beside the square (or under it when the layout is wide).
  const tall = rows * sy > cols * sx * 1.2;
  const box = tall ? { x: 12.5, y: 8.2, w: 7, h: 20 } : { x: 1.5, y: 19, w: 18, h: 9.5 };
  const scale = Math.min(box.w / (cols * sx), box.h / (rows * sy));
  const mx = box.x + (box.w - cols * sx * scale) / 2, my = box.y + 0.4;
  cover.text(box.x, box.y, "How the pages go together", { size: 0.32, bold: true });
  cover.style({ widthMm: 0.15, grey: 0.6 });
  for (const t of placed) {
    for (const s of t.cut) cover.polyline(s.points.map(([x, y]) => [mx + (x + t.x) * scale, my + (y + t.y) * scale]), s.closed);
  }
  const label = Math.min(0.45, sx * scale * 0.3);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = mx + c * sx * scale, y = my + r * sy * scale;
    if (used(r, c)) {
      cover.style({ widthMm: 0.3 }).rect(x, y, sx * scale, sy * scale);
      cover.text(x + (sx * scale) / 2, y + (sy * scale) / 2 + label * 0.35, `${rowName(r)}${c + 1}`, { size: label, bold: true, align: "center" });
    } else {
      cover.style({ widthMm: 0.15, dash: [0.15, 0.15], grey: 0.6 }).rect(x, y, sx * scale, sy * scale);
    }
  }

  let pages = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (!used(r, c)) continue;
    pages++;
    const p = doc.addPage(A4.width, A4.height);
    const m = A4.margin;
    p.clip(m, m, pw, ph);
    drawTemplates(p, placed, m - c * sx, m - r * sy, { x: c * sx, y: r * sy, w: pw, h: ph });
    p.unclip();
    // Trim lines (left, top) for pages that go over a neighbour.
    if (c > 0) p.style({ widthMm: 0.3 }).line(m, m, m, m + ph);
    if (r > 0) p.style({ widthMm: 0.3 }).line(m, m, m + pw, m);
    // Where the next page's trimmed edge goes.
    if (c + 1 < cols && used(r, c + 1)) {
      p.style({ widthMm: 0.3, dash: [0.4, 0.25] }).line(m + sx, m, m + sx, m + ph);
      p.text(m + sx + 0.6, m + ph / 2, `${rowName(r)}${c + 2} goes here`, { size: 0.3, align: "center", angle: 90, grey: 0.4 });
    }
    if (r + 1 < rows && used(r + 1, c)) {
      p.style({ widthMm: 0.3, dash: [0.4, 0.25] }).line(m, m + sy, m + pw, m + sy);
      p.text(m + pw / 2, m + sy + 0.65, `${rowName(r + 1)}${c + 1} goes here`, { size: 0.3, align: "center", grey: 0.4 });
    }
    p.style({ widthMm: 0.1, grey: 0.7 }).rect(m, m, pw, ph);
    p.text(m, A4.height - 0.35, `${rowName(r)}${c + 1}   |   size ${size}   |   ${title}`, { size: 0.28, bold: true });
    ruler(p, A4.width - m - 6, A4.height - 0.35);
  }
  return { pages: pages + 1, problems };
}

/** One long sheet (or a few) on a plotter roll `rollWidth` cm wide. */
function rollFor(doc, title, sizes, templates, rollWidth) {
  const margin = 1;
  const { placed, problems } = pack(templates, rollWidth - 2 * margin);
  const header = 12.5;
  // Pages break between rows of pieces, under the PDF page limit.
  const rows = [...new Set(placed.map((t) => t.by))].sort((a, b) => a - b);
  const breaks = [0];
  for (const y of rows) if (y + header - breaks[breaks.length - 1] > MAX_PAGE - 20) breaks.push(y);
  breaks.push(Infinity);
  for (let i = 0; i < breaks.length - 1; i++) {
    const from = breaks[i], to = breaks[i + 1];
    const part = placed.filter((t) => t.by >= from && t.by < to);
    const bottom = Math.max(...part.map((t) => t.by + t.height)) - from;
    const top = i === 0 ? header : 3;
    const p = doc.addPage(rollWidth, top + bottom + 2 * margin);
    p.text(margin, margin + 0.7, `${title}${breaks.length > 2 ? `  (part ${i + 1} of ${breaks.length - 1})` : ""}`, { size: 0.6, bold: true });
    if (i === 0) {
      p.text(margin, margin + 1.5, `Sizes ${sizes.join(", ")}  |  ${placed.length} pieces  |  full size (1:1)  |  print at 100% / Actual size`, { size: 0.4 });
      checkSquare(p, margin, margin + 2);
    }
    drawTemplates(p, part, margin, margin + top - from);
  }
  return { pages: breaks.length - 1, problems };
}

/**
 * Builds the cut-out PDF.
 * sizes: [{ label, pieces }] (finished pieces), mode: "tiles" | "roll".
 */
export function buildCutouts({ title, orderRef, sizes, mode = "tiles", rollWidth = 91.4 }) {
  const doc = new PdfDocument(title);
  const problems = [];
  let pages = 0;
  const templatesFor = (s) => s.pieces.filter((p) => p.pathData).map((p) => pieceTemplate(p, s.label, orderRef));
  if (mode === "roll") {
    const all = sizes.flatMap(templatesFor);
    const r = rollFor(doc, title, sizes.map((s) => s.label), all, rollWidth);
    pages += r.pages;
    problems.push(...r.problems);
  } else {
    for (const s of sizes) {
      const r = tilesForSize(doc, title, s.label, templatesFor(s));
      pages += r.pages;
      problems.push(...r.problems);
    }
  }
  return { blob: doc.toBlob(), pages, problems };
}
