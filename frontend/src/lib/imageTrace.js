// Finds the outline of a garment in a picture, for the custom-design editor.
// It works on a garment photographed or laid flat against a plain background
// (white, grey, a wall): pixels that differ from the background are the
// garment, the biggest connected blob is kept, and its border is traced and
// simplified. A garment on a person, or a busy background, won't separate
// cleanly — trace those by hand instead.

import { simplifyRing } from "./customDesign.js";

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That picture couldn't be read."));
    img.src = src;
  });
}

// Reads a file into a downscaled JPEG data URL (long side <= maxSide), so the
// design picture stays small enough to save with the order.
export async function fileToDataUrl(file, maxSide = 1400) {
  const raw = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("That file couldn't be read."));
    r.readAsDataURL(file);
  });
  const img = await loadImage(raw);
  const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * k);
  canvas.height = Math.round(img.naturalHeight * k);
  const ctx = canvas.getContext("2d");
  // A transparent PNG would turn black as a JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.85), width: canvas.width, height: canvas.height };
}

// A smaller copy of a picture (long side <= maxSide) as a JPEG data URL, for a
// reader that is slow on big pictures (a local model).
export async function shrinkDataUrl(src, maxSide) {
  const img = await loadImage(src);
  const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  if (k === 1) return src;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * k);
  canvas.height = Math.round(img.naturalHeight * k);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

// The most common colour along the picture's border, as [r, g, b].
function borderColor(data, w, h) {
  const buckets = new Map();
  const add = (x, y) => {
    const i = (y * w + x) * 4;
    const key = `${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`;
    const b = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    b.n++;
    b.r += data[i];
    b.g += data[i + 1];
    b.b += data[i + 2];
    buckets.set(key, b);
  };
  for (let x = 0; x < w; x++) {
    add(x, 0);
    add(x, h - 1);
  }
  for (let y = 1; y < h - 1; y++) {
    add(0, y);
    add(w - 1, y);
  }
  let top = null;
  for (const b of buckets.values()) if (!top || b.n > top.n) top = b;
  return [top.r / top.n, top.g / top.n, top.b / top.n];
}

// Traces the outline of the biggest thing in the picture. Returns points in
// the picture's own pixels, or throws with a reason.
export async function traceSilhouette(src, sensitivity = 50) {
  const img = await loadImage(src);
  const k = Math.min(1, 480 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(8, Math.round(img.naturalWidth * k));
  const h = Math.max(8, Math.round(img.naturalHeight * k));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const bg = borderColor(data, w, h);

  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4] - bg[0];
    const g = data[i * 4 + 1] - bg[1];
    const b = data[i * 4 + 2] - bg[2];
    if (data[i * 4 + 3] > 10 && Math.sqrt(r * r + g * g + b * b) > sensitivity) mask[i] = 1;
  }

  // The biggest 4-connected blob.
  const label = new Int32Array(w * h);
  let bestLabel = 0;
  let bestSize = 0;
  let next = 0;
  const queue = new Int32Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || label[start]) continue;
    next++;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    label[start] = next;
    while (head < tail) {
      const p = queue[head++];
      const x = p % w;
      const y = (p - x) / w;
      const nbr = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const q of nbr) {
        if (q >= 0 && mask[q] && !label[q]) {
          label[q] = next;
          queue[tail++] = q;
        }
      }
    }
    if (tail > bestSize) {
      bestSize = tail;
      bestLabel = next;
    }
  }
  if (bestSize < w * h * 0.02) throw new Error("Couldn't find a garment in the picture. Try a higher sensitivity, or trace it by hand.");
  if (bestSize > w * h * 0.93) throw new Error("The garment can't be told apart from the background. Use a picture on a plain background, or trace it by hand.");

  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && label[y * w + x] === bestLabel;

  // Moore-neighbour border tracing, starting at the top-left-most pixel.
  let sx = 0;
  let sy = 0;
  outer: for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (inside(x, y)) {
        sx = x;
        sy = y;
        break outer;
      }
    }
  }
  const dirs = [
    [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
  ];
  const ring = [{ x: sx, y: sy }];
  let cx = sx;
  let cy = sy;
  let dir = 0; // as if we had just stepped east into the start pixel (its west neighbour is outside)
  for (let guard = 0; guard < w * h * 4; guard++) {
    let found = false;
    for (let k2 = 0; k2 < 8; k2++) {
      const d = (dir + 5 + k2) % 8; // start just past where we came from
      const nx = cx + dirs[d][0];
      const ny = cy + dirs[d][1];
      if (inside(nx, ny)) {
        cx = nx;
        cy = ny;
        dir = d;
        found = true;
        break;
      }
    }
    if (!found) break; // a single pixel
    if (cx === sx && cy === sy && ring.length > 2) break;
    ring.push({ x: cx, y: cy });
  }

  const simple = simplifyRing(ring, Math.max(1.2, Math.max(w, h) / 260));
  if (simple.length < 3) throw new Error("The outline came out too small. Try a lower sensitivity.");
  // Back to the picture's own pixels (pixel centres).
  return simple.map((p) => ({ x: (p.x + 0.5) / k, y: (p.y + 0.5) / k, c: false }));
}
