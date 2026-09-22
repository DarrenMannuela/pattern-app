import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import GarmentFlatPreview from "./GarmentFlatPreview.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import { PartThumb, PocketThumb, ExtraThumb, usePartThumbs } from "./PartThumbs.jsx";
import { POCKET_SHAPES } from "../lib/pocketShapes.js";
import { designToMaker } from "../lib/photoMatch.js";
import ReferencePhoto from "./ReferencePhoto.jsx";
import { MOTIF_PATTERNS } from "./MotifDefs.jsx";
import { fileToDataUrl, shrinkDataUrl } from "../lib/imageTrace.js";
import { sleeveAlignment } from "../lib/garmentFlat.js";

// A drag-and-drop pattern maker for shirts. The catalog of parts is fixed;
// dropping a part on the garment (or clicking it) sets that slot, and the
// pieces are redrafted by the backend and the illustration redrawn from
// them a moment later. Nothing is saved until "Generate mockup".

const SLOTS = [
  {
    key: "fit",
    label: "Fit",
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
    if (slot.key === "trim") return (hasCollar || vNeck) && !polo ? slot : null;
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
    case "collar": return value.collarEnabled ? value.collarStyle : value.neckline === "v_neck" ? "v_neck" : "none";
    case "trim": return value.trim;
    case "bands": return value.motifs;
    case "pattern": return value.pattern;
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
    sleeveStyle: value.sleeveStyle,
    sleeveFabric: value.sleeveFabric,
    dartPosition: value.dartPosition,
    frontStyle: value.frontStyle,
    backStyle: value.backStyle,
    hemStyle: value.hemStyle,
    neckline: value.neckline,
    trim: value.trim,
    panel: value.motifs.includes("side") ? "side" : "none",
    motifs: value.motifs.filter((m) => m !== "side"),
    pattern: value.pattern,
    sizes: [size],
    accessories,
  };
  if (garmentType === "uniform_shirt") payload.collar = value.collarEnabled;
  if (garmentType === "school_shirt" || (garmentType === "uniform_shirt" && value.collarEnabled)) payload.collarStyle = value.collarStyle;
  if (garmentType === "polo_shirt") {
    payload.collar = true;
    payload.collarStyle = "polo";
  }
  return payload;
}

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

function startExtraDrag(e, extra) {
  e.dataTransfer.setData("text/plain", JSON.stringify({ slot: "extra", ...extra }));
  e.dataTransfer.effectAllowed = "copy";
}

