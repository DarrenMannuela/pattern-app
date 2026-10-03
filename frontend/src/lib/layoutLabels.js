// Labels for pieces on a cutting layout: upright whichever way the piece was
// turned, centred on it, short, and sized to fit inside it.

// "Shirt front — SDN 01 S" -> "Shirt front · S": the piece and its size,
// without the customer name the order adds in between.
export function shortPieceName(name) {
  const [piece, rest] = String(name || "").split(" — ");
  if (!rest) return piece;
  const size = rest.trim().split(/\s+/).at(-1);
  return size ? `${piece} · ${size}` : piece;
}

// Where a placed piece's centre is on the fabric, and how big it is there.
// The nester places a piece by turning it (rotation, clockwise, about its
// own origin) and then moving it (tx, ty); its outline spans 0..w, 0..h.
export function placedBox(p) {
  const w = p.origWidth;
  const h = p.origHeight;
  switch (((p.rotation % 360) + 360) % 360) {
    case 90:
      return { cx: p.tx - h / 2, cy: p.ty + w / 2, w: h, h: w };
    case 180:
      return { cx: p.tx - w / 2, cy: p.ty - h / 2, w, h };
    case 270:
      return { cx: p.tx + h / 2, cy: p.ty - w / 2, w: h, h: w };
    default:
      return { cx: p.tx + w / 2, cy: p.ty + h / 2, w, h };
  }
}

// The label for a placed piece, or null when it is too small to hold one.
// A tall, narrow strip (a placket, a side panel) gets its label turned to
// run along it, which is the only way the name fits.
export function pieceLabel(p) {
  const text = shortPieceName(p.name);
  const box = placedBox(p);
  const fit = (along, across) => Math.min(3.2, (along * 0.85) / Math.max(1, text.length * 0.58), across * 0.3);
  const flat = fit(box.w, box.h);
  const turned = box.h > box.w * 1.5 ? fit(box.h, box.w) : 0;
  const size = Math.max(flat, turned);
  if (size < 1.2) return null;
  return { text, x: box.cx, y: box.cy, size, rotate: turned > flat ? -90 : 0 };
}
