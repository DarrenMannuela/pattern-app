import GarmentIcon from "./GarmentIcons";
import { GARMENT_TYPES } from "../lib/garmentTypes.js";

// A visual picker — reference icons instead of a plain dropdown — so
// picking a garment type means recognizing its basic shape, not just
// reading a label.
export default function GarmentTypePicker({ value, onChange }) {
  return (
    <div className="garment-type-grid">
      {GARMENT_TYPES.map((g) => (
        <button
          key={g.value}
          type="button"
          className={value === g.value ? "garment-type-card active" : "garment-type-card"}
          onClick={() => onChange(g.value)}
        >
          <GarmentIcon type={g.value} />
          <span className="garment-type-label">{g.label}</span>
          <span className="garment-type-hint">{g.hint}</span>
        </button>
      ))}
    </div>
  );
}
