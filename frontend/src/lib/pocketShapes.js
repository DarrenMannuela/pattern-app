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
  return `M 0 0 L ${w} 0 L ${w} ${h - r} Q ${w} ${h} ${w - r} ${h} L ${r} ${h} Q 0 ${h} 0 ${h - r} Z`;
}
