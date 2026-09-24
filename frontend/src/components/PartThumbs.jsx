import { useEffect, useId, useState } from "react";
import { api } from "../api.js";
import { layoutGarmentViews } from "../lib/garmentFlat.js";
import { pocketPath } from "../lib/pocketShapes.js";
import { MotifDefs } from "./MotifDefs.jsx";
import { motifFill } from "../lib/motifs.js";

// Picture tiles for the pattern maker. Each shirt part is shown as a small
// drawing of that part on a shirt, produced by the same pattern drafting and
// drawing code as the main preview: the shirt is drafted once with only that
// part changed, then cropped to the part's area.

const BASE = { gender: "unisex", sleeveStyle: "full", collarEnabled: true, collarStyle: "convertible", frontStyle: "placket", backStyle: "yoke", hemStyle: "curved", dartPosition: "side", neckline: "round", trim: "none", motifs: [], pattern: "solid" };

const BOTTOM_BASE = { length: "short", legStyle: "straight", frontPocket: "slant", backPocket: "welt", beltLoops: "loops", fly: "fly", waist: "band", stripe: "none" };
const BOTTOM_SLOTS = new Set(["length", "leg", "frontPocket", "backPocket", "beltLoops", "fly", "trouserWaist", "stripe"]);

const MERCH_FIELD = { mSize: "size", mShape: "shape", mStrap: "strap", mPocket: "pocket", mBottom: "bottom", mBrim: "brim", mClosure: "closure" };

const SKIRT_FIELD = { skStyle: "style", skWaist: "waist", skPocket: "pocket" };

function optionsFor(slot, part, base) {
  if (slot.startsWith("sk")) return { ...(base || { style: "a_line", waist: "band", pocket: "none" }), [SKIRT_FIELD[slot]]: part, _skirt: true };
  if (slot.startsWith("m")) {
    if (slot === "mItem") return { item: part, size: base?.size || "medium", pocket: "none" };
    return { ...(base || { item: "tote_bag" }), [MERCH_FIELD[slot]]: part };
  }
  if (BOTTOM_SLOTS.has(slot)) {
    const o = { ...BOTTOM_BASE };
    if (slot === "leg") o.legStyle = part;
    else if (slot === "length") o.length = part;
    else if (slot === "trouserWaist") o.waist = part;
    else o[slot] = part;
    return o;
  }
  const o = { ...BASE };
  if (slot === "fit") o.gender = part;
  if (slot === "sleeve") o.sleeveStyle = part;
  if (slot === "collar") {
    if (part === "none") o.collarEnabled = false;
    else if (part === "v_neck") {
      o.collarEnabled = false;
      o.neckline = "v_neck";
    } else o.collarStyle = part;
  }
  if (slot === "front") o.frontStyle = part;
  if (slot === "back") o.backStyle = part;
  if (slot === "hem") o.hemStyle = part;
  if (slot === "trim") o.trim = part;
  if (slot === "colorBlock") o.colorBlock = part === "none" ? "" : part;
  if (slot === "bands") o.motifs = [part];
  if (slot === "pattern") {
    o.motifs = ["centre"];
    o.pattern = part;
  }
  return o;
}

function payloadFor(o, size, garmentType) {
  if (o._skirt) return { garmentType: "skirt", skirt: { style: o.style, waist: o.waist, pocket: o.pocket }, sizes: [size] };
  if (o.item) return { garmentType: "other", merch: o, sizes: [size] };
  if (o.legStyle) {
    return { garmentType, trousers: { length: o.length, legStyle: o.legStyle, frontPocket: o.frontPocket, backPocket: o.backPocket, beltLoops: o.beltLoops, fly: o.fly, waist: o.waist, stripe: o.stripe }, sizes: [size] };
  }
  return {
    garmentType: "uniform_shirt",
    gender: o.gender,
    sleeveStyle: o.sleeveStyle,
    dartPosition: o.dartPosition,
    frontStyle: o.frontStyle,
    backStyle: o.backStyle,
    hemStyle: o.hemStyle,
    neckline: o.neckline,
    trim: o.trim,
    colorBlock: o.colorBlock || "",
    panel: o.motifs.includes("side") ? "side" : "none",
    motifs: o.motifs.filter((x) => x !== "side"),
    pattern: o.pattern,
    collar: o.collarEnabled,
    collarStyle: o.collarStyle,
    sizes: [size],
  };
}

