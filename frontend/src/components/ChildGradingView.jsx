import { useState } from "react";
import { api } from "../api";

const FIELDS = [
  { key: "bust", label: "Chest (cm)", placeholder: "60" },
  { key: "waist", label: "Waist (cm) — recorded, not used yet", placeholder: "56" },
  { key: "backWaistLength", label: "Nape to hem / shirt length (cm)", placeholder: "28.7" },
  { key: "shoulder", label: "Shoulder seam (cm)", placeholder: "9.8" },
  { key: "neck", label: "Neck circumference (cm)", placeholder: "29" },
  { key: "ease", label: "Wearing ease (cm)", placeholder: "10" },
];

const SIZES = ["6", "7", "8", "9", "10", "11", "12"];

const SIZE_COLORS = {
  "6": "#3B7A82", "7": "#B5453D", "8": "#8A7B54", "9": "#5B6E9C",
  "10": "#7A5B9C", "11": "#9C5B7A", "12": "#4B8C5A",
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
        {piece.name.replace("Child bodice ", "")} · {piece.width}×{piece.height}cm
      </div>
    </div>
  );
}

export default function ChildGradingView() {
  const [values, setValues] = useState({});
  const [baseSize, setBaseSize] = useState("8");
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
      const payload = { baseSize };
      for (const f of FIELDS) {
        if (values[f.key] !== undefined && values[f.key] !== "") {
          payload[f.key] = Number(values[f.key]);
        }
      }
      payload.sizes = SIZES.filter((s) => included[s]);
      if (payload.sizes.length === 0) {
        setError("Select at least one age.");
        return;
      }
      const result = await api.gradeChild(payload);
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
          name: `${piece.name} — age ${row.size}`,
          width: piece.width,
          height: piece.height,
          qty: qty * 2,
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
        <h1>Kids' Sizing</h1>
        <p className="sub">
          A separate, dartless block — children don't have the bust
          curve a dart exists to shape for, so this isn't just the
          adult block with smaller numbers. Draft one base age, then
          generate the full age run.
        </p>

        {FIELDS.map((f) => (
          <div className="field" key={f.key}>
            <label>{f.label} — for age {baseSize}</label>
            <input
              type="number"
              placeholder={f.placeholder}
              value={values[f.key] ?? ""}
              onChange={(e) => setField(f.key, e.target.value)}
            />
          </div>
        ))}

        <div className="field">
          <label>Base age (the measurements above are this age)</label>
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

        <div className="divider" />

        <label style={{ display: "block", fontSize: "11.5px", color: "#9aa0a5", marginBottom: 8 }}>
          Ages to include in the run
        </label>
        {SIZES.map((s) => (
          <label className="check" key={s}>
            <input
              type="checkbox"
              checked={!!included[s]}
              onChange={() => toggleSize(s)}
            />
            Age {s}
            {s === baseSize && <span className="mono" style={{ color: "#787e82" }}> (base)</span>}
          </label>
        ))}

        <button className="btn-generate" onClick={handleGenerate} disabled={loading}>
          {loading ? "Grading…" : "Generate age run"}
        </button>

        {error && <p className="error">{error}</p>}

        <p className="note">
          Growth increments per age-year (chest +2cm, waist +1.5cm,
          shoulder +0.4cm, neck +0.5cm, length +1.3cm) are standard
          starting points across ages 6–12, not a fitted grade for any
          specific child or supplier chart — real growth isn't
          perfectly linear, especially around growth spurts. Spot-check
          the youngest and oldest sizes before cutting a full order.
        </p>
      </aside>

      <main>
        {!run && (
          <p className="empty">
            Enter the base age's measurements, pick which ages you
            need, and click "Generate age run" to see every age's
            pattern pieces here.
          </p>
        )}

        {run && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <p className="sub" style={{ margin: 0 }}>
                Enter an order quantity per age, then send each age
                (or all at once) to the cutting layout — ages sent
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
                    Chest {row.measurements.bust}cm<br />
                    Length {row.measurements.backWaistLength}cm<br />
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
