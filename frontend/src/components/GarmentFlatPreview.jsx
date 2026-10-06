import { useEffect, useId, useRef, useState } from "react";
import { layoutGarmentViews, isSideSegment } from "../lib/garmentFlat";
import { pocketPath } from "../lib/pocketShapes";
import { MotifDefs } from "./MotifDefs.jsx";
import { motifFill } from "../lib/motifs.js";
import FabricColorPicker from "./FabricColorPicker.jsx";
import FabricPicker from "./FabricPicker.jsx";
import { artworkUrl } from "../api.js";

// Darkens a #rrggbb hex color by the given fraction, for seam-line
// strokes that read as "the same fabric, one shade darker" rather
// than a piece-by-piece rainbow — closer to how a real flat sketch
// uses outline weight, not fill color, to separate pieces.
function darken(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * (1 - amount));
  const g = Math.round(((n >> 8) & 255) * (1 - amount));
  const b = Math.round((n & 255) * (1 - amount));
  return `rgb(${r},${g},${b})`;
}

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

// The line colours. Technical flats are line drawings, so the silhouette has
// to read on any fabric and against the white page: always a dark line, near
// black on light cloth. The details inside it (seams, topstitching, darts,
// buttons) have to read against the cloth itself: dark on light fabric, but a
// lighter line on dark fabric, where a black seam on navy or black trousers
// simply disappears.
function lineInk(hex) {
  return darken(hex, luminance(hex) > 0.5 ? 0.78 : 0.55);
}
function detailInk(hex) {
  return luminance(hex) < 0.32 ? lighten(hex, 0.42) : lineInk(hex);
}

// Line weights, as flats use them: the silhouette heaviest, seams lighter,
// topstitching a fine dashed line.
const OUTLINE_W = 0.42;
const SEAM_W = 0.3;
const STITCH_W = 0.2;
const STITCH_DASH = "0.65,0.45";

function lighten(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix((n >> 16) & 255)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
}

const ACCESSORY_FILL = { embroidery: "#d9c589", sablon: "#7fc8a9" };

// Rotates a rectangle-shaped item about its own centre.
const spin = (item) => (item.rotation ? `rotate(${item.rotation} ${item.x + item.width / 2} ${item.y + item.height / 2})` : undefined);

function fillFor(item, color, secondaryColor, accent) {
  if (ACCESSORY_FILL[item.category]) return ACCESSORY_FILL[item.category];
  if (item.category === "trim" || item.category === "panel" || item.category === "motif") return accent;
  if (item.fabric === "contrast") return accent; // a sleeve or pocket cut from the second fabric
  if (secondaryColor && item.half === "mirror") return secondaryColor;
  return color;
}

const DRAGGABLE_CATEGORIES = new Set(["pocket", "embroidery", "sablon"]);
const ACCESSORY_TYPE_LABELS = { pocket: "Pocket", embroidery: "Embroidery", sablon: "Sablon (screen print)" };

function clampFraction(kind, x, y) {
  if (kind === "signed") return { x: Math.max(-0.9, Math.min(0.9, x)), y: Math.max(0.02, Math.min(0.95, y)) };
  return { x: Math.max(0.05, Math.min(0.95, x)), y: Math.max(0.02, Math.min(0.95, y)) };
}

// A pocket on a side-bound segment (chest, sleeve, leg) stores its distance from
// the center line, and the segment says which side it is on, so a click's raw
// position is absolute-valued. Everything else keeps the sign, so it stays
// where it was put.
function positionFromClick(type, segment, view, localX, localY, width, height) {
  const unsigned = type === "pocket" && isSideSegment(segment) && view !== "left" && view !== "right";
  return { x: (unsigned ? Math.abs(localX) : localX) / width, y: localY / height };
}

// Finds which hit-region a click landed in, or — if it missed every
// region (there are gaps between the coarse zones) — whichever one's
// center is closest, so a click anywhere on the garment always
// resolves to some sensible segment instead of doing nothing.
function nearestSegmentAt(segments, x, y) {
  if (!segments || !segments.length) return null;
  let best = null;
  let bestDist = Infinity;
  for (const seg of segments) {
    const cx = Math.min(seg.x + seg.width, Math.max(seg.x, x));
    const cy = Math.min(seg.y + seg.height, Math.max(seg.y, y));
    const d = (x - cx) ** 2 + (y - cy) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = seg;
    }
  }
  if (!best) return null;
  // The click is pulled onto the zone, and kept a few cm in from its edges so
  // an extra centred there stays on the zone instead of hanging off its edge
  // (a click beside the garment lands on the nearest part of it).
  const inX = Math.min(3, best.width / 2);
  const inY = Math.min(3, best.height / 2);
  return {
    seg: best,
    x: Math.min(best.x + best.width - inX, Math.max(best.x + inX, x)),
    y: Math.min(best.y + best.height - inY, Math.max(best.y + inY, y)),
  };
}

// Where an extra's centre and top and bottom edges are on its drawing (view
// units), allowing for its turn and, for one carried round a sleeve, the
// matrix that places it.
function extraBox(item) {
  const w = item.width;
  const h = item.height;
  const turn = ((item.rotation || 0) * Math.PI) / 180;
  let cx = item.x + w / 2;
  let cy = item.y + h / 2;
  let half = (w * Math.abs(Math.sin(turn)) + h * Math.abs(Math.cos(turn))) / 2;
  const m = item.matrix && item.matrix.match(/-?\d*\.?\d+(e-?\d+)?/g)?.map(Number);
  if (m && m.length === 6) {
    const [a, b, c, d, e, f] = m;
    [cx, cy] = [a * cx + c * cy + e, b * cx + d * cy + f];
    half *= Math.hypot(c, d);
  }
  return { cx, top: cy - half, bottom: cy + half };
}

