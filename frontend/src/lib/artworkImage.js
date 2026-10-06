// Gets a customer's logo ready to put on a uniform as embroidery or sablon.
//
// Logos usually arrive as a JPG on a white background. Printed as it is, the
// white box would be printed too, so a plain background that runs round the
// edge of the picture is cleared (white inside the logo stays: only background
// connected to the edge goes). The empty margin is trimmed, so the size set on
// the garment is the size of the logo itself. And the main colours are counted:
// a sablon needs one screen per colour and an embroidery one thread per colour,
// which is what the price depends on.
//
// The pixel functions work on anything shaped like ImageData
// ({ data, width, height }), so they can be tested without a browser.

import { loadImage } from "./imageTrace.js";

// The longest side a prepared logo is kept at: sharp enough for a 30 cm back
// print on screen, small enough to upload in a moment.
const MAX_SIDE = 1200;

const rgbDistance = (data, i, c) => Math.hypot(data[i] - c[0], data[i + 1] - c[1], data[i + 2] - c[2]);

// True when any pixel is see-through: the picture already has no background.
export function hasTransparency({ data }) {
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true;
  return false;
}

function borderPixels(width, height) {
  const out = [];
  for (let x = 0; x < width; x++) out.push(x, x + (height - 1) * width);
  for (let y = 1; y < height - 1; y++) out.push(y * width, y * width + width - 1);
  return out;
}

// The colour of the picture's border when most of the border is one plain
// colour (a logo on white or on a coloured card), else null: a photo, or
// artwork that runs off the edge, has no background to clear.
export function borderColor(img, tolerance = 40) {
  const { data, width, height } = img;
  const edge = borderPixels(width, height);
  const counts = new Map();
  for (const p of edge) {
    const i = p * 4;
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let best = -1;
  let bestCount = 0;
  for (const [key, n] of counts) {
    if (n > bestCount) {
      best = key;
      bestCount = n;
    }
  }
  // The average of the border pixels in the commonest bucket.
  const sum = [0, 0, 0];
  let n = 0;
  for (const p of edge) {
    const i = p * 4;
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    if (key !== best) continue;
    sum[0] += data[i];
    sum[1] += data[i + 1];
    sum[2] += data[i + 2];
    n++;
  }
  const c = sum.map((s) => s / n);
  const near = edge.filter((p) => rgbDistance(data, p * 4, c) < tolerance).length;
  return near / edge.length >= 0.7 ? c : null;
}

// Clears a plain background connected to the picture's edge, in place, and
// softens the cut edge so the logo has no light fringe on dark cloth. Returns
// whether anything was cleared.
export function removePlainBackground(img, tolerance = 40) {
  const bg = borderColor(img, tolerance);
  if (!bg) return false;
  const { data, width, height } = img;
  const cleared = new Uint8Array(width * height);
  const stack = [];
  for (const p of borderPixels(width, height)) {
    if (!cleared[p] && rgbDistance(data, p * 4, bg) < tolerance) {
      cleared[p] = 1;
      stack.push(p);
    }
  }
  while (stack.length) {
    const p = stack.pop();
    data[p * 4 + 3] = 0;
    const x = p % width;
    const next = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width];
    for (const q of next) {
      if (q < 0 || q >= width * height || cleared[q]) continue;
      if (rgbDistance(data, q * 4, bg) < tolerance) {
        cleared[q] = 1;
        stack.push(q);
      }
    }
  }
  // Edge pixels are part logo, part background. Each gets the share of logo
  // it holds as its opacity, and the background taken back out of its colour.
  for (let p = 0; p < width * height; p++) {
    if (cleared[p]) continue;
    const x = p % width;
    const touches = (x > 0 && cleared[p - 1]) || (x < width - 1 && cleared[p + 1]) || (p >= width && cleared[p - width]) || (p + width < width * height && cleared[p + width]);
    if (!touches) continue;
    const i = p * 4;
    const a = Math.min(1, Math.max(0, (rgbDistance(data, i, bg) - tolerance) / (tolerance * 1.5)));
    if (a >= 1) continue;
    data[i + 3] = Math.round(255 * a);
    if (a > 0) for (let k = 0; k < 3; k++) data[i + k] = Math.round(Math.min(255, Math.max(0, (data[i + k] - bg[k] * (1 - a)) / a)));
  }
  return true;
}

// The smallest box holding everything visible, or null for a blank picture.
export function contentBounds({ data, width, height }, minAlpha = 16) {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] < minAlpha) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

