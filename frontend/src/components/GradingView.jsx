import { useState } from "react";
import { api } from "../api";

const FIELDS = [
  { key: "bust", label: "Bust/chest (cm)", placeholder: "90" },
  { key: "waist", label: "Waist (cm)", placeholder: "72" },
  { key: "backWaistLength", label: "Nape to waist (cm)", placeholder: "40" },
  { key: "shoulder", label: "Shoulder seam (cm)", placeholder: "12.5" },
  { key: "neck", label: "Neck circumference (cm)", placeholder: "36" },
  { key: "ease", label: "Wearing ease (cm)", placeholder: "6" },
];

const DART_POSITIONS = [
  { key: "waist", label: "Waist (default)" },
  { key: "side", label: "Side seam" },
  { key: "french", label: "French (lower side)" },
  { key: "shoulder", label: "Shoulder" },
  { key: "armhole", label: "Armhole" },
  { key: "neckline", label: "Neckline" },
];

const SIZES = ["S", "M", "L", "XL", "XXL", "XXXL"];

const SIZE_COLORS = {
  S: "#3B7A82",
  M: "#B5453D",
  L: "#8A7B54",
  XL: "#5B6E9C",
  XXL: "#7A5B9C",
  XXXL: "#9C5B7A",
};

const MARGIN = 16;
const PX_PER_CM = 4.4;

function MiniPreview({ piece, color }) {
  const w = piece.width * PX_PER_CM + MARGIN * 2;
  const h = piece.height * PX_PER_CM + MARGIN * 2;
  return (
    <div className="grade-piece">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="draft-svg">
        <g transform={`translate(${MARGIN},${MARGIN}) scale(${PX_PER_CM})`}>
          <path d={piece.pathData} fill={color + "CC"} stroke="#23272A" strokeWidth={0.5} />
        </g>
      </svg>
      <div className="grade-piece-label mono">
        {piece.name.replace("Bodice ", "")} · {piece.width}×{piece.height}cm
      </div>
    </div>
  );
}