// Slides an extra's toolbar sideways, if it would run past the edge of the
// drawing area, so all of it stays in view.
function keepInside(el) {
  if (!el) return;
  el.style.setProperty("--nudge", "0px");
  const box = el.getBoundingClientRect();
  const frame = (el.closest(".flat-views") || el.parentElement).getBoundingClientRect();
  const dx = box.left < frame.left + 4 ? frame.left + 4 - box.left : box.right > frame.right - 4 ? frame.right - 4 - box.right : 0;
  el.style.setProperty("--nudge", `${Math.round(dx)}px`);
}

function ViewPanel({ title, viewKey, layout, color, secondaryColor, accent, pattern, patternPrefix, pxPerCm, zoom, onItemDrag, onCanvasClick, onCanvasDrop, selectedId, onSelect, onItemResize, toolbarFor }) {
  const svgRef = useRef(null);
  if (!layout) {
    return (
      <div className="flat-view flat-view-empty">
        <p className="empty">No {title.toLowerCase()} piece in this mockup.</p>
      </div>
    );
  }
  const { items, segments, width, height, topPadding } = layout;
  const marginSide = Math.max(width * 0.08, 3);
  const marginTop = Math.max(topPadding + 6, height * 0.1);
  const marginBottom = Math.max(height * 0.05, 8);
  const viewW = width * 2 + marginSide * 2;
  const viewH = height + marginTop + marginBottom;
  const originX = viewW / 2;
  const originY = marginTop;
  const stroke = lineInk(color);
  const detail = detailInk(color);
  const shadeId = `shade-${patternPrefix}`;
  const stitchId = `stitch-${patternPrefix}`;
  // Tones of the one fabric, so the garment reads as a garment: the inside of
  // the neck and collar in shadow, the sleeves a touch darker than the body
  // they hang beside.
  const innerTone = darken(color, 0.3);
  const sleeveTone = darken(color, 0.05);

  // Screen px -> this view's own template units. Distinct views use
  // different real-world scales for the same "1 unit" (the hand-drawn
  // shirt silhouette's fixed unit space vs. a pair of pants' actual
  // drafted width in cm) — width/height above is already that view's
  // own scale, so using it here (instead of a hardcoded constant)
  // keeps a drag or a click tracking the mouse 1:1 for every garment
  // type instead of just the one the constant happened to match.
  function toLocal(clientX, clientY) {
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const scaleX = viewW / rect.width;
    const scaleY = viewH / rect.height;
    return { x: (clientX - rect.left) * scaleX - originX, y: (clientY - rect.top) * scaleY - originY };
  }

  function startDrag(e, item) {
    if (!onItemDrag || !item.fraction) return;
    e.preventDefault();
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startFraction = item.fraction;
    // Pocket accessories on a mirrored segment (right_chest, right_sleeve)
    // store an unsigned fraction that's sign-flipped only at render time
    // to land on the right side (see accessoryItem's `sign`). Dragging
    // has to flip the same way, or moving the mouse right decreases the
    // stored fraction and the pocket visibly moves left.
    const xSign = item.mirror ? -1 : 1;

    function onMove(moveEvent) {
      const svg = svgRef.current;
      const rect = svg.getBoundingClientRect();
      const scaleX = viewW / rect.width;
      const scaleY = viewH / rect.height;
      const dxTemplate = (moveEvent.clientX - startClientX) * scaleX * xSign;
      const dyTemplate = (moveEvent.clientY - startClientY) * scaleY;
      const next = clampFraction(item.fractionKind, startFraction.x + dxTemplate / width, startFraction.y + dyTemplate / height);
      onItemDrag(item.accessoryId, next);
    }
    // Lifting the finger or mouse ends it, and so does the browser taking
    // the touch away (a call, a system gesture): left listening, the extra
    // would follow the next touch anywhere on the page.
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  // Dragging the corner handle of a picked extra scales it about its centre,
  // keeping its proportions. Measured on screen, so it works the same on a
  // turned extra or one carried round a sleeve.
  function startResize(e, item) {
    if (!onItemResize) return;
    e.preventDefault();
    e.stopPropagation();
    const box = e.currentTarget.closest("[data-pick]")?.querySelector("[data-pick-outline]")?.getBoundingClientRect();
    if (!box) return;
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const d0 = Math.hypot(e.clientX - cx, e.clientY - cy) || 1;
    const w0 = item.width;
    const h0 = item.height;
    function onMove(m) {
      const k = Math.min(5, Math.max(0.2, Math.hypot(m.clientX - cx, m.clientY - cy) / d0));
      // No smaller than 1.5 cm across, no bigger than 45 cm.
      const kk = Math.max(1.5 / Math.min(w0, h0), Math.min(45 / Math.max(w0, h0), k));
      onItemResize(item.accessoryId, { width: Math.round(w0 * kk * 10) / 10, height: Math.round(h0 * kk * 10) / 10 });
    }
    // Lifting the finger or mouse ends it, and so does the browser taking
    // the touch away (a call, a system gesture): left listening, the extra
    // would follow the next touch anywhere on the page.
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  // The outline and corner handle drawn round the picked extra.
  function pickOverlay(item) {
    const pad = 0.7;
    return (
      <g transform={spin(item)} data-pick="">
        <rect data-pick-outline="" x={item.x - pad} y={item.y - pad} width={item.width + pad * 2} height={item.height + pad * 2} fill="none" stroke="#3fb8b8" strokeWidth={1.6} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" style={{ pointerEvents: "none" }} />
        {onItemResize && (
          <g className="pick-handle" onPointerDown={(e) => startResize(e, item)} onClick={(e) => e.stopPropagation()}>
            <circle cx={item.x + item.width + pad} cy={item.y + item.height + pad} r={2.2} fill="transparent" />
            <circle cx={item.x + item.width + pad} cy={item.y + item.height + pad} r={1.05} fill="#fff" stroke="#3fb8b8" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
          </g>
        )}
      </g>
    );
  }

  function handleCanvasClick(e) {
    if (!onCanvasClick) return;
    const raw = toLocal(e.clientX, e.clientY);
    const hit = nearestSegmentAt(segments, raw.x, raw.y);
    if (!hit) return;
    const { seg, x, y } = hit;
    onCanvasClick({
      view: viewKey,
      segment: seg.segment,
      label: seg.label,
      allowsPocket: seg.allowsPocket,
      localX: x,
      localY: y,
      width,
      height,
      screenX: e.clientX,
      screenY: e.clientY,
    });
  }

  // A part dragged from the pattern maker's palette and dropped on the
  // garment: works out which segment it landed on.
  function handleCanvasDrop(e) {
    // A logo file dragged in from the computer goes where it was dropped.
    const file = [...(e.dataTransfer.files || [])].find((f) => /^image\//.test(f.type));
    if (file) {
      e.preventDefault();
      e.stopPropagation(); // the stage under the drawing would add it a second time
      const raw = toLocal(e.clientX, e.clientY);
      const hit = nearestSegmentAt(segments, raw.x, raw.y);
      if (hit) onCanvasDrop({ file, segment: hit.seg.segment, view: viewKey, localX: hit.x, localY: hit.y, width, height });
      return;
    }
    let dropped;
    try {
      dropped = JSON.parse(e.dataTransfer.getData("text/plain"));
    } catch {
      return;
    }
    if (dropped?.slot !== "extra") return;
    e.preventDefault();
    const raw = toLocal(e.clientX, e.clientY);
    const hit = nearestSegmentAt(segments, raw.x, raw.y);
    if (!hit) return;
    const { seg, x, y } = hit;
    if (dropped.value === "pocket" && !seg.allowsPocket) return;
    onCanvasDrop({ type: dropped.value, extra: dropped.extra, segment: seg.segment, view: viewKey, localX: x, localY: y, width, height });
  }

  function renderItem(item) {
    let fill = fillFor(item, color, secondaryColor, accent);
    if (item.category === "inner") fill = innerTone;
    else if (fill === color && /^sleeve/.test(item.key)) fill = sleeveTone;
    const draggable = DRAGGABLE_CATEGORIES.has(item.category) && item.fraction && item.half !== "mirror" /* only the main (unmirrored) copy drags */;
    const dragProps = draggable
      ? {
          onPointerDown: (e) => {
            onSelect?.(item.accessoryId);
            startDrag(e, item);
          },
          onClick: (e) => e.stopPropagation(), // don't also open the add-popover underneath
          style: { cursor: "grab" },
          className: "flat-draggable",
        }
      : {};
    if (item.kind === "rect" && item.shape) {
      // A patch pocket: a shade lighter than the cloth with a dark
      // outline and a stitched line under its top edge, so it reads on
      // the garment whatever the fabric colour.
      return (
        <g key={item.key} {...dragProps} transform={`translate(${item.x} ${item.y})${item.rotation ? ` rotate(${item.rotation} ${item.width / 2} ${item.height / 2})` : ""}`}>
          <path d={pocketPath(item.shape, item.width, item.height)} transform="translate(0.25 0.35)" fill="#000" opacity={0.14} />
          <path d={pocketPath(item.shape, item.width, item.height)} fill={item.fabric === "contrast" ? motifFill(patternPrefix, pattern, "v") || accent : lighten(color, 0.1)} stroke={detail} strokeWidth={0.4} />
          <line x1={0.6} y1={1.4} x2={item.width - 0.6} y2={1.4} stroke={detail} strokeWidth={0.22} strokeDasharray="0.9,0.7" />
        </g>
      );
    }
    if (item.kind === "rect" && item.image) {
      // A logo: the picture at its printed size. Embroidery stands off the
      // cloth a little, so it casts a small shadow; a print lies flat.
      return (
        <g key={item.key} {...dragProps} transform={spin(item)}>
          <image
            href={artworkUrl(item.image)}
            x={item.x}
            y={item.y}
            width={item.width}
            height={item.height}
            preserveAspectRatio="xMidYMid meet"
            filter={item.category === "embroidery" ? `url(#${stitchId})` : undefined}
          />
          <rect x={item.x} y={item.y} width={item.width} height={item.height} fill="transparent" />
        </g>
      );
    }
    if (item.kind === "rect" && ACCESSORY_FILL[item.category] && item.label) {
      // Text (a name, a school): lettering in a colour that stands out on the
      // cloth, squeezed to fit the print's width when it is long.
      const size = Math.min(item.height * 0.72, (item.width / Math.max(1, item.label.length)) * 1.75);
      const natural = item.label.length * size * 0.58;
      return (
        <g key={item.key} {...dragProps} transform={spin(item)}>
          <rect x={item.x} y={item.y} width={item.width} height={item.height} fill="transparent" />
          <text
            x={item.x + item.width / 2}
            y={item.y + item.height / 2}
            fontSize={size}
            fontWeight={700}
            fontFamily="'Space Grotesk', Arial, sans-serif"
            textAnchor="middle"
            dominantBaseline="central"
            fill={luminance(color) > 0.45 ? "#1f2a44" : "#f4f1e8"}
            filter={item.category === "embroidery" ? `url(#${stitchId})` : undefined}
            {...(natural > item.width ? { textLength: item.width, lengthAdjust: "spacingAndGlyphs" } : {})}
          >
            {item.label}
          </text>
        </g>
      );
    }
    if (item.kind === "rect") {
      return (
        <g key={item.key} {...dragProps} transform={spin(item)}>
          <rect
            x={item.x}
            y={item.y}
            width={item.width}
            height={item.height}
            rx={item.rx || 0}
            fill={ACCESSORY_FILL[item.category] ? "none" : fill}
            stroke={ACCESSORY_FILL[item.category] ? fill : stroke}
            strokeWidth={ACCESSORY_FILL[item.category] ? 0.4 : 0.35}
            strokeDasharray={ACCESSORY_FILL[item.category] ? "1.2,1" : undefined}
            // An empty print box is only an outline: let its inside take the
            // tap or click too, or it falls through to the cloth underneath.
            pointerEvents={ACCESSORY_FILL[item.category] ? "all" : undefined}
          />
          {item.label && (
            <text
              x={item.x + item.width / 2}
              y={item.y + item.height / 2}
              fontSize={Math.min(2.6, item.height * 0.35)}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={fill}
            >
              {item.label}
            </text>
          )}
        </g>
      );
    }
    if (item.kind === "line") {
      if (item.category === "trim") return <line key={item.key} x1={item.x1} y1={item.y1} x2={item.x2} y2={item.y2} stroke={accent} strokeWidth={0.65} strokeLinecap="round" />;
      if (item.category === "stitch") return <line key={item.key} x1={item.x1} y1={item.y1} x2={item.x2} y2={item.y2} stroke={detail} strokeWidth={STITCH_W} strokeDasharray={STITCH_DASH} />;
      return <line key={item.key} x1={item.x1} y1={item.y1} x2={item.x2} y2={item.y2} stroke={detail} strokeWidth={SEAM_W} strokeLinecap="round" />;
    }
    if (item.kind === "circle") {
      // A button: a disc a shade off the cloth with its rim, so it reads as a button, not a hole.
      return <circle key={item.key} cx={item.cx} cy={item.cy} r={item.r} fill={lighten(color, 0.18)} stroke={detail} strokeWidth={0.26} />;
    }
    const clipId = item.clip ? `clip-${title}-${item.key}` : null;
    const outlined = item.category === "body" || item.category === "collar";
    const lineColor = outlined ? stroke : detail;
    return (
      <g key={item.key} {...dragProps}>
        {item.category === "collar" && !item.noFill && (
          // A soft shadow the collar casts on the body under it.
          <g transform="translate(0 0.55)" style={{ pointerEvents: "none" }}>
            <path d={item.d} transform={item.transform} fill="#000" opacity={0.13} />
          </g>
        )}
        {item.clip && (
          <clipPath id={clipId}>
            <rect x={item.clip.x} y={item.clip.y} width={item.clip.width} height={item.clip.height} />
          </clipPath>
        )}
        <path
          d={item.d}
          transform={item.transform}
          fill={item.noFill ? "none" : (item.category === "motif" || item.category === "panel" || (item.category === "pocket" && item.fabric === "contrast")) && motifFill(patternPrefix, item.pattern || pattern, item.orient) || fill}
          stroke={item.noStroke ? "none" : lineColor}
          strokeWidth={item.category === "stitch" ? STITCH_W : outlined ? OUTLINE_W : SEAM_W}
          strokeLinejoin="round"
          strokeDasharray={item.category === "stitch" ? STITCH_DASH : undefined}
          clipPath={clipId ? `url(#${clipId})` : undefined}
        />
        {item.category === "body" && !item.noFill && (
          // Shading over the cloth: light at the shoulders, deeper toward the hem.
          <path d={item.d} transform={item.transform} fill={`url(#${shadeId})`} style={{ pointerEvents: "none" }} clipPath={clipId ? `url(#${clipId})` : undefined} />
        )}
      </g>
    );
  }

  return (
    <div className="flat-view" style={zoom ? { width: `${zoom}%`, flex: "0 0 auto" } : undefined}>
      <div className="flat-svg-wrap" style={zoom ? { width: "100%" } : undefined}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${viewW} ${viewH}`}
        width={viewW * pxPerCm}
        height={viewH * pxPerCm}
        className={`flat-svg${onCanvasClick ? "" : " is-static"}`}
        style={zoom ? { width: "100%", maxWidth: "none" } : undefined}
        onClick={handleCanvasClick}
        onDragOver={onCanvasDrop ? (e) => e.preventDefault() : undefined}
        onDrop={onCanvasDrop ? handleCanvasDrop : undefined}
      >
        {items.some((i) => (i.category === "motif" || i.category === "panel" || (i.category === "pocket" && i.fabric === "contrast")) && (i.pattern || pattern) && (i.pattern || pattern) !== "solid") && <MotifDefs prefix={patternPrefix} base={accent} />}
        <defs>
          <linearGradient id={shadeId} x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
            <stop offset="0" stopColor="#fff" stopOpacity={0.07} />
            <stop offset="0.45" stopColor="#fff" stopOpacity={0} />
            <stop offset="1" stopColor="#000" stopOpacity={0.1} />
          </linearGradient>
          {items.some((i) => (i.image || i.label) && i.category === "embroidery") && (
            <filter id={stitchId} x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx={0.06} dy={0.1} stdDeviation={0.07} floodColor="#000" floodOpacity={0.45} />
            </filter>
          )}
        </defs>
        <g transform={`translate(${originX} ${originY})`}>
          {/* Extras last, over the garment's buttons and stitching, so a finger
              or the mouse on an extra always picks the extra up. */}
          {[...items.filter((i) => !i.accessoryId), ...items.filter((i) => i.accessoryId)].map((item) => {
            const picked = selectedId && item.accessoryId === selectedId && item.fraction && item.half !== "mirror";
            const el = picked ? (
              <g key={item.key}>
                {renderItem(item)}
                {pickOverlay(item)}
              </g>
            ) : (
              renderItem(item)
            );
            if (!item.matrix && !item.clipPath) return el;
            // A sleeve extra: clipped to the sleeve, and (when it carries on from
            // another drawing) moved into place by a matrix.
            const clipId = `wrap-${title}-${item.key}`;
            return (
              <g key={item.key} clipPath={`url(#${clipId})`} style={item.bleed ? { pointerEvents: "none" } : undefined}>
                <clipPath id={clipId}>
                  <path d={item.clipPath.d} transform={item.clipPath.transform} />
                </clipPath>
                <g transform={item.matrix}>{el}</g>
              </g>
            );
          })}
        </g>
      </svg>
      {toolbarFor &&
        (() => {
          // The picked extra's tools, just above it (below it near the top edge),
          // placed in the drawing's own proportions so they follow it at any zoom.
          const item = items.find((i) => i.accessoryId === selectedId && i.fraction && i.half !== "mirror");
          if (!item) return null;
          const box = extraBox(item);
          const below = (originY + box.top) / viewH < 0.16;
          const left = ((originX + box.cx) / viewW) * 100;
          const top = ((originY + (below ? box.bottom : box.top)) / viewH) * 100;
          return (
            <div ref={keepInside} className={`extra-toolbar${below ? " is-below" : ""}`} style={{ left: `${left}%`, top: `${top}%` }}>
              {toolbarFor(item)}
            </div>
          );
        })()}
      </div>
      <div className="flat-view-label">{title}</div>
    </div>
  );
}

