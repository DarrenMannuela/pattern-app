import { MOTIF_PATTERNS } from "./motifs.js";
// The content of a pattern sheet: one printable page per garment with its
// features, sizes, pieces, sewing order and allowances, laid out like the
// "molde" sheets pattern makers hand to a cutting room.

// Colours that tell sizes apart in the grading nest, smallest to largest.
export const SIZE_COLORS = ["#2b6cb0", "#2f855a", "#b7791f", "#c05621", "#9b2c2c", "#6b46c1", "#2c7a7b", "#97266d"];

const COLLAR_NAMES = {
  convertible: "Point collar on a stand",
  spread: "Spread collar on a stand",
  peter_pan: "Peter Pan collar (flat)",
  standing: "Band (mandarin) collar",
  polo: "Knit polo collar",
};

const SLEEVE_NAMES = { half: "Short sleeves", three_quarter: "Three-quarter sleeves", full: "Long sleeves with buttoned cuffs" };

const has = (pieces, re) => pieces.some((p) => re.test(p.name));

const isShirt = (t) => ["school_shirt", "polo_shirt", "pe_shirt", "uniform_shirt"].includes(t);
const isBottoms = (t) => t === "pants" || t === "shorts";

// Extras (pockets, embroidery, prints) in plain words, grouped by where they go.
function extrasList(accessories) {
  const where = (seg) => String(seg || "").replace(/_/g, " ");
  return (accessories || []).map((a) => {
    const size = a.width && a.height ? ` (${a.width} × ${a.height} cm)` : "";
    if (a.type === "pocket") return `Pocket on the ${where(a.segment)}${size}`;
    const kind = a.type === "sablon" ? "Screen print" : "Embroidery";
    return `${kind} on the ${where(a.segment)}${a.label ? `: "${a.label}"` : ""}${size}`;
  });
}

// What the garment is, in the maker's own words, from the revision's options
// and the pieces it was drafted into.
const BAND_NAMES = { side: "side panel", centre: "streak", double: "2 streaks", chest: "chest", shoulder: "shoulders", hem: "hem", arms: "arms" };

// "Motif bands: chest in batik, arms in stripes" — each band with its own
// pattern, or one pattern for them all.
function motifLine(opts) {
  const bands = opts.motifs || [];
  const patternOf = (band) => opts.motifPatterns?.[band] || opts.pattern || "solid";
  const named = (pat) => MOTIF_PATTERNS.find((m) => m.value === pat)?.label.toLowerCase() || pat;
  if (!bands.length) return "Motif bands";
  if (new Set(bands.map(patternOf)).size === 1) return `Motif bands (${bands.map((b) => BAND_NAMES[b] || b).join(", ")}) in ${named(patternOf(bands[0]))}`;
  return `Motif bands: ${bands.map((b) => `${BAND_NAMES[b] || b} in ${named(patternOf(b))}`).join(", ")}`;
}

