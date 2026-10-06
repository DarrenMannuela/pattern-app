// The body measurements each kind of garment is drafted from, as the size chart
// asks for them.

export const SHIRT_FIELDS = [
  { key: "bust", label: "Bust/chest (cm)", local: "Lingkar badan" },
  { key: "waist", label: "Waist (cm)", local: "Lingkar pinggang" },
  // A shirt hangs to the hip: its hem is cut to go over it.
  { key: "hip", label: "Hip (cm)", local: "Lingkar panggul" },
  { key: "backWaistLength", label: "Back length, nape to waist (cm)", local: "Panjang punggung" },
  // Optional: left blank (or 0), the length is worked out from the back length.
  { key: "shirtLength", label: "Shirt length, nape to hem (cm)", local: "Panjang baju", optional: true },
  { key: "shoulder", label: "Shoulder seam (cm)", local: "Panjang bahu" },
  { key: "neck", label: "Neck circumference (cm)", local: "Lingkar leher" },
  { key: "ease", label: "Wearing ease (cm) — the shirt's Fit adds to it", local: "Kelonggaran" },
  // Shoulder to wrist. A short-sleeve shirt can be given its short sleeve's
  // own length instead (30 cm or less), as konveksi charts do.
  { key: "sleeveLength", label: "Sleeve length, cuff included (cm)", local: "Panjang lengan", note: "to the wrist, or the short sleeve itself" },
  { key: "upperArm", label: "Upper arm (cm)", local: "Lingkar lengan atas" },
  { key: "wrist", label: "Wrist (cm)", local: "Lingkar pergelangan" },
];

export const PANTS_FIELDS = [
  { key: "waist", label: "Waist (cm)", local: "Lingkar pinggang" },
  { key: "hip", label: "Hip (cm)", local: "Lingkar panggul" },
  { key: "rise", label: "Rise / crotch depth (cm)", local: "Tinggi duduk" },
  { key: "inseam", label: "Inseam (cm)", local: "Panjang dalam" },
  { key: "hemWidth", label: "Leg opening, half (cm)", local: "Lebar kaki", optional: true },
  { key: "ease", label: "Wearing ease (cm)", local: "Kelonggaran" },
];

export const SKIRT_FIELDS = [
  { key: "waist", label: "Waist (cm)", local: "Lingkar pinggang" },
  { key: "hip", label: "Hip (cm)", local: "Lingkar panggul" },
  { key: "skirtLength", label: "Skirt length (cm)", local: "Panjang rok" },
  { key: "ease", label: "Wearing ease (cm)", local: "Kelonggaran" },
];

// Which measurement fields make sense depends on what's being made —
// a shirt doesn't need a rise/inseam, pants don't need a neckline.
export function measurementFieldsFor(garmentType) {
  switch (garmentType) {
    case "pants":
    case "shorts":
      return PANTS_FIELDS;
    case "skirt":
      return SKIRT_FIELDS;
    case "custom":
    case "other":
      return []; // sized by the drawing / the item's own dimensions, not body measurements
    default:
      return SHIRT_FIELDS;
  }
}
