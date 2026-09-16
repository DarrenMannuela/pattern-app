// Small reference-illustration icons for the garment-type picker —
// simple line silhouettes so someone can recognize the garment shape
// before generating anything, not derived from real pattern math.
const ICONS = {
  school_shirt: (
    <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
      <path d="M17 6 L11 10 L8 8 L2 12 L5 17 L8 15 L8 34 L28 34 L28 15 L31 17 L34 12 L28 8 L25 10 Z" />
      <path d="M17 6 L14.5 10 L18 13 L21.5 10 L19 6" />
    </g>
  ),
  pe_shirt: (
    <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
      <path d="M16 6 L9 9 L2 13 L6 19 L9 17 L9 34 L27 34 L27 17 L30 19 L34 13 L27 9 L20 6 Z" />
      <path d="M14.5 6 Q18 10 21.5 6" />
    </g>
  ),
  uniform_shirt: (
    <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
      <path d="M16 6 L9 9 L2 13 L6 19 L9 17 L9 34 L27 34 L27 17 L30 19 L34 13 L27 9 L20 6 Z" />
      <path d="M14.5 6 Q18 10 21.5 6" strokeDasharray="2.5,2.5" />
    </g>
  ),
  pants: (
    <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
      <path d="M8 4 L28 4 L28 9 L18.5 9 L19.5 34 L14 34 L13 12 L12 34 L6.5 34 L7.5 9 L8 9 Z" />
      <line x1="8" y1="4" x2="28" y2="4" strokeWidth="3.2" />
    </g>
  ),
  shorts: (
    <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
      <path d="M8 4 L28 4 L28 9 L19 9 L19.5 22 L14 22 L13 12 L12 22 L6.5 22 L7.5 9 L8 9 Z" />
      <line x1="8" y1="4" x2="28" y2="4" strokeWidth="3.2" />
    </g>
  ),
  skirt: (
    <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
      <path d="M11 4 L25 4 L31 32 L5 32 Z" />
      <line x1="11" y1="4" x2="25" y2="4" strokeWidth="3.2" />
    </g>
  ),
  other: (
    <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
      <path d="M18 4 L30 16 L18 28 L10 28 L10 4 Z" />
      <circle cx="15" cy="9" r="1.6" fill="currentColor" stroke="none" />
    </g>
  ),
};

export default function GarmentIcon({ type, size = 36 }) {
  return (
    <svg viewBox="0 0 36 36" width={size} height={size}>
      {ICONS[type] || ICONS.other}
    </svg>
  );
}
