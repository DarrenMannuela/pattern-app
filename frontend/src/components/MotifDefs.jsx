// The fills for motif bands: SVG patterns drawn in the shirt's accent colour
// with a contrasting ink, in cm like the rest of the drawing.

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

// <defs> holding every pattern, for use inside an <svg>.
export function MotifDefs({ prefix, base }) {
  const ink = inkFor(base);
  const tile = (id, w, h, children) => (
    <pattern id={`${prefix}-${id}`} width={w} height={h} patternUnits="userSpaceOnUse">
      <rect width={w} height={h} fill={base} />
      {children}
    </pattern>
  );
  const line = { stroke: ink, fill: "none", strokeWidth: 0.35, strokeLinecap: "round" };
  return (
    <defs>
      {tile("stripes-v", 1.5, 4, <line x1="0.75" y1="0" x2="0.75" y2="4" {...line} strokeWidth="0.55" />)}
      {tile("stripes-h", 4, 1.5, <line x1="0" y1="0.75" x2="4" y2="0.75" {...line} strokeWidth="0.55" />)}
      {tile(
        "batik",
        4,
        4,
        <>
          <path d="M2 0.4 L3.6 2 L2 3.6 L0.4 2 Z" {...line} />
          <circle cx="2" cy="2" r="0.55" fill={ink} />
          {[[0, 0], [4, 0], [0, 4], [4, 4]].map(([x, y]) => (
            <circle key={`${x}${y}`} cx={x} cy={y} r="0.4" fill={ink} />
          ))}
        </>
      )}
      {tile(
        "parang",
        4,
        4,
        <>
          <path d="M-1 4.2 Q1 2 2 3.2 T5 2.2" {...line} strokeWidth="0.55" />
          <path d="M-1 2.2 Q1 0 2 1.2 T5 0.2" {...line} strokeWidth="0.55" />
        </>
      )}
      {tile(
        "chevron",
        4,
        3,
        <>
          <path d="M0 2.6 L1 1.2 L2 2.6 L3 1.2 L4 2.6" {...line} />
          <path d="M0 1 L1 -0.4 L2 1 L3 -0.4 L4 1" {...line} />
        </>
      )}
      {tile("dots", 2, 2, <circle cx="1" cy="1" r="0.42" fill={ink} />)}
      {tile(
        "check",
        2.4,
        2.4,
        <>
          <rect width="1.2" height="1.2" fill={ink} opacity="0.55" />
          <rect x="1.2" y="1.2" width="1.2" height="1.2" fill={ink} opacity="0.55" />
        </>
      )}
    </defs>
  );
}
