// Pocket outlines for the 2D preview and the pattern maker's picture tiles,
// in local units with the top-left corner at 0,0. They mirror
// backend/draft/addons.go's draftPatchPocket.
export const POCKET_SHAPES = [
  { value: "classic", label: "Classic" },
  { value: "square", label: "Square" },
  { value: "rounded", label: "Rounded" },
  { value: "pointed", label: "Pointed" },
];

export function pocketPath(shape, w, h) {
  const m = Math.min(w, h);
  if (shape === "pointed") {
    const side = h * 0.72;
    return `M 0 0 L ${w} 0 L ${w} ${side} L ${w / 2} ${h} L 0 ${side} Z`;
  }
  if (shape === "square") return `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`;
  const r = shape === "rounded" ? m * 0.4 : m * 0.18;
  // The same cubic circular-arc approximation (k = r*0.552) as the backend's
  // draftPatchPocket, not a quadratic-to-the-corner curve — the two used to
  // approximate the same rounded corner two visibly different ways.
  const k = r * 0.552;
  return `M 0 0 L ${w} 0 L ${w} ${h - r} C ${w} ${h - r + k} ${w - r + k} ${h} ${w - r} ${h} L ${r} ${h} C ${r - k} ${h} 0 ${h - r + k} 0 ${h - r} Z`;
}
