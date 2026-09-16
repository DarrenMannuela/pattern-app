import { useEffect, useState } from "react";
import { api } from "../api";
import Garment3DPreview from "./Garment3DPreview";
import ErrorBoundary from "./ErrorBoundary";
import GarmentTypePicker from "./GarmentTypePicker";

const STATUS_OPTIONS = ["consultation", "mockup", "revision", "approved"];

const EMBROIDERY_PLACEMENTS = [
  { key: "left_chest", label: "Left chest" },
  { key: "right_chest", label: "Right chest" },
  { key: "back", label: "Back" },
  { key: "sleeve", label: "Sleeve" },
];

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
  { key: "backWaistLength", label: "Nape to waist (cm)" },
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
    default:
      return SHIRT_FIELDS;
  }
}

const MARGIN = 24;
const PX_PER_CM = 6;
const FOCUS_PX_PER_CM = 8;

function PiecePreview({ piece, pxPerCm = PX_PER_CM }) {
  const w = piece.width * pxPerCm + MARGIN * 2;
  const h = piece.height * pxPerCm + MARGIN * 2;
  return (
    <div className="draft-piece">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="draft-svg">
        <g transform={`translate(${MARGIN},${MARGIN}) scale(${pxPerCm})`}>
          <path d={piece.pathData} fill="#3B7A82CC" stroke="#23272A" strokeWidth={0.4} />
          {piece.foldEdge === "left" && (
            <line
              x1={0}
              y1={-1}
              x2={0}
              y2={piece.height + 1}
              stroke="#8A7B54"
              strokeWidth={0.3}
              strokeDasharray="1.2,1"
            />
          )}
        </g>
      </svg>
      <div className="draft-piece-label">
        <span className="draft-piece-name">{piece.name}</span>
        <span className="draft-piece-dims mono">
          {piece.width}×{piece.height} cm
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
        <button className="link-btn" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Hide measurements" : "Edit measurements"}
        </button>
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
  const [dartPosition, setDartPosition] = useState("waist");
  const [shirtStyle, setShirtStyle] = useState("fitted"); // uniform_shirt only
  const [collarEnabled, setCollarEnabled] = useState(false); // uniform_shirt only
  const [collarStyle, setCollarStyle] = useState("convertible");
  const [chestPocket, setChestPocket] = useState(false);
  const [backPocket, setBackPocket] = useState(false);
  const [embroideryEnabled, setEmbroideryEnabled] = useState(false);
  const [embroideryPlacement, setEmbroideryPlacement] = useState("left_chest");
  const [embroideryWidth, setEmbroideryWidth] = useState("8");
  const [embroideryHeight, setEmbroideryHeight] = useState("8");
  const [embroideryLabel, setEmbroideryLabel] = useState("");
  const [mockupNote, setMockupNote] = useState("");
  const [generating, setGenerating] = useState(false);
  const [activeMockup, setActiveMockup] = useState(null); // { mockup, pieces }
  const [activeSizeLabel, setActiveSizeLabel] = useState(null);
  const [focusIdx, setFocusIdx] = useState(0);
  const [sentAll, setSentAll] = useState(false);

  useEffect(() => {
    setOrder(null);
    setActiveMockup(null);
    api
      .getOrder(orderId)
      .then((o) => {
        setOrder(o);
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
      const updated = await api.updateOrder(orderId, order);
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
      const payload = { note: mockupNote, dartPosition };
      if (order.garmentType === "uniform_shirt") {
        payload.style = shirtStyle;
        payload.collar = collarEnabled;
      }
      if (showCollarStyle) {
        payload.collarStyle = collarStyle;
      }
      if (["school_shirt", "pe_shirt", "uniform_shirt"].includes(order.garmentType)) {
        payload.chestPocket = chestPocket;
      }
      if (["pants", "shorts", "skirt"].includes(order.garmentType)) {
        payload.backPocket = backPocket;
      }
      if (embroideryEnabled) {
        payload.embroidery = {
          placement: embroideryPlacement,
          width: Number(embroideryWidth) || 8,
          height: Number(embroideryHeight) || 8,
          label: embroideryLabel,
        };
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
    } catch (e) {
      setError(e.message);
    }
  }

  function colorFor(piece) {
    const n = piece.name.toLowerCase();
    if (n.includes("sleeve")) return "#C79A3E";
    if (n.includes("collar")) return "#7A5B9C";
    if (n.includes("placket")) return "#4B8C5A";
    if (n.includes("waistband")) return "#5B6E9C";
    if (n.includes("back")) return "#B5453D";
    return "#3B7A82";
  }

  async function sendPiece(piece, sizeLabel, quantity) {
    await api.addPiece({
      name: `${piece.name} — ${order.customerName} ${sizeLabel}`,
      width: piece.width,
      height: piece.height,
      qty: 2 * Math.max(1, Number(quantity) || 1),
      color: colorFor(piece),
      grainLocked: true,
      pathData: piece.pathData,
    });
  }

  async function handleSendAllSizes() {
    if (!activeMockup) return;
    setError(null);
    try {
      for (const sz of order.sizes) {
        const pieces = activeMockup.pieces[sz.label];
        if (!pieces) continue;
        for (const piece of pieces) {
          await sendPiece(piece, sz.label, sz.quantity);
        }
      }
      setSentAll(true);
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
  const isStubGarment = order.garmentType === "other";
  const matchedFabric = fabrics.find((f) => f.name === order.fabric?.name);
  const fields = measurementFieldsFor(order.garmentType);
  const showDartPosition =
    order.garmentType === "school_shirt" ||
    (order.garmentType === "uniform_shirt" && shirtStyle === "fitted");
  const isShirtType = ["school_shirt", "pe_shirt", "uniform_shirt"].includes(order.garmentType);
  const showCollarStyle =
    order.garmentType === "school_shirt" || (order.garmentType === "uniform_shirt" && collarEnabled);
  const showChestPocket = isShirtType;
  const showBackPocket = ["pants", "shorts", "skirt"].includes(order.garmentType);
  const showAddOns = showChestPocket || showBackPocket;

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

        <label style={{ display: "block", fontSize: "11.5px", color: "#9aa0a5", marginBottom: 8 }}>
          Fabric
        </label>
        <div className="field">
          <select
            className="select"
            value={order.fabric?.name || ""}
            onChange={(e) => updateFabric("name", e.target.value)}
          >
            <option value="">— choose a fabric —</option>
            {fabrics.map((f) => (
              <option key={f.name} value={f.name}>{f.name}</option>
            ))}
          </select>
        </div>
        {matchedFabric && (
          <p className="note" style={{ marginTop: -6 }}>
            {matchedFabric.composition} — {matchedFabric.notes}
          </p>
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

          {(!order.sizes || order.sizes.length === 0) && (
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

          {order.garmentType === "uniform_shirt" && (
            <div className="row2" style={{ maxWidth: 420 }}>
              <div className="field">
                <label>Fit style</label>
                <select className="select" value={shirtStyle} onChange={(e) => setShirtStyle(e.target.value)}>
                  <option value="fitted">Fitted (bust dart)</option>
                  <option value="relaxed">Relaxed (dartless)</option>
                </select>
              </div>
              <div className="field">
                <label style={{ display: "flex", alignItems: "center", gap: 0 }}>Collar + placket</label>
                <label className="check" style={{ marginTop: 8 }}>
                  <input
                    type="checkbox"
                    checked={collarEnabled}
                    onChange={(e) => setCollarEnabled(e.target.checked)}
                  />
                  Include collar + button placket
                </label>
              </div>
            </div>
          )}
          {showCollarStyle && (
            <div className="field" style={{ maxWidth: 280 }}>
              <label>Collar style</label>
              <select className="select" value={collarStyle} onChange={(e) => setCollarStyle(e.target.value)}>
                <option value="convertible">Convertible (turn-down point)</option>
                <option value="standing">Standing band (mandarin/koko)</option>
              </select>
            </div>
          )}
          {showDartPosition && (
            <div className="field" style={{ maxWidth: 280 }}>
              <label>Front dart position</label>
              <select className="select" value={dartPosition} onChange={(e) => setDartPosition(e.target.value)}>
                {DART_POSITIONS.map((d) => (
                  <option key={d.key} value={d.key}>{d.label}</option>
                ))}
              </select>
            </div>
          )}
          {showAddOns && (
            <div className="addons-box">
              <label style={{ display: "block", fontSize: "11.5px", color: "#9aa0a5", marginBottom: 10 }}>
                Add-ons
              </label>
              {showChestPocket && (
                <label className="check">
                  <input type="checkbox" checked={chestPocket} onChange={(e) => setChestPocket(e.target.checked)} />
                  Chest pocket (patch)
                </label>
              )}
              {showBackPocket && (
                <label className="check">
                  <input type="checkbox" checked={backPocket} onChange={(e) => setBackPocket(e.target.checked)} />
                  Back pocket(s) (patch)
                </label>
              )}
              <label className="check" style={{ marginBottom: embroideryEnabled ? 12 : 0 }}>
                <input
                  type="checkbox"
                  checked={embroideryEnabled}
                  onChange={(e) => setEmbroideryEnabled(e.target.checked)}
                />
                Embroidery / logo placement
              </label>
              {embroideryEnabled && (
                <div className="addons-embroidery">
                  <div className="row2">
                    <div className="field">
                      <label>Placement</label>
                      <select
                        className="select"
                        value={embroideryPlacement}
                        onChange={(e) => setEmbroideryPlacement(e.target.value)}
                      >
                        {EMBROIDERY_PLACEMENTS.map((p) => (
                          <option key={p.key} value={p.key}>{p.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>Label / description</label>
                      <input
                        type="text"
                        placeholder="e.g. Logo SDN 01"
                        value={embroideryLabel}
                        onChange={(e) => setEmbroideryLabel(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="row2">
                    <div className="field">
                      <label>Width (cm)</label>
                      <input type="number" value={embroideryWidth} onChange={(e) => setEmbroideryWidth(e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Height (cm)</label>
                      <input type="number" value={embroideryHeight} onChange={(e) => setEmbroideryHeight(e.target.value)} />
                    </div>
                  </div>
                </div>
              )}
            </div>
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
            disabled={generating || !order.sizes?.length}
          >
            {generating ? "Generating…" : "Generate mockup"}
          </button>

          {isStubGarment && (
            <p className="note" style={{ marginTop: 12 }}>
              Pattern drafting for this garment type isn't built yet —
              generating a mockup will tell you that directly. The
              order, size chart, and notes above are still tracked and
              saved normally.
            </p>
          )}

          {activeMockup && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "20px 0 12px" }}>
                <div className="mono" style={{ fontSize: 12.5, color: "#9aa0a5" }}>
                  Revision v{activeMockup.mockup.version}
                  {activeMockup.mockup.note ? ` — ${activeMockup.mockup.note}` : ""}
                </div>
                <button
                  className="btn-add btn-inline"
                  onClick={handleSendAllSizes}
                  disabled={sentAll}
                >
                  {sentAll ? "Sent all sizes to layout ✓" : "Send all sizes to cutting layout"}
                </button>
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

              {activePieces && (
                <ErrorBoundary
                  fallback={
                    <div className="garment-preview">
                      <p className="draft-piece-notes" style={{ maxWidth: "none" }}>
                        The 3D preview couldn't be displayed. The cutting pieces below are unaffected.
                      </p>
                    </div>
                  }
                >
                  <Garment3DPreview
                    pieces={activePieces}
                    embroidery={activeMockup.mockup.options?.addOns?.embroidery}
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
                          <option key={p.name} value={i}>{p.name}</option>
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