export default function PatternMaker({ orderId, garmentType, sizes, value, onChange, dartPositions, accessories = [], onAddAccessory, onRemoveAccessory, onUpdateAccessory, onMirrorAccessory, onDragAccessory, colorHint, onColorHint, fabricColors, referencePhoto, onReferencePhoto }) {
  const [pieces, setPieces] = useState(null);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(null); // { slot, value }
  const [over, setOver] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewMode, setViewMode] = useState("both"); // both | front | back
  const [zoom, setZoom] = useState(100);
  const [partsOpen, setPartsOpen] = useState(true);
  const [photo, setPhoto] = useState(referencePhoto ? { url: referencePhoto } : null); // the reference photo: { url }, kept with the order
  const [photoResult, setPhotoResult] = useState(null); // what a reader made of it
  const [matching, setMatching] = useState(false);
  const [matchError, setMatchError] = useState(null);
  const [readerStatus, setReaderStatus] = useState(null); // who can read photos: { provider, model, hint }
  const seq = useRef(0);

  const hasSleeveViews = !isBottoms(garmentType) && !isSkirt(garmentType) && !isMerch(garmentType);
  const slots = slotsFor(garmentType, value);
  const size = isMerch(garmentType) ? sizes?.[0] || { label: "One size", quantity: 1, measurements: {} } : sizes?.[0];
  const request = size ? JSON.stringify(previewPayload(garmentType, value, size, accessories)) : null;
  const thumbFor = usePartThumbs(orderId, size, slots.flatMap((s) => s.parts.map((p) => ({ slot: s.key, value: p.value }))), garmentType, isMerch(garmentType) ? value.merch : isSkirt(garmentType) ? value.skirt : undefined);

  // Redraft shortly after the last change.
  useEffect(() => {
    if (!request) return undefined;
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      try {
        const res = await api.previewPieces(orderId, JSON.parse(request));
        if (mine !== seq.current) return; // a newer change is already in flight
        setPieces(res.pieces[size.label] || Object.values(res.pieces)[0] || null);
        setError(null);
      } catch (e) {
        if (mine === seq.current) setError(e.message);
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [request, orderId, size?.label]);

  function apply(slotKey, part) {
    if (slotKey === "bands") {
      // Bands can be combined; one streak or two, not both.
      const has = value.motifs.includes(part);
      let next = has ? value.motifs.filter((m) => m !== part) : [...value.motifs, part];
      if (!has && part === "centre") next = next.filter((m) => m !== "double");
      if (!has && part === "double") next = next.filter((m) => m !== "centre");
      onChange({ motifs: next });
      return;
    }
    onChange(patchFor(slotKey, part));
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

  // Has the available reader set the parts, pockets, prints and colours to
  // match photoUrl as closely as the catalog allows.
  async function runMatch(photoUrl, status) {
    setMatching(true);
    setMatchError(null);
    try {
      // A local model reads a smaller picture much faster and about as well.
      const design = await api.analyzePhoto(status?.provider === "ollama" ? await shrinkDataUrl(photoUrl, 768) : photoUrl);
      const result = designToMaker(design, garmentType);
      if (Object.keys(result.patch).length > 0) onChange(result.patch);
      if (!result.mismatch) {
        for (const a of accessories) onRemoveAccessory?.(a.id);
        for (const a of result.accessories) onAddAccessory?.(a.type, a.segment, undefined, a.extra);
      }
      if (result.colors.main || result.colors.accent) onColorHint?.({ ...result.colors });
      setPhotoResult({ design, ...result });
    } catch (e) {
      setMatchError(e.message);
    } finally {
      setMatching(false);
    }
  }

  // The manual "Match parts" button re-runs the match against whatever
  // photo and reader are already loaded — for a retry, or after changing
  // the fabric/trim colour picked from the photo.
  function matchPhoto() {
    if (!photo) return;
    return runMatch(photo.url, readerStatus);
  }

  function addExtra(type, extra, presetKey) {
    onAddAccessory?.(type, defaultSegment(garmentType, type, presetKey), undefined, extra);
  }

  const effectiveCollarStyle =
    garmentType === "polo_shirt" ? "polo" : garmentType === "pe_shirt" ? undefined : value.collarEnabled || garmentType === "school_shirt" ? value.collarStyle : undefined;

  return (
    <div className={`pattern-maker${partsOpen ? "" : " pattern-maker-wide"}`}>
      {partsOpen && <div className="pm-palette">
        {slots.map((slot) => (
          <div key={slot.key} className="pm-slot">
            <div className="pm-slot-title">{slot.label}</div>
            <div className="pm-parts">
              {slot.parts.map((part) => {
                const current = currentPart(slot.key, value);
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
                  onClick={() => onChange({ dartPosition: d.key })}
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
          <button type="button" className="pm-tool" onClick={() => setPartsOpen((o) => !o)}>
            {partsOpen ? "◂ Hide parts" : "▸ Show parts"}
          </button>
          <div className="pm-seg" role="group" aria-label="View">
            {[["both", "Front + back"], ["front", "Front"], ["back", "Back"], ...(hasSleeveViews ? [["sleeves", "Sleeves"], ["all", "All"]] : [])].map(([v, label]) => (
              <button type="button" key={v} className={`pm-tool${viewMode === v ? " pm-tool-on" : ""}`} onClick={() => setViewMode(v)}>
                {label}
              </button>
            ))}
          </div>
          {!isMerch(garmentType) && (
            <label className={`pm-tool pm-photo-btn${photo ? " pm-tool-on" : ""}`} title="Put a photo of an existing uniform beside the preview to match it by eye, and take its colours">
              Reference photo
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  loadPhoto(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
          )}
          <label className="pm-zoom">
            Size
            <input type="range" min="60" max="220" step="10" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
            <span>{zoom}%</span>
          </label>
        </div>
        <button type="button" className="pm-burger" onClick={() => setDrawerOpen((o) => !o)} aria-expanded={drawerOpen} aria-label="Extras menu">
          <span className="pm-burger-icon" aria-hidden="true">☰</span> Extras{accessories.length > 0 ? ` (${accessories.length})` : ""}
        </button>

        {drawerOpen && (
          <div className="pm-drawer">
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
            </div>

            {accessories.length > 0 && <div className="pm-slot-title" style={{ marginTop: 12 }}>On the garment</div>}
            <ul className="pm-extras">
              {accessories.map((a) => (
                <li key={a.id}>
                  <div className="pm-extra-head">
                    <span>{EXTRA_LABELS[a.type] || a.type} · {a.segment.replace("_", " ")}{sleeveFace(a)}</span>
                    <button type="button" className="link-btn link-btn-danger" onClick={() => onRemoveAccessory?.(a.id)}>
                      Remove
                    </button>
                  </div>
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
                      <button type="button" className="pm-tool" onClick={() => onUpdateAccessory?.(a.id, { rotation: sleeveAlignment(a.segment, a.view) })} title="Turn it to follow the arm">Fit sleeve</button>
                    )}
                  </div>
                  <div className="pm-extra-row">
                    <label>Width {(a.width || DEFAULT_POCKET.width).toFixed(1)} cm</label>
                    <input type="range" min="3" max={a.type === "pocket" ? 18 : 30} step="0.5" value={a.width || (a.type === "pocket" ? DEFAULT_POCKET.width : 6)} onChange={(e) => onUpdateAccessory?.(a.id, { width: Number(e.target.value) })} />
                  </div>
                  <div className="pm-extra-row">
                    <label>Height {(a.height || DEFAULT_POCKET.height).toFixed(1)} cm</label>
                    <input type="range" min="3" max={a.type === "pocket" ? 20 : 30} step="0.5" value={a.height || (a.type === "pocket" ? DEFAULT_POCKET.height : 6)} onChange={(e) => onUpdateAccessory?.(a.id, { height: Number(e.target.value) })} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={`pm-compare${photo ? " pm-compare-on" : ""}`}>
          {photo && (
            <ReferencePhoto
              photo={photo}
              colors={colorHint || {}}
              status={readerStatus}
              analyzing={matching}
              result={photoResult}
              error={matchError}
              onPick={pickColor}
              onMatch={matchPhoto}
              onClose={() => {
                setPhoto(null);
                setPhotoResult(null);
                onReferencePhoto?.("");
              }}
            />
          )}
          <div className="pm-compare-main">
            {!photo && matchError && <p className="error">{matchError}</p>}
            {!size && <p className="empty">Add a size to see the garment build up.</p>}
            {error && <p className="error">{error}</p>}
            {size && pieces && (
              <ErrorBoundary fallback={<p className="empty">The preview couldn't be displayed.</p>}>
                <GarmentFlatPreview
                  compact
                  views={viewMode}
                  zoom={zoom}
                  pieces={pieces}
                  gender={value.gender}
                  dartPosition={value.dartPosition}
                  sleeveStyle={value.sleeveStyle}
                  collarStyle={effectiveCollarStyle}
                  merchItem={isMerch(garmentType) ? value.merch.item : undefined}
                  accessories={accessories}
                  colorHint={colorHint}
                  fabricColors={fabricColors}
                  pattern={value.pattern}
                  onAddAccessory={onAddAccessory}
                  onDragAccessory={onDragAccessory}
                  onDropAccessory={onAddAccessory ? () => {} : undefined}
                />
              </ErrorBoundary>
            )}
          </div>
        </div>
        <p className="pm-stage-hint">
          Click anywhere on the garment to add a pocket, pen pocket, embroidery or sablon exactly there — on the collar, cuffs, chest, sleeves, back, legs, waistband or hem. Drag an extra to move it; open Extras to resize it or change its shape.
        </p>
        {dragging && <div className="pm-drop-hint">Drop to set {slots.find((s) => s.key === dragging.slot)?.label.toLowerCase()}</div>}
      </div>
    </div>
  );
}
