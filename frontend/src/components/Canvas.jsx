const MARGIN = 34;
const MAX_RENDER_WIDTH = 680;

export default function LayoutCanvas({ result }) {
  if (!result) {
    return (
      <div className="canvas-wrap">
        <p className="empty">
          Add pattern pieces on the left, then generate a layout. The
          fabric roll will render here with each piece placed for minimum
          waste.
        </p>
      </div>
    );
  }

  const { fabricWidth, totalHeight, placed } = result;
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

        {placed.map((p, i) => {
          const x = MARGIN + p.x * scale;
          const y = MARGIN + p.y * scale;
          const pw = p.w * scale;
          const ph = p.h * scale;
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={pw}
                height={ph}
                fill={p.color + "CC"}
                stroke="#23272A"
                strokeWidth="1.3"
              />
              {p.grainLocked && ph > 24 && (
                <g stroke="#23272A" strokeWidth="1.2" fill="none">
                  <line
                    x1={x + pw / 2}
                    y1={y + 8}
                    x2={x + pw / 2}
                    y2={y + ph - 8}
                  />
                  <polyline
                    points={`${x + pw / 2 - 4},${y + 14} ${x + pw / 2},${y + 8} ${x + pw / 2 + 4},${y + 14}`}
                  />
                  <polyline
                    points={`${x + pw / 2 - 4},${y + ph - 14} ${x + pw / 2},${y + ph - 8} ${x + pw / 2 + 4},${y + ph - 14}`}
                  />
                </g>
              )}
              {pw > 34 && ph > 16 && (
                <text
                  x={x + 5}
                  y={y + 14}
                  fontSize="10"
                  fontWeight="600"
                  fontFamily="Space Grotesk, sans-serif"
                  fill="#23272A"
                >
                  {p.name}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
