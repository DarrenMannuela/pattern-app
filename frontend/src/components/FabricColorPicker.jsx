import { useState } from "react";

// A fabric's real supplier colours (from its e-catalog PDF), each shown with
// its own code visible on the swatch — not just a colour block, so picking
// one that matches a physical sample in hand means reading the same code,
// not eyeballing a screen colour. targetable (Main/Contrast) so a colour can
// be assigned to either fabric slot the garment actually cuts.
export default function FabricColorPicker({ colors, colorHint, onPick }) {
  const [target, setTarget] = useState("main");

  if (!colors?.length) return null;

  return (
    <div className="fabric-color-picker">
      <div className="fabric-color-target">
        <button type="button" className={target === "main" ? "on" : ""} onClick={() => setTarget("main")}>
          Main fabric
        </button>
        <button type="button" className={target === "accent" ? "on" : ""} onClick={() => setTarget("accent")}>
          Contrast fabric
        </button>
      </div>
      <div className="fabric-colors">
        {colors.map((c) => {
          const active = colorHint?.[target] === c.hex;
          return (
            <button
              type="button"
              key={c.code}
              className={`fabric-color-swatch${active ? " fabric-color-swatch-active" : ""}`}
              title={c.category ? `${c.code} — ${c.category}` : c.code}
              onClick={() => onPick(target, c.hex)}
            >
              <span className="fabric-color-swatch-fill" style={{ background: c.hex }} />
              <span className="fabric-color-swatch-code">{c.code}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