export function featuresFor(garmentType, opts = {}, pieces = [], accessories = []) {
  const out = [];
  if (isShirt(garmentType)) {
    if (opts.gender === "female") out.push(`Women's fit${opts.dartPosition ? `, ${opts.dartPosition.replace(/_/g, " ")} darts` : ""}`);
    else if (opts.gender === "male") out.push("Men's fit");
    else out.push("Unisex fit");
    const collarKey = garmentType === "polo_shirt" ? "polo" : has(pieces, /collar/i) ? opts.collarStyle || "convertible" : null;
    if (collarKey) out.push(COLLAR_NAMES[collarKey] || "Collar");
    else out.push(opts.neckline === "v_neck" ? "V-neck, no collar" : "Round neck, no collar");
    if (has(pieces, /^hidden placket$/i)) out.push("Hidden button placket");
    else if (has(pieces, /polo placket/i)) out.push("Short polo placket");
    else if (has(pieces, /^placket$/i)) out.push(opts.frontStyle === "half_placket" ? "Half placket (pullover)" : "Full button placket");
    else out.push("Pullover front");
    out.push(SLEEVE_NAMES[opts.sleeveStyle] || "Sleeves");
    if (has(pieces, /^cuff slit tower$/i)) out.push("Pointed sleeve placket");
    if (has(pieces, /^yoke$/i)) out.push(pieces.some((p) => /back/i.test(p.name) && p.landmarks?.pleat) ? "Back yoke, box pleat at centre back" : "Back yoke");
    if (garmentType !== "polo_shirt") out.push(opts.hemStyle === "straight" ? "Straight hem" : "Curved shirttail hem");
    if (has(pieces, /^upper front$/i)) out.push(`Colour block (${opts.colorBlock === "v" ? "V" : "straight"}) in the contrast fabric`);
    if (opts.sleeveFabric === "contrast") out.push("Sleeves in the contrast fabric");
    if (has(pieces, /piping strip|neck trim/i)) out.push("Contrast trim");
    if (has(pieces, /insert panel/i)) out.push("Contrast insert panel");
    if (has(pieces, /motif|chest band|shoulder band|hem band|arm band|streak/i) || opts.motifs?.length) out.push(motifLine(opts));
  } else if (isBottoms(garmentType)) {
    // Read from the pieces the draft actually made, which carry every default.
    const t = opts.trousers || {};
    out.push(`${t.legStyle ? t.legStyle.replace(/_/g, " ") : "Straight"} leg`.replace(/^./, (c) => c.toUpperCase()));
    out.push(has(pieces, /elastic/i) ? "Elastic waist" : "Waistband");
    if (has(pieces, /fly facing/i)) out.push("Zip fly");
    if (has(pieces, /slant pocket/i)) out.push("Slant front pockets");
    else if (has(pieces, /side pocket/i)) out.push("Side pockets");
    if (has(pieces, /welt strip/i)) out.push("Welt back pockets");
    else if (has(pieces, /^patch pocket$/i)) out.push("Patch back pockets");
    if (has(pieces, /belt loop/i)) out.push("Belt loops");
    if (has(pieces, /side stripe/i)) out.push("Side stripe");
  } else if (garmentType === "skirt") {
    const k = opts.skirt || {};
    out.push(`${(k.style || "a_line").replace(/_/g, "-")} skirt`.replace(/^./, (c) => c.toUpperCase()));
    out.push(k.waist === "elastic" ? "Elastic waist" : "Waistband with a back zip");
    if (k.pocket && k.pocket !== "none") out.push("Side pockets");
  } else {
    out.push(`${pieces.length} pieces`);
  }
  return [...out, ...extrasList(accessories)];
}

// How many to cut, as a cutting room writes it.
export function cutLabel(piece) {
  const qty = Math.max(1, piece.qty || 1);
  const fold = piece.foldEdge === "left" || piece.foldEdge === "bottom";
  let label = fold && qty % 2 === 0 ? `Cut ${qty / 2} on the fold` : `Cut ${qty}`;
  if (!fold && qty === 2 && /front|sleeve|leg|pants|shorts|cuff/i.test(piece.name)) label += " (a pair)";
  if (piece.fabric === "contrast") label += " · contrast fabric";
  return label;
}

// The allowances already in the cutting lines (backend/draft/finish.go).
export function seamAllowances(garmentType) {
  const rows = [
    ["Seams", "1 cm"],
    ["On the fold", "0"],
  ];
  if (isShirt(garmentType)) {
    rows.push(["Shirt hem", "2 cm"], ["Sleeve hem", "2.5 cm"]);
  } else if (isBottoms(garmentType) || garmentType === "skirt") {
    rows.push(["Hem", "4 cm"]);
  }
  return rows;
}

