import { useState } from "react";
import { fabricLabel, groupFabrics } from "../lib/fabricCatalog.js";

// A catalog photo that shows a plain placeholder (or nothing, with
// fallback={null}) when the file is missing or fails to load, instead of the
// browser's broken-image icon. Give it key={src} so a new source gets a fresh try.
export function FabricImage({ src, alt, fallback = <span className="fabric-swatch-noimg" aria-hidden="true" /> }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return fallback;
  return <img src={src} alt={alt} onError={() => setFailed(true)} />;
}

// The fabric catalog's photo grid, grouped by brand — shared between the
// order form's Fabric section and the Design Preview panel's own compact
// picker, so picking a fabric works the same wherever it's shown.
export default function FabricPicker({ fabrics, currentName, onPick }) {
  const fabricGroups = groupFabrics(fabrics);
  return (
    <div className="fabric-picker">
      {fabricGroups.map(([group, items]) => (
        <div key={group} className="fabric-group">
          <div className="pm-slot-title">{group}</div>
          <div className="fabric-swatches">
            {items.map((f) => {
              const label = fabricLabel(f);
              const active = currentName === label;
              return (
                <button
                  type="button"
                  key={label}
                  className={`fabric-swatch${active ? " fabric-swatch-active" : ""}`}
                  onClick={() => onPick(active ? "" : label)}
                  title={f.sourceUrl || label}
                >
                  <FabricImage src={f.imageUrl} alt={f.name} />
                  <span className="fabric-swatch-label">{f.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
