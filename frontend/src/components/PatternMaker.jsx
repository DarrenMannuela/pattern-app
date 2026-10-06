import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { api } from "../api.js";
import { prepareArtwork, printSize } from "../lib/artworkImage.js";
import PrintArtwork from "./PrintArtwork.jsx";
import { cachedDraft, draftKey, draftedExtras, fetchDraft, lookOf, payloadOf } from "../lib/draftCache.js";
import GarmentFlatPreview from "./GarmentFlatPreview.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import { PartThumb, PocketThumb, ExtraThumb, usePartThumbs } from "./PartThumbs.jsx";
import { POCKET_SHAPES } from "../lib/pocketShapes.js";
import { designToMaker } from "../lib/photoMatch.js";
import ReferencePhoto from "./ReferencePhoto.jsx";
import DescribeDesign from "./DescribeDesign.jsx";
import { MOTIF_PATTERNS } from "../lib/motifs.js";
import { fileToDataUrl, shrinkDataUrl } from "../lib/imageTrace.js";
import { sleeveAlignment } from "../lib/garmentFlat.js";

// A drag-and-drop pattern maker for shirts. The catalog of parts is fixed;
// dropping a part on the garment (or clicking it) sets that slot, and the
// pieces are redrafted by the backend and the illustration redrawn from
// them a moment later. Nothing is saved until "Generate mockup".

const SLOTS = [
  {
    key: "fit",
    label: "Cut",
    parts: [
      { value: "unisex", label: "Unisex", hint: "Relaxed, no dart" },
      { value: "male", label: "Male", hint: "Broader, no dart" },
      { value: "female", label: "Female", hint: "Fitted, bust dart" },
    ],
  },
  {
    key: "sleeve",
    label: "Sleeves",
    parts: [
      { value: "half", label: "Short", hint: "Half sleeve" },
      { value: "three_quarter", label: "3⁄4", hint: "Three-quarter" },
      { value: "full", label: "Long", hint: "Full, with cuff" },
    ],
  },
  {
    key: "sleeveFabric",
    label: "Sleeve fabric",
    parts: [
      { value: "main", label: "Main", hint: "Same fabric as the torso" },
      { value: "contrast", label: "Contrast", hint: "Cut from the second fabric — cuff too" },
    ],
  },
  {
    key: "colorBlock",
    label: "Colour block",
    parts: [
      { value: "none", label: "None", hint: "One fabric" },
      { value: "straight", label: "Straight", hint: "Top of front and back in the contrast fabric, straight across" },
      { value: "v", label: "V", hint: "Top in the contrast fabric, dipping to a V at centre front" },
    ],
  },
  {
    key: "collar",
    label: "Collar",
    parts: [
      { value: "none", label: "No collar", hint: "Round neck" },
      { value: "v_neck", label: "V-neck", hint: "Collarless V neckline" },
      { value: "convertible", label: "Point", hint: "Turn-down point" },
      { value: "spread", label: "Spread", hint: "Wide point" },
      { value: "peter_pan", label: "Peter Pan", hint: "Rounded" },
      { value: "standing", label: "Band", hint: "Mandarin / koko" },
    ],
  },
  {
    key: "front",
    label: "Front",
    parts: [
      { value: "placket", label: "Placket", hint: "Full length buttons" },
      { value: "half_placket", label: "Half placket", hint: "To mid-chest" },
      { value: "hidden_placket", label: "Hidden", hint: "Concealed buttons" },
      { value: "plain", label: "Plain", hint: "No placket" },
    ],
  },
  {
    key: "back",
    label: "Back",
    parts: [
      { value: "yoke", label: "Yoke", hint: "Shoulder yoke seam" },
      { value: "yoke_pleat", label: "Yoke + pleat", hint: "Yoke with a box pleat at centre back below it" },
      { value: "plain", label: "Plain", hint: "One panel" },
    ],
  },
  {
    key: "hem",
    label: "Hem",
    parts: [
      { value: "curved", label: "Curved", hint: "Shirttail" },
      { value: "straight", label: "Straight", hint: "Flat hem" },
    ],
  },
  {
    key: "trim",
    label: "Trim",
    parts: [
      { value: "none", label: "None", hint: "Self-fabric collar / neckline" },
      { value: "contrast", label: "Contrast", hint: "Piping or binding in an accent colour" },
    ],
  },
  {
    key: "bands",
    label: "Motif bands",
    multi: true,
    parts: [
      { value: "side", label: "Side panel", hint: "Insert panel down one side, shoulder to hem" },
      { value: "centre", label: "Streak", hint: "One band down the center front, collar to hem" },
      { value: "double", label: "2 streaks", hint: "Two bands down the front" },
      { value: "chest", label: "Chest band", hint: "A band across the chest" },
      { value: "shoulder", label: "Shoulders", hint: "A band across the shoulders" },
      { value: "hem", label: "Hem band", hint: "A border round the hem" },
      { value: "arms", label: "Arm bands", hint: "A band round each arm" },
    ],
  },
  { key: "pattern", label: "Motif pattern", parts: MOTIF_PATTERNS },
];

// The motif bands' names, for the pattern's "apply to" chips.
const BAND_LABELS = Object.fromEntries((SLOTS.find((s) => s.key === "bands")?.parts || []).map((p) => [p.value, p.label]));

const BOTTOM_SLOTS = [
  { key: "trouserWaist", label: "Waist", parts: [{ value: "band", label: "Waistband", hint: "Fitted band with belt loops, darts and a fly" }, { value: "elastic", label: "Elastic", hint: "Pull-on with elastic and drawstring" }] },
  { key: "leg", label: "Leg", parts: [{ value: "slim", label: "Slim", hint: "Narrow hem" }, { value: "straight", label: "Straight", hint: "Standard hem" }, { value: "wide", label: "Wide", hint: "Roomy hem" }] },
  { key: "frontPocket", label: "Front pockets", parts: [{ value: "slant", label: "Slant", hint: "Side-slant pockets" }, { value: "none", label: "None", hint: "No front pockets" }] },
  { key: "backPocket", label: "Back pockets", parts: [{ value: "welt", label: "Welt", hint: "Button welt pockets" }, { value: "patch", label: "Patch", hint: "Sewn-on pockets" }, { value: "none", label: "None", hint: "No back pockets" }] },
  { key: "beltLoops", label: "Belt loops", parts: [{ value: "loops", label: "Loops", hint: "With belt loops" }, { value: "none", label: "None", hint: "No belt loops" }] },
  { key: "fly", label: "Front closure", parts: [{ value: "fly", label: "Zip fly", hint: "Fly with facing" }, { value: "plain", label: "Plain", hint: "No fly" }] },
  { key: "stripe", label: "Side stripe", parts: [{ value: "none", label: "None", hint: "Plain side seam" }, { value: "side", label: "Stripe", hint: "Contrast stripe down each side seam" }] },
];

const SHORTS_LENGTH = { key: "length", label: "Length", parts: [{ value: "mini", label: "Mini", hint: "10 cm inseam" }, { value: "short", label: "Short", hint: "18 cm inseam" }, { value: "knee", label: "Knee", hint: "32 cm inseam" }] };

