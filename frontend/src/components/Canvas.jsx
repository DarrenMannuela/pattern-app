const MARGIN = 34;
const MAX_RENDER_WIDTH = 680;

export default function LayoutCanvas({ result }) {
  if (!result) {
    return (
      <div className="canvas-wrap">
        <p className="empty">
          Add pattern pieces on the left, then generate a layout. The
          fabric roll will render here with each piece's actual cut
          outline placed for minimum waste.
        </p>
      </div>
    );
  }

  const { fabricWidth, totalHeight, placed, unplaced } = result;
  const scale = Math.min(MAX_RENDER_WIDTH / fabricWidth, 3.2);
  const w = fabricWidth * scale + MARGIN;
  const h = totalHeight * scale + MARGIN;

  const topTicks = [];
  for (let x = 0; x <= fabricWidth; x += 10) {
    topTicks.push(x);
  }
  const leftTicks = [];
  for (let y = 0; y <= totalHeight; y += 10) {
    leftTicks.push(y);
  }

  return (
    <div className="canvas-wrap">
      {unplaced && unplaced.length > 0 && (
        <p className="warning">
          Couldn't fit on this fabric width: {unplaced.join(", ")}. Try a
          wider fabric or a smaller piece.
        </p>
      )}
      <svg width={w} height={h} className="layout-svg">
        <rect x={0} y={0} width={w} height={h} fill="#D8CBA8" />

        {topTicks.map((x) => (
          <g key={`tx-${x}`}>
            <line
              x1={MARGIN + x * scale}
              y1={MARGIN - 6}
              x2={MARGIN + x * scale}
              y2={MARGIN}
              stroke="#B9A97E"
            />
            {x % 20 === 0 && (
              <text
                x={MARGIN + x * scale - 6}
                y={MARGIN - 10}
                fontSize="10"
                fontFamily="IBM Plex Mono, monospace"
                fill="#8A7B54"
              >
                {x}
              </text>
            )}
          </g>
        ))}
        {leftTicks.map((y) => (
          <line
            key={`ty-${y}`}
            x1={MARGIN - 6}
            y1={MARGIN + y * scale}
            x2={MARGIN}
            y2={MARGIN + y * scale}
            stroke="#B9A97E"
          />
        ))}

        {/* fabric origin group: piece coordinates are in cm, so scale
            once here and let every piece use its own cm-space transform */}
        <g transform={`translate(${MARGIN},${MARGIN}) scale(${scale})`}>
          {placed.map((p, i) => (
            <g
              key={i}
              transform={`translate(${p.tx},${p.ty}) rotate(${p.rotation})`}
            >
              <path
                d={p.pathData}
                fill={p.color + "CC"}
                stroke="#23272A"
                strokeWidth={0.35 / scale}
              />
              {p.grainLocked && p.origHeight > 24 && (
                <g
                  stroke="#23272A"
                  strokeWidth={0.3 / scale}
                  fill="none"
                >
                  <line
                    x1={p.origWidth / 2}
                    y1={8}
                    x2={p.origWidth / 2}
                    y2={p.origHeight - 8}
                  />
                  <polyline
                    points={`${p.origWidth / 2 - 1.2},${14} ${p.origWidth / 2},${8} ${p.origWidth / 2 + 1.2},${14}`}
                  />
                  <polyline
                    points={`${p.origWidth / 2 - 1.2},${p.origHeight - 14} ${p.origWidth / 2},${p.origHeight - 8} ${p.origWidth / 2 + 1.2},${p.origHeight - 14}`}
                  />
                </g>
              )}
              {p.origWidth > 12 && p.origHeight > 8 && (
                <text
                  x={2}
                  y={6}
                  fontSize={3.2}
                  fontWeight="600"
                  fontFamily="Space Grotesk, sans-serif"
                  fill="#23272A"
                >
                  {p.name}
                </text>
              )}
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
