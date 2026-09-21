// Colours from a reference photo, worked out in the browser (no service needed):
// the main colours of the picture, and the colour under a click.

import { loadImage } from "./imageTrace.js";

const hex = (r, g, b) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

// The picture drawn at natural size (long side <= maxSide) on a canvas.
export async function photoCanvas(src, maxSide = 900) {
  const img = await loadImage(src);
  const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * k));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// The average colour of a small patch at (fx, fy), as fractions of the picture.
export function colorAt(canvas, fx, fy, radius = 3) {
  const x = Math.min(canvas.width - 1, Math.max(0, Math.round(fx * canvas.width)));
  const y = Math.min(canvas.height - 1, Math.max(0, Math.round(fy * canvas.height)));
  const x0 = Math.max(0, x - radius);
  const y0 = Math.max(0, y - radius);
  const w = Math.min(canvas.width - x0, radius * 2 + 1);
  const h = Math.min(canvas.height - y0, radius * 2 + 1);
  const { data } = canvas.getContext("2d", { willReadFrequently: true }).getImageData(x0, y0, w, h);
  let r = 0;
  let g = 0;
  let b = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  return hex(r / n, g / n, b / n);
}

// The main colours of the picture, most common first: the centre counts for more
// (the garment is usually there), and colours too close to one already listed
// are folded into it.
export function dominantColors(canvas, count = 6) {
  const small = document.createElement("canvas");
  const k = Math.min(1, 96 / Math.max(canvas.width, canvas.height));
  small.width = Math.max(1, Math.round(canvas.width * k));
  small.height = Math.max(1, Math.round(canvas.height * k));
  const ctx = small.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, small.width, small.height);
  const { data } = ctx.getImageData(0, 0, small.width, small.height);

  const buckets = new Map();
  for (let y = 0; y < small.height; y++) {
    for (let x = 0; x < small.width; x++) {
      const i = (y * small.width + x) * 4;
      if (data[i + 3] < 128) continue;
      const cx = x / small.width - 0.5;
      const cy = y / small.height - 0.5;
      const weight = Math.abs(cx) < 0.3 && Math.abs(cy) < 0.35 ? 1 : 0.35;
      const key = `${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`;
      const b = buckets.get(key) || { w: 0, r: 0, g: 0, b: 0 };
      b.w += weight;
      b.r += data[i] * weight;
      b.g += data[i + 1] * weight;
      b.b += data[i + 2] * weight;
      buckets.set(key, b);
    }
  }
  const sorted = [...buckets.values()].sort((a, b) => b.w - a.w);
  const total = sorted.reduce((s, b) => s + b.w, 0) || 1;
  const picked = [];
  for (const b of sorted) {
    const c = [b.r / b.w, b.g / b.w, b.b / b.w];
    const near = picked.find((p) => Math.hypot(p.c[0] - c[0], p.c[1] - c[1], p.c[2] - c[2]) < 44);
    if (near) {
      near.w += b.w;
      continue;
    }
    picked.push({ c, w: b.w });
  }
  return picked
    .sort((a, b) => b.w - a.w)
    .slice(0, count)
    .filter((p) => p.w / total > 0.02)
    .map((p) => ({ color: hex(...p.c), share: p.w / total }));
}
