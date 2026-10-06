import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import PatternMaker from "./PatternMaker.jsx";
import CustomDesigner from "./CustomDesigner.jsx";
import { customPayload } from "../lib/customDesign.js";
import GarmentFlatPreview from "./GarmentFlatPreview";
import ErrorBoundary from "./ErrorBoundary";
import CuttingPlan from "./CuttingPlan.jsx";
import PatternSummary from "./PatternSummary.jsx";
import SizeChartTable from "./SizeChartTable.jsx";
import GarmentTypePicker from "./GarmentTypePicker";
import FabricColorPicker from "./FabricColorPicker.jsx";
import FabricPicker, { FabricImage } from "./FabricPicker.jsx";
import { sleeveAlignment } from "../lib/garmentFlat.js";
import { fabricLabel, fabricSlug } from "../lib/fabricCatalog.js";
import { measurementFieldsFor } from "../lib/measurementFields.js";
import { fabricKey } from "../lib/fabricKeys.js";
import { GARMENT_LABELS } from "../lib/garmentTypes.js";
import { setLeaveWarning } from "../lib/leaveGuard.js";
import { clearLocalDraft, makeDraft, readLocalDraft, saveLocalDraft } from "../lib/localDraft.js";

const STATUS_OPTIONS = ["consultation", "mockup", "revision", "approved"];

const DEFAULT_MERCH = { item: "tote_bag", size: "medium", width: 0, height: 0, shape: "", strap: "", pocket: "none", bottom: "flat", brim: "short", closure: "zip" };

const DART_POSITIONS = [
  { key: "waist", label: "Waist (default)" },
  { key: "side", label: "Side seam" },
  { key: "french", label: "French (lower side)" },
  { key: "shoulder", label: "Shoulder" },
  { key: "armhole", label: "Armhole" },
  { key: "neckline", label: "Neckline" },
];

const MARGIN = 24;
const PX_PER_CM = 6;

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

const STEPS = [
  { key: "sizes", label: "Sizes" },
  { key: "design", label: "Design" },
  { key: "pattern", label: "Pattern" },
  { key: "cutting", label: "Cutting" },
];

// One scale for every piece in the grid, so sizes compare, and small enough
// that the biggest piece fits a card.
function pieceScale(pieces) {
  const biggest = Math.max(...pieces.map((p) => Math.max(p.cutWidth || p.width, p.cutHeight || p.height)));
  return Math.max(1.2, Math.min(3, 210 / biggest));
}

function StepEmpty({ text, onGo }) {
  return (
    <div className="step-empty">
      <p>{text}</p>
      <button type="button" className="btn-add btn-inline" onClick={onGo}>
        Go to Design
      </button>
    </div>
  );
}

