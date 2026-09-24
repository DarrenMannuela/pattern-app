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