export default function GradingView() {
  const [values, setValues] = useState({});
  const [dartPosition, setDartPosition] = useState("waist");
  const [baseSize, setBaseSize] = useState("M");
  const [included, setIncluded] = useState(() =>
    Object.fromEntries(SIZES.map((s) => [s, true]))
  );
  const [orderQty, setOrderQty] = useState({});
  const [run, setRun] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sentSizes, setSentSizes] = useState({});

  function setField(key, v) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  function toggleSize(sz) {
    setIncluded((prev) => ({ ...prev, [sz]: !prev[sz] }));
  }

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const payload = { dartPosition, baseSize };
      for (const f of FIELDS) {
        if (values[f.key] !== undefined && values[f.key] !== "") {
          payload[f.key] = Number(values[f.key]);
        }
      }
      payload.sizes = SIZES.filter((s) => included[s]);
      if (payload.sizes.length === 0) {
        setError("Select at least one size.");
        return;
      }
      const result = await api.grade(payload);
      setRun(result);
      setSentSizes({});
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSendSize(row) {
    const qty = Number(orderQty[row.size]) || 1;
    try {
      for (const piece of row.pieces) {
        await api.addPiece({
          name: `${piece.name} — ${row.size}`,
          width: piece.width,
          height: piece.height,
          qty: qty * 2, // half-pattern piece, cut twice per garment (or once if placed on fold)
          color: SIZE_COLORS[row.size],
          grainLocked: true,
          pathData: piece.pathData,
        });
      }
      setSentSizes((prev) => ({ ...prev, [row.size]: true }));
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleSendAll() {
    for (const row of run) {
      if (Number(orderQty[row.size]) > 0 && !sentSizes[row.size]) {
        await handleSendSize(row);
      }
    }
  }

  return (
    <div className="tab-body">
      <aside className="sidebar">
        <h1>Size Grading</h1>
        <p className="sub">
          Draft one base size, then generate the full size run from
          it automatically — no redrawing each size by hand.
        </p>

        {FIELDS.map((f) => (
          <div className="field" key={f.key}>
            <label>{f.label} — for size {baseSize}</label>
            <input
              type="number"
              placeholder={f.placeholder}
              value={values[f.key] ?? ""}
              onChange={(e) => setField(f.key, e.target.value)}
            />
          </div>
        ))}

        <div className="field">
          <label>Base size (the measurements above are this size)</label>
          <select
            className="select"
            value={baseSize}
            onChange={(e) => setBaseSize(e.target.value)}
          >
            {SIZES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Front dart position</label>
          <select
            className="select"
            value={dartPosition}
            onChange={(e) => setDartPosition(e.target.value)}
          >
            {DART_POSITIONS.map((d) => (
              <option key={d.key} value={d.key}>{d.label}</option>
            ))}
          </select>
        </div>

        <div className="divider" />

        <label style={{ display: "block", fontSize: "11.5px", color: "#9aa0a5", marginBottom: 8 }}>
          Sizes to include in the run
        </label>
        {SIZES.map((s) => (
          <label className="check" key={s}>
            <input
              type="checkbox"
              checked={!!included[s]}
              onChange={() => toggleSize(s)}
            />
            {s}
            {s === baseSize && <span className="mono" style={{ color: "#787e82" }}> (base)</span>}
          </label>
        ))}

        <button className="btn-generate" onClick={handleGenerate} disabled={loading}>
          {loading ? "Grading…" : "Generate size run"}
        </button>

        {error && <p className="error">{error}</p>}

        <p className="note">
          Grading applies standard adult increments per size step —
          bust/waist ±4cm, shoulder/neck ±1cm, torso length ±1.5cm —
          relative to your base size. Spot-check the smallest and
          largest sizes against a real fit before cutting a full order.
        </p>
      </aside>

      <main>
        {!run && (
          <p className="empty">
            Enter the base size's measurements, pick which sizes you
            need, and click "Generate size run" to see every size's
            pattern pieces here.
          </p>
        )}

        {run && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <p className="sub" style={{ margin: 0 }}>
                Enter an order quantity per size, then send each size
                (or all at once) to the cutting layout — sizes sent
                together get nested into one shared marker.
              </p>
              <button className="btn-add" style={{ width: "auto", padding: "10px 18px" }} onClick={handleSendAll}>
                Send all entered quantities
              </button>
            </div>

            <div className="draft-grid" style={{ flexDirection: "column", gap: 14 }}>
              {run.map((row) => (
                <div className="draft-card" key={row.size} style={{ width: "100%", display: "flex", alignItems: "center", gap: 20 }}>
                  <div style={{ width: 46, flexShrink: 0 }}>
                    <div
                      className="mono"
                      style={{
                        width: 40, height: 40, borderRadius: 6,
                        background: SIZE_COLORS[row.size], color: "#fff",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontWeight: 700, fontSize: 13,
                      }}
                    >
                      {row.size}
                    </div>
                  </div>

                  <div className="mono" style={{ fontSize: 11.5, color: "#9aa0a5", width: 180, flexShrink: 0, lineHeight: 1.7 }}>
                    Bust {row.measurements.bust}cm<br />
                    Waist {row.measurements.waist}cm<br />
                    Shoulder {row.measurements.shoulder}cm
                  </div>

                  <div style={{ display: "flex", gap: 12 }}>
                    {row.pieces.map((p) => (
                      <MiniPreview key={p.name} piece={p} color={SIZE_COLORS[row.size]} />
                    ))}
                  </div>

                  <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                    <div className="field" style={{ margin: 0, width: 90 }}>
                      <label>Order qty</label>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={orderQty[row.size] ?? ""}
                        onChange={(e) =>
                          setOrderQty((prev) => ({ ...prev, [row.size]: e.target.value }))
                        }
                      />
                    </div>
                    <button
                      className="btn-add"
                      style={{ width: "auto", padding: "10px 16px", marginTop: 14 }}
                      onClick={() => handleSendSize(row)}
                      disabled={sentSizes[row.size]}
                    >
                      {sentSizes[row.size] ? "Sent ✓" : "Send to layout"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
