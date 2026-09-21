import GarmentIcon from "./GarmentIcons";

// Single source of truth for every garment type this app knows
// about — used by the order-creation picker, the order-detail
// editor, and the orders-list labels, so a new type only needs to be
// added here once.
export const GARMENT_TYPES = [
  { value: "school_shirt", label: "School Shirt", hint: "Collar + placket" },
  { value: "polo_shirt", label: "Polo Shirt", hint: "Knit collar + short placket" },
  { value: "pe_shirt", label: "PE / Olahraga Shirt", hint: "Pullover, no collar" },
  { value: "uniform_shirt", label: "Uniform Shirt", hint: "Customizable base" },
  { value: "pants", label: "Pants / Trousers", hint: "Waistband + legs" },
  { value: "shorts", label: "Shorts", hint: "PE / olahraga" },
  { value: "skirt", label: "A-line Skirt", hint: "Waistband + panels" },
  { value: "other", label: "Merch", hint: "Bags, hats, patches" },
  { value: "custom", label: "Custom design", hint: "Trace a picture or draw your own" },
];

export const GARMENT_LABELS = Object.fromEntries(GARMENT_TYPES.map((g) => [g.value, g.label]));

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
