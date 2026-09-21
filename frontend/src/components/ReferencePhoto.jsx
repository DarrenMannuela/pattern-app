import { useEffect, useRef, useState } from "react";
import { colorAt, dominantColors, photoCanvas } from "../lib/photoColors.js";

// A reference photo beside the preview, for matching a uniform by eye: click
// the photo (or one of its main colours) to set the fabric or trim colour. When
// a photo reader is available (the Claude API or a local model) it can also
// match the parts for you.
export default function ReferencePhoto({ photo, colors, status, analyzing, result, error, onPick, onMatch, onClose }) {
  const [armed, setArmed] = useState("main"); // which colour the next pick sets
  const [swatches, setSwatches] = useState([]);
  const canvasRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    photoCanvas(photo.url)
      .then((canvas) => {
        if (cancelled) return;
        canvasRef.current = canvas;
        setSwatches(dominantColors(canvas));
      })
      .catch(() => {
        if (!cancelled) setSwatches([]);
      });
    return () => {
      cancelled = true;
    };
  }, [photo.url]);

  function pickFromPhoto(e) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const box = e.currentTarget.getBoundingClientRect();
    onPick(armed, colorAt(canvas, (e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height));
    if (armed === "main") setArmed("accent");
  }

  const provider = status?.provider;
  const local = provider === "ollama";
  const notes = result ? [...result.notes, ...(result.design.unsupported || []).map((u) => `Not in the catalog: ${u}`)] : [];

  return (
    <aside className="pm-ref">
      <div className="pm-ref-head">
        <div className="pm-slot-title" style={{ margin: 0 }}>Reference photo</div>
        <button type="button" className="link-btn" onClick={onClose}>Close</button>
      </div>
      <img className="pm-ref-img" src={photo.url} alt="Reference uniform" onClick={pickFromPhoto} title={`Click to set the ${armed === "main" ? "fabric" : "trim"} colour`} />

      <div className="pm-ref-colors">
        {[["main", "Fabric"], ["accent", "Trim"]].map(([key, label]) => (
          <button type="button" key={key} className={`pm-ref-chip${armed === key ? " pm-ref-chip-on" : ""}`} onClick={() => setArmed(key)}>
            <span className="pm-ref-dot" style={{ background: colors?.[key] || "transparent" }} />
            {label}
          </button>
        ))}
      </div>
      {swatches.length > 0 && (
        <div className="pm-ref-swatches" aria-label="Main colours in the photo">
          {swatches.map((s) => (
            <button type="button" key={s.color} className="pm-ref-swatch" style={{ background: s.color }} title={`${s.color} — ${Math.round(s.share * 100)}% of the photo`} onClick={() => onPick(armed, s.color)} />
          ))}
        </div>
      )}
      <p className="pm-ref-tip">
        Click the photo or a swatch to set the <strong>{armed === "main" ? "fabric" : "trim"}</strong> colour, then choose the parts that match on the left.
      </p>

      {provider && provider !== "none" ? (
        <div className="pm-ref-auto">
          <button type="button" className="pm-tool" disabled={analyzing} onClick={onMatch}>
            {analyzing ? "Reading photo…" : local ? "Match parts with local model" : "Match parts with Claude"}
          </button>
          <p className="pm-ref-tip">
            {local ? `Runs on this computer with ${status.model}: free, but on a small laptop it can take a few minutes, and it makes more mistakes than Claude, so check each part.` : "Sends the photo to the Claude API (one request)."}
          </p>
        </div>
      ) : (
        status && <p className="pm-ref-tip">{status.hint}</p>
      )}

      {error && <p className="error">{error}</p>}
      {result && (
        <div className="pm-ref-result">
          <div className="pm-slot-title">
            Matched by {result.design.provider === "ollama" ? "a local model" : "Claude"}
            {result.design.confidence ? ` · ${result.design.confidence} confidence` : ""}
          </div>
          {result.design.summary && <p className="pm-photo-summary">{result.design.summary}</p>}
          {result.mismatch && <p className="error">{result.mismatch}</p>}
          {notes.length > 0 && (
            <ul className="pm-photo-notes">
              {notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </aside>
  );
}
