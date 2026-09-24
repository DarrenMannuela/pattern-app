// Turns what the vision service read from a photo or a written description
// (backend/vision Design) into pattern-maker choices: the parts to set, the
// pockets and prints to place, the colours, and plain-language notes about
// anything that couldn't be matched.

const SHIRT_TYPES = ["school_shirt", "polo_shirt", "pe_shirt", "uniform_shirt"];

const SEGMENTS = {
  shirt: ["collar", "cuffs", "left_chest", "right_chest", "center_front", "back", "left_sleeve", "right_sleeve"],
  bottoms: ["waistband", "left_leg", "right_leg", "back", "left_hem", "right_hem", "hem"],
  skirt: ["waistband", "center_front", "back", "hem"],
  other: ["center_front"],
};

const GARMENT_FOR = { shirt: "a shirt", polo: "a polo shirt", pants: "pants", shorts: "shorts", skirt: "a skirt", other: "something else" };
const KIND_LABEL = { shirt: "a shirt", bottoms: "pants or shorts", skirt: "a skirt", other: "a merchandise item" };

function kindOfOrder(garmentType) {
  if (SHIRT_TYPES.includes(garmentType)) return "shirt";
  if (garmentType === "pants" || garmentType === "shorts") return "bottoms";
  if (garmentType === "skirt") return "skirt";
  return "other";
}

function kindOfDesign(garment) {
  if (garment === "shirt" || garment === "polo") return "shirt";
  if (garment === "pants" || garment === "shorts") return "bottoms";
  if (garment === "skirt") return "skirt";
  return "other";
}

const isHex = (c) => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c.trim());

