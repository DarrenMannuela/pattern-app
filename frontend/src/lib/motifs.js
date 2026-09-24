// Pure helpers behind the motif band patterns (the SVG <defs> live in
// components/MotifDefs.jsx).

export const MOTIF_PATTERNS = [
  { value: "solid", label: "Solid", hint: "One plain contrast colour" },
  { value: "stripes", label: "Stripes", hint: "Fine stripes along the band" },
  { value: "batik", label: "Batik", hint: "Diamond (ceplok) batik" },
  { value: "parang", label: "Parang", hint: "Diagonal wave batik" },
  { value: "chevron", label: "Chevron", hint: "Zigzag / tumpal" },
  { value: "dots", label: "Dots", hint: "Small dots" },
  { value: "check", label: "Check", hint: "Small checks" },
];

// A colour to draw the pattern's lines in: darker on a light base, lighter on a dark one.
export function inkFor(hex) {
  const n = parseInt((hex || "#c0392b").slice(1), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  const mix = (v) => Math.max(0, Math.min(255, Math.round(lum > 0.55 ? v * 0.45 : v + (255 - v) * 0.6)));
  return `#${rgb.map((v) => mix(v).toString(16).padStart(2, "0")).join("")}`;
}

// The fill to give a motif shape, or null for a plain colour.
export function motifFill(prefix, pattern, orient = "v") {
  if (!pattern || pattern === "solid") return null;
  return `url(#${prefix}-${pattern}${pattern === "stripes" ? `-${orient}` : ""})`;
}
