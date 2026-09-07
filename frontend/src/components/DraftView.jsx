import { useState } from "react";
import { api } from "../api";

const FIELDS = [
  { key: "bust", label: "Bust (cm)", placeholder: "90" },
  { key: "waist", label: "Waist (cm)", placeholder: "72" },
  { key: "backWaistLength", label: "Nape to waist (cm)", placeholder: "40" },
  { key: "shoulder", label: "Shoulder seam (cm)", placeholder: "12.5" },
  { key: "neck", label: "Neck circumference (cm)", placeholder: "36" },
  { key: "ease", label: "Wearing ease (cm)", placeholder: "6" },
];

const MARGIN = 24;
const PX_PER_CM = 6;

function PiecePreview({ piece }) {
  const w = piece.width * PX_PER_CM + MARGIN * 2;
  const h = piece.height * PX_PER_CM + MARGIN * 2;
  return (
    <div className="draft-piece">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        className="draft-svg"
      >
        <g transform={`translate(${MARGIN},${MARGIN}) scale(${PX_PER_CM})`}>
          <path
            d={piece.pathData}
            fill="#3B7A82CC"
            stroke="#23272A"
            strokeWidth={0.4}
          />
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

export default function DraftView() {
  const [values, setValues] = useState({});
  const [pieces, setPieces] = useState(null);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState(null);
  const [sentIds, setSentIds] = useState({});

  function setField(key, v) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  async function handleDraft() {
    setDrafting(true);
    setError(null);
    try {
      const measurements = {};
      for (const f of FIELDS) {
        if (values[f.key] !== undefined && values[f.key] !== "") {
          measurements[f.key] = Number(values[f.key]);
        }
      }
      const result = await api.draft(measurements);
      setPieces(result);
      setSentIds({});
    } catch (e) {
      setError(e.message);
    } finally {
      setDrafting(false);
    }
  }

  async function handleSend(piece, idx) {
    try {
      await api.addPiece({
        name: piece.name,
        width: piece.width,
        height: piece.height,
        qty: 2, // a half-front/half-back piece is cut twice (or on the fold)
        color: idx === 0 ? "#3B7A82" : "#B5453D",
        grainLocked: true,
      });
      setSentIds((prev) => ({ ...prev, [idx]: true }));
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="tab-body">
      <aside className="sidebar">
        <h1>Draft Pieces</h1>
        <p className="sub">
          Enter body measurements to generate a basic bodice front and
          back with real curved outlines — a rough sloper, not a
          fitted final pattern.
        </p>

        {FIELDS.map((f) => (
          <div className="field" key={f.key}>
            <label>{f.label}</label>
            <input
              type="number"
              placeholder={f.placeholder}
              value={values[f.key] ?? ""}
              onChange={(e) => setField(f.key, e.target.value)}
            />
          </div>
        ))}

        <button
          className="btn-generate"
          style={{ marginTop: 8 }}
          onClick={handleDraft}
          disabled={drafting}
        >
          {drafting ? "Drafting…" : "Draft pattern"}
        </button>

        {error && <p className="error">{error}</p>}

        <p className="note">
          Any field left blank uses a plausible average measurement, so
          you can try it immediately. Formulas here are the classic
          proportional shortcuts (e.g. armhole depth ≈ bust/4 + 2.5cm)
          used to rough out a block — refine fit with a muslin toile
          before cutting real fabric.
        </p>
      </aside>

      <main>
        {!pieces && (
          <p className="empty">
            Fill in measurements (or leave them blank for a default
            size) and click "Draft pattern" to see the front and back
            bodice pieces here.
          </p>
        )}

        {pieces && (
          <div className="draft-grid">
            {pieces.map((piece, idx) => (
              <div className="draft-card" key={piece.name}>
                <PiecePreview piece={piece} />
                <button
                  className="btn-add"
                  onClick={() => handleSend(piece, idx)}
                  disabled={!!sentIds[idx]}
                >
                  {sentIds[idx]
                    ? "Sent to layout ✓"
                    : "Send to cutting layout"}
                </button>
                <p className="draft-piece-notes">{piece.notes}</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
