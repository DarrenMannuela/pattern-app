import { useEffect, useState } from "react";
import { api } from "../api";
import PatternMaker from "./PatternMaker.jsx";
import CustomDesigner, { customPayload } from "./CustomDesigner.jsx";
import GarmentFlatPreview from "./GarmentFlatPreview";
import ErrorBoundary from "./ErrorBoundary";
import GarmentTypePicker from "./GarmentTypePicker";
import FabricColorPicker from "./FabricColorPicker.jsx";
import { sleeveAlignment } from "../lib/garmentFlat.js";

const STATUS_OPTIONS = ["consultation", "mockup", "revision", "approved"];

// A catalog fabric's stored/displayed identity: brand-qualified when it has
// one, since two brands can share a plain name (Verlando and Maryland both
// sell a "Tropical Deluxe").
const fabricLabel = (f) => (f.brand ? `${f.brand} — ${f.name}` : f.name);

// The key fabricColors (colors.json) is keyed by — the image filename
// stem, since that's the one identifier already unique per catalog entry.
function fabricSlug(f) {
  return f.imageUrl?.match(/([^/]+)\.[a-z]+$/)?.[1];
}

// Groups the fabric list by brand, in the order each brand first appears,
// with the older brandless reference entries collected under one heading.
function groupFabrics(fabrics) {
  const groups = new Map();
  for (const f of fabrics) {
    const key = f.brand || "Other reference fabrics";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  return [...groups.entries()];
}

const DEFAULT_MERCH = { item: "tote_bag", size: "medium", width: 0, height: 0, shape: "", strap: "", pocket: "none", bottom: "flat", brim: "short", closure: "zip" };

const DART_POSITIONS = [
  { key: "waist", label: "Waist (default)" },
  { key: "side", label: "Side seam" },
  { key: "french", label: "French (lower side)" },
  { key: "shoulder", label: "Shoulder" },
  { key: "armhole", label: "Armhole" },
  { key: "neckline", label: "Neckline" },
];

const SHIRT_FIELDS = [
  { key: "bust", label: "Bust/chest (cm)" },
  { key: "waist", label: "Waist (cm)" },
  { key: "backWaistLength", label: "Back length, nape to waist (cm)" },
  { key: "shirtLength", label: "Shirt length, nape to hem (cm, 0 = auto)" },
  { key: "shoulder", label: "Shoulder seam (cm)" },
  { key: "neck", label: "Neck circumference (cm)" },
  { key: "ease", label: "Wearing ease (cm)" },
  { key: "sleeveLength", label: "Sleeve length (cm)" },
  { key: "upperArm", label: "Upper arm (cm)" },
  { key: "wrist", label: "Wrist (cm)" },
];

const PANTS_FIELDS = [
  { key: "waist", label: "Waist (cm)" },
  { key: "hip", label: "Hip (cm)" },
  { key: "rise", label: "Rise / crotch depth (cm)" },
  { key: "inseam", label: "Inseam (cm)" },
  { key: "hemWidth", label: "Leg opening, half (cm) — optional" },
  { key: "ease", label: "Wearing ease (cm)" },
];

const SKIRT_FIELDS = [
  { key: "waist", label: "Waist (cm)" },
  { key: "hip", label: "Hip (cm)" },
  { key: "skirtLength", label: "Skirt length (cm)" },
  { key: "ease", label: "Wearing ease (cm)" },
];

// Which measurement fields make sense depends on what's being made —
// a shirt doesn't need a rise/inseam, pants don't need a neckline.
function measurementFieldsFor(garmentType) {
  switch (garmentType) {
    case "pants":
    case "shorts":
      return PANTS_FIELDS;
    case "skirt":
      return SKIRT_FIELDS;
    case "custom":
    case "other":
      return []; // sized by the drawing / the item's own dimensions, not body measurements
    default:
      return SHIRT_FIELDS;
  }
}

const MARGIN = 24;
const PX_PER_CM = 6;
const FOCUS_PX_PER_CM = 8;

function PiecePreview({ piece, pxPerCm = PX_PER_CM }) {
  // A finished piece has a cutting line (sewing line + allowances) and a
  // grainline; the sewing line is drawn inside it at CutOffset. Pieces
  // without them (older data) fall back to just the outline.
  const cw = piece.cutWidth || piece.width;
  const ch = piece.cutHeight || piece.height;
  const off = piece.cutOffset || { x: 0, y: 0 };
  const w = cw * pxPerCm + MARGIN * 2;
  const h = ch * pxPerCm + MARGIN * 2;
  const g = piece.grainline;
  return (
    <div className="draft-piece">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="draft-svg">
        <g transform={`translate(${MARGIN},${MARGIN}) scale(${pxPerCm})`}>
          {piece.cutPathData && (
            <path d={piece.cutPathData} fill="none" stroke="#8A7B54" strokeWidth={0.25} strokeDasharray="1.2,0.8" />
          )}
          <g transform={`translate(${off.x},${off.y})`}>
            <path d={piece.pathData} fill="#3B7A82CC" stroke="#23272A" strokeWidth={0.4} />
            {piece.foldEdge === "left" && (
              <line x1={0} y1={-1} x2={0} y2={piece.height + 1} stroke="#8A7B54" strokeWidth={0.3} strokeDasharray="1.2,1" />
            )}
            {g && (
              <g stroke="#23272A" strokeWidth={0.3} fill="#23272A">
                <line x1={g[0]} y1={g[1]} x2={g[2]} y2={g[3]} />
                {[[g[0], g[1], g[2], g[3]], [g[2], g[3], g[0], g[1]]].map(([x, y, tx, ty], i) => {
                  const a = Math.atan2(ty - y, tx - x);
                  const l = 1.6;
                  const p1 = [x + Math.cos(a) * l + Math.cos(a + 2.6) * 0.9, y + Math.sin(a) * l + Math.sin(a + 2.6) * 0.9];
                  const p2 = [x + Math.cos(a) * l + Math.cos(a - 2.6) * 0.9, y + Math.sin(a) * l + Math.sin(a - 2.6) * 0.9];
                  return <polygon key={i} points={`${x},${y} ${p1.join(",")} ${p2.join(",")}`} stroke="none" />;
                })}
              </g>
            )}
          </g>
        </g>
      </svg>
      <div className="draft-piece-label">
        <span className="draft-piece-name">{piece.name}</span>
        <span className="draft-piece-dims mono">
          {piece.width}×{piece.height} cm{piece.cutWidth ? ` · cut ${piece.cutWidth}×${piece.cutHeight}` : ""}
        </span>
      </div>
    </div>
  );
}

function emptySizeRow() {
  return { label: "", quantity: 1, measurements: {} };
}

function SizeRow({ size, idx, fields, onChange, onMeasurement, onRemove }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="size-row">
      <div className="size-row-main">
        <input
          type="text"
          className="size-row-label"
          placeholder="Label (e.g. M, 28, Kelas 3)"
          value={size.label}
          onChange={(e) => onChange(idx, { label: e.target.value })}
        />
        <input
          type="number"
          min="0"
          className="size-row-qty"
          placeholder="Qty"
          value={size.quantity}
          onChange={(e) => onChange(idx, { quantity: Number(e.target.value) })}
        />
        {fields.length > 0 && (
          <button className="link-btn" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Hide measurements" : "Edit measurements"}
          </button>
        )}
        <button className="link-btn link-btn-danger" onClick={() => onRemove(idx)}>
          Remove
        </button>
      </div>
      {expanded && (
        <div className="size-row-measurements">
          {fields.map((f) => (
            <div className="field" key={f.key}>
              <label>{f.label}</label>
              <input
                type="number"
                value={size.measurements?.[f.key] ?? ""}
                onChange={(e) => onMeasurement(idx, f.key, e.target.value)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrderDetailView({ orderId, onBack }) {
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [fabrics, setFabrics] = useState([]);
  // The supplier's real per-fabric colour codes, extracted from their own
  // e-catalog PDFs (frontend/public/fabric-catalog/colors.json) and keyed
  // by the same slug as each fabric's ImageURL — static reference data,
  // fetched once, not tied to any one order.
  const [fabricColors, setFabricColors] = useState({});
  const [dartPosition, setDartPosition] = useState("waist");
  // Gender/sleeveStyle apply to every shirt garment type (school/PE
  // presets used to hardcode a fitted silhouette regardless of this —
  // now the client's choice always passes through, see
  // orders.GeneratePieces). Default "unisex" so a new order doesn't
  // silently read as gendered either way until someone picks one.
  const [gender, setGender] = useState("unisex");
  const [sleeveStyle, setSleeveStyle] = useState("full");
  const [sleeveFabric, setSleeveFabric] = useState("main");
  const [collarEnabled, setCollarEnabled] = useState(false); // uniform_shirt only
  const [collarStyle, setCollarStyle] = useState("convertible");
  // Premade construction options (see draft.ShirtOptions): the pattern is
  // assembled from these and the preview is drawn from the result.
  const [frontStyle, setFrontStyle] = useState("placket");
  const [backStyle, setBackStyle] = useState("yoke");
  const [hemStyle, setHemStyle] = useState("curved");
  const [neckline, setNeckline] = useState("round");
  const [trim, setTrim] = useState("none");
  const [motifs, setMotifs] = useState([]); // motif bands, "side" being the insert panel
  const [motifPattern, setMotifPattern] = useState("solid");
  const [colorHint, setColorHint] = useState(null); // colours read off a reference photo
  const [legStyle, setLegStyle] = useState("straight");
  const [shortsLength, setShortsLength] = useState("short");
  const [frontPocket, setFrontPocket] = useState("slant");
  const [backPocket, setBackPocket] = useState("welt");
  const [beltLoops, setBeltLoops] = useState("loops");
  const [fly, setFly] = useState("fly");
  const [trouserWaist, setTrouserWaist] = useState("band");
  const [stripe, setStripe] = useState("none");
  const [merch, setMerch] = useState(DEFAULT_MERCH);
  const [skirt, setSkirt] = useState({ style: "a_line", waist: "band", pocket: "none" });
  // Pocket/embroidery/sablon accessories — added by clicking directly
  // on the design preview, not a form. Each carries its own id
  // (assigned here, client-side, so drag/remove can target one
  // instance among possibly several on the same segment) and its
  // exact clicked (then possibly dragged) position; sent to the
  // backend as-is on generate.
  const [accessories, setAccessories] = useState([]);
  const [mockupNote, setMockupNote] = useState("");
  const [generating, setGenerating] = useState(false);
  const [activeMockup, setActiveMockup] = useState(null); // { mockup, pieces }
  const [activeSizeLabel, setActiveSizeLabel] = useState(null);
  const [focusIdx, setFocusIdx] = useState(0);
  const [sentAll, setSentAll] = useState(false);
  const [sentFabricCounts, setSentFabricCounts] = useState(null); // { main, contrast } piece counts, once sent

  useEffect(() => {
    setOrder(null);
    setActiveMockup(null);
    api
      .getOrder(orderId)
      .then((o) => {
        setOrder(o);
        setColorHint(o.previewColors?.main || o.previewColors?.accent ? { ...o.previewColors } : null);
        // Jump straight to the latest revision instead of leaving the
        // mockup section blank when reopening an order that already
        // has one.
        if (o.mockups && o.mockups.length > 0) {
          const latest = o.mockups[o.mockups.length - 1].version;
          api
            .getMockup(orderId, latest)
            .then((res) => {
              setActiveMockup(res);
              setActiveSizeLabel(Object.keys(res.pieces)[0] || null);
              setAccessories(res.mockup.options?.addOns?.accessories || []);
              restoreOptions(res.mockup.options || {});
            })
            .catch(() => {});
        }
      })
      .catch((e) => setError(e.message));
    api
      .fabrics()
      .then(setFabrics)
      .catch(() => {});
  }, [orderId]);

  useEffect(() => {
    fetch("/fabric-catalog/colors.json")
      .then((r) => r.json())
      .then(setFabricColors)
      .catch(() => {});
  }, []);

  // Sets the maker's choices back to what a saved revision was made with, so
  // reopening an order shows the garment that was built, not the defaults.
  function restoreOptions(opt) {
    setGender(opt.gender || "unisex");
    setDartPosition(opt.dartPosition || "waist");
    setSleeveStyle(opt.sleeveStyle || "full");
    setSleeveFabric(opt.sleeveFabric || "main");
    setCollarEnabled(!!opt.collar);
    if (opt.collarStyle) setCollarStyle(opt.collarStyle);
    setFrontStyle(opt.frontStyle || "placket");
    setBackStyle(opt.backStyle || "yoke");
    setHemStyle(opt.hemStyle || "curved");
    setNeckline(opt.neckline || "round");
    setTrim(opt.trim || "none");
    setMotifs([...(opt.panel === "side" ? ["side"] : []), ...(opt.motifs || [])]);
    setMotifPattern(opt.pattern || "solid");
    const t = opt.trousers || {};
    setLegStyle(t.legStyle || "straight");
    if (t.length) setShortsLength(t.length);
    setFrontPocket(t.frontPocket || "slant");
    setBackPocket(t.backPocket || "welt");
    setBeltLoops(t.beltLoops || "loops");
    setFly(t.fly || "fly");
    setTrouserWaist(t.waist || "band");
    setStripe(t.stripe || "none");
    if (opt.skirt?.style || opt.skirt?.waist) setSkirt((prev) => ({ ...prev, ...opt.skirt }));
    if (opt.merch?.item) setMerch((prev) => ({ ...prev, ...opt.merch }));
  }

  function updateField(key, value) {
    setOrder((prev) => ({ ...prev, [key]: value }));
  }
  function updateFabric(key, value) {
    setOrder((prev) => ({ ...prev, fabric: { ...prev.fabric, [key]: value } }));
  }
  function updateSizeRow(idx, patch) {
    setOrder((prev) => {
      const sizes = prev.sizes.slice();
      sizes[idx] = { ...sizes[idx], ...patch };
      return { ...prev, sizes };
    });
  }
  function updateSizeMeasurement(idx, key, value) {
    setOrder((prev) => {
      const sizes = prev.sizes.slice();
      const measurements = { ...sizes[idx].measurements };
      if (value === "") delete measurements[key];
      else measurements[key] = Number(value);
      sizes[idx] = { ...sizes[idx], measurements };
      return { ...prev, sizes };
    });
  }
  function addSizeRow() {
    setOrder((prev) => ({ ...prev, sizes: [...(prev.sizes || []), emptySizeRow()] }));
  }
  function removeSizeRow(idx) {
    setOrder((prev) => ({ ...prev, sizes: prev.sizes.filter((_, i) => i !== idx) }));
  }

  async function prefillStandardChart() {
    try {
      const run = await api.grade({});
      const rows = run.map((row) => ({
        label: row.size,
        quantity: 1,
        measurements: row.measurements,
      }));
      setOrder((prev) => ({ ...prev, sizes: [...(prev.sizes || []), ...rows] }));
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateOrder(orderId, { ...order, previewColors: { main: colorHint?.main, accent: colorHint?.accent } });
      setOrder(updated);
      return updated;
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      // The backend drafts from the saved order, not local edits, so
      // an unsaved size-chart change would otherwise be silently
      // ignored — save first so what's on screen is what gets drafted.
      await handleSave();
      const payload = { note: mockupNote, accessories };
      if (isShirtType) {
        payload.gender = gender;
        payload.sleeveStyle = sleeveStyle;
        payload.sleeveFabric = sleeveFabric;
        payload.dartPosition = dartPosition;
        payload.frontStyle = frontStyle;
        payload.backStyle = backStyle;
        payload.hemStyle = hemStyle;
        payload.neckline = neckline;
        payload.trim = trim;
        payload.panel = motifs.includes("side") ? "side" : "none";
        payload.motifs = motifs.filter((m) => m !== "side");
        payload.pattern = motifPattern;
      }
      if (order.garmentType === "other") {
        payload.merch = merch;
      }
      if (order.garmentType === "skirt") {
        payload.skirt = skirt;
      }
      if (order.garmentType === "custom") {
        payload.custom = customPayload(order.design);
      }
      if (isBottomType) {
        payload.trousers = { length: shortsLength, legStyle, frontPocket, backPocket, beltLoops, fly, waist: trouserWaist, stripe };
      }
      if (order.garmentType === "uniform_shirt") {
        payload.collar = collarEnabled;
      }
      if (showCollarStyle) {
        payload.collarStyle = collarStyle;
      }
      if (order.garmentType === "polo_shirt") {
        payload.collar = true;
        payload.collarStyle = "polo";
      }
      const res = await api.createMockup(orderId, payload);
      setOrder(res.order);
      setActiveMockup({ mockup: res.mockup, pieces: res.pieces });
      setActiveSizeLabel(Object.keys(res.pieces)[0] || null);
      setFocusIdx(0);
      setSentAll(false);
      setMockupNote("");
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  async function viewRevision(version) {
    setError(null);
    try {
      const res = await api.getMockup(orderId, version);
      setActiveMockup(res);
      setActiveSizeLabel(Object.keys(res.pieces)[0] || null);
      setFocusIdx(0);
      setSentAll(false);
      setAccessories(res.mockup.options?.addOns?.accessories || []);
    } catch (e) {
      setError(e.message);
    }
  }

  function addAccessory(type, segment, position, extra) {
    const id = `acc-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const base = { id, type, segment, ...extra };
    // On a sleeve an extra follows the arm unless a specific angle is given.
    if (base.rotation === undefined && sleeveAlignment(segment, base.view)) base.rotation = sleeveAlignment(segment, base.view);
    if (position) base.position = position;
    if (type !== "pocket") {
      base.width = extra?.width ?? 6;
      base.height = extra?.height ?? 6;
      base.label = extra?.label || "";
    }
    setAccessories((prev) => [...prev, base]);
  }

  // A matching extra on the other side: the left chest pocket's twin on the
  // right, a sleeve pocket's twin on the other sleeve, or a mirrored position.
  function mirrorAccessory(id) {
    const SWAP = { left_chest: "right_chest", right_chest: "left_chest", left_sleeve: "right_sleeve", right_sleeve: "left_sleeve", left_leg: "right_leg", right_leg: "left_leg", left_hem: "right_hem", right_hem: "left_hem" };
    setAccessories((prev) => {
      const a = prev.find((x) => x.id === id);
      if (!a) return prev;
      const sideView = a.view === "left" || a.view === "right";
      const copy = {
        ...a,
        id: `acc-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
        segment: SWAP[a.segment] || a.segment,
        view: sideView ? (a.view === "left" ? "right" : "left") : a.view,
        rotation: -(a.rotation || 0),
      };
      // Positions on a side-bound segment are distances from the center line; the rest are signed.
      if (a.position && (!SWAP[a.segment] || sideView)) copy.position = { ...a.position, x: -a.position.x };
      return [...prev, copy];
    });
  }

  function updateAccessory(id, patch) {
    setAccessories((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  function removeAccessory(id) {
    setAccessories((prev) => prev.filter((a) => a.id !== id));
  }

  function dragAccessory(id, fraction) {
    setAccessories((prev) => prev.map((a) => (a.id === id ? { ...a, position: fraction } : a)));
  }

  // "contrast" for a motif band, an insert panel, a V-neck/collar trim or a
  // side stripe — everything else is the garment's main fabric. Different
  // fabric means a different bolt of cloth, so the cutting layout has to nest
  // and count yardage for each one separately rather than as one length.
  function fabricOf(piece) {
    return piece.fabric === "contrast" ? "contrast" : "main";
  }

  function colorFor(piece) {
    // Prefer the colour actually picked for this fabric in the preview
    // (colorHint), so the cutting layout's swatches match what's on screen —
    // fall back to a per-part heuristic only when nothing was picked.
    if (fabricOf(piece) === "contrast" && colorHint?.accent) return colorHint.accent;
    if (fabricOf(piece) === "main" && colorHint?.main) return colorHint.main;
    const n = piece.name.toLowerCase();
    if (n.includes("sleeve")) return "#C79A3E";
    if (n.includes("collar")) return "#7A5B9C";
    if (n.includes("placket")) return "#4B8C5A";
    if (n.includes("waistband")) return "#5B6E9C";
    if (n.includes("back")) return "#B5453D";
    return "#3B7A82";
  }

  async function sendPiece(piece, sizeLabel, quantity) {
    const fabric = fabricOf(piece);
    await api.addPiece({
      name: `${piece.name} — ${order.customerName} ${sizeLabel}`,
      // Nest the CUT outline (with seam/hem allowances), not the sewing
      // line — yardage has to cover the allowances.
      width: piece.cutWidth || piece.width,
      height: piece.cutHeight || piece.height,
      qty: (piece.qty || 2) * Math.max(1, Number(quantity) || 1),
      color: colorFor(piece),
      grainLocked: true,
      pathData: piece.cutPathData || piece.pathData,
      ...(fabric === "contrast" ? { fabric } : {}),
    });
  }

  async function handleSendAllSizes() {
    if (!activeMockup) return;
    setError(null);
    const counts = { main: 0, contrast: 0 };
    try {
      for (const sz of order.sizes) {
        const pieces = activeMockup.pieces[sz.label];
        if (!pieces) continue;
        for (const piece of pieces) {
          counts[fabricOf(piece)]++;
          await sendPiece(piece, sz.label, sz.quantity);
        }
      }
      setSentAll(true);
      setSentFabricCounts(counts);
    } catch (e) {
      setError(e.message);
    }
  }

  if (!order) {
    return (
      <div className="tab-body">
        <main>
          <p className="empty">{error || "Loading order…"}</p>
        </main>
      </div>
    );
  }

  const sizeLabels = activeMockup ? Object.keys(activeMockup.pieces) : [];
  const activePieces = activeMockup && activeSizeLabel ? activeMockup.pieces[activeSizeLabel] : null;
  // Two catalog entries can share a plain name across brands (both Verlando
  // and Maryland sell a "Tropical Deluxe"), so the stored/matched value is
  // brand-qualified wherever a brand exists, not the bare name.
  const matchedFabric = fabrics.find((f) => fabricLabel(f) === order.fabric?.name);
  const fabricGroups = groupFabrics(fabrics);
  const matchedFabricColors = matchedFabric ? fabricColors[fabricSlug(matchedFabric)] || [] : [];
  const pickedFabricColor = matchedFabricColors.find((c) => c.hex === colorHint?.main);
  const fields = measurementFieldsFor(order.garmentType);
  const isBottomType = order.garmentType === "pants" || order.garmentType === "shorts";
  const isMerchType = order.garmentType === "other";
  const isSkirtType = order.garmentType === "skirt";
  const isCustomType = order.garmentType === "custom";
  const isShirtType = ["school_shirt", "polo_shirt", "pe_shirt", "uniform_shirt"].includes(order.garmentType);
  const showCollarStyle =
    order.garmentType === "school_shirt" || (order.garmentType === "uniform_shirt" && collarEnabled);
  // Gender always passes through as given for every shirt type now
  // (see orders.GeneratePieces) — the preview reads it from what was
  // ACTUALLY drafted on the active mockup, not the live form control,
  // the same way dartPosition already does below, so switching the
  // gender selector doesn't repaint the preview until you regenerate.
  const effectiveGender = activeMockup?.mockup.options?.gender;

  return (
    <div className="tab-body">
      <aside className="sidebar">
        <button className="link-btn" style={{ marginBottom: 14 }} onClick={onBack}>
          ← All orders
        </button>
        <h1>{order.customerName || "Untitled order"}</h1>
        <p className="sub">
          Order #{order.id} · created {new Date(order.createdAt).toLocaleDateString()}
        </p>

        <div className="field">
          <label>Customer / school name</label>
          <input
            type="text"
            value={order.customerName}
            onChange={(e) => updateField("customerName", e.target.value)}
          />
        </div>
        <div className="field">
          <label>Contact</label>
          <input
            type="text"
            value={order.contactInfo}
            onChange={(e) => updateField("contactInfo", e.target.value)}
          />
        </div>
        <label style={{ display: "block", fontSize: "11.5px", color: "#9aa0a5", marginBottom: 8 }}>
          Garment type
        </label>
        <GarmentTypePicker
          value={order.garmentType}
          onChange={(v) => updateField("garmentType", v)}
        />
        <div className="field">
          <label>Status</label>
          <select
            className="select"
            value={order.status}
            onChange={(e) => updateField("status", e.target.value)}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Design notes</label>
          <textarea
            rows={4}
            value={order.designNotes}
            onChange={(e) => updateField("designNotes", e.target.value)}
          />
        </div>

        <div className="divider" />

        <label id="fabric-picker" style={{ display: "block", fontSize: "11.5px", color: "#9aa0a5", marginBottom: 8 }}>
          Fabric
        </label>
        <div className="fabric-picker">
          {fabricGroups.map(([group, items]) => (
            <div key={group} className="fabric-group">
              <div className="pm-slot-title">{group}</div>
              <div className="fabric-swatches">
                {items.map((f) => {
                  const label = fabricLabel(f);
                  return (
                    <button
                      type="button"
                      key={label}
                      className={`fabric-swatch${order.fabric?.name === label ? " fabric-swatch-active" : ""}`}
                      onClick={() => updateFabric("name", order.fabric?.name === label ? "" : label)}
                      title={f.sourceUrl || label}
                    >
                      {f.imageUrl ? <img src={f.imageUrl} alt={f.name} /> : <span className="fabric-swatch-noimg" aria-hidden="true" />}
                      <span className="fabric-swatch-label">{f.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {matchedFabric && (
          <div className="fabric-detail">
            {matchedFabric.imageUrl && <img src={matchedFabric.imageUrl} alt={matchedFabric.name} />}
            <p className="note">
              {matchedFabric.composition} — {matchedFabric.notes}
              {matchedFabric.sourceUrl && (
                <>
                  {" "}
                  <a href={matchedFabric.sourceUrl} target="_blank" rel="noreferrer">Supplier page ↗</a>
                </>
              )}
            </p>
          </div>
        )}
        {matchedFabricColors.length > 0 && (
          <div className="field">
            <label>
              Colour — {matchedFabricColors.length} from the supplier's own e-catalog
              {pickedFabricColor ? `: ${pickedFabricColor.code}${pickedFabricColor.category ? ` (${pickedFabricColor.category})` : ""}` : ""}
            </label>
            <FabricColorPicker
              colors={matchedFabricColors}
              colorHint={colorHint}
              onPick={(slot, hex) => setColorHint((prev) => ({ ...prev, [slot]: hex }))}
            />
          </div>
        )}
        <div className="field">
          <label>Fabric notes</label>
          <textarea
            rows={2}
            value={order.fabric?.notes || ""}
            onChange={(e) => updateFabric("notes", e.target.value)}
          />
        </div>

        <button className="btn-generate" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save order"}
        </button>

        {error && <p className="error">{error}</p>}
      </aside>

      <main>
        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ fontSize: 15, margin: 0 }}>Size chart</h2>
            <div style={{ display: "flex", gap: 8 }}>
              {isShirtType && (
                <button className="btn-add btn-inline" onClick={prefillStandardChart}>
                  Prefill from standard chart
                </button>
              )}
              <button className="btn-add btn-inline" onClick={addSizeRow}>
                + Add size
              </button>
            </div>
          </div>

          {(!order.sizes || order.sizes.length === 0) && (isMerchType || isCustomType) && (
            <p className="empty" style={{ padding: "20px 0" }}>
              No size rows — that's fine here: one set of pieces is drafted
              for the whole order. Add a row per size or colour only if you
              want a separate quantity for each.
            </p>
          )}
          {(!order.sizes || order.sizes.length === 0) && !isMerchType && !isCustomType && (
            <p className="empty" style={{ padding: "20px 0" }}>
              No sizes yet — this customer's own sizing goes here, so add
              a row (or prefill from the standard chart as a starting
              point) and adjust it to match.
            </p>
          )}

          <div className="size-chart">
            {(order.sizes || []).map((sz, idx) => (
              <SizeRow
                key={idx}
                size={sz}
                idx={idx}
                fields={fields}
                onChange={updateSizeRow}
                onMeasurement={updateSizeMeasurement}
                onRemove={removeSizeRow}
              />
            ))}
          </div>
        </section>

        <div className="divider" />

        <section>
          <h2 style={{ fontSize: 15, margin: "0 0 12px" }}>Mockup</h2>

          {isCustomType && (
            <CustomDesigner
              design={order.design}
              image={order.designImage}
              onDesign={(dd) => setOrder((prev) => ({ ...prev, design: dd }))}
              onImage={(url) => setOrder((prev) => ({ ...prev, designImage: url }))}
            />
          )}
          {(isShirtType || isBottomType || isMerchType || isSkirtType) && (
            <PatternMaker
              orderId={orderId}
              garmentType={order.garmentType}
              sizes={order.sizes}
              dartPositions={DART_POSITIONS}
              accessories={accessories}
              onAddAccessory={addAccessory}
              onRemoveAccessory={removeAccessory}
              onUpdateAccessory={updateAccessory}
              onMirrorAccessory={mirrorAccessory}
              onDragAccessory={dragAccessory}
              colorHint={colorHint}
              onColorHint={(c) => setColorHint((prev) => ({ ...prev, ...c }))}
              fabricColors={matchedFabricColors}
              referencePhoto={order.designImage}
              onReferencePhoto={(url) => setOrder((prev) => ({ ...prev, designImage: url }))}
              value={{ gender, dartPosition, sleeveStyle, sleeveFabric, collarEnabled, collarStyle, frontStyle, backStyle, hemStyle, neckline, trim, motifs, pattern: motifPattern, legStyle, shortsLength, frontPocket, backPocket, beltLoops, fly, trouserWaist, stripe, merch, skirt }}
              onChange={(patch) => {
                if ("gender" in patch) setGender(patch.gender);
                if ("dartPosition" in patch) setDartPosition(patch.dartPosition);
                if ("sleeveStyle" in patch) setSleeveStyle(patch.sleeveStyle);
                if ("sleeveFabric" in patch) setSleeveFabric(patch.sleeveFabric);
                if ("collarEnabled" in patch) setCollarEnabled(patch.collarEnabled);
                if ("collarStyle" in patch) setCollarStyle(patch.collarStyle);
                if ("frontStyle" in patch) setFrontStyle(patch.frontStyle);
                if ("backStyle" in patch) setBackStyle(patch.backStyle);
                if ("hemStyle" in patch) setHemStyle(patch.hemStyle);
                if ("neckline" in patch) setNeckline(patch.neckline);
                if ("trim" in patch) setTrim(patch.trim);
                if ("motifs" in patch) setMotifs(patch.motifs);
                if ("pattern" in patch) setMotifPattern(patch.pattern);
                if ("legStyle" in patch) setLegStyle(patch.legStyle);
                if ("shortsLength" in patch) setShortsLength(patch.shortsLength);
                if ("frontPocket" in patch) setFrontPocket(patch.frontPocket);
                if ("backPocket" in patch) setBackPocket(patch.backPocket);
                if ("beltLoops" in patch) setBeltLoops(patch.beltLoops);
                if ("fly" in patch) setFly(patch.fly);
                if ("trouserWaist" in patch) setTrouserWaist(patch.trouserWaist);
                if ("stripe" in patch) setStripe(patch.stripe);
                if ("merch" in patch) setMerch((prev) => ({ ...prev, ...patch.merch }));
                if ("skirt" in patch) setSkirt((prev) => ({ ...prev, ...patch.skirt }));
              }}
            />
          )}
          {!isCustomType && (
          <p className="note" style={{ marginTop: 0 }}>
              Pockets, embroidery, and sablon are added by clicking directly on the
              design preview below, once you've generated at least one mockup.
            </p>
          )}
          <div className="field" style={{ maxWidth: 420 }}>
            <label>Revision note</label>
            <input
              type="text"
              placeholder="e.g. v2 — lowered collar point per client feedback"
              value={mockupNote}
              onChange={(e) => setMockupNote(e.target.value)}
            />
          </div>
          <button
            className="btn-generate btn-inline"
            onClick={handleGenerate}
            disabled={generating || (!order.sizes?.length && !isMerchType && !isCustomType)}
          >
            {generating ? "Generating…" : "Generate mockup"}
          </button>

          {activeMockup && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "20px 0 12px" }}>
                <div className="mono" style={{ fontSize: 12.5, color: "#9aa0a5" }}>
                  Revision v{activeMockup.mockup.version}
                  {activeMockup.mockup.note ? ` — ${activeMockup.mockup.note}` : ""}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <button
                    className="btn-add btn-inline"
                    onClick={handleSendAllSizes}
                    disabled={sentAll}
                  >
                    {sentAll ? "Sent all sizes to layout ✓" : "Send all sizes to cutting layout"}
                  </button>
                  {sentFabricCounts && (
                    <span className="mono" style={{ fontSize: 11.5, color: "#9aa0a5" }}>
                      {sentFabricCounts.main} main-fabric piece{sentFabricCounts.main === 1 ? "" : "s"}
                      {sentFabricCounts.contrast > 0 ? `, ${sentFabricCounts.contrast} contrast-fabric piece${sentFabricCounts.contrast === 1 ? "" : "s"}` : ""} — kept as separate fabrics in the layout
                    </span>
                  )}
                </div>
              </div>

              {sizeLabels.length > 1 && (
                <div className="field" style={{ maxWidth: 200, marginBottom: 16 }}>
                  <label>Preview size</label>
                  <select
                    className="select"
                    value={activeSizeLabel}
                    onChange={(e) => {
                      setActiveSizeLabel(e.target.value);
                      setFocusIdx(0);
                    }}
                  >
                    {sizeLabels.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>
              )}

              {activePieces && !isCustomType && (
                <ErrorBoundary
                  fallback={
                    <div className="garment-preview">
                      <p className="draft-piece-notes" style={{ maxWidth: "none" }}>
                        The design preview couldn't be displayed. The cutting pieces below are unaffected.
                      </p>
                    </div>
                  }
                >
                  <GarmentFlatPreview
                    pieces={activePieces}
                    accessories={accessories}
                    gender={effectiveGender}
                    dartPosition={activeMockup.mockup.options?.dartPosition}
                    sleeveStyle={activeMockup.mockup.options?.sleeveStyle}
                    collarStyle={activeMockup.mockup.options?.collarStyle}
                    colorHint={colorHint}
                    fabricColors={matchedFabricColors}
                    pattern={activeMockup.mockup.options?.pattern || "solid"}
                    onColorChange={(c) => setColorHint((prev) => ({ ...prev, ...c }))}
                    merchItem={order.garmentType === "other" ? activeMockup.mockup.options?.merch?.item : undefined}
                    onAddAccessory={addAccessory}
                    onRemoveAccessory={removeAccessory}
                    onDragAccessory={dragAccessory}
                  />
                </ErrorBoundary>
              )}

              {activePieces && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <h3 style={{ fontSize: 14, margin: 0 }}>Cutting piece</h3>
                    <div className="field" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                      <label style={{ margin: 0 }}>Piece</label>
                      <select
                        className="select"
                        style={{ width: "auto" }}
                        value={focusIdx}
                        onChange={(e) => setFocusIdx(Number(e.target.value))}
                      >
                        {activePieces.map((p, i) => (
                          <option key={i} value={i}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="draft-grid">
                    <div className="draft-card">
                      <PiecePreview piece={activePieces[focusIdx]} pxPerCm={FOCUS_PX_PER_CM} />
                      <p className="draft-piece-notes" style={{ maxWidth: "none" }}>
                        {activePieces[focusIdx].notes}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </section>

        {order.mockups && order.mockups.length > 0 && (
          <>
            <div className="divider" />
            <section>
              <h2 style={{ fontSize: 15, margin: "0 0 12px" }}>Revision history</h2>
              <div className="revision-list">
                {order.mockups
                  .slice()
                  .reverse()
                  .map((m) => (
                    <div className="revision-row" key={m.version} onClick={() => viewRevision(m.version)}>
                      <span className="mono">v{m.version}</span>
                      <span className="revision-note">{m.note || "—"}</span>
                      <span className="mono revision-date">
                        {new Date(m.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
