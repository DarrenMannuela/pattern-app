// The cutting-plan form: what a person types, and the request the backend wants.

export const DEFAULT_PLAN_FORM = {
  fabricWidth: "150",
  contrastWidth: "",
  maxPlies: "50",
  maxGarments: "4",
  mixSizes: true,
  oneWay: false,
  tubular: false,
  widthPerLay: false,
  pricePerMeter: "",
  pricePerKg: "",
  stripeLength: "",
  stripeWidth: "",
  endAllowance: "2",
  shrinkLength: "0",
  shrinkWidth: "0",
  reservePercent: "3",
  gsm: "",
};

// Widths the fabric is commonly sold in, in cm, for the comparison.
export const COMPARE_WIDTHS = [110, 115, 120, 140, 150, 160];
// Knit tubes are sold by their width laid flat, in inches: 36" to 46".
export const TUBE_WIDTHS = [36, 38, 40, 42, 44, 46].map((inch) => Math.round(inch * 2.54));

// [field, label, min, max]: the same limits the backend enforces, so a mistake
// is explained here rather than bounced back.
const LIMITS = [
  ["fabricWidth", "Fabric width", 20, 500],
  ["maxPlies", "Plies per lay", 1, 300],
  ["maxGarments", "Garments per marker", 1, 12],
  ["endAllowance", "End allowance", 0, 20],
  ["shrinkLength", "Shrinkage along the length", 0, 15],
  ["shrinkWidth", "Shrinkage across the width", 0, 15],
  ["reservePercent", "Reserve", 0, 30],
];

// Returns { body } for the request, or { error } saying what to fix.
export function planRequest(form, compareWidths) {
  const body = { singleSizes: !form.mixSizes, oneWay: !!form.oneWay, tubular: !!form.tubular };
  for (const [field, label, min, max] of LIMITS) {
    const raw = String(form[field] ?? "").trim();
    if (raw === "") return { error: `${label} needs a number.` };
    const n = Number(raw.replace(",", "."));
    if (!Number.isFinite(n) || n < min || n > max) return { error: `${label} must be between ${min} and ${max}.` };
    body[field] = n;
  }
  const optional = [
    ["contrastWidth", "Contrast fabric width", 20, 500],
    ["gsm", "Fabric weight", 1, 1000],
    ["stripeLength", "Stripe repeat along the roll", 0.5, 100],
    ["stripeWidth", "Stripe repeat across the width", 0.5, 100],
  ];
  for (const [field, label, min, max] of optional) {
    const raw = String(form[field] ?? "").trim();
    if (raw === "") continue;
    const n = Number(raw.replace(",", "."));
    if (!Number.isFinite(n) || n < min || n > max) return { error: `${label} must be between ${min} and ${max}.` };
    body[field] = n;
  }
  // Prices in rupiah, typed the Indonesian way or not: 25.000, 25000 or 25,000.
  for (const [field, label] of [["pricePerMeter", "Price per metre"], ["pricePerKg", "Price per kilo"]]) {
    const raw = String(form[field] ?? "").trim().replace(/^rp\s*/i, "");
    if (raw === "") continue;
    const n = Number(raw.replace(/[.,\s]/g, ""));
    if (!Number.isFinite(n) || n < 1 || n > 10000000 || !/^[\d.,\s]+$/.test(raw)) return { error: `${label} must be a price in rupiah, like 25.000.` };
    body[field] = n;
  }
  if (form.widthPerLay) body.layWidths = form.tubular ? TUBE_WIDTHS : COMPARE_WIDTHS;
  if (compareWidths?.length) body.compareWidths = compareWidths;
  return { body };
}

// "1 × S + 2 × M + 1 × L"
export function ratioText(ratio) {
  return ratio.map((r) => `${r.count} × ${r.size}`).join(" + ");
}

// Rupiah, the way it's written in Indonesia: Rp 3.450.000.
export function rupiah(n) {
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`;
}

// Metres to show: two decimals under 10 m, one above.
export function metres(m) {
  return `${Number(m).toFixed(m < 10 ? 2 : 1)} m`;
}

// How the plan's estimate compares with what cutting the order really used.
// plan is the main fabric's plan; reservePercent the reserve it was planned
// with. Compares the cut estimate (before the reserve) in the unit recorded:
// kilos for knit bought by weight, else metres. Returns null when nothing
// comparable was recorded.
export function compareActual(plan, actual, reservePercent) {
  if (!plan || !actual) return null;
  // A plan with a width per lay has no single width to hold the cut to.
  if (actual.widthCm && plan.fabricWidthCm && Math.abs(actual.widthCm - plan.fabricWidthCm) > 1) {
    return { sameWidth: false, widthCm: actual.widthCm };
  }
  let estimate, real, unit;
  if (actual.kg > 0 && plan.weightKg > 0) {
    estimate = plan.weightKg / (1 + reservePercent / 100);
    real = actual.kg;
    unit = "kg";
  } else if (actual.meters > 0) {
    estimate = plan.meters;
    real = actual.meters;
    unit = "m";
  } else {
    return null;
  }
  const diff = (real - estimate) / estimate;
  const close = Math.abs(diff) <= 0.05;
  return {
    sameWidth: true,
    unit,
    estimate: Math.round(estimate * 10) / 10,
    real,
    diffPercent: Math.round(diff * 1000) / 10,
    close,
    // The reserve that would make what the plan says to buy equal what was used.
    suggestedReserve: diff > 0 ? Math.min(30, Math.ceil(diff * 100)) : 0,
  };
}