// The order the garment is sewn in. Built from what was actually drafted, so a
// shirt without a yoke doesn't list one; the sequences follow the standard
// ones for each kind of garment.
export function sewingSteps(garmentType, opts = {}, pieces = [], accessories = []) {
  const steps = [];
  const prints = (accessories || []).filter((a) => a.type === "embroidery" || a.type === "sablon");
  const pockets = (accessories || []).filter((a) => a.type === "pocket");
  if (prints.length) steps.push("Embroider or print the logos on the cut panels, before anything is sewn.");

  if (isShirt(garmentType)) {
    const polo = garmentType === "polo_shirt";
    if (opts.gender === "female" && opts.dartPosition) steps.push("Sew the darts and press them down.");
    if (has(pieces, /^upper front$/i)) steps.push("Join the colour-block upper parts to the front and back (or yoke); press and topstitch.");
    if (has(pieces, /insert panel/i)) steps.push("Join the insert panel between its front pieces.");
    if (has(pieces, /polo placket/i)) steps.push("Set the polo placket into the front slit.");
    else if (has(pieces, /^hidden placket$/i)) steps.push("Sew the hidden placket to each front edge and turn it in.");
    else if (has(pieces, /^placket$/i)) steps.push("Sew the placket to each front edge; press and edge-stitch.");
    if (pockets.length) steps.push("Press the pocket edges under and topstitch the pockets in place.");
    if (has(pieces, /^yoke$/i)) steps.push("Sew the back to the yoke, the back sandwiched between the outer and inner yoke.");
    steps.push(has(pieces, /^yoke$/i) ? "Join the fronts to the yoke at the shoulders." : "Join the shoulder seams.");
    if (opts.collarStyle === "peter_pan" && has(pieces, /collar leaf/i)) steps.push("Make the flat collar and attach it with a bias facing.");
    else if (has(pieces, /collar stand/i)) {
      steps.push("Make the collar: sew the two leaves, turn, press and topstitch; sew the leaf into the stand.");
      steps.push("Attach the stand to the neckline and topstitch it closed.");
    } else if (has(pieces, /standing collar/i)) steps.push("Make the band collar and attach it to the neckline; topstitch.");
    else if (has(pieces, /polo collar/i)) steps.push("Attach the knit collar to the neckline and cover the seam with tape.");
    else if (has(pieces, /neck trim/i)) steps.push("Bind the neckline with the trim.");
    else steps.push("Finish the neckline with its facing.");
    steps.push("Set the sleeves into the armholes flat, and topstitch.");
    steps.push(polo ? "Sew the side and underarm seams in one pass, leaving the vents open." : "Sew the side and underarm seams in one pass (felled).");
    if (has(pieces, /^cuff$/i)) steps.push("Finish the sleeve slits and attach the cuffs.");
    else if (has(pieces, /sleeve rib/i)) steps.push("Attach the rib bands to the sleeves.");
    else steps.push("Hem the sleeves.");
    steps.push(polo ? "Hem the body and bar-tack the vents." : "Hem the shirt.");
    if (has(pieces, /placket|cuff/i)) steps.push("Make the buttonholes and sew on the buttons.");
  } else if (isBottoms(garmentType)) {
    const elastic = has(pieces, /elastic/i);
    if (has(pieces, /slant pocket|side pocket/i)) steps.push("Make the front pockets and baste the bags in.");
    if (has(pieces, /welt strip/i)) steps.push("Sew the darts, then make the back welt pockets.");
    else if (has(pieces, /^patch pocket$/i)) steps.push("Sew the darts, then topstitch the back patch pockets.");
    else steps.push("Sew the back darts.");
    if (has(pieces, /fly facing/i)) steps.push("Set the fly zip and topstitch the J.");
    if (has(pieces, /side stripe/i)) steps.push("Topstitch the side stripes onto the outside leg.");
    steps.push("Join the side seams, then the inside leg seams.");
    steps.push("Join the crotch seam, front to back.");
    steps.push(elastic ? "Sew the waist casing and thread the elastic." : "Attach the waistband.");
    if (has(pieces, /belt loop/i)) steps.push("Sew on the belt loops.");
    steps.push("Hem the legs.");
    if (!elastic) steps.push("Buttonhole and button; bar-tack the fly.");
  } else if (garmentType === "skirt") {
    const k = opts.skirt || {};
    steps.push("Sew the darts.");
    if (k.pocket && k.pocket !== "none") steps.push("Make the side pockets.");
    if (k.waist !== "elastic") steps.push("Set the back zip and close the centre-back seam below it.");
    else steps.push("Close the centre-back seam.");
    steps.push("Join the side seams.");
    steps.push(k.waist === "elastic" ? "Sew the waist casing and thread the elastic." : "Attach the waistband and fasten it.");
    steps.push("Hem the skirt.");
  } else {
    steps.push("Sew the pieces as each one's note says.");
  }
  steps.push("Trim the threads, press, and check the finished measurements.");
  return steps;
}

// What one garment of each size takes, in metres, from a cutting plan made one
// garment per marker (maxGarments 1, single sizes). { size: { main, contrast } }
export function consumptionBySize(result) {
  const out = {};
  for (const plan of result?.plans || []) {
    for (const lay of plan.lays || []) {
      const size = lay.ratio?.[0]?.size;
      if (!size || !lay.garments) continue;
      out[size] = { ...(out[size] || {}), [plan.fabric]: Math.round((lay.fabricCm / lay.garments / 100) * 100) / 100 };
    }
  }
  return out;
}

// The pieces worth drawing on top of each other for the grading nest: the big
// body pieces that every size has.
export function gradingPieceNames(piecesBySize) {
  const sizes = Object.values(piecesBySize || {});
  if (!sizes.length) return [];
  const inAll = sizes[0].filter((p) => sizes.every((ps) => ps.some((q) => q.name === p.name)));
  return inAll
    .filter((p) => p.fabric !== "contrast")
    .sort((a, b) => b.width * b.height - a.width * a.height)
    .slice(0, 3)
    .map((p) => p.name);
}

// The size to draw the pieces in: M if there is one, else the middle size.
export function sampleSize(labels) {
  if (!labels?.length) return null;
  return labels.find((l) => l.toUpperCase() === "M") || labels[Math.floor((labels.length - 1) / 2)];
}
