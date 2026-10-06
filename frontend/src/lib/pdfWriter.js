// A small vector PDF writer for printing at real size. Pages are sized in
// centimetres and everything is drawn in centimetres, y down, so a pattern
// drawn here prints 1:1 when the PDF is printed at "Actual size" (100%).
// Text uses the built-in Helvetica, so nothing has to be embedded.

const PT_PER_CM = 72 / 2.54;
const n = (v) => (Math.round(v * 1000) / 1000).toString();

// Helvetica's average advance is about half an em; good enough to centre labels.
export const textWidth = (text, sizeCm) => String(text).length * sizeCm * 0.52;

// Only WinAnsi characters survive in a standard font; the rest become "?".
function pdfString(text) {
  const clean = String(text)
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/×/g, "x")
    .replace(/·/g, "-")
    .replace(/[^\x20-\x7e]/g, "?");
  return `(${clean.replace(/([\\()])/g, "\\$1")})`;
}

class Page {
  constructor(widthCm, heightCm) {
    this.width = widthCm;
    this.height = heightCm;
    // Centimetres, origin top-left, y down.
    this.ops = [`${n(PT_PER_CM)} 0 0 ${n(-PT_PER_CM)} 0 ${n(heightCm * PT_PER_CM)} cm`, "1 J 1 j"];
  }

  /** Line width in mm, dash pattern in cm ([] for solid), grey 0 (black) to 1 (white). */
  style({ widthMm = 0.3, dash = [], grey = 0 } = {}) {
    this.ops.push(`${n(widthMm / 10)} w [${dash.map(n).join(" ")}] 0 d ${n(grey)} G ${n(grey)} g`);
    return this;
  }

  polyline(points, closed = false) {
    if (points.length < 2) return this;
    this.ops.push(`${n(points[0][0])} ${n(points[0][1])} m`);
    for (let i = 1; i < points.length; i++) this.ops.push(`${n(points[i][0])} ${n(points[i][1])} l`);
    this.ops.push(closed ? "s" : "S");
    return this;
  }

  line(x1, y1, x2, y2) {
    return this.polyline([[x1, y1], [x2, y2]]);
  }

  rect(x, y, w, h, fill = false) {
    this.ops.push(`${n(x)} ${n(y)} ${n(w)} ${n(h)} re ${fill ? "f" : "S"}`);
    return this;
  }

  polygonFill(points) {
    if (points.length < 3) return this;
    this.ops.push(`${n(points[0][0])} ${n(points[0][1])} m`);
    for (let i = 1; i < points.length; i++) this.ops.push(`${n(points[i][0])} ${n(points[i][1])} l`);
    this.ops.push("f");
    return this;
  }

  /** Keeps what's drawn between clip() and unclip() inside a rectangle. */
  clip(x, y, w, h) {
    this.ops.push(`q ${n(x)} ${n(y)} ${n(w)} ${n(h)} re W n`);
    return this;
  }

  unclip() {
    this.ops.push("Q");
    return this;
  }

  /** Text with its baseline at (x, y), size in cm, turned by `angle` degrees. */
  text(x, y, text, { size = 0.35, bold = false, align = "left", angle = 0, grey = 0 } = {}) {
    const w = textWidth(text, size);
    const dx = align === "center" ? -w / 2 : align === "right" ? -w : 0;
    const r = (angle * Math.PI) / 180;
    const c = Math.cos(r), s = Math.sin(r);
    // Flip y back so the glyphs stand upright in the y-down page.
    this.ops.push(`BT /${bold ? "F2" : "F1"} ${n(size)} Tf ${n(grey)} g ${n(c)} ${n(s)} ${n(s)} ${n(-c)} ${n(x + dx * c)} ${n(y + dx * s)} Tm ${pdfString(text)} Tj ET`);
    return this;
  }
}

export class PdfDocument {
  constructor(title = "") {
    this.title = title;
    this.pages = [];
  }

  addPage(widthCm, heightCm) {
    const p = new Page(widthCm, heightCm);
    this.pages.push(p);
    return p;
  }

  /** The finished file as a Blob. */
  toBlob() {
    const objects = [];
    const add = (body) => {
      objects.push(body);
      return objects.length;
    };
    const catalog = add(null);
    const pagesObj = add(null);
    const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const bold = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const kids = [];
    for (const p of this.pages) {
      const stream = p.ops.join("\n");
      const content = add(`<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`);
      const w = n(p.width * PT_PER_CM), h = n(p.height * PT_PER_CM);
      kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${w} ${h}] /Contents ${content} 0 R /Resources << /Font << /F1 ${font} 0 R /F2 ${bold} 0 R >> >> >>`));
    }
    objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R /ViewerPreferences << /PrintScaling /None >> >>`;
    objects[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
    const info = add(`<< /Title ${pdfString(this.title)} /Producer (Konveksi Studio) >>`);

    const enc = new TextEncoder();
    const chunks = [enc.encode("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")];
    let offset = chunks[0].length;
    const offsets = [];
    objects.forEach((body, i) => {
      offsets.push(offset);
      const bytes = enc.encode(`${i + 1} 0 obj\n${body}\nendobj\n`);
      chunks.push(bytes);
      offset += bytes.length;
    });
    const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)].join("");
    chunks.push(enc.encode(`${xref}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${offset}\n%%EOF\n`));
    return new Blob(chunks, { type: "application/pdf" });
  }
}