const MERCH_ITEMS = [
  { value: "tote_bag", label: "Tote bag", hint: "Bags" },
  { value: "drawstring_bag", label: "Drawstring", hint: "Bags" },
  { value: "pouch", label: "Pouch", hint: "Bags" },
  { value: "apron", label: "Apron", hint: "Bags" },
  { value: "bucket_hat", label: "Bucket hat", hint: "Headwear" },
  { value: "headband", label: "Headband", hint: "Headwear" },
  { value: "patch", label: "Patch", hint: "Flat items" },
  { value: "lanyard", label: "Lanyard", hint: "Flat items" },
  { value: "banner", label: "Banner", hint: "Flat items" },
];
const MERCH_SIZES = { key: "mSize", label: "Size", parts: [{ value: "small", label: "Small", hint: "80%" }, { value: "medium", label: "Medium", hint: "Standard" }, { value: "large", label: "Large", hint: "125%" }] };
// Item-specific slots; the first part of each is that slot's default.
const MERCH_SLOTS = {
  tote_bag: [
    { key: "mShape", label: "Body", parts: [{ value: "square", label: "Square", hint: "Square corners" }, { value: "rounded", label: "Rounded", hint: "Rounded base" }] },
    { key: "mStrap", label: "Handles", parts: [{ value: "long", label: "Long", hint: "Shoulder handles" }, { value: "short", label: "Short", hint: "Hand handles" }, { value: "none", label: "None", hint: "No handles" }] },
    { key: "mBottom", label: "Base", parts: [{ value: "flat", label: "Flat", hint: "Flat seam" }, { value: "gusset", label: "Gusset", hint: "Boxed base" }] },
    { key: "mPocket", label: "Pocket", parts: [{ value: "none", label: "None", hint: "No pocket" }, { value: "patch", label: "Patch", hint: "Sewn-on pocket" }] },
  ],
  drawstring_bag: [
    { key: "mStrap", label: "Cord", parts: [{ value: "cord", label: "Cord", hint: "Drawstring" }, { value: "none", label: "None", hint: "No cord" }] },
    { key: "mPocket", label: "Pocket", parts: [{ value: "none", label: "None", hint: "No pocket" }, { value: "patch", label: "Patch", hint: "Sewn-on pocket" }] },
  ],
  pouch: [{ key: "mClosure", label: "Closure", parts: [{ value: "zip", label: "Zip", hint: "Zip top" }, { value: "flap", label: "Flap", hint: "Flap over" }] }],
  apron: [
    { key: "mShape", label: "Style", parts: [{ value: "full", label: "Waist", hint: "Waist apron" }, { value: "bib", label: "Bib", hint: "With bib and neck strap" }] },
    { key: "mPocket", label: "Pocket", parts: [{ value: "none", label: "None", hint: "No pocket" }, { value: "patch", label: "Patch", hint: "Front pocket" }] },
  ],
  bucket_hat: [{ key: "mBrim", label: "Brim", parts: [{ value: "short", label: "Short", hint: "5 cm brim" }, { value: "wide", label: "Wide", hint: "8 cm brim" }, { value: "none", label: "None", hint: "Brimless" }] }],
  patch: [{ key: "mShape", label: "Shape", parts: [{ value: "rect", label: "Rectangle", hint: "Square corners" }, { value: "rounded", label: "Rounded", hint: "Rounded corners" }, { value: "circle", label: "Circle", hint: "Round" }, { value: "shield", label: "Shield", hint: "Badge shape" }] }],
  banner: [{ key: "mShape", label: "Shape", parts: [{ value: "rect", label: "Rectangle", hint: "Pole channel" }, { value: "pennant", label: "Pennant", hint: "Triangle" }] }],
};
const MERCH_DEFAULT = { mShape: "", mStrap: "", mPocket: "none", mBottom: "flat", mBrim: "short", mClosure: "zip" };
const MERCH_KEY = { mSize: "size", mShape: "shape", mStrap: "strap", mPocket: "pocket", mBottom: "bottom", mBrim: "brim", mClosure: "closure" };

const SKIRT_SLOTS = [
  { key: "skStyle", label: "Style", parts: [{ value: "straight", label: "Straight", hint: "Hangs from the hip" }, { value: "a_line", label: "A-line", hint: "Gently widening" }, { value: "flared", label: "Flared", hint: "Wide hem" }] },
  { key: "skWaist", label: "Waist", parts: [{ value: "band", label: "Waistband", hint: "Darts, band and back zip" }, { value: "elastic", label: "Elastic", hint: "Pull-on, no darts" }] },
  { key: "skPocket", label: "Pockets", parts: [{ value: "none", label: "None", hint: "No pockets" }, { value: "side", label: "Side", hint: "In-seam pockets" }] },
];
const SKIRT_KEY = { skStyle: "style", skWaist: "waist", skPocket: "pocket" };

const isSkirt = (garmentType) => garmentType === "skirt";
const isMerch = (garmentType) => garmentType === "other";
const isBottoms = (garmentType) => garmentType === "pants" || garmentType === "shorts";

// Which slots a garment type has, and which parts of them it allows.
function slotsFor(garmentType, value) {
  if (isSkirt(garmentType)) return SKIRT_SLOTS;
  if (isMerch(garmentType)) {
    const item = value.merch.item;
    return [{ key: "mItem", label: "Item", parts: MERCH_ITEMS }, MERCH_SIZES, ...(MERCH_SLOTS[item] || [])];
  }
  if (isBottoms(garmentType)) {
    // A pull-on has no belt loops or fly.
    const slots = value.trouserWaist === "elastic" ? BOTTOM_SLOTS.filter((s) => s.key !== "beltLoops" && s.key !== "fly") : BOTTOM_SLOTS;
    return garmentType === "shorts" ? [SHORTS_LENGTH, ...slots] : slots;
  }
  const polo = garmentType === "polo_shirt";
  const vNeck = !value.collarEnabled && value.neckline === "v_neck";
  const hasCollar = garmentType === "school_shirt" || (garmentType === "uniform_shirt" && value.collarEnabled);
  return SLOTS.map((slot) => {
    if (slot.key === "collar") {
      if (polo) return null;
      // A school shirt always has a collar; a PE shirt never (but can have a V-neck).
      if (garmentType === "school_shirt") return { ...slot, parts: slot.parts.filter((p) => p.value !== "none" && p.value !== "v_neck") };
      if (garmentType === "pe_shirt") return { ...slot, parts: slot.parts.filter((p) => p.value === "none" || p.value === "v_neck") };
      return slot;
    }
    if (slot.key === "front") return (hasCollar || vNeck) && !polo ? slot : null;
    // A polo is knit in one piece; a side insert panel already splits the front.
    if (slot.key === "colorBlock") return polo || value.motifs?.includes("side") ? null : slot;
    if (slot.key === "trim") {
      if (!(hasCollar || vNeck || polo)) return null;
      // A polo's collar is knit rib, not a bound edge — "contrast" there
      // recolours the collar (and cuff, via Sleeve fabric) itself.
      if (!polo) return slot;
      return { ...slot, parts: slot.parts.map((p) => (p.value === "contrast" ? { ...p, hint: "Collar in an accent colour" } : p)) };
    }
    if (slot.key === "pattern") return value.motifs.length > 0 ? slot : null;
    if (slot.key === "back" || slot.key === "hem") return polo ? null : slot;
    return slot;
  }).filter(Boolean);
}

function currentPart(slotKey, value) {
  if (slotKey.startsWith("sk")) return value.skirt[SKIRT_KEY[slotKey]];
  if (slotKey === "mItem") return value.merch.item;
  if (slotKey.startsWith("m")) return value.merch[MERCH_KEY[slotKey]] || MERCH_SLOTS[value.merch.item]?.find((s) => s.key === slotKey)?.parts[0].value || MERCH_DEFAULT[slotKey];
  switch (slotKey) {
    case "fit": return value.gender;
    case "sleeve": return value.sleeveStyle;
    case "sleeveFabric": return value.sleeveFabric || "main";
    case "colorBlock": return value.colorBlock || "none";
    case "collar": return value.collarEnabled ? value.collarStyle : value.neckline === "v_neck" ? "v_neck" : "none";
    case "trim": return value.trim;
    case "bands": return value.motifs;
    case "pattern": return value.pattern || "solid";
    case "front": return value.frontStyle;
    case "back": return value.backStyle;
    case "hem": return value.hemStyle;
    case "leg": return value.legStyle;
    case "length": return value.shortsLength;
    case "frontPocket": return value.frontPocket;
    case "backPocket": return value.backPocket;
    case "beltLoops": return value.beltLoops;
    case "fly": return value.fly;
    case "trouserWaist": return value.trouserWaist;
    case "stripe": return value.stripe;
    default: return null;
  }
}