// `design` is the JSON from POST /api/analyze-photo or /api/analyze-text, and
// `source` says which ("photo" or "description"). Returns
// { patch, accessories, colors, notes, mismatch } — `patch` is in the shape
// PatternMaker's onChange takes, `accessories` are { type, segment, extra }.
//
// A small local model reading a photo invents pockets, prints and panels, so
// there they are only suggested. A description is the customer's own words —
// what it names was asked for — so it is applied whichever model read it.
export function designToMaker(design, garmentType, source = "photo") {
  const fromPhoto = source === "photo";
  const notes = [];
  // The first-choice reader failed and another stepped in; say so first.
  if (design.fallback) notes.push(design.fallback);
  const patch = {};
  const accessories = [];
  const colors = {};
  if (isHex(design.main_color)) colors.main = design.main_color.trim();
  if (isHex(design.accent_color)) colors.accent = design.accent_color.trim();

  const orderKind = kindOfOrder(garmentType);
  const photoKind = kindOfDesign(design.garment);
  if (orderKind !== photoKind) {
    return {
      patch,
      accessories,
      colors,
      notes,
      mismatch: `${fromPhoto ? "The photo looks like" : "The description sounds like"} ${GARMENT_FOR[design.garment] || "another kind of garment"}, but this order is for ${KIND_LABEL[orderKind]}. Only the colours were taken; start an order of the right type to match the pattern.`,
    };
  }

  if (orderKind === "shirt") {
    const school = garmentType === "school_shirt";
    const polo = garmentType === "polo_shirt";
    const pe = garmentType === "pe_shirt";

    if (["unisex", "male", "female"].includes(design.fit)) patch.gender = design.fit;

    const sleeve = { short: "half", three_quarter: "three_quarter", long: "full" }[design.sleeve];
    if (sleeve) patch.sleeveStyle = sleeve;
    else if (design.sleeve === "sleeveless") notes.push("Sleeveless isn't in the catalog — the shortest sleeve was kept.");

    // A polo's collar is knit, so a contrast collar there is the whole collar.
    if (polo) patch.trim = design.trim === "contrast_trim" ? "contrast" : "none";

    if (!polo) {
      const collars = { point_collar: "convertible", spread_collar: "spread", peter_pan_collar: "peter_pan", band_collar: "standing", polo_collar: "convertible" };
      const neck = design.neckline;
      if (collars[neck]) {
        if (pe) notes.push("A PE shirt has no collar, so the collar wasn't applied. A uniform shirt order can have one.");
        else {
          patch.collarEnabled = true;
          patch.collarStyle = collars[neck];
          patch.neckline = "round";
          if (neck === "polo_collar") notes.push("A knit polo collar isn't a shirt-collar option here — a point collar was used. Use a polo shirt order for the real thing.");
        }
      } else if (neck === "v_neck" || neck === "round_neck") {
        if (school) notes.push("A school shirt always has a collar, so the collarless neckline wasn't applied. A uniform shirt order can be collarless.");
        else {
          patch.collarEnabled = false;
          patch.neckline = neck === "v_neck" ? "v_neck" : "round";
        }
      }

      const front = { placket: "placket", half_placket: "half_placket", hidden_placket: "hidden_placket", plain: "plain" }[design.front];
      if (front) patch.frontStyle = front;
      if (["yoke", "plain"].includes(design.back)) patch.backStyle = design.back;
      if (["curved", "straight"].includes(design.hem)) patch.hemStyle = design.hem;
      patch.trim = design.trim === "contrast_trim" ? "contrast" : "none";
      const motifName = { centre_streak: "centre", double_streak: "double", chest_band: "chest", shoulder_band: "shoulder", hem_band: "hem", arm_bands: "arms" };
      const bands = [...new Set((design.motifs || []).map((x) => motifName[x]).filter(Boolean))];
      const panel = design.insert_panel === "side_panel";
      if (fromPhoto && design.provider === "ollama") {
        // A small local model flags panels and bands that aren't there, so they are
        // suggestions to check rather than choices made for you.
        if (panel) notes.push("The local model thinks there is a contrasting side panel — not added. Pick Side panel under Motif bands if you can see one.");
        if (bands.length) notes.push(`The local model thinks there are motif bands (${bands.join(", ")}) — not added. Pick them under Motif bands if you can see them.`);
        if (design.pattern && design.pattern !== "solid") notes.push(`It read the motif pattern as ${design.pattern}.`);
      } else {
        patch.motifs = [...(panel ? ["side"] : []), ...bands];
        patch.pattern = design.pattern || "solid";
      }
    }
  } else if (orderKind === "bottoms") {
    if (["slim", "straight", "wide"].includes(design.leg)) patch.legStyle = design.leg;
    if (["slant", "none"].includes(design.front_pocket)) patch.frontPocket = design.front_pocket;
    if (["welt", "patch", "none"].includes(design.back_pocket)) patch.backPocket = design.back_pocket;
    if (["band", "elastic"].includes(design.waist)) patch.trouserWaist = design.waist;
    patch.stripe = design.side_stripe === "side_stripe" ? "side" : "none";
  } else if (orderKind === "skirt") {
    if (["straight", "a_line", "flared"].includes(design.skirt_style)) patch.skirt = { style: design.skirt_style };
  }

  const valid = SEGMENTS[orderKind];
  // A small local model often invents pockets and prints, so its are suggestions
  // to check, not things put on the garment.
  const suggestOnly = fromPhoto && design.provider === "ollama";
  for (const p of design.pockets || []) {
    if (!valid.includes(p.segment)) {
      notes.push(`A ${p.kind} pocket on the ${String(p.segment).replace("_", " ")} can't be placed on this garment.`);
      continue;
    }
    if (p.kind === "welt" && orderKind === "bottoms") continue; // covered by the back pocket choice
    if (suggestOnly) {
      notes.push(`The local model thinks there is a ${p.kind} pocket on the ${String(p.segment).replace("_", " ")} — not added. Click the garment to add it if you can see it.`);
      continue;
    }
    const sleeve = /sleeve/.test(p.segment);
    const extra = p.kind === "pen" ? { shape: "square", width: 3.5, height: 13 } : sleeve ? { shape: "classic", width: 6, height: 7 } : { shape: "classic", width: 10, height: 11.5 };
    accessories.push({ type: "pocket", segment: p.segment, extra });
  }
  for (const pr of design.prints || []) {
    if (!valid.includes(pr.segment)) {
      notes.push(`${pr.type === "embroidery" ? "Embroidery" : "A print"} on the ${String(pr.segment).replace("_", " ")} can't be placed on this garment.`);
      continue;
    }
    if (suggestOnly) {
      notes.push(`The local model thinks there is ${pr.type === "embroidery" ? "embroidery" : "a print"}${pr.description ? ` ("${pr.description}")` : ""} on the ${String(pr.segment).replace("_", " ")} — not added. Click the garment to add it if you can see it.`);
      continue;
    }
    accessories.push({ type: pr.type === "embroidery" ? "embroidery" : "sablon", segment: pr.segment, extra: { label: (pr.description || "").slice(0, 16) } });
  }

  return { patch, accessories, colors, notes, mismatch: null };
}