function emptySizeRow() {
  return { label: "", quantity: 1, measurements: {} };
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
  // How roomy a shirt is: "" keeps only the size chart's ease (how older
  // revisions were made), "regular" and "loose" add the usual shirt ease.
  const [fit, setFit] = useState("regular");
  // The shirt's cut: "" the classic block, "konveksi" the shop's uniform block,
  // sized by the shop chart that konveksi re-anchors ({ baseSize, chest, length }).
  const [block, setBlock] = useState("");
  const [konveksi, setKonveksi] = useState({});
  const [sleevePlacket, setSleevePlacket] = useState(""); // "" = the pointed tower placket
  const [sleeveStyle, setSleeveStyle] = useState("full");
  const [sleeveFabric, setSleeveFabric] = useState("main");
  const [colorBlock, setColorBlock] = useState("none");
  const [motifPatterns, setMotifPatterns] = useState({});
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
  // Which step of the order is open: the size chart, the design, the drafted
  // pattern, or the cutting plan. Opens on Design once there are sizes.
  const [step, setStep] = useState("design");
  const [justSaved, setJustSaved] = useState(false); // a mockup was just generated from the Design step
  // What has changed since the order was loaded or saved: the order itself
  // (sizes, names, fabric, colours) and the design (parts and extras, which
  // are kept only when a mockup is generated).
  const [unsaved, setUnsaved] = useState({ order: false, design: false });
  // Set when a save was refused because the order was saved elsewhere first.
  const [conflict, setConflict] = useState(null);
  // Unsaved changes kept in this browser from last time (a crash, a power
  // cut), offered back until restored or discarded.
  const [recovery, setRecovery] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false); // the order's details, on a phone
  const [historyReady, setHistoryReady] = useState(false);
  const [settledKey, setSettledKey] = useState(null); // the design as it last settled
  const [past, setPast] = useState([]); // earlier settled designs, oldest first
  const [future, setFuture] = useState([]); // undone designs, next first
  const markUnsaved = (part) => setUnsaved((u) => (u[part] ? u : { ...u, [part]: true }));
  function editOrder(update) {
    setOrder(update);
    markUnsaved("order");
  }
  function editColors(c) {
    setColorHint((prev) => ({ ...prev, ...c }));
    markUnsaved("order");
  }
  const leaveMessage = unsaved.order
    ? "This order has changes that aren't saved. Leave without saving them?"
    : unsaved.design
      ? "The design has changes that aren't in a mockup yet. Leave without generating one?"
      : null;
  // While something is unsaved, leaving asks first: the app's own links
  // through the guard, closing or reloading the tab through the browser.
  useEffect(() => {
    setLeaveWarning(leaveMessage);
    if (!leaveMessage) return undefined;
    const hold = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", hold);
    return () => {
      window.removeEventListener("beforeunload", hold);
      setLeaveWarning(null);
    };
  }, [leaveMessage]);
  const [typeOpen, setTypeOpen] = useState(false); // the garment-type picker, folded away once chosen
  const [fabricOpen, setFabricOpen] = useState(false); // the fabric grid, folded away behind Choose/Change
  // Each step opens at its top, not wherever the last one was scrolled to.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);
  const [sentFabricCounts, setSentFabricCounts] = useState(null); // { main, contrast } piece counts, once sent

  // Loads the order and, if it has one, its latest revision. A slower answer for
  // an order the person has already moved on from is dropped, not shown.
  const loadSeq = useRef(0);
  async function loadOrder() {
    const mine = ++loadSeq.current;
    const stale = () => mine !== loadSeq.current;
    const kept = readLocalDraft(orderId);
    setRecovery(null);
    setOrder(null);
    setActiveMockup(null);
    setError(null);
    setHistoryReady(false);
    setConflict(null);
    setSettledKey(null);
    setPast([]);
    setFuture([]);
    try {
      const o = await api.getOrder(orderId);
      if (stale()) return;
      setOrder(o);
      setUnsaved({ order: false, design: false });
      setStep(o.sizes?.length || o.garmentType === "other" || o.garmentType === "custom" ? "design" : "sizes");
      setJustSaved(false);
      setColorHint(o.previewColors?.main || o.previewColors?.accent ? { ...o.previewColors } : null);
      // Jump straight to the latest revision instead of leaving the
      // mockup section blank when reopening an order that already
      // has one.
      if (o.mockups && o.mockups.length > 0) {
        const latest = o.mockups[o.mockups.length - 1].version;
        try {
          const res = await api.getMockup(orderId, latest);
          if (stale()) return;
          setActiveMockup(res);
          setActiveSizeLabel(res.mockup?.sizes?.find((sz) => res.pieces[sz.label])?.label || Object.keys(res.pieces)[0] || null);
          setAccessories(res.mockup.options?.addOns?.accessories || []);
          restoreOptions(res.mockup.options || {});
        } catch (e) {
          if (!stale()) setError(`The order opened, but its latest revision couldn't be loaded: ${e.message}`);
        }
      }
      if (!stale()) setHistoryReady(true); // what was loaded is where undo stops
      if (!stale() && kept) setRecovery({ ...kept, savedSince: kept.baseUpdatedAt !== o.updatedAt });
    } catch (e) {
      if (!stale()) setError(e.message);
    }
  }

  useEffect(() => {
    const seq = loadSeq;
    loadOrder();
    return () => {
      seq.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  // The catalog and its colours are extras: without them the fabric picker is
  // just empty, so a failure is noted in the console, not shown as an error.
  useEffect(() => {
    let cancelled = false;
    api
      .fabrics()
      .then((f) => !cancelled && setFabrics(f))
      .catch((e) => console.warn("Couldn't load the fabric catalog:", e.message));
    api
      .fabricColors()
      .then((c) => !cancelled && setFabricColors(c))
      .catch((e) => console.warn("Couldn't load the fabric colours:", e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  // Sets the maker's choices back to what a saved revision was made with, so
  // reopening an order shows the garment that was built, not the defaults.
  function restoreOptions(opt) {
    setGender(opt.gender || "unisex");
    setFit(opt.fit || "");
    setBlock(opt.block || "");
    setKonveksi(opt.konveksi || {});
    setSleevePlacket(opt.sleevePlacket || "");
    setDartPosition(opt.dartPosition || "waist");
    setSleeveStyle(opt.sleeveStyle || "full");
    setSleeveFabric(opt.sleeveFabric || "main");
    setColorBlock(opt.colorBlock || "none");
    setMotifPatterns(opt.motifPatterns || {});
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
    editOrder((prev) => ({ ...prev, [key]: value }));
  }
  function updateFabric(key, value) {
    editOrder((prev) => ({ ...prev, fabric: { ...prev.fabric, [key]: value } }));
  }
  function updateSizeRow(idx, patch) {
    editOrder((prev) => {
      const sizes = prev.sizes.slice();
      sizes[idx] = { ...sizes[idx], ...patch };
      return { ...prev, sizes };
    });
  }
  function updateSizeMeasurement(idx, key, value) {
    editOrder((prev) => {
      const sizes = prev.sizes.slice();
      const measurements = { ...sizes[idx].measurements };
      if (value === "") delete measurements[key];
      else measurements[key] = Number(value);
      sizes[idx] = { ...sizes[idx], measurements };
      return { ...prev, sizes };
    });
  }
  function addSizeRow() {
    editOrder((prev) => ({ ...prev, sizes: [...(prev.sizes || []), emptySizeRow()] }));
  }
  function removeSizeRow(idx) {
    editOrder((prev) => ({ ...prev, sizes: prev.sizes.filter((_, i) => i !== idx) }));
  }

  async function prefillStandardChart() {
    try {
      const run = await api.grade({});
      const rows = run.map((row) => ({
        label: row.size,
        quantity: 1,
        measurements: row.measurements,
      }));
      editOrder((prev) => ({ ...prev, sizes: [...(prev.sizes || []), ...rows] }));
    } catch (e) {
      setError(e.message);
    }
  }

  // The same standard-chart prefill, but for the elementary-school age
  // run (6-12) the child block is graded for — a school/PE shirt order
  // is exactly the case this covers, and previously had no way to reach
  // it: DraftChildBodice/grade-child existed only on the backend.
  async function prefillChildChart() {
    try {
      const run = await api.gradeChild({});
      const rows = run.map((row) => ({
        label: `Age ${row.size}`,
        quantity: 1,
        measurements: row.measurements,
      }));
      editOrder((prev) => ({ ...prev, sizes: [...(prev.sizes || []), ...rows] }));
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
      setUnsaved((u) => ({ ...u, order: false }));
      return updated;
    } catch (e) {
      if (e.status === 409) setConflict(e.message);
      else setError(e.message);
      return null;
    } finally {
      setSaving(false);
    }
  }

  // Saves what the cut really used, along with the rest of the order as it is
  // on screen (the same as Save order). Throws so the form can show the error.
  async function saveActualFabric(actualFabric) {
    const updated = await api.updateOrder(orderId, { ...order, actualFabric, previewColors: { main: colorHint?.main, accent: colorHint?.accent } }).catch((e) => {
      if (e.status === 409) setConflict(e.message);
      throw e;
    });
    setOrder(updated);
    setUnsaved((u) => ({ ...u, order: false }));
  }

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      // The backend drafts from the saved order, not local edits, so
      // an unsaved size-chart change would otherwise be silently
      // ignored — save first so what's on screen is what gets drafted.
      if (!(await handleSave())) return; // the save error is already showing
      const payload = { note: mockupNote, accessories };
      if (isShirtType) {
        payload.gender = gender;
        payload.fit = fit;
        payload.block = block;
        payload.konveksi = konveksi;
        payload.sleevePlacket = sleevePlacket;
        payload.sleeveStyle = sleeveStyle;
        payload.sleeveFabric = sleeveFabric;
        payload.colorBlock = colorBlock === "none" ? "" : colorBlock;
        payload.dartPosition = dartPosition;
        payload.frontStyle = frontStyle;
        payload.backStyle = backStyle;
        payload.hemStyle = hemStyle;
        payload.neckline = neckline;
        payload.trim = trim;
        payload.panel = motifs.includes("side") ? "side" : "none";
        payload.motifs = motifs.filter((m) => m !== "side");
        payload.pattern = motifPattern;
        payload.motifPatterns = Object.fromEntries(Object.entries(motifPatterns).filter(([band]) => motifs.includes(band)));
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
      setUnsaved({ order: false, design: false });
      setActiveMockup({ mockup: res.mockup, pieces: res.pieces, summaries: res.summaries });
      setJustSaved(true);
      setActiveSizeLabel(res.mockup?.sizes?.find((sz) => res.pieces[sz.label])?.label || Object.keys(res.pieces)[0] || null);
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
    if (unsaved.design && !window.confirm("Showing another revision replaces the extras you've changed since the last mockup. Show it anyway?")) return;
    setError(null);
    try {
      const res = await api.getMockup(orderId, version);
      setActiveMockup(res);
      setActiveSizeLabel(res.mockup?.sizes?.find((sz) => res.pieces[sz.label])?.label || Object.keys(res.pieces)[0] || null);
      setFocusIdx(0);
      setSentAll(false);
      setAccessories(res.mockup.options?.addOns?.accessories || []);
    } catch (e) {
      setError(e.message);
    }
  }

  function addAccessory(type, segment, position, extra) {
    markUnsaved("design");
    const id = `acc-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const base = { id, type, segment, ...extra };
    // On a sleeve an extra follows the arm unless a specific angle is given.
    if (base.rotation === undefined && sleeveAlignment(segment, base.view, sleeveStyle)) base.rotation = sleeveAlignment(segment, base.view, sleeveStyle);
    if (position) base.position = position;
    if (type !== "pocket") {
      base.width = extra?.width ?? 6;
      base.height = extra?.height ?? 6;
      base.label = extra?.label || "";
    }
    setAccessories((prev) => [...prev, base]);
    return id;
  }

  // A matching extra on the other side: the left chest pocket's twin on the
  // right, a sleeve pocket's twin on the other sleeve, or a mirrored position.
  function mirrorAccessory(id) {
    markUnsaved("design");
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
    markUnsaved("design");
    setAccessories((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  function removeAccessory(id) {
    markUnsaved("design");
    setAccessories((prev) => prev.filter((a) => a.id !== id));
  }

  function dragAccessory(id, fraction) {
    markUnsaved("design");
    setAccessories((prev) => prev.map((a) => (a.id === id ? { ...a, position: fraction } : a)));
  }

  // "contrast" for a motif band, an insert panel, a V-neck/collar trim or a
  // side stripe — everything else is the garment's main fabric. Different
  // fabric means a different bolt of cloth, so the cutting layout has to nest
  // and count yardage for each one separately rather than as one length.
  function fabricOf(piece) {
    return fabricKey(piece); // each motif is its own cloth
  }

  function colorFor(piece) {
    // Prefer the colour actually picked for this fabric in the preview
    // (colorHint), so the cutting layout's swatches match what's on screen —
    // fall back to a per-part heuristic only when nothing was picked.
    if (fabricOf(piece) !== "main" && colorHint?.accent) return colorHint.accent;
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
      // A half drawn against a fold is laid out and cut as the whole piece.
      ...(piece.foldEdge === "left" ? { foldEdge: "left" } : {}),
      ...(fabric !== "main" ? { fabric } : {}),
    });
  }

  async function handleSendAllSizes() {
    if (!activeMockup) return;
    setError(null);
    const counts = { main: 0 };
    try {
      for (const sz of order.sizes) {
        const pieces = activeMockup.pieces[sz.label];
        if (!pieces) continue;
        for (const piece of pieces) {
          counts[fabricOf(piece)] = (counts[fabricOf(piece)] || 0) + 1;
          await sendPiece(piece, sz.label, sz.quantity);
        }
      }
      setSentAll(true);
      setSentFabricCounts(counts);
    } catch (e) {
      setError(e.message);
    }
  }

  // A change to the design: parts picked in the maker, or a state put back
  // by undo or redo.
  function applyDesign(patch) {
    markUnsaved("design");
    if ("gender" in patch) setGender(patch.gender);
    if ("fit" in patch) setFit(patch.fit);
    if ("block" in patch) setBlock(patch.block);
    if ("konveksi" in patch) setKonveksi(patch.konveksi);
    if ("sleevePlacket" in patch) setSleevePlacket(patch.sleevePlacket);
    if ("dartPosition" in patch) setDartPosition(patch.dartPosition);
    if ("sleeveStyle" in patch) setSleeveStyle(patch.sleeveStyle);
    if ("sleeveFabric" in patch) setSleeveFabric(patch.sleeveFabric);
    if ("colorBlock" in patch) setColorBlock(patch.colorBlock);
    if ("motifPatterns" in patch) setMotifPatterns(patch.motifPatterns);
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
  }

  // Undo and redo for the design. Every settled state of the parts and
  // extras is a step: a drag or a slider counts once, when it stops.
  const designValue = { gender, fit, block, konveksi, sleevePlacket, dartPosition, sleeveStyle, sleeveFabric, colorBlock, motifPatterns, collarEnabled, collarStyle, frontStyle, backStyle, hemStyle, neckline, trim, motifs, pattern: motifPattern, legStyle, shortsLength, frontPocket, backPocket, beltLoops, fly, trouserWaist, stripe, merch, skirt };
  const designKey = JSON.stringify({ value: designValue, accessories });

  // Keep unsaved changes in this browser while working, a moment after each
  // change, and forget them once everything is saved. Nothing is written
  // while an offer to restore older ones is still open.
  useEffect(() => {
    if (!historyReady || recovery) return undefined;
    if (!unsaved.order && !unsaved.design) {
      clearLocalDraft(orderId);
      return undefined;
    }
    const t = setTimeout(
      () => saveLocalDraft(orderId, makeDraft({ order, colorHint, design: designValue, accessories, orderChanged: unsaved.order, designChanged: unsaved.design })),
      600,
    );
    return () => clearTimeout(t);
    // designValue is rebuilt each render; designKey stands for it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyReady, recovery, unsaved, order, colorHint, designKey, orderId]);

  function restoreDraft() {
    const k = recovery;
    if (k.orderChanged && k.order) {
      editOrder((prev) => ({ ...prev, ...k.order }));
      if (k.colorHint) setColorHint(k.colorHint);
    }
    if (k.designChanged && k.design) {
      applyDesign(k.design);
      setAccessories(k.accessories || []);
    }
    setRecovery(null);
  }
  function discardDraft() {
    clearLocalDraft(orderId);
    setRecovery(null);
  }

  useEffect(() => {
    if (!historyReady || designKey === settledKey) return undefined;
    const t = setTimeout(() => {
      if (settledKey !== null) {
        setPast((p) => [...p.slice(-59), settledKey]);
        setFuture([]);
      }
      setSettledKey(designKey);
    }, 400);
    return () => clearTimeout(t);
  }, [designKey, settledKey, historyReady]);
  // A change made but not yet settled is undone first.
  const changing = settledKey !== null && designKey !== settledKey;
  function restoreDesign(key) {
    const snap = JSON.parse(key);
    applyDesign(snap.value);
    setAccessories(snap.accessories);
    setSettledKey(key);
  }
  function undo() {
    if (changing) {
      setFuture((f) => [designKey, ...f]);
      restoreDesign(settledKey);
      return;
    }
    if (!past.length) return;
    setFuture((f) => [designKey, ...f]);
    setPast((p) => p.slice(0, -1));
    restoreDesign(past[past.length - 1]);
  }
  function redo() {
    if (!future.length || changing) return;
    setPast((p) => [...p, designKey]);
    setFuture((f) => f.slice(1));
    restoreDesign(future[0]);
  }
  // ⌘Z / Ctrl+Z undoes, with Shift (or Ctrl+Y) redoes, on the Design step
  // and outside text boxes, which keep their own undo.
  useEffect(() => {
    if (step !== "design") return undefined;
    function onKey(e) {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!order) {
    return (
      <div className="tab-body">
        <main>
          {error ? (
            <div className="empty load-failed" role="alert">
              <p>Couldn't open this order.</p>
              <p className="load-failed-detail">{error}</p>
              <div className="load-failed-actions">
                <button className="btn-add btn-inline" onClick={loadOrder}>Try again</button>
                <button className="btn-add btn-inline btn-ghost" onClick={onBack}>Back to orders</button>
              </div>
            </div>
          ) : (
            <p className="empty">Loading order…</p>
          )}
        </main>
      </div>
    );
  }

  // In the size chart's order (S, M, L…), not the alphabetical order the pieces come keyed in.
  const sizeLabels = activeMockup
    ? [...new Set([...(activeMockup.mockup.sizes || []).map((sz) => sz.label), ...Object.keys(activeMockup.pieces)])].filter((l) => activeMockup.pieces[l])
    : [];
  const activePieces = activeMockup && activeSizeLabel ? activeMockup.pieces[activeSizeLabel] : null;
  // Two catalog entries can share a plain name across brands (both Verlando
  // and Maryland sell a "Tropical Deluxe"), so the stored/matched value is
  // brand-qualified wherever a brand exists, not the bare name.
  const matchedFabric = fabrics.find((f) => fabricLabel(f) === order.fabric?.name);
  const matchedFabricColors = matchedFabric ? fabricColors[fabricSlug(matchedFabric)] || [] : [];
  const pickedFabricColor = matchedFabricColors.find((c) => c.hex === colorHint?.main);
  const fields = measurementFieldsFor(order.garmentType);

  // The one-line state shown under each step's name.
  function stepStatus(key) {
    if (key === "sizes") {
      const n = order.sizes?.length || 0;
      const pcs = (order.sizes || []).reduce((t, sz) => t + (Number(sz.quantity) || 0), 0);
      return n ? `${n} size${n === 1 ? "" : "s"} · ${pcs} pcs` : "add sizes";
    }
    if (key === "design") return unsaved.design ? "unsaved changes" : activeMockup ? `v${activeMockup.mockup.version} saved` : "not saved yet";
    if (key === "pattern") {
      if (!activeMockup) return "—";
      const checks = Object.values(activeMockup.summaries || {}).flatMap((sm) => sm.checks || []);
      if (!checks.length) return `v${activeMockup.mockup.version}`;
      const bad = checks.filter((c) => !c.ok).length;
      return bad ? `${bad} check${bad === 1 ? "" : "s"} to fix` : "all seam checks pass";
    }
    if (key === "cutting") return order.actualFabric?.meters ? `${order.actualFabric.meters} m used` : activeMockup ? "plan the fabric" : "—";
    return "";
  }
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
          Order #{order.id} · created {new Date(order.createdAt).toLocaleDateString("id-ID")}
        </p>
        {/* On a phone the order's details fold away, so the steps come first. */}
        <button type="button" className="phone-only phone-fold-toggle" onClick={() => setDetailsOpen((o) => !o)} aria-expanded={detailsOpen}>
          Order details: {order.status}
          {order.fabric?.name ? ` · ${order.fabric.name}` : ""} <span aria-hidden="true">{detailsOpen ? "▴" : "▾"}</span>
        </button>
        <div className={`phone-fold${detailsOpen ? " is-open" : ""}`}>

        <div className="field">
          <label>Customer / school name</label>
          <input
            type="text"
            value={order.customerName}
            maxLength={200}
            onChange={(e) => updateField("customerName", e.target.value)}
          />
        </div>
        <div className="field">
          <label>Contact</label>
          <input
            type="text"
            value={order.contactInfo}
            maxLength={400}
            onChange={(e) => updateField("contactInfo", e.target.value)}
          />
        </div>
        <div className="field">
          <label id="garment-type-label">Garment type</label>
          {typeOpen ? (
            <GarmentTypePicker
              value={order.garmentType}
              onChange={(v) => {
                updateField("garmentType", v);
                setTypeOpen(false);
              }}
            />
          ) : (
            <div className="type-current" aria-labelledby="garment-type-label">
              <span>{GARMENT_LABELS[order.garmentType] || order.garmentType}</span>
              <button type="button" className="link-btn" onClick={() => setTypeOpen(true)}>
                Change
              </button>
            </div>
          )}
        </div>
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
            maxLength={20000}
            onChange={(e) => updateField("designNotes", e.target.value)}
          />
        </div>

        <div className="divider" />

        <div className="field" id="fabric-picker">
          <label id="fabric-label">Fabric</label>
          <div className="type-current" aria-labelledby="fabric-label">
            <span className={order.fabric?.name ? "" : "type-current-empty"}>{order.fabric?.name || "Not chosen yet"}</span>
            <button type="button" className="link-btn" onClick={() => setFabricOpen((o) => !o)} aria-expanded={fabricOpen}>
              {fabricOpen ? "Close" : order.fabric?.name ? "Change" : "Choose"}
            </button>
          </div>
          {fabricOpen && (
            <FabricPicker
              fabrics={fabrics}
              currentName={order.fabric?.name}
              onPick={(name) => {
                updateFabric("name", name);
                setFabricOpen(false);
              }}
            />
          )}
        </div>
        {matchedFabric && (
          <div className="fabric-detail">
            <FabricImage key={matchedFabric.imageUrl} src={matchedFabric.imageUrl} alt={matchedFabric.name} fallback={null} />
            <div className="fabric-detail-info">
              <p className="fabric-detail-composition">{matchedFabric.composition}</p>
              {matchedFabric.benefits?.length > 0 && (
                <div className="fabric-benefit-chips">
                  {matchedFabric.benefits.map((b) => (
                    <span key={b} className="fabric-benefit-chip">{b}</span>
                  ))}
                </div>
              )}
              {matchedFabric.usedFor && <p className="fabric-detail-usedfor">Used for {matchedFabric.usedFor.charAt(0).toLowerCase() + matchedFabric.usedFor.slice(1)}</p>}
              {matchedFabric.sourceUrl && (
                <a className="fabric-detail-link" href={matchedFabric.sourceUrl} target="_blank" rel="noreferrer">Supplier page ↗</a>
              )}
            </div>
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
              onPick={(slot, hex) => editColors({ [slot]: hex })}
            />
          </div>
        )}
        <div className="field">
          <label>Fabric notes</label>
          <textarea
            rows={2}
            value={order.fabric?.notes || ""}
            maxLength={20000}
            onChange={(e) => updateFabric("notes", e.target.value)}
          />
        </div>

        </div>

        <button className={`btn-generate${unsaved.order ? " has-changes" : ""}`} onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : unsaved.order ? "Save changes" : "Save order"}
        </button>
        {unsaved.order && !saving && <p className="unsaved-line">Unsaved changes</p>}

        {error && <p className="error">{error}</p>}
      </aside>

      <main className="order-main">
        {recovery && (
          <div className="conflict-banner recovery-banner" role="alert">
            <p>
              Changes you hadn't saved were kept from {new Date(recovery.savedAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
              {recovery.orderChanged && recovery.designChanged ? " (the order and the design)" : recovery.orderChanged ? " (the order)" : " (the design)"}.
              {recovery.savedSince ? " The order has been saved since then: restoring puts your kept changes over it." : ""}
            </p>
            <button type="button" className="btn-add btn-inline" onClick={restoreDraft}>
              Restore them
            </button>
            <button type="button" className="btn-add btn-inline btn-ghost" onClick={discardDraft}>
              Discard
            </button>
          </div>
        )}
        {conflict && (
          <div className="conflict-banner" role="alert">
            <p>{conflict}</p>
            <button
              type="button"
              className="btn-add btn-inline"
              onClick={() => {
                if (!unsaved.order && !unsaved.design) loadOrder();
                else if (window.confirm("Reload the order? What you changed here since your last save will be lost.")) loadOrder();
              }}
            >
              Reload the order
            </button>
          </div>
        )}
        <nav className="order-steps" aria-label="Order steps">
          {STEPS.map((st, i) => (
            <button
              type="button"
              key={st.key}
              className={`order-step${step === st.key ? " is-current" : ""}`}
              aria-current={step === st.key ? "step" : undefined}
              onClick={() => setStep(st.key)}
            >
              <span className="order-step-num">{i + 1}</span>
              <span className="order-step-text">
                <span className="order-step-label">{st.label}</span>
                <span className="order-step-status">{stepStatus(st.key)}</span>
              </span>
            </button>
          ))}
        </nav>

        {step === "sizes" && (
        <section>
          <div className="section-head">
            <h2>Size chart</h2>
            <div className="section-head-actions">
              {isShirtType && (
                <button className="btn-add btn-inline btn-ghost" onClick={prefillStandardChart}>
                  Prefill: adult chart
                </button>
              )}
              {isShirtType && (
                <button className="btn-add btn-inline btn-ghost" onClick={prefillChildChart} title="Elementary-school age run (6-12), dartless child block">
                  Prefill: children's chart
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

          <SizeChartTable
            sizes={order.sizes || []}
            fields={fields}
            onSize={updateSizeRow}
            onMeasurement={updateSizeMeasurement}
            onRemove={removeSizeRow}
          />
        </section>
        )}

        {step === "design" && (
          <section>
          {isCustomType && (
            <CustomDesigner
              design={order.design}
              image={order.designImage}
              onDesign={(dd) => editOrder((prev) => ({ ...prev, design: dd }))}
              onImage={(url) => editOrder((prev) => ({ ...prev, designImage: url }))}
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
              onColorHint={editColors}
              fabricColors={matchedFabricColors}
              fabrics={fabrics}
              fabricName={order.fabric?.name}
              onFabricPick={(name) => updateFabric("name", name)}
              referencePhoto={order.designImage}
              onReferencePhoto={(url) => editOrder((prev) => ({ ...prev, designImage: url }))}
              value={designValue}
              onChange={applyDesign}
              history={{ canUndo: changing || past.length > 0, canRedo: future.length > 0 && !changing, undo, redo }}
            />
          )}
          <div className="mockup-actions">
            <div className="field">
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
              {generating ? "Generating…" : unsaved.design ? "Generate mockup with these changes" : "Generate mockup"}
            </button>
          </div>
            {justSaved && activeMockup && (
              <p className="saved-line" role="status">
                Saved as v{activeMockup.mockup.version}.{" "}
                <button type="button" className="link-btn" onClick={() => setStep("pattern")}>
                  See its pattern and measurements →
                </button>
              </p>
            )}
          </section>
        )}

        {step === "pattern" && !activeMockup && (
          <StepEmpty onGo={() => setStep("design")} text="There's no pattern yet: build the garment in Design and generate a mockup, and its pieces, finished measurements and seam check appear here." />
        )}
        {step === "pattern" && activeMockup && (
          <section className="pattern-step">
            <div className="pattern-step-head">
              <div className="field" style={{ margin: 0, minWidth: 240 }}>
                <label htmlFor="revision-pick">Revision</label>
                <select id="revision-pick" className="select" value={activeMockup.mockup.version} onChange={(e) => viewRevision(Number(e.target.value))}>
                  {(order.mockups || [])
                    .slice()
                    .reverse()
                    .map((m) => (
                      <option key={m.version} value={m.version}>
                        v{m.version}
                        {m.note && m.note.trim().toLowerCase() !== `v${m.version}` ? ` — ${m.note}` : ""} · {new Date(m.createdAt).toLocaleDateString("id-ID")}
                      </option>
                    ))}
                </select>
              </div>
              {!isCustomType && (
                <a className="btn-add btn-inline btn-ghost" href={`#sheet-${orderId}-v${activeMockup.mockup.version}`} target="_blank" rel="noreferrer">
                  Pattern sheet ↗
                </a>
              )}
            </div>

            <div className={`pattern-step-grid${activeMockup.summaries ? "" : " is-single"}`}>
              <div>
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
                    readOnly
                    pieces={activePieces}
                    accessories={accessories}
                    gender={effectiveGender}
                    dartPosition={activeMockup.mockup.options?.dartPosition}
                    sleeveStyle={activeMockup.mockup.options?.sleeveStyle}
                    collarStyle={activeMockup.mockup.options?.collarStyle}
                    colorHint={colorHint}
                    fabricColors={matchedFabricColors}
                    fabrics={fabrics}
                    fabricName={order.fabric?.name}
                    onFabricPick={(name) => updateFabric("name", name)}
                    sharedControls={!(isShirtType || isBottomType || isMerchType || isSkirtType)}
                    pattern={activeMockup.mockup.options?.pattern || "solid"}
                    onColorChange={editColors}
                    merchItem={order.garmentType === "other" ? activeMockup.mockup.options?.merch?.item : undefined}
                    onAddAccessory={addAccessory}
                    onRemoveAccessory={removeAccessory}
                    onDragAccessory={dragAccessory}
                  />
                </ErrorBoundary>
              )}
              </div>
              {activeMockup.summaries && (
                <ErrorBoundary fallback={<p className="empty">The measurements couldn't be displayed.</p>}>
                  <PatternSummary
                    summaries={activeMockup.summaries}
                    sizeOrder={sizeLabels}
                    activeSize={activeSizeLabel}
                    onSize={(l) => {
                      setActiveSizeLabel(l);
                      setFocusIdx(0);
                    }}
                  />
                </ErrorBoundary>
              )}
            </div>

            {activePieces && (
              <section aria-labelledby="pieces-heading">
                <h3 id="pieces-heading" className="ps-heading">
                  Pieces, size {activeSizeLabel} <span className="ps-local">{activePieces.length} pieces · pick one for its cutting notes</span>
                </h3>
                <div className="piece-grid">
                  {activePieces.map((p, i) => (
                    <button type="button" key={`${p.name}-${i}`} className={`piece-card${i === focusIdx ? " is-current" : ""}`} onClick={() => setFocusIdx(i)} aria-pressed={i === focusIdx}>
                      <PiecePreview piece={p} pxPerCm={pieceScale(activePieces)} />
                    </button>
                  ))}
                </div>
                {activePieces[focusIdx] && (
                  <p className="draft-piece-notes piece-notes">
                    <b>{activePieces[focusIdx].name}.</b> {activePieces[focusIdx].notes}
                  </p>
                )}
              </section>
            )}
          </section>
        )}

        {step === "cutting" && !activeMockup && (
          <StepEmpty onGo={() => setStep("design")} text="There's nothing to cut yet: generate a mockup in Design first." />
        )}
        {step === "cutting" && activeMockup && (
          <section>
            {!isCustomType && (
              <>
            <ErrorBoundary fallback={<p className="empty">The cutting plan couldn't be displayed.</p>}>
              <CuttingPlan
                key={`${orderId}-${activeMockup.mockup.version}`}
                orderId={orderId}
                version={activeMockup.mockup.version}
                actualFabric={order.actualFabric}
                onSaveActual={saveActualFabric}
                fabric={matchedFabric}
              />
            </ErrorBoundary>
              </>
            )}
            <div className="cutting-send">
              <div>
                <h3 className="ps-heading">Cut one garment at a time instead</h3>
                <p className="note" style={{ margin: 0 }}>
                  Sends every garment's pieces, one by one, to the Cutting Layout to arrange by hand. For a whole order the cutting plan above is faster and wastes less.
                </p>
                {sentFabricCounts && (
                  <p className="mono" style={{ fontSize: 11.5, color: "var(--text-3)", margin: "6px 0 0" }}>
                    Sent {sentFabricCounts.main} main-fabric piece{sentFabricCounts.main === 1 ? "" : "s"}
                    {Object.keys(sentFabricCounts).length > 1
                      ? `, and ${Object.entries(sentFabricCounts).filter(([k]) => k !== "main").reduce((n, [, v]) => n + v, 0)} in ${Object.keys(sentFabricCounts).length - 1} other fabric${Object.keys(sentFabricCounts).length > 2 ? "s" : ""}`
                      : ""}{" "}
                    — each fabric laid out separately
                  </p>
                )}
              </div>
              <button className="btn-add btn-inline btn-ghost" onClick={handleSendAllSizes} disabled={sentAll}>
                {sentAll ? "Sent all sizes ✓" : "Send all sizes to cutting layout"}
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