const cache = new Map();

// Fetches (and remembers) the drafted pieces behind every tile in `parts`.
export function usePartThumbs(orderId, size, parts, garmentType, base) {
  const [, bump] = useState(0);
  const key = size ? JSON.stringify(size.measurements) : "";
  const baseKey = base ? JSON.stringify(base) : "";
  // Slots come and go as other choices change (a V-neck adds Front and Trim tiles).
  const partsKey = parts.map((p) => `${p.slot}:${p.value}`).join(",");
  useEffect(() => {
    if (!size) return undefined;
    let cancelled = false;
    (async () => {
      for (const { slot, value } of parts) {
        const o = optionsFor(slot, value, base);
        const id = `${garmentType}|${key}|${JSON.stringify(o)}`;
        if (cache.has(id)) continue;
        try {
          const res = await api.previewPieces(orderId, payloadFor(o, size, garmentType));
          cache.set(id, { pieces: res.pieces[size.label] || Object.values(res.pieces)[0], options: o });
        } catch {
          cache.set(id, null);
        }
        if (cancelled) return;
        bump((n) => n + 1);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, key, garmentType, baseKey, partsKey]);
  return (slot, value) => cache.get(`${garmentType}|${key}|${JSON.stringify(optionsFor(slot, value, base))}`);
}

const FABRIC = "#33475B";
const COLLAR = "#465f79";
const LINE = "#b9c8d8";
const ACCENT = "#d9634f";

// Where each part shows: which view, and the area (as a function of the
// layout's half width w and height h) to zoom to.
function regionFor(slot, w, h) {
  switch (slot) {
    case "frontPocket": return { view: "front", box: [-w, -6, w * 2, 30] };
    case "backPocket": return { view: "back", box: [-w, -6, w * 2, 30] };
    case "beltLoops": return { view: "front", box: [-w, -8, w * 2, 16] };
    case "fly": return { view: "front", box: [-12, -6, 24, 30] };
    case "trouserWaist": return { view: "front", box: [-w, -8, w * 2, 34] };
    case "stripe": return { view: "front", box: [-w - 1, -8, w * 2 + 2, h + 12] };
    case "leg":
    case "length": return { view: "front", box: [-w - 1, -8, w * 2 + 2, h + 12] };
    case "collar":
    case "trim": return { view: "front", box: [-15, -7, 30, 24] };
    case "bands": return { view: "front", box: [-w, -7, 2 * w, h + 11] };
    case "pattern": return { view: "front", box: [-14, -2, 28, 30] };
    case "front": return { view: "front", box: [-13, 1, 26, 34] };
    case "back": return { view: "back", box: [-19, -6, 38, 34] };
    case "hem": return { view: "front", box: [-w * 0.78, h - 24, w * 1.56, 30] };
    default: return { view: "front", box: [-w, -7, 2 * w, h + 11] };
  }
}

export function PartThumb({ slot, thumb }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (!thumb?.pieces) return <div className="pm-thumb pm-thumb-loading" />;
  const o = thumb.options;
  const layout = layoutGarmentViews(thumb.pieces, {
    merchItem: o.item,
    gender: o.gender,
    dartPosition: o.dartPosition,
    sleeveStyle: o.sleeveStyle,
    collarStyle: o.collarEnabled ? o.collarStyle : undefined,
    accessories: [],
  });
  const region = o._skirt
    ? { view: "front", box: [-(layout.front?.width || 25) - 1, -6, (layout.front?.width || 25) * 2 + 2, (layout.front?.height || 58) + 10] }
    : o.item
    ? { view: "front", box: [-(layout.front?.width || 20) - 1, -(layout.front?.topPadding || 4) - 2, (layout.front?.width || 20) * 2 + 2, (layout.front?.height || 40) + (layout.front?.topPadding || 4) + 4] }
    : regionFor(slot, layout.front?.width || 30, layout.front?.height || 70);
  const view = layout[region.view];
  if (!view) return <div className="pm-thumb pm-thumb-loading" />;
  const [x, y, w, h] = region.box;
  return (
    <svg className="pm-thumb" viewBox={`${x} ${y} ${w} ${h}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {o.pattern && o.pattern !== "solid" && <MotifDefs prefix={`mo${uid}`} base={ACCENT} />}
      {view.items.map((it) => {
        const sw = Math.max(0.3, w / 140);
        let el = null;
        if (it.kind === "path") {
          const patterned = (it.category === "motif" || it.category === "panel") && motifFill(`mo${uid}`, o.pattern, it.orient);
          el = <path key={it.key} d={it.d} transform={it.transform} fill={it.noFill ? "none" : patterned || (it.fabric === "contrast" ? ACCENT : it.category === "collar" ? COLLAR : it.category === "trim" || it.category === "panel" || it.category === "motif" ? ACCENT : FABRIC)} stroke={it.noStroke ? "none" : LINE} strokeWidth={sw} />;
        } else if (it.kind === "line" && it.category === "trim") {
          el = <line key={it.key} x1={it.x1} y1={it.y1} x2={it.x2} y2={it.y2} stroke={ACCENT} strokeWidth={Math.max(0.6, w / 60)} strokeLinecap="round" />;
        } else if (it.kind === "line") {
          el = <line key={it.key} x1={it.x1} y1={it.y1} x2={it.x2} y2={it.y2} stroke={LINE} strokeWidth={Math.max(0.25, w / 170)} />;
        } else if (it.kind === "circle") {
          el = <circle key={it.key} cx={it.cx} cy={it.cy} r={it.r} fill="none" stroke={LINE} strokeWidth={Math.max(0.25, w / 170)} />;
        }
        if (!el || !it.clipPath) return el;
        const id = `clip${uid}${it.key}`;
        return (
          <g key={it.key} clipPath={`url(#${id})`}>
            <clipPath id={id}>
              <path d={it.clipPath.d} transform={it.clipPath.transform} />
            </clipPath>
            {el}
          </g>
        );
      })}
    </svg>
  );
}

// A picture of a pocket outline, for the extras tiles.
export function PocketThumb({ shape, ratio }) {
  // ratio = width / height, so a slim pen pocket looks slim.
  const h = 12;
  const w = ratio ? Math.max(3, Math.min(10, h * ratio)) : 10;
  return (
    <svg className="pm-thumb" viewBox="-2 -2 14 16" aria-hidden="true">
      <g transform={`translate(${(10 - w) / 2} 0)`}>
        <path d={pocketPath(shape, w, h)} fill={FABRIC} stroke={LINE} strokeWidth="0.5" />
        <line x1="0" y1="2" x2={w} y2="2" stroke={LINE} strokeWidth="0.35" />
      </g>
    </svg>
  );
}

export function ExtraThumb({ kind }) {
  return (
    <svg className="pm-thumb" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="1" y="1" width="18" height="18" rx="2" fill={FABRIC} />
      {kind === "embroidery" ? (
        <>
          <path d="M5 14 L5 6 L15 6 L15 14 M5 10 L13 10" fill="none" stroke="#f0d98a" strokeWidth="1.4" strokeDasharray="1.6 1" />
        </>
      ) : (
        <>
          <circle cx="10" cy="10" r="5" fill="#c0392b" />
          <path d="M7.5 10 L9.3 11.8 L12.6 8.2" fill="none" stroke="#fff" strokeWidth="1.2" />
        </>
      )}
    </svg>
  );
}
