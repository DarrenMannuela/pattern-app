import { useEffect, useId, useRef, useState } from "react";
import { layoutGarmentViews, isSideSegment } from "../lib/garmentFlat";
import { pocketPath } from "../lib/pocketShapes";
import { MotifDefs, motifFill } from "./MotifDefs.jsx";
import FabricColorPicker from "./FabricColorPicker.jsx";

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

function ViewPanel({ title, viewKey, layout, color, secondaryColor, accent, pattern, patternPrefix, pxPerCm, zoom, onItemDrag, onCanvasClick, onCanvasDrop }) {
  const svgRef = useRef(null);
  if (!layout) {
    return (
      <div className="flat-view flat-view-empty">
        <p className="empty">No {title.toLowerCase()} piece in this mockup.</p>
      </div>
    );
  }
  const { items, segments, width, height, topPadding } = layout;
  const marginSide = Math.max(width * 0.75, 18);
  const marginTop = Math.max(topPadding + 6, height * 0.1);
  const marginBottom = Math.max(height * 0.05, 8);
  const viewW = width * 2 + marginSide * 2;
  const viewH = height + marginTop + marginBottom;
  const originX = viewW / 2;
  const originY = marginTop;
  const stroke = darken(color, 0.35);

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
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
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
    const fill = fillFor(item, color, secondaryColor, accent);
    const draggable = DRAGGABLE_CATEGORIES.has(item.category) && item.fraction && item.half !== "mirror" /* only the main (unmirrored) copy drags */;
    const dragProps = draggable
      ? {
          onPointerDown: (e) => startDrag(e, item),
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
          <path d={pocketPath(item.shape, item.width, item.height)} fill={item.fabric === "contrast" ? motifFill(patternPrefix, pattern, "v") || accent : lighten(color, 0.16)} stroke={stroke} strokeWidth={0.45} />
          <line x1={0.6} y1={1.4} x2={item.width - 0.6} y2={1.4} stroke={stroke} strokeWidth={0.25} strokeDasharray="0.9,0.7" />
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
      return <line key={item.key} x1={item.x1} y1={item.y1} x2={item.x2} y2={item.y2} stroke={stroke} strokeWidth={0.35} />;
    }
    if (item.kind === "circle") {
      return <circle key={item.key} cx={item.cx} cy={item.cy} r={item.r} fill="none" stroke={stroke} strokeWidth={0.3} />;
    }
    const clipId = item.clip ? `clip-${title}-${item.key}` : null;
    return (
      <g key={item.key} {...dragProps}>
        {item.clip && (
          <clipPath id={clipId}>
            <rect x={item.clip.x} y={item.clip.y} width={item.clip.width} height={item.clip.height} />
          </clipPath>
        )}
        <path
          d={item.d}
          transform={item.transform}
          fill={item.noFill ? "none" : (item.category === "motif" || item.category === "panel" || (item.category === "pocket" && item.fabric === "contrast")) && motifFill(patternPrefix, pattern, item.orient) || fill}
          stroke={item.noStroke ? "none" : stroke}
          strokeWidth={0.3}
          clipPath={clipId ? `url(#${clipId})` : undefined}
        />
      </g>
    );
  }

  return (
    <div className="flat-view" style={zoom ? { width: `${zoom}%`, flex: "0 0 auto" } : undefined}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${viewW} ${viewH}`}
        width={viewW * pxPerCm}
        height={viewH * pxPerCm}
        className="flat-svg"
        style={zoom ? { width: "100%", maxWidth: "none" } : undefined}
        onClick={handleCanvasClick}
        onDragOver={onCanvasDrop ? (e) => e.preventDefault() : undefined}
        onDrop={onCanvasDrop ? handleCanvasDrop : undefined}
      >
        {pattern && pattern !== "solid" && items.some((i) => i.category === "motif" || i.category === "panel" || (i.category === "pocket" && i.fabric === "contrast")) && <MotifDefs prefix={patternPrefix} base={accent} />}
        <g transform={`translate(${originX} ${originY})`}>
          {items.map((item) => {
            const el = renderItem(item);
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
      <div className="flat-view-label">{title}</div>
    </div>
  );
}

export default function GarmentFlatPreview({ pieces, accessories = [], gender, dartPosition, sleeveStyle, collarStyle, onAddAccessory, onRemoveAccessory, onDragAccessory, onDropAccessory, merchItem, compact = false, views = "both", zoom, colorHint, onColorChange, fabricColors, pattern = "solid" }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [sidesOn, setSidesOn] = useState(false);
  const [color, setColor] = useState("#33475B");
  const [colorBlockOn, setColorBlockOn] = useState(false);
  const [secondaryColor, setSecondaryColor] = useState("#c0392b");
  const [accentColor, setAccentColor] = useState("#c0392b");
  const [pendingAdd, setPendingAdd] = useState(null); // { view, segment, label, allowsPocket, localX, localY, width, height, screenX, screenY }
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

  if (!pieces?.length) return null;
  const showSides = views === "sleeves" || views === "all" || sidesOn;
  const { kind, front, back, left, right } = layoutGarmentViews(pieces, { accessories, gender, dartPosition, sleeveStyle, collarStyle, merchItem, sides: showSides });
  const pxPerCm = 5;

  // Sleeve drawings are narrower than the shirt's; keep the same scale as the front.
  const viewWidth = (l) => l.width * 2 + Math.max(l.width * 0.75, 18) * 2;
  const sideZoom = (l) => (zoom && front && l ? (zoom * viewWidth(l)) / viewWidth(front) : zoom);
  const hasDraggable = [front, back, left, right].some((v) => v?.items.some((i) => DRAGGABLE_CATEGORIES.has(i.category) && i.fraction && i.half !== "mirror"));

  function handleCanvasClick(payload) {
    setPendingAdd(payload);
  }

  function handleDrop({ type, extra, segment, view, localX, localY, width, height }) {
    const position = positionFromClick(type, segment, view, localX, localY, width, height);
    onAddAccessory?.(type, segment, position, { ...extra, view });
  }

  // What a freshly added pocket looks like: a chest-sized patch, smaller on a
  // sleeve, or a slim pen pocket.
  function pocketExtra(kindOfPocket, segment) {
    if (kindOfPocket === "pen") return { shape: "square", width: 3.5, height: 13 };
    if (/sleeve/.test(segment)) return { shape: "classic", width: 6, height: 7 };
    return { shape: "classic", width: 10, height: 11.5 };
  }

  function handlePopoverAdd(type) {
    if (!pendingAdd) return;
    const real = type === "pen" ? "pocket" : type;
    const position = positionFromClick(real, pendingAdd.segment, pendingAdd.view, pendingAdd.localX, pendingAdd.localY, pendingAdd.width, pendingAdd.height);
    onAddAccessory?.(real, pendingAdd.segment, position, { ...(real === "pocket" ? pocketExtra(type, pendingAdd.segment) : undefined), view: pendingAdd.view });
    setPendingAdd(null);
  }

  const hasAccent =
    (pieces || []).some((p) => p.fabric === "contrast" || /neck trim|piping strip|insert panel|side stripe|motif|chest band|shoulder band|hem band/i.test(p.name)) ||
    accessories.some((a) => a.fabric === "contrast");

  return (
    <div className="garment-preview">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 15 }}>Design preview</h2>
      </div>
      <div className="preview-controls">
        <div className="field" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ margin: 0 }} title="A free-pick preview colour — it isn't checked against any real fabric. For an order using a cataloged fabric, pick its actual colour from the swatches in the Fabric section above instead.">
            Preview color (free pick)
          </label>
          <input
            type="color"
            value={color}
            onChange={(e) => {
              setColor(e.target.value);
              onColorChange?.({ main: e.target.value });
            }}
            style={{ width: 34, height: 26, padding: 0, border: "1px solid #454c51", borderRadius: 4, background: "none" }}
          />
        </div>
        {hasAccent && (
          <div className="field" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ margin: 0 }} title="A free-pick preview colour — it isn't checked against any real fabric.">Trim / panel color</label>
            <input
              type="color"
              value={accentColor}
              onChange={(e) => {
                setAccentColor(e.target.value);
                onColorChange?.({ accent: e.target.value });
              }}
              style={{ width: 34, height: 26, padding: 0, border: "1px solid #454c51", borderRadius: 4, background: "none" }}
            />
          </div>
        )}
        {!compact && kind === "torso" && (
          <label className="check" style={{ margin: 0 }}>
            <input type="checkbox" checked={sidesOn} onChange={(e) => setSidesOn(e.target.checked)} />
            Sleeve side views
          </label>
        )}
        <label className="check" style={{ margin: 0 }}>
          <input type="checkbox" checked={colorBlockOn} onChange={(e) => setColorBlockOn(e.target.checked)} />
          Two-tone panel
        </label>
        {colorBlockOn && (
          <div className="field" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ margin: 0 }}>Panel color</label>
            <input
              type="color"
              value={secondaryColor}
              onChange={(e) => setSecondaryColor(e.target.value)}
              style={{ width: 34, height: 26, padding: 0, border: "1px solid #454c51", borderRadius: 4, background: "none" }}
            />
          </div>
        )}
      </div>
      {fabricColors?.length > 0 ? (
        <div className="fabric-colors-inline">
          <label style={{ margin: "0 0 4px", display: "block" }}>
            {fabricColors.length} real colours for this fabric
          </label>
          <FabricColorPicker colors={fabricColors} colorHint={colorHint} onPick={(slot, hex) => onColorChange?.({ [slot]: hex })} />
        </div>
      ) : (
        <p className="fabric-colors-hint">
          No catalog fabric picked yet — "Preview color" above is a free-pick guess, not a real fabric colour.{" "}
          <a
            href="#fabric-picker"
            onClick={(e) => {
              e.preventDefault();
              document.getElementById("fabric-picker")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            Pick a fabric ↑
          </a>{" "}
          to see its real colours here.
        </p>
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
            pxPerCm={pxPerCm}
            zoom={zoom}
            onItemDrag={onDragAccessory}
            onCanvasClick={handleCanvasClick}
            onCanvasDrop={onDropAccessory ? handleDrop : undefined}
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
            pxPerCm={pxPerCm}
            zoom={zoom}
            onItemDrag={onDragAccessory}
            onCanvasClick={handleCanvasClick}
            onCanvasDrop={onDropAccessory ? handleDrop : undefined}
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
            pxPerCm={pxPerCm}
            zoom={left && sideZoom(left)}
            onItemDrag={onDragAccessory}
            onCanvasClick={handleCanvasClick}
            onCanvasDrop={onDropAccessory ? handleDrop : undefined}
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
            pxPerCm={pxPerCm}
            zoom={right && sideZoom(right)}
            onItemDrag={onDragAccessory}
            onCanvasClick={handleCanvasClick}
            onCanvasDrop={onDropAccessory ? handleDrop : undefined}
          />
          )}
        </div>
        {!compact && <aside className="accessory-list-panel">
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
      {pendingAdd && (
        <div
          ref={popoverRef}
          className="accessory-popover"
          style={{ left: pendingAdd.screenX, top: pendingAdd.screenY }}
        >
          <div className="accessory-popover-title">{pendingAdd.label}</div>
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
          </div>
        </div>
      )}
      {!compact && <p className="draft-piece-notes" style={{ maxWidth: "none" }}>
        Stylized front/back illustration composed directly from the drafted cutting pieces —
        a technical flat, not a photo-real render, so drape and fabric weight aren't shown. Click
        anywhere on the garment to add a pocket, embroidery, or sablon exactly there
        {hasDraggable ? ", and drag any accessory already placed to reposition it" : ""} — Generate
        mockup again to redraft the actual pattern at that spot. Use the cutting pieces below for the
        actual pattern.
      </p>}
    </div>
  );
}