const toHex = (c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

// The artwork's main colours, commonest first. Similar shades (JPEG noise, the
// soft edge of a letter) count as one colour. fullColour is true for artwork
// that isn't a few flat colours, a photo or a gradient, which a konveksi
// prints digitally (DTF) instead of separating into screens.
export function inkPalette({ data, width, height }, { maxColors = 6, minShare = 0.02, merge = 56 } = {}) {
  const bins = new Map();
  let total = 0;
  for (let p = 0; p < width * height; p++) {
    const i = p * 4;
    if (data[i + 3] < 128) continue;
    total++;
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const b = bins.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    b.n++;
    b.r += data[i];
    b.g += data[i + 1];
    b.b += data[i + 2];
    bins.set(key, b);
  }
  if (!total) return { colors: [], fullColour: false };
  const clusters = [];
  for (const b of [...bins.values()].sort((m, n) => n.n - m.n)) {
    const c = [b.r / b.n, b.g / b.n, b.b / b.n];
    const home = clusters.find((k) => Math.hypot(k.c[0] - c[0], k.c[1] - c[1], k.c[2] - c[2]) < merge);
    if (home) home.n += b.n;
    else clusters.push({ c, n: b.n });
  }
  const inks = clusters.filter((k) => k.n / total >= minShare);
  const covered = inks.reduce((s, k) => s + k.n, 0) / total;
  const fullColour = inks.length > maxColors || covered < 0.85;
  return { colors: fullColour ? [] : inks.map((k) => toHex(k.c)), fullColour };
}

// What a print's colours mean for making it: a screen per colour for sablon,
// a thread per colour for embroidery, or a digital print for a photo.
export function inkSummary(type, colors = [], fullColour = false) {
  if (fullColour) {
    return type === "sablon" ? "Full colour: print it digitally (DTF), not with screens" : "Many colours: the embroiderer will cut it down to a few threads";
  }
  const n = colors.length;
  if (!n) return "";
  if (type === "sablon") return `${n} colour${n === 1 ? "" : "s"}: ${n} screen${n === 1 ? "" : "s"}`;
  return `${n} thread colour${n === 1 ? "" : "s"}`;
}

// How big a print goes on each part of the garment by default, as the box
// (cm, width × height) the logo is fitted into: a school badge on the chest,
// a big print across the back.
const PRINT_BOX = {
  left_chest: [8, 8],
  right_chest: [8, 8],
  center_front: [20, 20],
  back: [24, 26],
  left_sleeve: [6, 7],
  right_sleeve: [6, 7],
  collar: [5, 2.5],
  waistband: [6, 3],
  left_leg: [7, 8],
  right_leg: [7, 8],
};

const half = (v) => Math.round(v * 2) / 2;

// The default printed size of a logo with the given aspect (height / width)
// on segment, in its own proportions.
export function printSize(segment, aspect) {
  const [bw, bh] = PRINT_BOX[segment] || [8, 8];
  const ratio = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  const width = Math.max(1, Math.min(bw, bh / ratio));
  return { width: half(width), height: half(Math.max(1, width * ratio)) };
}

// Reads a logo file and gets it ready: background cleared (unless
// keepBackground), margin trimmed, colours counted. Resolves to
// { dataUrl (PNG), aspect, backgroundRemoved, colors, fullColour }.
export async function prepareArtwork(file, { keepBackground = false } = {}) {
  const svg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name || "");
  if (!svg && !/^image\//.test(file.type || "")) throw new Error("That file isn't a picture. Use a PNG, JPG or SVG of the logo.");
  const url = URL.createObjectURL(file);
  try {
    let img;
    try {
      img = await loadImage(url);
    } catch {
      throw new Error("That picture couldn't be opened. Try saving it as a PNG or JPG.");
    }
    const w0 = img.naturalWidth || MAX_SIDE;
    const h0 = img.naturalHeight || MAX_SIDE;
    // A drawing (SVG) is drawn at full size; a photo is only ever shrunk.
    const k = svg ? MAX_SIDE / Math.max(w0, h0) : Math.min(1, MAX_SIDE / Math.max(w0, h0));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w0 * k));
    canvas.height = Math.max(1, Math.round(h0 * k));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const backgroundRemoved = !keepBackground && !hasTransparency(pixels) && removePlainBackground(pixels);
    const box = contentBounds(pixels);
    if (!box) throw new Error("The picture looks empty.");
    ctx.putImageData(pixels, 0, 0);
    const out = document.createElement("canvas");
    out.width = box.width;
    out.height = box.height;
    const octx = out.getContext("2d", { willReadFrequently: true });
    octx.drawImage(canvas, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
    const palette = inkPalette(octx.getImageData(0, 0, box.width, box.height));
    return { dataUrl: out.toDataURL("image/png"), aspect: box.height / box.width, backgroundRemoved, ...palette };
  } finally {
    URL.revokeObjectURL(url);
  }
}
