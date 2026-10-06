import { artworkUrl } from "../api.js";
import { inkSummary } from "../lib/artworkImage.js";

// The controls for one embroidery or sablon in the Extras list: which of the
// two it is, its logo (or text, when there is no logo), and its colours.
export default function PrintArtwork({ accessory: a, busy, canKeepBackground, onPickFile, onKeepBackground, onRemoveImage, onUpdate }) {
  const summary = inkSummary(a.type, a.inkColors, a.fullColour);
  return (
    <div className="print-art">
      <div className="pm-fit-chips" role="radiogroup" aria-label="Made as">
        {[
          ["embroidery", "Embroidery"],
          ["sablon", "Sablon"],
        ].map(([type, label]) => (
          <button type="button" key={type} role="radio" aria-checked={a.type === type} className={`pm-ref-chip${a.type === type ? " pm-ref-chip-on" : ""}`} onClick={() => onUpdate({ type })}>
            {label}
          </button>
        ))}
      </div>
      {a.image ? (
        <div className="print-art-logo">
          <img src={artworkUrl(a.image)} alt="The logo" className="print-art-thumb" />
          <div className="print-art-actions">
            <label className={`link-btn${busy ? " is-busy" : ""}`}>
              {busy ? "Uploading…" : "Replace"}
              <input type="file" accept="image/*" hidden disabled={busy} onChange={(e) => { onPickFile(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            {canKeepBackground && (
              <button type="button" className="link-btn" onClick={onKeepBackground} disabled={busy} title="The plain background round the logo was cleared; put it back">
                Keep its background
              </button>
            )}
            <button type="button" className="link-btn link-btn-danger" onClick={onRemoveImage} disabled={busy}>
              Remove logo
            </button>
          </div>
        </div>
      ) : (
        <div className="print-art-empty">
          <label className={`pm-tool print-art-upload${busy ? " is-busy" : ""}`}>
            {busy ? "Uploading…" : "Add a logo file"}
            <input type="file" accept="image/*" hidden disabled={busy} onChange={(e) => { onPickFile(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <input
            type="text"
            className="input print-art-text"
            placeholder="or type text, e.g. a name"
            maxLength={40}
            value={a.label || ""}
            onChange={(e) => onUpdate({ label: e.target.value })}
            aria-label="Text to embroider or print"
          />
        </div>
      )}
      {summary && (
        <div className="print-art-inks">
          {(a.inkColors || []).map((c) => (
            <span key={c} className="print-art-ink" style={{ background: c }} title={c} />
          ))}
          <span>{summary}</span>
        </div>
      )}
    </div>
  );
}
