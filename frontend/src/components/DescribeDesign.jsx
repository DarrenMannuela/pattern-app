import { useState } from "react";
import { formatElapsed, useElapsed } from "../lib/useElapsed.js";

// Starting points a person can click to fill the box — in the words a konveksi
// customer actually uses, one Indonesian and one English.
const EXAMPLES = [
  "Kemeja lengan pendek warna krem, kerah tegak, kancing depan penuh, bordir logo kecil di dada kiri",
  "Light blue polo, short sleeves, collar in tan, embroidered school logo on the left chest",
  "Long-sleeve navy shirt with a point collar and a pen pocket on the left chest",
];

const MAX_CHARS = 2000;

// Describe a uniform in words and get a rough first design: the same reader that
// matches a photo turns the description into catalog parts, pockets, prints and
// colours, which the pattern maker then applies. A starting point to adjust, not
// a finished design.
export default function DescribeDesign({ status, busy, result, error, onGenerate, onClose }) {
  const [text, setText] = useState("");
  const elapsed = useElapsed(busy);

  const provider = status?.provider;
  const ready = provider && provider !== "none";
  const local = provider === "ollama";
  const canSend = ready && !busy && text.trim().length > 0;
  const notes = result ? [...result.notes, ...(result.design.unsupported || []).map((u) => `Not in the catalog: ${u}`)] : [];

  function send() {
    if (canSend) onGenerate(text.trim());
  }

  return (
    <aside className="pm-ref pm-describe">
      <div className="pm-ref-head">
        <div className="pm-slot-title" style={{ margin: 0 }}>Describe the uniform</div>
        <button type="button" className="link-btn" onClick={onClose}>Close</button>
      </div>

      <textarea
        id="pm-describe-text"
        className="pm-describe-text"
        rows={5}
        maxLength={MAX_CHARS}
        value={text}
        placeholder="Type what you want in your own words — collar, sleeves, colour, pockets, embroidery…"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send();
        }}
      />

      <div className="pm-describe-examples" aria-label="Examples">
        {EXAMPLES.map((ex) => (
          <button type="button" key={ex} className="pm-ref-chip" onClick={() => setText(ex)} title="Use this example">
            <span className="pm-ref-chip-text">{ex}</span>
          </button>
        ))}
      </div>

      {ready ? (
        <div className="pm-ref-auto">
          <button type="button" className="pm-tool" disabled={!canSend} onClick={send}>
            {busy ? `Designing… ${formatElapsed(elapsed)}` : "Make a rough design"}
          </button>
          <p className="pm-ref-tip">
            {local
              ? `Runs on this computer with ${status.model}: free, and quicker than reading a photo. It's a first guess from your words — check each part.`
              : "Sends your description to the Claude API (one request)."}{" "}
            It applies to the current garment, so pick the garment type first.
          </p>
        </div>
      ) : (
        status && <p className="pm-ref-tip">{status.hint}</p>
      )}

      {error && <p className="error">{error}</p>}
      {result && (
        <div className="pm-ref-result">
          <div className="pm-slot-title">
            Made by {result.design.provider === "ollama" ? "a local model" : "Claude"}
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