// readOnly: a reference drawing only — no colour or fabric controls, no
// adding or moving extras (the Pattern step shows the garment as it was saved).
export default function GarmentFlatPreview({ pieces, accessories = [], gender, dartPosition, sleeveStyle, collarStyle, onAddAccessory, onRemoveAccessory, onDragAccessory, onDropAccessory, onLogoFile, selectedId = null, onSelect, onUpdateAccessory, onMirrorAccessory, onEditAccessory, partFor, onJumpToPart, merchItem, compact = false, readOnly = false, views = "both", zoom, colorHint, onColorChange, fabricColors, fabrics, fabricName, onFabricPick, pattern = "solid", sharedControls = true }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [sidesOn, setSidesOn] = useState(false);
  const [color, setColor] = useState("#33475B");
  const [colorBlockOn, setColorBlockOn] = useState(false);
  const [secondaryColor, setSecondaryColor] = useState("#c0392b");
  const [accentColor, setAccentColor] = useState("#c0392b");
  const [pendingAdd, setPendingAdd] = useState(null); // { view, segment, label, allowsPocket, localX, localY, width, height, screenX, screenY }
  const [fabricPickerOpen, setFabricPickerOpen] = useState(false);
  const popoverRef = useRef(null);

  // Colours read off a reference photo replace the picked ones when they change.
  const [seenHint, setSeenHint] = useState(null);
  if (colorHint !== seenHint) {
    setSeenHint(colorHint);
    if (colorHint?.main) setColor(colorHint.main);
    if (colorHint?.accent) {
      setAccentColor(colorHint.accent);
      setSecondaryColor(colorHint.accent);
    }
  }

  useEffect(() => {
    if (!pendingAdd) return;
    function onDocClick(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) setPendingAdd(null);
    }
    // Capture phase, after the click that opened it has already
    // finished bubbling, so this doesn't immediately close itself.
    const id = requestAnimationFrame(() => window.addEventListener("click", onDocClick));
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("click", onDocClick);
    };
  }, [pendingAdd]);

  const showSides = views === "sleeves" || views === "all" || sidesOn;
  const { kind, front, back, left, right } = pieces?.length ? layoutGarmentViews(pieces, { accessories, gender, dartPosition, sleeveStyle, collarStyle, merchItem, sides: showSides }) : {};
  const pxPerCm = 5;

  // Sleeve drawings are narrower than the shirt's; keep the same scale as the front.
  const viewWidth = (l) => l.width * 2 + Math.max(l.width * 0.08, 3) * 2;
  const sideZoom = (l) => (zoom && front && l ? (zoom * viewWidth(l)) / viewWidth(front) : zoom);
  const hasDraggable = [front, back, left, right].some((v) => v?.items?.some((i) => DRAGGABLE_CATEGORIES.has(i.category) && i.fraction && i.half !== "mirror"));

  // The picked extra, and the drawing its tools show on: the first shown one it is on.
  const picked = !readOnly && selectedId ? accessories.find((a) => a.id === selectedId) : null;
  const shownViews = [
    (views === "both" || views === "front" || views === "all") && ["front", front],
    (views === "both" || views === "back" || views === "all") && ["back", back],
    (views === "sleeves" || views === "all" || (views === "both" && sidesOn)) && ["left", left],
    (views === "sleeves" || views === "all" || (views === "both" && sidesOn)) && ["right", right],
  ].filter((v) => v && v[1]);
  const carries = ([, l]) => l.items.some((i) => i.accessoryId === picked.id && i.fraction && i.half !== "mirror");
  // The drawing it was put on, when that one is shown (a sleeve print shows
  // on several, mostly hidden on all but its own).
  const pickedHome = picked && (shownViews.find((v) => v[0] === picked.view && carries(v)) || shownViews.find(carries));
  const toolbarView = pickedHome?.[0];
  const pickedItem = pickedHome?.[1].items.find((i) => i.accessoryId === picked.id && i.fraction && i.half !== "mirror");

  const resizeExtra = (id, size) => onUpdateAccessory?.(id, size);
  function scaleExtra(item, k) {
    const kk = Math.max(1.5 / Math.min(item.width, item.height), Math.min(45 / Math.max(item.width, item.height), k));
    resizeExtra(item.accessoryId, { width: Math.round(item.width * kk * 10) / 10, height: Math.round(item.height * kk * 10) / 10 });
  }
  const turnExtra = (a, by) => onUpdateAccessory?.(a.id, { rotation: ((((a.rotation || 0) + by + 180) % 360) + 360) % 360 - 180 });
  function removeExtra(id) {
    onRemoveAccessory?.(id);
    onSelect?.(null);
  }
  const canMirror = (a) => onMirrorAccessory && (/left|right/.test(a.segment) || a.position);

  // Moves the picked extra by dx, dy cm, the way dragging it does.
  function nudge(dx, dy) {
    const [, layout] = pickedHome;
    const it = pickedItem;
    const xSign = it.mirror ? -1 : 1;
    onDragAccessory?.(it.accessoryId, clampFraction(it.fractionKind, it.fraction.x + (dx * xSign) / layout.width, it.fraction.y + dy / layout.height));
  }

  // The keyboard works on the picked extra: arrows move it (Shift: further),
  // + and − size it, R turns it, Delete removes it, Escape puts it down.
  useEffect(() => {
    if (!picked || !pickedItem) return undefined;
    function onKey(e) {
      if (e.target.closest?.("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      const step = e.shiftKey ? 2 : 0.5;
      const keys = {
        ArrowLeft: () => nudge(-step, 0),
        ArrowRight: () => nudge(step, 0),
        ArrowUp: () => nudge(0, -step),
        ArrowDown: () => nudge(0, step),
        Delete: () => removeExtra(picked.id),
        Backspace: () => removeExtra(picked.id),
        Escape: () => onSelect?.(null),
        "+": () => scaleExtra(pickedItem, 1.1),
        "=": () => scaleExtra(pickedItem, 1.1),
        "-": () => scaleExtra(pickedItem, 1 / 1.1),
        r: () => turnExtra(picked, 15),
        R: () => turnExtra(picked, -15),
      };
      if (!keys[e.key]) return;
      e.preventDefault();
      keys[e.key]();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!pieces?.length) return null;

  function toolbarFor(item) {
    const a = accessories.find((x) => x.id === item.accessoryId);
    if (!a) return null;
    return (
      <>
        <span className="extra-toolbar-name">{a.image ? "Logo" : ACCESSORY_TYPE_LABELS[a.type]?.replace(/ \(.*\)/, "") || a.type}</span>
        <button type="button" onClick={() => scaleExtra(item, 1 / 1.1)} aria-label="Smaller" title="Smaller (−)">−</button>
        <button type="button" onClick={() => scaleExtra(item, 1.1)} aria-label="Bigger" title="Bigger (+)">+</button>
        <button type="button" onClick={() => turnExtra(a, -15)} aria-label="Turn left" title="Turn left (⇧R)">↺</button>
        <button type="button" onClick={() => turnExtra(a, 15)} aria-label="Turn right" title="Turn right (R)">↻</button>
        {canMirror(a) && (
          <button type="button" onClick={() => onMirrorAccessory(a.id)} aria-label="Copy to the other side" title="Copy to the other side">⇋</button>
        )}
        <button type="button" className="is-danger" onClick={() => removeExtra(a.id)} aria-label="Remove" title="Remove (Delete)">✕</button>
        {onEditAccessory && (
          <button type="button" onClick={() => onEditAccessory(a.id)} aria-label="More settings" title="Shape, fabric, size in cm">⋯</button>
        )}
      </>
    );
  }

  // A click on the cloth puts down a picked extra; with none picked it
  // offers what can be added there.
  function handleCanvasClick(payload) {
    if (selectedId) {
      onSelect?.(null);
      return;
    }
    setPendingAdd(payload);
  }

  function handleDrop({ file, type, extra, segment, view, localX, localY, width, height }) {
    if (file) {
      onLogoFile?.(file, { segment, view, position: positionFromClick("sablon", segment, view, localX, localY, width, height) });
      return;
    }
    const position = positionFromClick(type, segment, view, localX, localY, width, height);
    const id = onAddAccessory?.(type, segment, position, { ...extra, view });
    if (id) onSelect?.(id);
  }

  function handlePopoverLogo(file) {
    if (!pendingAdd || !file) return;
    const { segment, view, localX, localY, width, height } = pendingAdd;
    onLogoFile?.(file, { segment, view, position: positionFromClick("sablon", segment, view, localX, localY, width, height) });
    setPendingAdd(null);
  }

  // What a freshly added pocket looks like: a slim pen pocket, a small one on
  // a sleeve, or a chest pocket left for the draft to size from the front, as
  // the shop sizes its own (12 x 13cm on a size L).
  function pocketExtra(kindOfPocket, segment) {
    if (kindOfPocket === "pen") return { shape: "square", width: 3.5, height: 13 };
    if (/sleeve/.test(segment)) return { shape: "classic", width: 6, height: 7 };
    return { shape: "classic" };
  }

  function handlePopoverAdd(type) {
    if (!pendingAdd) return;
    const real = type === "pen" ? "pocket" : type;
    const position = positionFromClick(real, pendingAdd.segment, pendingAdd.view, pendingAdd.localX, pendingAdd.localY, pendingAdd.width, pendingAdd.height);
    const id = onAddAccessory?.(real, pendingAdd.segment, position, { ...(real === "pocket" ? pocketExtra(type, pendingAdd.segment) : undefined), view: pendingAdd.view });
    if (id) onSelect?.(id);
    setPendingAdd(null);
  }

  const hasAccent =
    (pieces || []).some((p) => p.fabric === "contrast" || /neck trim|piping strip|insert panel|side stripe|motif|chest band|shoulder band|hem band/i.test(p.name)) ||
    accessories.some((a) => a.fabric === "contrast");

  const swatch = (value, onPick, label, title) => (
    <label className="swatch-control" title={title}>
      <input type="color" value={value} onChange={(e) => onPick(e.target.value)} aria-label={label} />
      <span>{label}</span>
    </label>
  );

  return (
    <div className={`garment-preview${readOnly ? " is-readonly" : ""}`}>
      {!readOnly && (
        <div className="preview-toolbar">
          {sharedControls &&
            swatch(
              color,
              (v) => {
                setColor(v);
                onColorChange?.({ main: v });
              },
              "Colour",
              fabricName ? "The fabric's colour" : "A free-pick colour until a fabric is chosen",
            )}
          {sharedControls &&
            hasAccent &&
            swatch(
              accentColor,
              (v) => {
                setAccentColor(v);
                onColorChange?.({ accent: v });
              },
              "Accent",
              "Trim, panels and contrast pieces",
            )}
          {sharedControls && fabrics?.length > 0 && (
            <button type="button" className="toolbar-btn" onClick={() => setFabricPickerOpen((o) => !o)} aria-expanded={fabricPickerOpen}>
              {fabricName || "Choose fabric"} <span aria-hidden="true">{fabricPickerOpen ? "▴" : "▾"}</span>
            </button>
          )}
          <span className="toolbar-spacer" />
          {!compact && kind === "torso" && (
            <label className="check">
              <input type="checkbox" checked={sidesOn} onChange={(e) => setSidesOn(e.target.checked)} />
              Sleeve views
            </label>
          )}
          <label className="check" title="Preview one half in a second colour">
            <input type="checkbox" checked={colorBlockOn} onChange={(e) => setColorBlockOn(e.target.checked)} />
            Two-tone
          </label>
          {colorBlockOn && swatch(secondaryColor, setSecondaryColor, "Panel", "The second colour")}
        </div>
      )}
      {!readOnly && sharedControls && fabricPickerOpen && fabrics?.length > 0 && (
        <div className="fabric-inline-picker">
          <FabricPicker
            fabrics={fabrics}
            currentName={fabricName}
            onPick={(name) => {
              onFabricPick?.(name);
              setFabricPickerOpen(false);
            }}
          />
        </div>
      )}
      {!readOnly && sharedControls && fabricColors?.length > 0 && (
        <div className="fabric-colors-inline">
          <span className="toolbar-label">{fabricName}: {fabricColors.length} colours</span>
          <FabricColorPicker colors={fabricColors} colorHint={colorHint} onPick={(slot, hex) => onColorChange?.({ [slot]: hex })} />
        </div>
      )}
      <div className="garment-preview-body">
        <div className="flat-views">
          {(views === "both" || views === "front" || views === "all") && (
          <ViewPanel
            title="Front"
            viewKey="front"
            layout={front}
            color={color}
            secondaryColor={colorBlockOn ? secondaryColor : null}
            accent={accentColor}
            pattern={pattern}
            patternPrefix={`mo${uid}front`}
            selectedId={readOnly ? null : selectedId}
            onSelect={readOnly ? undefined : onSelect}
            onItemResize={readOnly || !onUpdateAccessory ? undefined : resizeExtra}
            toolbarFor={toolbarView === "front" ? toolbarFor : undefined}
            pxPerCm={pxPerCm}
            zoom={zoom}
            onItemDrag={readOnly ? undefined : onDragAccessory}
            onCanvasClick={readOnly ? undefined : handleCanvasClick}
            onCanvasDrop={!readOnly && (onDropAccessory || onLogoFile) ? handleDrop : undefined}
          />
          )}
          {(views === "both" || views === "back" || views === "all") && (
          <ViewPanel
            title="Back"
            viewKey="back"
            layout={back}
            color={color}
            secondaryColor={colorBlockOn ? secondaryColor : null}
            accent={accentColor}
            pattern={pattern}
            patternPrefix={`mo${uid}back`}
            selectedId={readOnly ? null : selectedId}
            onSelect={readOnly ? undefined : onSelect}
            onItemResize={readOnly || !onUpdateAccessory ? undefined : resizeExtra}
            toolbarFor={toolbarView === "back" ? toolbarFor : undefined}
            pxPerCm={pxPerCm}
            zoom={zoom}
            onItemDrag={readOnly ? undefined : onDragAccessory}
            onCanvasClick={readOnly ? undefined : handleCanvasClick}
            onCanvasDrop={!readOnly && (onDropAccessory || onLogoFile) ? handleDrop : undefined}
          />
          )}
          {(views === "sleeves" || views === "all" || (views === "both" && sidesOn)) && left && (
          <ViewPanel
            title="Left sleeve"
            viewKey="left"
            layout={left}
            color={color}
            secondaryColor={colorBlockOn ? secondaryColor : null}
            accent={accentColor}
            pattern={pattern}
            patternPrefix={`mo${uid}left`}
            selectedId={readOnly ? null : selectedId}
            onSelect={readOnly ? undefined : onSelect}
            onItemResize={readOnly || !onUpdateAccessory ? undefined : resizeExtra}
            toolbarFor={toolbarView === "left" ? toolbarFor : undefined}
            pxPerCm={pxPerCm}
            zoom={left && sideZoom(left)}
            onItemDrag={readOnly ? undefined : onDragAccessory}
            onCanvasClick={readOnly ? undefined : handleCanvasClick}
            onCanvasDrop={!readOnly && (onDropAccessory || onLogoFile) ? handleDrop : undefined}
          />
          )}
          {(views === "sleeves" || views === "all" || (views === "both" && sidesOn)) && right && (
          <ViewPanel
            title="Right sleeve"
            viewKey="right"
            layout={right}
            color={color}
            secondaryColor={colorBlockOn ? secondaryColor : null}
            accent={accentColor}
            pattern={pattern}
            patternPrefix={`mo${uid}right`}
            selectedId={readOnly ? null : selectedId}
            onSelect={readOnly ? undefined : onSelect}
            onItemResize={readOnly || !onUpdateAccessory ? undefined : resizeExtra}
            toolbarFor={toolbarView === "right" ? toolbarFor : undefined}
            pxPerCm={pxPerCm}
            zoom={right && sideZoom(right)}
            onItemDrag={readOnly ? undefined : onDragAccessory}
            onCanvasClick={readOnly ? undefined : handleCanvasClick}
            onCanvasDrop={!readOnly && (onDropAccessory || onLogoFile) ? handleDrop : undefined}
          />
          )}
        </div>
        {!compact && !readOnly && accessories.length > 0 && <aside className="accessory-list-panel">
          <div className="accessory-list-title">Pockets, embroidery &amp; sablon</div>
          {accessories.length === 0 ? (
            <p className="empty" style={{ margin: 0 }}>
              Click anywhere on the garment to add one.
            </p>
          ) : (
            <ul className="segment-accessory-list">
              {accessories.map((acc) => (
                <li key={acc.id}>
                  <span>
                    {ACCESSORY_TYPE_LABELS[acc.type] || acc.type}
                    {acc.label ? ` — "${acc.label}"` : ""}
                    <br />
                    <small>{[front, back].map((v) => v?.segments?.find((s) => s.segment === acc.segment)?.label).find(Boolean) || acc.segment}</small>
                  </span>
                  <button type="button" className="link-btn link-btn-danger" onClick={() => onRemoveAccessory?.(acc.id)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>}
      </div>
      {!readOnly && pendingAdd && (
        <div
          ref={popoverRef}
          className="accessory-popover"
          style={{ left: pendingAdd.screenX, top: pendingAdd.screenY }}
        >
          <div className="accessory-popover-title">{pendingAdd.label}</div>
          {onJumpToPart && partFor?.(pendingAdd.segment) && (
            <button
              type="button"
              className="popover-jump"
              onClick={() => {
                onJumpToPart(pendingAdd.segment);
                setPendingAdd(null);
              }}
            >
              Change the {partFor(pendingAdd.segment).toLowerCase()} →
            </button>
          )}
          <div className="accessory-popover-actions">
            {pendingAdd.allowsPocket && (
              <>
                <button type="button" className="btn-add btn-inline" onClick={() => handlePopoverAdd("pocket")}>
                  + Pocket
                </button>
                <button type="button" className="btn-add btn-inline" onClick={() => handlePopoverAdd("pen")}>
                  + Pen pocket
                </button>
              </>
            )}
            <button type="button" className="btn-add btn-inline" onClick={() => handlePopoverAdd("embroidery")}>
              + Embroidery
            </button>
            <button type="button" className="btn-add btn-inline" onClick={() => handlePopoverAdd("sablon")}>
              + Sablon
            </button>
            {onLogoFile && (
              <label className="btn-add btn-inline btn-file">
                + Logo from a file
                <input type="file" accept="image/*" hidden onChange={(e) => handlePopoverLogo(e.target.files?.[0])} />
              </label>
            )}
          </div>
        </div>
      )}
      {!compact && !readOnly && (
        <p className="preview-hint">
          Click the garment to add a pocket, embroidery or sablon{onLogoFile ? ", or drop a logo file on it" : ""}{hasDraggable ? "; drag one to move it" : ""}.
        </p>
      )}
    </div>
  );
}
