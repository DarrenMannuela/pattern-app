// The fills for motif bands: SVG patterns drawn in the shirt's accent colour
// with a contrasting ink, in cm like the rest of the drawing.
import { inkFor } from "../lib/motifs.js";

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