function patchFor(slotKey, part) {
  if (slotKey.startsWith("sk")) return { skirt: { [SKIRT_KEY[slotKey]]: part } };
  if (slotKey === "mItem") return { merch: { item: part, shape: "", strap: "", pocket: "none", bottom: "flat", brim: "short", closure: "zip", width: 0, height: 0 } };
  if (slotKey.startsWith("m")) return { merch: { [MERCH_KEY[slotKey]]: part } };
  switch (slotKey) {
    case "fit": return { gender: part };
    case "sleeve": return { sleeveStyle: part };
    case "sleeveFabric": return { sleeveFabric: part };
    case "colorBlock": return { colorBlock: part };
    case "collar":
      if (part === "none") return { collarEnabled: false, neckline: "round" };
      if (part === "v_neck") return { collarEnabled: false, neckline: "v_neck" };
      return { collarEnabled: true, collarStyle: part, neckline: "round" };
    case "trim": return { trim: part };
    case "pattern": return { pattern: part };
    case "front": return { frontStyle: part };
    case "back": return { backStyle: part };
    case "hem": return { hemStyle: part };
    case "leg": return { legStyle: part };
    case "length": return { shortsLength: part };
    case "frontPocket": return { frontPocket: part };
    case "backPocket": return { backPocket: part };
    case "beltLoops": return { beltLoops: part };
    case "fly": return { fly: part };
    case "trouserWaist": return { trouserWaist: part };
    case "stripe": return { stripe: part };
    default: return {};
  }
}

// Which part list each area of the drawing belongs to.
const SEGMENT_SLOT = {
  collar: "collar",
  cuffs: "sleeve",
  left_sleeve: "sleeve",
  right_sleeve: "sleeve",
  center_front: "front",
  left_chest: "front",
  right_chest: "front",
  back: "back",
  left_hem: "hem",
  right_hem: "hem",
};
const BOTTOM_SEGMENT_SLOT = {
  waistband: "trouserWaist",
  left_leg: "leg",
  right_leg: "leg",
  legs: "leg",
  back: "backPocket",
  center_front: "fly",
  left_hem: "length",
  right_hem: "length",
};

// The request the backend drafts from, following the same rules as
// "Generate mockup" (a polo always has its knit collar, a school shirt
// always a collar, a PE shirt never).
function previewPayload(garmentType, value, size, accessories) {
  if (isSkirt(garmentType)) return { skirt: value.skirt, sizes: [size], accessories };
  if (isMerch(garmentType)) return { merch: value.merch, sizes: [size], accessories };
  if (isBottoms(garmentType)) {
    return { trousers: { length: value.shortsLength, legStyle: value.legStyle, frontPocket: value.frontPocket, backPocket: value.backPocket, beltLoops: value.beltLoops, fly: value.fly, waist: value.trouserWaist, stripe: value.stripe }, sizes: [size], accessories };
  }
  const payload = {
    gender: value.gender,
    fit: value.fit || "",
    sleevePlacket: value.sleevePlacket || "",
    sleeveStyle: value.sleeveStyle,
    sleeveFabric: value.sleeveFabric,
    colorBlock: value.colorBlock === "none" ? "" : value.colorBlock,
    dartPosition: value.dartPosition,
    frontStyle: value.frontStyle,
    backStyle: value.backStyle,
    hemStyle: value.hemStyle,
    neckline: value.neckline,
    trim: value.trim,
    panel: value.motifs.includes("side") ? "side" : "none",
    motifs: value.motifs.filter((m) => m !== "side"),
    pattern: value.pattern,
    // Only the bands that are on keep their own pattern.
    motifPatterns: Object.fromEntries(Object.entries(value.motifPatterns || {}).filter(([band]) => value.motifs?.includes(band))),
    sizes: [size],
    accessories,
  };
  if (garmentType === "uniform_shirt") payload.collar = value.collarEnabled;
  if (garmentType === "school_shirt" || (garmentType === "uniform_shirt" && value.collarEnabled)) payload.collarStyle = value.collarStyle;
  if (garmentType === "polo_shirt") {
    payload.collar = true;
    payload.collarStyle = "polo";
  }
  // The shop's uniform block: only sent when chosen, so a classic design's
  // drafts (and their cache) stay exactly as they were.
  if (value.block && hasBlocks(garmentType)) {
    payload.block = value.block;
    payload.konveksi = value.konveksi || {};
  }
  return payload;
}

// The woven shirts can be cut in either block; polo and PE shirts are knits.
const hasBlocks = (garmentType) => garmentType === "school_shirt" || garmentType === "uniform_shirt";

const EXTRA_LABELS = { pocket: "Pocket", embroidery: "Embroidery", sablon: "Sablon" };
const DEFAULT_POCKET = { width: 10, height: 11.5 };
// Pocket presets in the extras menu: a chest patch, a smaller pocket, a slim pen pocket.
const POCKET_PRESETS = [
  { key: "chest", label: "Chest pocket", hint: "10 × 11.5 cm", extra: { shape: "classic", width: 10, height: 11.5 } },
  { key: "small", label: "Small pocket", hint: "7 × 8 cm", extra: { shape: "classic", width: 7, height: 8 } },
  { key: "pen", label: "Pen pocket", hint: "3.5 × 13 cm — sleeve or chest", extra: { shape: "square", width: 3.5, height: 13 } },
];

// Where a click on a tile puts a new extra (clicking the preview puts it exactly
// where you click; dragging a tile drops it there too).
function defaultSegment(garmentType, type, presetKey) {
  if (garmentType === "other") return "center_front";
  if (garmentType === "skirt") return type === "sablon" ? "back" : "center_front";
  if (garmentType === "pants" || garmentType === "shorts") return type === "pocket" && presetKey !== "pen" ? "back" : type === "sablon" ? "back" : "left_leg";
  if (type === "pocket") return presetKey === "pen" ? "left_sleeve" : "left_chest";
  return type === "embroidery" ? "right_chest" : "back";
}

// Which face of a sleeve an extra sits on, from the drawing it was placed on.
function sleeveFace(a) {
  if (!/sleeve/.test(a.segment)) return "";
  if (a.view === "back") return " (back)";
  if (a.view === "left" || a.view === "right") return " (outside)";
  return " (front)";
}

// An angle turned by `by` degrees, kept within -180..180.
function turnBy(rotation, by) {
  let r = ((rotation || 0) + by) % 360;
  if (r > 180) r -= 360;
  if (r <= -180) r += 360;
  return r;
}

// A logo is usually embroidered on a shirt or polo (the school badge) and
// screen printed on anything else (a PE shirt, merch).
const EMBROIDERED_LOGO = new Set(["school_shirt", "uniform_shirt", "polo_shirt"]);
const logoType = (garmentType) => (EMBROIDERED_LOGO.has(garmentType) ? "embroidery" : "sablon");

// Where a logo goes when no spot was picked: the left chest of a top (the
// right chest when the left already has something, a pocket say), else the
// garment's usual print spot.
function logoSegment(garmentType, accessories) {
  if (isBottoms(garmentType) || isSkirt(garmentType) || isMerch(garmentType)) return defaultSegment(garmentType, "sablon");
  return accessories.some((a) => a.segment === "left_chest") ? "right_chest" : "left_chest";
}

const toHalfCm = (v) => Math.max(1, Math.round(v * 2) / 2);

function startExtraDrag(e, extra) {
  e.dataTransfer.setData("text/plain", JSON.stringify({ slot: "extra", ...extra }));
  e.dataTransfer.effectAllowed = "copy";
}

// How roomy a shirt is round the chest, on top of the size chart's ease —
// konveksi pick it per design ("medium fit"), not per person.
const FITS = [
  { value: "", label: "As chart", hint: "Only the size chart's wearing ease" },
  { value: "regular", label: "Regular", hint: "+6 cm: a quarter of the chest + 3 cm a panel, the usual kemeja fit" },
  { value: "loose", label: "Loose", hint: "+14 cm: the Bunka shirt block, half the chest + 10 cm" },
];

const LIVE_KEYS = ["chest", "length", "shoulder", "sleeve"];

// The shirt's cut. The shop's block is Dad's own uniform pattern.
const BLOCKS = [
  { value: "", label: "Classic", hint: "The classic shirt block, sized from each size's body measurements" },
  { value: "konveksi", label: "Konveksi uniform", hint: "The shop's own uniform cut (Dad's size M pattern), sized by the shop chart" },
];
const CHART_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];
// Picking the shop's block puts on the rest of Dad's uniform too: a short
// sleeve, the stand collar, the lidah front, a plain back, a straight hem.
// Any of them can still be changed after.
const KONVEKSI_UNIFORM = { sleeveStyle: "half", collarEnabled: true, collarStyle: "standing", frontStyle: "hidden_placket", backStyle: "plain", hemStyle: "straight" };

