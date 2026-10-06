import { useId } from "react";
import { pocketPath } from "../lib/pocketShapes";
import { artworkUrl } from "../api.js";

const INK = "#1d1d1f";
const PAPER = "#ffffff";
const CONTRAST = "#d9dde2"; // contrast fabric, shown as a light grey in a line drawing

// A garment view drawn the way a technical drawing is: black lines on white,
// topstitching dashed, contrast fabric a light grey. Static — for sheets and
// print, not for editing (GarmentFlatPreview is the interactive one).
export default function FlatDrawing({ layout, label, height = 260 }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (!layout) return null;
  const { items, width, height: h, topPadding = 2 } = layout;
  const side = Math.max(width * 0.35, 6);
  const top = topPadding + 4;
  const viewW = width * 2 + side * 2;
  const viewH = h + top + 4;

  const fillOf = (it) => {
    if (it.noFill) return "none";
    if (it.fabric === "contrast" || it.category === "panel" || it.category === "motif" || it.category === "trim") return CONTRAST;
    if (it.category === "inner") return "#eceef0";
    return PAPER;
  };
  const weight = (it) => (it.category === "stitch" ? 0.18 : it.category === "body" || it.category === "collar" ? 0.4 : 0.28);

  function draw(it) {
    if (it.kind === "rect" && it.shape) {
      return (
        <g key={it.key} transform={`translate(${it.x} ${it.y})${it.rotation ? ` rotate(${it.rotation} ${it.width / 2} ${it.height / 2})` : ""}`}>
          <path d={pocketPath(it.shape, it.width, it.height)} fill={it.fabric === "contrast" ? CONTRAST : PAPER} stroke={INK} strokeWidth={0.32} />
          <line x1={0.6} y1={1.4} x2={it.width - 0.6} y2={1.4} stroke={INK} strokeWidth={0.18} strokeDasharray="0.65,0.45" />
        </g>
      );
    }
    if (it.kind === "rect") {
      const extra = it.category === "embroidery" || it.category === "sablon";
      return (
        <g key={it.key} transform={it.rotation ? `rotate(${it.rotation} ${it.x + it.width / 2} ${it.y + it.height / 2})` : undefined}>
          {extra && it.image && <image href={artworkUrl(it.image)} x={it.x} y={it.y} width={it.width} height={it.height} preserveAspectRatio="xMidYMid meet" />}
          <rect x={it.x} y={it.y} width={it.width} height={it.height} rx={it.rx || 0} fill={extra ? "none" : PAPER} stroke={INK} strokeWidth={it.image ? 0.16 : 0.28} strokeDasharray={extra ? "1,0.8" : undefined} />
          {it.label && !it.image && (
            <text x={it.x + it.width / 2} y={it.y + it.height / 2} fontSize={Math.min(2.4, it.height * 0.35)} textAnchor="middle" dominantBaseline="middle" fill={INK}>
              {it.label}
            </text>
          )}
        </g>
      );
    }
    if (it.kind === "line") {
      const stitch = it.category === "stitch";
      return <line key={it.key} x1={it.x1} y1={it.y1} x2={it.x2} y2={it.y2} stroke={INK} strokeWidth={stitch ? 0.18 : it.category === "trim" ? 0.5 : 0.28} strokeDasharray={stitch ? "0.65,0.45" : undefined} />;
    }
    if (it.kind === "circle") return <circle key={it.key} cx={it.cx} cy={it.cy} r={it.r} fill={PAPER} stroke={INK} strokeWidth={0.22} />;
    return (
      <path
        key={it.key}
        d={it.d}
        transform={it.transform || undefined}
        fill={fillOf(it)}
        stroke={it.noStroke ? "none" : INK}
        strokeWidth={weight(it)}
        strokeDasharray={it.category === "stitch" ? "0.65,0.45" : undefined}
      />
    );
  }

  return (
    <figure className="flat-drawing">
      <svg viewBox={`${-width - side} ${-top} ${viewW} ${viewH}`} style={{ height, width: "auto", maxWidth: "100%" }} aria-label={label}>
        {items.map((it) => {
          const el = draw(it);
          if (!it.clipPath && !it.matrix) return el;
          const id = `fd${uid}${it.key}`;
          return (
            <g key={it.key} clipPath={it.clipPath ? `url(#${id})` : undefined}>
              {it.clipPath && (
                <clipPath id={id}>
                  <path d={it.clipPath.d} transform={it.clipPath.transform} />
                </clipPath>
              )}
              <g transform={it.matrix}>{el}</g>
            </g>
          );
        })}
      </svg>
      {label && <figcaption>{label}</figcaption>}
    </figure>
  );
}
