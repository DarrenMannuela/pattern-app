import { useState } from "react";
import { buildCutouts, ROLL_WIDTHS } from "../lib/cutouts.js";

const ROLL_LABELS = { 61: '61 cm (24")', 91.4: '91 cm (36")', 106.7: '107 cm (42")', 152.4: '152 cm (60")' };

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Full-size paper patterns to cut from: A4 sheets to tape together, or one
// plotter roll for a print shop.
export default function CutoutsPanel({ title, orderRef, sizes, piecesBySize, currentSize, onClose }) {
  const [chosen, setChosen] = useState(() => new Set([currentSize]));
  const [mode, setMode] = useState("tiles");
  const [roll, setRoll] = useState(91.4);
  const [result, setResult] = useState(null);

  const toggle = (s) => setChosen((c) => {
    const next = new Set(c);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    return next;
  });

  function make() {
    const picked = sizes.filter((s) => chosen.has(s) && piecesBySize[s]?.length);
    if (!picked.length) return setResult({ error: "Pick at least one size." });
    try {
      const r = buildCutouts({ title, orderRef, sizes: picked.map((label) => ({ label, pieces: piecesBySize[label] })), mode, rollWidth: roll });
      const slug = `${title}`.replace(/[^\w-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
      download(r.blob, `${slug}-${picked.join("-")}-${mode === "roll" ? `roll-${Math.round(roll)}cm` : "A4"}.pdf`);
      setResult(r);
    } catch (e) {
      setResult({ error: `Couldn't make the PDF: ${e.message}` });
    }
  }

  return (
    <div className="cutouts-panel no-print">
      <div className="cutouts-head">
        <b>Full-size cut-outs (1:1)</b>
        <button className="link-btn" onClick={onClose}>Close</button>
      </div>
      <p className="pm-hint">
        Every piece at real size with its cutting line, sewing line (dashed), grainline and label. Print at <b>Actual size / 100%</b>, then check the 10 cm square.
      </p>
      <div className="cutouts-row">
        <span>Sizes</span>
        {sizes.map((s) => (
          <label key={s} className="check">
            <input type="checkbox" checked={chosen.has(s)} onChange={() => toggle(s)} /> {s}
          </label>
        ))}
        {sizes.length > 1 && (
          <button className="link-btn" onClick={() => setChosen(new Set(chosen.size === sizes.length ? [currentSize] : sizes))}>
            {chosen.size === sizes.length ? "Just this size" : "All sizes"}
          </button>
        )}
      </div>
      <div className="cutouts-row">
        <span>Print on</span>
        <label className="check">
          <input type="radio" checked={mode === "tiles"} onChange={() => setMode("tiles")} /> A4 sheets to tape together (any printer)
        </label>
        <label className="check">
          <input type="radio" checked={mode === "roll"} onChange={() => setMode("roll")} /> Plotter roll at a print shop
        </label>
        {mode === "roll" && (
          <select className="select" value={roll} onChange={(e) => setRoll(Number(e.target.value))}>
            {ROLL_WIDTHS.map((w) => (
              <option key={w} value={w}>{ROLL_LABELS[w]}</option>
            ))}
          </select>
        )}
      </div>
      <div className="cutouts-row">
        <button className="btn-add btn-inline" onClick={make}>Download PDF</button>
        {result?.pages > 0 && (
          <span className="pm-hint">
            {result.pages} page{result.pages === 1 ? "" : "s"}
            {mode === "tiles" ? " (the first is the cover: how to print and how the sheets go together)" : ""}.
          </span>
        )}
        {result?.error && <span className="error">{result.error}</span>}
      </div>
      {result?.problems?.length > 0 && (
        <ul className="error">
          {result.problems.map((p) => (
            <li key={p}>{p}: pick a wider roll.</li>
          ))}
        </ul>
      )}
    </div>
  );
}