// A number box that keeps what's being typed and passes on only a number in
// range, so typing "104" doesn't draft a 1cm and a 10cm shirt on the way.
function CmField({ id, label, title, value, min, max, onCommit }) {
  const [text, setText] = useState(value ? String(value).replace(".", ",") : "");
  const [focused, setFocused] = useState(false);
  const shown = focused ? text : value ? String(value).replace(".", ",") : "";
  return (
    <label className="pm-cm" htmlFor={id} title={title}>
      <span>{label}</span>
      <input
        id={id}
        inputMode="decimal"
        value={shown}
        onFocus={() => { setText(shown); setFocused(true); }}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value.replace(",", "."));
          if (Number.isFinite(n) && n >= min && n <= max) onCommit(n);
        }}
      />
      <em>cm</em>
    </label>
  );
}

// The shop chart: one size anchored (Dad's numbers unless changed) and every
// size up and down graded from it, as the backend drafts them.
function KonveksiChart({ value, chart, onChange, sizeLabel }) {
  const k = value || {};
  const base = CHART_SIZES.includes(k.baseSize) ? k.baseSize : "M";
  const row = (chart || []).find((r) => r.size === base);
  const changed = Boolean(k.chest || k.length);
  return (
    <div className="pm-slot">
      <div className="pm-slot-title">Shop size chart</div>
      <p className="pm-hint">Dad's size M, each size 3 cm wider laid flat (6 cm round). Change one size's chest or length and every size up and down follows.</p>
      <div className="pm-konveksi-base">
        <label className="pm-cm" htmlFor="pm-k-base">
          <span>Size</span>
          <select id="pm-k-base" value={base} onChange={(e) => onChange({ baseSize: e.target.value })}>
            {CHART_SIZES.map((sz) => (
              <option key={sz} value={sz}>{sz}</option>
            ))}
          </select>
        </label>
        <CmField key={`c-${base}`} id="pm-k-chest" label="Chest" value={k.chest || row?.chest} min={60} max={170} onCommit={(chest) => onChange({ ...k, baseSize: base, chest })} />
        <CmField key={`l-${base}`} id="pm-k-length" label="Length" title="From the shoulder by the neck down to the hem" value={k.length || row?.length} min={45} max={110} onCommit={(length) => onChange({ ...k, baseSize: base, length })} />
        {changed && (
          <button type="button" className="link-btn" onClick={() => onChange({ baseSize: base })}>Shop's numbers</button>
        )}
      </div>
      {chart?.length > 0 && (
        <div className="pm-konveksi-table-wrap">
          <table className="pm-konveksi-table">
            <thead>
              <tr><th>Size</th><th>Chest</th><th>Flat</th><th>Length</th><th>Shoulder</th><th>Sleeve</th></tr>
            </thead>
            <tbody>
              {chart.map((r) => (
                <tr key={r.size} className={`${r.size === base ? "is-base" : ""}${r.size === sizeLabel ? " is-shown" : ""}`}>
                  <th scope="row">{r.size}</th>
                  <td>{r.chest.toFixed(1)}</td>
                  <td>{(r.chest / 2).toFixed(1)}</td>
                  <td>{r.length.toFixed(1)}</td>
                  <td>{r.shoulder.toFixed(1)}</td>
                  <td>{r.sleeve.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="pm-hint">Finished sizes in cm; the length is from the shoulder by the neck down to the hem. Sizes named XS to 7XL in the size chart are cut from this chart; any other size by its chest plus 6 cm.</p>
    </div>
  );
}

// How the opening above a cuff is finished.
const SLEEVE_OPENINGS = [
  { value: "", label: "Pointed placket", hint: "Tower placket with a point, as the shop makes kemeja" },
  { value: "bound", label: "Bound slit", hint: "A narrow strip binding the slit; quicker to sew" },
];

// The shirt's Fit, and what the drafted size comes out at: the finished
// measurements a size chart lists, and whether its seams all check out.
function FitPicker({ value, onChange, summary, sizeLabel, chartFit }) {
  const shown = (summary?.finished || []).filter((f) => LIVE_KEYS.includes(f.key));
  const checks = summary?.checks || [];
  const failing = checks.filter((c) => !c.ok);
  return (
    <div className="pm-slot">
      <div className="pm-slot-title">Fit</div>
      {chartFit ? (
        <p className="pm-hint">Set by the shop size chart below.</p>
      ) : (
      <div className="pm-fit-chips" role="radiogroup" aria-label="Fit">
        {FITS.map((f) => (
          <button
            type="button"
            key={f.value || "chart"}
            role="radio"
            aria-checked={value === f.value}
            className={`pm-ref-chip${value === f.value ? " pm-ref-chip-on" : ""}`}
            onClick={() => onChange(f.value)}
            title={f.hint}
          >
            {f.label}
          </button>
        ))}
      </div>
      )}
      {shown.length > 0 && (
        <div className="pm-live">
          <div className="pm-live-head">Finished size {sizeLabel}</div>
          <dl className="pm-live-grid">
            {shown.map((f) => (
              <div key={f.key} title={f.local}>
                <dt>{f.label.replace(", shoulder to hem", "")}</dt>
                <dd>{f.cm.toFixed(1)}</dd>
              </div>
            ))}
          </dl>
          {checks.length > 0 && (
            <p className={`pm-live-checks ${failing.length ? "is-bad" : "is-ok"}`}>
              {failing.length ? `${failing.length} of ${checks.length} seam checks fail: ${failing[0].label.toLowerCase()}` : `All ${checks.length} seam checks pass`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// The modifier key shown in shortcut hints: ⌘ on a Mac, Ctrl elsewhere.
const MOD_KEY = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl+";

// The preview's zoom, in percent: − and + step through it, the number resets it.
const ZOOM_MIN = 60;
const ZOOM_MAX = 220;
const ZOOM_STEP = 20;

export default function PatternMaker({ orderId, garmentType, sizes, value, onChange, dartPositions, accessories = [], onAddAccessory, onRemoveAccessory, onUpdateAccessory, onMirrorAccessory, onDragAccessory, colorHint, onColorHint, fabricColors, fabrics, fabricName, onFabricPick, referencePhoto, onReferencePhoto, history }) {
  // The draft on screen. A new choice shows as soon as its draft is in (at
  // once when it was drafted before); until then the last one stays up.
  const [shownKey, setShownKey] = useState(null);
  const [error, setError] = useState(null);
  const [selectedExtra, setSelectedExtra] = useState(null); // the extra picked on the drawing
  const [flashSlot, setFlashSlot] = useState(null); // the part list jumped to from the drawing
  const [dragging, setDragging] = useState(null); // { slot, value }
  const [over, setOver] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewMode, setViewMode] = useState("both"); // both | front | back
  const [zoom, setZoom] = useState(100);
  // Which band the Motif pattern tiles set: "all", or one band's own pattern.
  const [patternTarget, setPatternTarget] = useState("all");
  const [partsOpen, setPartsOpen] = useState(true);
  const [photo, setPhoto] = useState(referencePhoto ? { url: referencePhoto } : null); // the reference photo: { url }, kept with the order
  // The photo panel folded away (the photo stays with the order). On a phone
  // it starts folded: there it fills the screen above the design.
  const [photoHidden, setPhotoHidden] = useState(() => window.matchMedia?.("(max-width: 760px)").matches ?? false);
  const [photoResult, setPhotoResult] = useState(null); // what a reader made of it
  const [matching, setMatching] = useState(false);
  const [matchError, setMatchError] = useState(null);
  const [readerStatus, setReaderStatus] = useState(null); // who can read photos: { provider, model, hint }
  const [describeOpen, setDescribeOpen] = useState(false); // the "describe it in words" panel
  const [describing, setDescribing] = useState(false);
  const [describeResult, setDescribeResult] = useState(null);
  const [describeError, setDescribeError] = useState(null);
  const [startOpen, setStartOpen] = useState(false); // the "Start from" menu: words or a photo
  const [logoBusy, setLogoBusy] = useState(null); // the print whose logo is uploading ("new" for a new one)
  const [logoNote, setLogoNote] = useState(null); // { text, error } about the last logo added
  // The file each uploaded logo came from, this session, so a cleared
  // background can be put back without picking the file again.
  const [logoFiles, setLogoFiles] = useState({}); // image id -> { file, backgroundRemoved }
  const startRef = useRef(null);
  const seq = useRef(0);
  // The next redraft is for a click (a tile, a chip): send it at once rather
  // than waiting for more typing or sliding.
  const immediate = useRef(false);
  const hoverTimer = useRef(null);

  // A click anywhere outside the "Start from" menu closes it.
  useEffect(() => {
    if (!startOpen) return undefined;
    const close = (e) => {
      if (!startRef.current?.contains(e.target)) setStartOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [startOpen]);

  const hasSleeveViews = !isBottoms(garmentType) && !isSkirt(garmentType) && !isMerch(garmentType);
  const slots = slotsFor(garmentType, value);
  const size = isMerch(garmentType) ? sizes?.[0] || { label: "One size", quantity: 1, measurements: {} } : sizes?.[0];
  const keyFor = (v) => (size ? draftKey(orderId, previewPayload(garmentType, v, size, draftedExtras(accessories))) : null);
  const key = keyFor(value);
  const hit = cachedDraft(key);
  // On screen: this choice's draft when it is in, else the last one shown.
  const shown = hit ? { draft: hit, key } : shownKey && cachedDraft(shownKey) ? { draft: cachedDraft(shownKey), key: shownKey } : null;
  const shownPieces = shown ? shown.draft.pieces[size?.label] || Object.values(shown.draft.pieces)[0] || null : null;
  const liveSummary = shown ? shown.draft.summaries?.[size?.label] || Object.values(shown.draft.summaries || {})[0] || null : null;
  const look = shown ? lookOf(payloadOf(shown.key)) : null;
  const drawing = Boolean(key) && !hit;
  const thumbFor = usePartThumbs(orderId, size, slots.flatMap((s) => s.parts.map((p) => ({ slot: s.key, value: p.value }))), garmentType, isMerch(garmentType) ? value.merch : isSkirt(garmentType) ? value.skirt : undefined);

  // Draft the current choices: at once after a click, shortly after the last
  // keystroke or slider move otherwise. A choice drafted before is already on
  // screen; it only needs remembering as the last one shown.
  useEffect(() => {
    if (!key) return undefined;
    const mine = ++seq.current;
    const now = immediate.current;
    immediate.current = false;
    const timer = setTimeout(
      () => {
        fetchDraft(key, orderId)
          .then(() => {
            if (mine !== seq.current) return; // a newer choice has been made
            setShownKey(key);
            setError(null);
          })
          .catch((e) => {
            if (mine === seq.current) setError(e.message);
          });
      },
      cachedDraft(key) || now ? 0 : 120,
    );
    return () => clearTimeout(timer);
  }, [key, orderId]);

  // The choices a tile would make, for drafting it before it is clicked.
  function valueWith(patch) {
    const next = { ...value, ...patch };
    if (patch.merch) next.merch = { ...value.merch, ...patch.merch };
    if (patch.skirt) next.skirt = { ...value.skirt, ...patch.skirt };
    return next;
  }

  // Hovering a tile drafts what clicking it would show, so the click redraws
  // at once. A short pause first, so sweeping across tiles drafts nothing.
  function prefetch(slotKey, part) {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
      const k = keyFor(valueWith(pickPatch(slotKey, part)));
      if (k && !cachedDraft(k)) fetchDraft(k, orderId).catch(() => {});
    }, 60);
  }

  // A choice made by clicking: drafted at once, and, when its draft is
  // already in, eased in with a short cross-fade.
  function choose(patch) {
    immediate.current = true;
    const ready = cachedDraft(keyFor(valueWith(patch)));
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (ready && document.startViewTransition && !calm) {
      // A quicker next click cuts this fade short, which is fine: say nothing.
      document.startViewTransition(() => flushSync(() => onChange(patch))).ready.catch(() => {});
    } else onChange(patch);
  }

  // What picking part in slotKey changes.
  function pickPatch(slotKey, part) {
    if (slotKey === "bands") {
      // Bands can be combined; one streak or two, not both.
      const has = value.motifs.includes(part);
      let next = has ? value.motifs.filter((m) => m !== part) : [...value.motifs, part];
      if (!has && part === "centre") next = next.filter((m) => m !== "double");
      if (!has && part === "double") next = next.filter((m) => m !== "centre");
      const kept = Object.fromEntries(Object.entries(value.motifPatterns || {}).filter(([band]) => next.includes(band)));
      return { motifs: next, motifPatterns: kept };
    }
    if (slotKey === "pattern") {
      // One pattern for every band, or just the band picked above the tiles.
      if (patternTarget === "all") return { pattern: part, motifPatterns: {} };
      return { motifPatterns: { ...(value.motifPatterns || {}), [patternTarget]: part } };
    }
    return patchFor(slotKey, part);
  }

  function apply(slotKey, part) {
    const patch = pickPatch(slotKey, part);
    choose(patch);
    if (slotKey === "bands" && !patch.motifs.includes(patternTarget)) setPatternTarget("all");
  }

  function onDragStart(e, slot, part) {
    e.dataTransfer.setData("text/plain", JSON.stringify({ slot, value: part }));
    e.dataTransfer.effectAllowed = "copy";
    setDragging({ slot, value: part });
  }

  function onDrop(e) {
    e.preventDefault();
    setOver(false);
    setDragging(null);
    const file = [...(e.dataTransfer.files || [])].find((f) => /^image\//.test(f.type));
    if (file) {
      addLogo(file);
      return;
    }
    try {
      const { slot, value: part } = JSON.parse(e.dataTransfer.getData("text/plain"));
      if (slots.some((s) => s.key === slot)) apply(slot, part);
    } catch {
      // Not one of our parts — ignore.
    }
  }

  // Loads a reference photo to match by eye and immediately asks whoever can
  // read it (the Claude API or a local model) to match it — a photo you just
  // picked is a photo you want matched, not a separate step to remember.
  async function loadPhoto(file) {
    if (!file) return;
    setMatchError(null);
    try {
      const { dataUrl } = await fileToDataUrl(file, 1400);
      setPhoto({ url: dataUrl });
      setPhotoHidden(false);
      onReferencePhoto?.(dataUrl);
      setPhotoResult(null);
      const status = await api.photoStatus().catch(() => null);
      setReaderStatus(status);
      if (status?.provider && status.provider !== "none") await runMatch(dataUrl, status);
    } catch (e) {
      setMatchError(e.message);
    }
  }

  function pickColor(kind, color) {
    onColorHint?.({ [kind]: color });
  }

  // Puts a read design on the maker: sets the parts, replaces the pockets and
  // prints, and takes the colours. Returns what to show about it. `source` is
  // "photo" or "description" — see designToMaker.
  function applyDesign(design, source) {
    const result = designToMaker(design, garmentType, source);
    if (Object.keys(result.patch).length > 0) onChange(result.patch);
    if (!result.mismatch) {
      for (const a of accessories) onRemoveAccessory?.(a.id);
      for (const a of result.accessories) onAddAccessory?.(a.type, a.segment, undefined, a.extra);
    }
    if (result.colors.main || result.colors.accent) onColorHint?.({ ...result.colors });
    return { design, ...result };
  }

  // Has the available reader set the parts, pockets, prints and colours to
  // match photoUrl as closely as the catalog allows.
  async function runMatch(photoUrl, status) {
    setMatching(true);
    setMatchError(null);
    try {
      // A local model reads a smaller picture much faster and about as well.
      const design = await api.analyzePhoto(status?.provider === "ollama" ? await shrinkDataUrl(photoUrl, 768) : photoUrl);
      setPhotoResult(applyDesign(design, "photo"));
    } catch (e) {
      setMatchError(e.message);
    } finally {
      setMatching(false);
    }
  }

  // Turns a written description into a rough first design and applies it.
  async function describeDesign(text) {
    setDescribing(true);
    setDescribeError(null);
    try {
      setDescribeResult(applyDesign(await api.analyzeText(text), "description"));
    } catch (e) {
      setDescribeError(e.message);
    } finally {
      setDescribing(false);
    }
  }

  // Opening the panel finds out who can read a description, if the photo flow
  // hasn't already.
  function toggleDescribe() {
    setDescribeOpen((open) => !open);
    if (!readerStatus) api.photoStatus().then(setReaderStatus).catch(() => setReaderStatus(null));
  }

  // The manual "Match parts" button re-runs the match against whatever
  // photo and reader are already loaded — for a retry, or after changing
  // the fabric/trim colour picked from the photo.
  function matchPhoto() {
    if (!photo) return;
    return runMatch(photo.url, readerStatus);
  }

  // Gets a logo file ready and uploads it. Resolves to the print's fields:
  // the picture, its proportions (height / width) and its colours.
  async function uploadLogo(file, keepBackground = false) {
    const art = await prepareArtwork(file, { keepBackground });
    const { id } = await api.uploadArtwork(art.dataUrl);
    setLogoFiles((prev) => ({ ...prev, [id]: { file, backgroundRemoved: art.backgroundRemoved } }));
    return { image: id, aspect: art.aspect, inkColors: art.colors.length ? art.colors : undefined, fullColour: art.fullColour || undefined };
  }

  // Puts a logo on the garment where it was clicked or dropped
  // ({ segment, position, view }), or in the usual place for this garment.
  async function addLogo(file, placement) {
    if (!file || logoBusy) return;
    setLogoBusy("new");
    setLogoNote(null);
    try {
      const segment = placement?.segment || logoSegment(garmentType, accessories);
      const { aspect, ...art } = await uploadLogo(file);
      const type = logoType(garmentType);
      const id = onAddAccessory?.(type, segment, placement?.position, { ...art, ...printSize(segment, aspect), ...(placement?.view ? { view: placement.view } : {}) });
      if (id) setSelectedExtra(id);
      setLogoNote({ text: `Logo added as ${type === "sablon" ? "a sablon print" : "embroidery"} on the ${segment.replace(/_/g, " ")}. Drag it to move it; Extras changes its size, or makes it ${type === "sablon" ? "embroidery" : "a sablon print"}.` });
    } catch (e) {
      setLogoNote({ text: e.message, error: true });
    } finally {
      setLogoBusy(null);
    }
  }

  // A new logo for a print that is already on the garment. It keeps the width
  // it was given; a print that had no logo yet gets the usual size.
  async function replaceLogo(a, file, keepBackground = false) {
    if (!file || logoBusy) return;
    setLogoBusy(a.id);
    setLogoNote(null);
    try {
      const { aspect, ...art } = await uploadLogo(file, keepBackground);
      const size = a.image && a.width ? { width: a.width, height: toHalfCm(a.width * aspect) } : printSize(a.segment, aspect);
      onUpdateAccessory?.(a.id, { inkColors: undefined, fullColour: undefined, ...art, ...size, label: "" });
    } catch (e) {
      setLogoNote({ text: e.message, error: true });
    } finally {
      setLogoBusy(null);
    }
  }

  function addExtra(type, extra, presetKey) {
    const id = onAddAccessory?.(type, defaultSegment(garmentType, type, presetKey), undefined, extra);
    if (id) setSelectedExtra(id);
  }

  // The part list each area of the drawing is changed in: clicking the
  // collar on the drawing offers the collar tiles, and so on.
  function slotForSegment(segment) {
    const want = (isBottoms(garmentType) ? BOTTOM_SEGMENT_SLOT : SEGMENT_SLOT)[segment];
    return slots.find((sl) => sl.key === want) || null;
  }

  function jumpToPart(segment) {
    const slot = slotForSegment(segment);
    if (!slot) return;
    setPartsOpen(true);
    setFlashSlot(slot.key);
    // After the part list is shown again (when it was hidden).
    setTimeout(() => document.getElementById(`pm-slot-${slot.key}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 30);
    setTimeout(() => setFlashSlot((k) => (k === slot.key ? null : k)), 1800);
  }

  // "More" on an extra picked on the drawing: its full settings in Extras.
  function editExtra(id) {
    setSelectedExtra(id);
    setDrawerOpen(true);
    setTimeout(() => document.getElementById(`pm-extra-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 30);
  }
  const selected = accessories.some((a) => a.id === selectedExtra) ? selectedExtra : null;

  return (
    <div className={`pattern-maker${partsOpen ? "" : " pattern-maker-wide"}`}>
      {partsOpen && <div className="pm-palette">
        {!isBottoms(garmentType) && !isSkirt(garmentType) && !isMerch(garmentType) && (
          <>
            {hasBlocks(garmentType) && (
              <div className="pm-slot">
                <div className="pm-slot-title">Block</div>
                <div className="pm-fit-chips" role="radiogroup" aria-label="Block">
                  {BLOCKS.map((b) => (
                    <button
                      type="button"
                      key={b.value || "classic"}
                      role="radio"
                      aria-checked={(value.block || "") === b.value}
                      className={`pm-ref-chip${(value.block || "") === b.value ? " pm-ref-chip-on" : ""}`}
                      onClick={() => choose(b.value === "konveksi" && value.block !== "konveksi" ? { block: "konveksi", ...KONVEKSI_UNIFORM } : { block: b.value })}
                      title={b.hint}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <FitPicker value={value.fit || ""} onChange={(fit) => choose({ fit })} summary={liveSummary} sizeLabel={size?.label} chartFit={value.block === "konveksi" && hasBlocks(garmentType)} />
            {value.block === "konveksi" && hasBlocks(garmentType) && (
              <KonveksiChart value={value.konveksi} chart={shown?.draft?.konveksiChart} onChange={(konveksi) => onChange({ konveksi })} sizeLabel={size?.label} />
            )}
          </>
        )}
        {!isBottoms(garmentType) && !isSkirt(garmentType) && !isMerch(garmentType) && garmentType !== "polo_shirt" && value.sleeveStyle !== "half" && (
          <div className="pm-slot">
            <div className="pm-slot-title">Sleeve opening</div>
            <div className="pm-fit-chips" role="radiogroup" aria-label="Sleeve opening">
              {SLEEVE_OPENINGS.map((o) => {
                const on = (value.sleevePlacket || "") === o.value;
                return (
                  <button type="button" key={o.value || "tower"} role="radio" aria-checked={on} className={`pm-ref-chip${on ? " pm-ref-chip-on" : ""}`} onClick={() => choose({ sleevePlacket: o.value })} title={o.hint}>
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {slots.map((slot) => (
          <div key={slot.key} id={`pm-slot-${slot.key}`} className={`pm-slot${flashSlot === slot.key ? " pm-slot-flash" : ""}`}>
            <div className="pm-slot-title">{slot.label}</div>
            <div className="pm-parts">
              {slot.key === "pattern" && value.motifs.length > 1 && (
                <div className="pm-pattern-targets" role="group" aria-label="Apply the pattern to">
                  {["all", ...value.motifs].map((band) => {
                    const label = band === "all" ? "All bands" : BAND_LABELS[band] || band;
                    const own = band !== "all" && value.motifPatterns?.[band];
                    return (
                      <button
                        type="button"
                        key={band}
                        className={`pm-ref-chip${patternTarget === band ? " pm-ref-chip-on" : ""}`}
                        onClick={() => setPatternTarget(band)}
                        title={band === "all" ? "Pick one pattern for every band" : `Pick a pattern for the ${label.toLowerCase()} only`}
                      >
                        {label}
                        {own ? ` · ${MOTIF_PATTERNS.find((p) => p.value === own)?.label || own}` : ""}
                      </button>
                    );
                  })}
                </div>
              )}
              {slot.parts.map((part) => {
                const current = slot.key === "pattern" && patternTarget !== "all" ? value.motifPatterns?.[patternTarget] || value.pattern || "solid" : currentPart(slot.key, value);
                const active = Array.isArray(current) ? current.includes(part.value) : current === part.value;
                return (
                  <button
                    type="button"
                    key={part.value}
                    draggable
                    className={`pm-tile${active ? " pm-tile-active" : ""}`}
                    onDragStart={(e) => onDragStart(e, slot.key, part.value)}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(false);
                    }}
                    onClick={() => apply(slot.key, part.value)}
                    onPointerEnter={() => prefetch(slot.key, part.value)}
                    onPointerLeave={() => clearTimeout(hoverTimer.current)}
                    onFocus={() => prefetch(slot.key, part.value)}
                    title={part.hint}
                  >
                    <PartThumb slot={slot.key} value={part.value} thumb={thumbFor(slot.key, part.value)} />
                    <span className="pm-tile-label">{part.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {isMerch(garmentType) && (
          <div className="pm-slot">
            <div className="pm-slot-title">Custom size (cm, 0 = automatic)</div>
            <div className="pm-extra-row">
              <label>{value.merch.item === "bucket_hat" || value.merch.item === "headband" ? "Head circ." : "Width"}</label>
              <input type="number" min="0" step="1" value={value.merch.width || 0} onChange={(e) => onChange({ merch: { width: Number(e.target.value) } })} className="pm-num" />
              <label>Height</label>
              <input type="number" min="0" step="1" value={value.merch.height || 0} onChange={(e) => onChange({ merch: { height: Number(e.target.value) } })} className="pm-num" />
            </div>
          </div>
        )}
        {!isBottoms(garmentType) && !isSkirt(garmentType) && !isMerch(garmentType) && value.gender === "female" && (
          <div className="pm-slot">
            <div className="pm-slot-title">Bust dart</div>
            <div className="pm-parts">
              {dartPositions.map((d) => (
                <button
                  type="button"
                  key={d.key}
                  className={`pm-part${value.dartPosition === d.key ? " pm-part-active" : ""}`}
                  onClick={() => choose({ dartPosition: d.key })}
                >
                  <span className="pm-part-label">{d.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>}

      <div
        className={`pm-stage${dragging ? " pm-stage-armed" : ""}${over ? " pm-stage-over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <div className="pm-toolbar">
          <button type="button" className="pm-tool" onClick={() => setPartsOpen((o) => !o)} title={partsOpen ? "Hide the parts list for a bigger drawing" : "Show the parts list"}>
            {partsOpen ? "◂ Parts" : "▸ Parts"}
          </button>
          <div className="pm-seg" role="group" aria-label="View">
            {[["both", "Both"], ["front", "Front"], ["back", "Back"], ...(hasSleeveViews ? [["sleeves", "Sleeves"], ["all", "All"]] : [])].map(([v, label]) => (
              <button type="button" key={v} className={`pm-tool${viewMode === v ? " pm-tool-on" : ""}`} onClick={() => setViewMode(v)} aria-pressed={viewMode === v}>
                {label}
              </button>
            ))}
          </div>
          {history && (
            <div className="pm-seg" role="group" aria-label="Undo and redo">
              <button type="button" className="pm-tool pm-icon" onClick={history.undo} disabled={!history.canUndo} aria-label="Undo" title={`Undo (${MOD_KEY}Z)`}>
                ↶
              </button>
              <button type="button" className="pm-tool pm-icon" onClick={history.redo} disabled={!history.canRedo} aria-label="Redo" title={`Redo (${MOD_KEY}⇧Z)`}>
                ↷
              </button>
            </div>
          )}
          <div className="pm-seg" role="group" aria-label="Zoom">
            <button type="button" className="pm-tool" onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP))} disabled={zoom <= ZOOM_MIN} aria-label="Zoom out">
              −
            </button>
            <button type="button" className="pm-tool pm-zoom-value" onClick={() => setZoom(100)} title="Back to 100%">
              {zoom}%
            </button>
            <button type="button" className="pm-tool" onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP))} disabled={zoom >= ZOOM_MAX} aria-label="Zoom in">
              +
            </button>
          </div>
          <span className="toolbar-spacer" />
          {!isMerch(garmentType) && (
            <div className="pm-menu" ref={startRef}>
              <button type="button" className={`pm-tool${startOpen || describeOpen || photo ? " pm-tool-on" : ""}`} onClick={() => setStartOpen((o) => !o)} aria-expanded={startOpen} aria-haspopup="menu">
                Start from ▾
              </button>
              {startOpen && (
                <div className="pm-menu-list" role="menu">
                  {photo && photoHidden && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setStartOpen(false);
                        setPhotoHidden(false);
                      }}
                    >
                      Show the reference photo
                      <small>The one kept with this order</small>
                    </button>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setStartOpen(false);
                      if (!describeOpen) toggleDescribe();
                    }}
                  >
                    A description
                    <small>Type the uniform in words for a rough first design</small>
                  </button>
                  <label role="menuitem">
                    A reference photo
                    <small>Match the parts and colours of an existing uniform</small>
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => {
                        setStartOpen(false);
                        loadPhoto(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              )}
            </div>
          )}
          <div className="pm-menu">
            <button type="button" className={`pm-tool${drawerOpen ? " pm-tool-on" : ""}`} onClick={() => setDrawerOpen((o) => !o)} aria-expanded={drawerOpen}>
              Extras{accessories.length > 0 ? ` (${accessories.length})` : ""}
            </button>
            {drawerOpen && (
              // On a phone the drawer is a sheet over the page: a tap on the
              // dimmed page or "Done" closes it.
              <div className="sheet-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
            )}
            {drawerOpen && (
              <div className="pm-drawer">
                <div className="sheet-head phone-only">
                  <b>Extras</b>
                  <button type="button" className="btn-add btn-inline" onClick={() => setDrawerOpen(false)}>
                    Done
                  </button>
                </div>
                {!isMerch(garmentType) && <div className="pm-slot-title">Pockets — drag onto the garment</div>}
                {!isMerch(garmentType) && (
                  <div className="pm-parts">
                    {POCKET_PRESETS.map((pp) => (
                      <button
                        type="button"
                        key={pp.key}
                        draggable
                        className="pm-tile pm-tile-small"
                        onDragStart={(e) => startExtraDrag(e, { value: "pocket", extra: pp.extra })}
                        onClick={() => addExtra("pocket", pp.extra, pp.key)}
                        title={pp.hint}
                      >
                        <PocketThumb shape={pp.extra.shape} ratio={pp.extra.width / pp.extra.height} />
                        <span className="pm-tile-label">{pp.label}</span>
                      </button>
                    ))}
                    {POCKET_SHAPES.filter((s) => s.value !== "classic").map((s) => (
                      <button
                        type="button"
                        key={s.value}
                        draggable
                        className="pm-tile pm-tile-small"
                        onDragStart={(e) => startExtraDrag(e, { value: "pocket", extra: { shape: s.value, ...DEFAULT_POCKET } })}
                        onClick={() => addExtra("pocket", { shape: s.value, ...DEFAULT_POCKET }, "chest")}
                      >
                        <PocketThumb shape={s.value} />
                        <span className="pm-tile-label">{s.label}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="pm-slot-title" style={{ marginTop: isMerch(garmentType) ? 0 : 12 }}>Prints</div>
                <div className="pm-parts">
                  {["embroidery", "sablon"].map((k) => (
                    <button type="button" key={k} draggable className="pm-tile pm-tile-small" onDragStart={(e) => startExtraDrag(e, { value: k })} onClick={() => addExtra(k, undefined)}>
                      <ExtraThumb kind={k} />
                      <span className="pm-tile-label">{EXTRA_LABELS[k]}</span>
                    </button>
                  ))}
                  <label className={`pm-tile pm-tile-small${logoBusy === "new" ? " is-busy" : ""}`} title="A PNG, JPG or SVG of the logo. A plain background round it is cleared.">
                    <ExtraThumb kind="logo" />
                    <span className="pm-tile-label">{logoBusy === "new" ? "Adding…" : "Logo file"}</span>
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      disabled={Boolean(logoBusy)}
                      onChange={(e) => {
                        addLogo(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                <p className="pm-drawer-hint">You can also drop a logo file straight onto the garment.</p>

                {accessories.length > 0 && <div className="pm-slot-title" style={{ marginTop: 12 }}>On the garment</div>}
                <ul className="pm-extras">
                  {accessories.map((a) => (
                    <li key={a.id} id={`pm-extra-${a.id}`} className={selected === a.id ? "is-selected" : undefined} onPointerDown={() => setSelectedExtra(a.id)}>
                      <div className="pm-extra-head">
                        <span>{EXTRA_LABELS[a.type] || a.type} · {a.segment.replace("_", " ")}{sleeveFace(a)}</span>
                        <button type="button" className="link-btn link-btn-danger" onClick={() => onRemoveAccessory?.(a.id)}>
                          Remove
                        </button>
                      </div>
                      {(a.type === "embroidery" || a.type === "sablon") && (
                        <PrintArtwork
                          accessory={a}
                          busy={logoBusy === a.id}
                          canKeepBackground={Boolean(a.image && logoFiles[a.image]?.backgroundRemoved)}
                          onPickFile={(file) => replaceLogo(a, file)}
                          onKeepBackground={() => replaceLogo(a, logoFiles[a.image]?.file, true)}
                          onRemoveImage={() => onUpdateAccessory?.(a.id, { image: undefined, inkColors: undefined, fullColour: undefined })}
                          onUpdate={(patch) => onUpdateAccessory?.(a.id, patch)}
                        />
                      )}
                      {a.type === "pocket" && (
                        <div className="pm-extra-row">
                          <label>Shape</label>
                          <select className="select" value={a.shape || "classic"} onChange={(e) => onUpdateAccessory?.(a.id, { shape: e.target.value })}>
                            {POCKET_SHAPES.map((s) => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      {a.type === "pocket" && (
                        <div className="pm-extra-row">
                          <label>Fabric</label>
                          <select className="select" value={a.fabric === "contrast" ? "contrast" : "main"} onChange={(e) => onUpdateAccessory?.(a.id, { fabric: e.target.value === "contrast" ? "contrast" : undefined })} title="A contrast pocket is cut from the trim/motif fabric, batik included">
                            <option value="main">Main fabric</option>
                            <option value="contrast">Contrast fabric</option>
                          </select>
                        </div>
                      )}
                      <div className="pm-extra-row">
                        <label>Rotation {Math.round(a.rotation || 0)}°</label>
                        <input type="range" min="-180" max="180" step="5" value={a.rotation || 0} onChange={(e) => onUpdateAccessory?.(a.id, { rotation: Number(e.target.value) })} />
                      </div>
                      <div className="pm-extra-row pm-rot-buttons">
                        <button type="button" className="pm-tool" onClick={() => onUpdateAccessory?.(a.id, { rotation: turnBy(a.rotation, -45) })} title="Turn 45° anticlockwise">↺ 45°</button>
                        <button type="button" className="pm-tool" onClick={() => onUpdateAccessory?.(a.id, { rotation: turnBy(a.rotation, 45) })} title="Turn 45° clockwise">↻ 45°</button>
                        <button type="button" className="pm-tool" onClick={() => onUpdateAccessory?.(a.id, { rotation: 0 })}>Upright</button>
                        {onMirrorAccessory && (/left|right/.test(a.segment) || a.position) && (
                          <button type="button" className="pm-tool" onClick={() => onMirrorAccessory(a.id)} title="Add a matching one on the other side">Copy to other side</button>
                        )}
                        {/sleeve/.test(a.segment) && (
                          <button type="button" className="pm-tool" onClick={() => onUpdateAccessory?.(a.id, { rotation: sleeveAlignment(a.segment, a.view, value.sleeveStyle) })} title="Turn it to follow the arm">Fit sleeve</button>
                        )}
                      </div>
                      {a.image ? (
                        // A logo keeps its proportions: one slider sets its size.
                        <div className="pm-extra-row">
                          <label>
                            Size {a.width.toFixed(1)} × {a.height.toFixed(1)} cm
                          </label>
                          <input
                            type="range"
                            min="2"
                            max="36"
                            step="0.5"
                            value={a.width}
                            onChange={(e) => {
                              const width = Number(e.target.value);
                              onUpdateAccessory?.(a.id, { width, height: Math.round(((a.height * width) / a.width) * 10) / 10 });
                            }}
                          />
                        </div>
                      ) : (
                        <>
                          <div className="pm-extra-row">
                            <label>Width {(a.width || DEFAULT_POCKET.width).toFixed(1)} cm</label>
                            <input type="range" min="3" max={a.type === "pocket" ? 18 : 30} step="0.5" value={a.width || (a.type === "pocket" ? DEFAULT_POCKET.width : 6)} onChange={(e) => onUpdateAccessory?.(a.id, { width: Number(e.target.value) })} />
                          </div>
                          <div className="pm-extra-row">
                            <label>Height {(a.height || DEFAULT_POCKET.height).toFixed(1)} cm</label>
                            <input type="range" min="3" max={a.type === "pocket" ? 20 : 30} step="0.5" value={a.height || (a.type === "pocket" ? DEFAULT_POCKET.height : 6)} onChange={(e) => onUpdateAccessory?.(a.id, { height: Number(e.target.value) })} />
                          </div>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>


        {(logoBusy === "new" || logoNote) && (
          <p className={`pm-logo-note${logoNote?.error ? " is-error" : ""}`} role="status">
            {logoBusy === "new" ? "Getting the logo ready…" : logoNote.text}
            {logoNote && (
              <button type="button" className="link-btn" onClick={() => setLogoNote(null)}>
                Dismiss
              </button>
            )}
          </p>
        )}
        <div className={`pm-compare${photo || describeOpen ? " pm-compare-on" : ""}`}>
          {(photo || describeOpen) && (
            <div className="pm-side">
              {describeOpen && (
                <DescribeDesign
                  status={readerStatus}
                  busy={describing}
                  result={describeResult}
                  error={describeError}
                  onGenerate={describeDesign}
                  onClose={() => setDescribeOpen(false)}
                />
              )}
              {photo && !photoHidden && (
                <ReferencePhoto
                  photo={photo}
                  colors={colorHint || {}}
                  status={readerStatus}
                  analyzing={matching}
                  result={photoResult}
                  error={matchError}
                  onPick={pickColor}
                  onMatch={matchPhoto}
                  onHide={() => setPhotoHidden(true)}
                  onRemove={() => {
                    if (!confirm("Remove the reference photo from this order?")) return;
                    setPhoto(null);
                    setPhotoResult(null);
                    onReferencePhoto?.("");
                  }}
                />
              )}
            </div>
          )}
          <div className={`pm-compare-main${drawing ? " is-drawing" : ""}`}>
            <div className="pm-drawing-bar" aria-hidden="true" />
            {!photo && matchError && <p className="error">{matchError}</p>}
            {!size && <p className="empty">Add a size to see the garment build up.</p>}
            {error && <p className="error">{error}</p>}
            {size && shownPieces && (
              <ErrorBoundary fallback={<p className="empty">The preview couldn't be displayed.</p>}>
                <GarmentFlatPreview
                  compact
                  views={viewMode}
                  zoom={zoom}
                  pieces={shownPieces}
                  gender={look.gender}
                  dartPosition={look.dartPosition}
                  sleeveStyle={look.sleeveStyle}
                  collarStyle={look.collarStyle}
                  merchItem={look.merchItem}
                  accessories={accessories}
                  selectedId={selected}
                  onSelect={setSelectedExtra}
                  onUpdateAccessory={onUpdateAccessory}
                  onRemoveAccessory={onRemoveAccessory}
                  onMirrorAccessory={onMirrorAccessory}
                  onEditAccessory={editExtra}
                  partFor={(segment) => slotForSegment(segment)?.label}
                  onJumpToPart={jumpToPart}
                  colorHint={colorHint}
                  fabricColors={fabricColors}
                  fabrics={fabrics}
                  fabricName={fabricName}
                  onFabricPick={onFabricPick}
                  onColorChange={onColorHint}
                  pattern={look.pattern}
                  onAddAccessory={onAddAccessory}
                  onDragAccessory={onDragAccessory}
                  onDropAccessory={onAddAccessory ? () => {} : undefined}
                  onLogoFile={onAddAccessory ? addLogo : undefined}
                />
              </ErrorBoundary>
            )}
          </div>
        </div>
        <p className="pm-stage-hint">Click the garment to add a pocket or print there, or to change that part. Click an extra to pick it: drag it, pull its corner to size it, or use the arrow keys. {MOD_KEY}Z undoes.</p>
        {dragging && <div className="pm-drop-hint">Drop to set {slots.find((s) => s.key === dragging.slot)?.label.toLowerCase()}</div>}
      </div>
    </div>
  );
}
