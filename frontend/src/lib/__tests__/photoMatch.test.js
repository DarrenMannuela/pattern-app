import { describe, expect, it } from "vitest";
import { designToMaker } from "../photoMatch.js";
import { formatElapsed } from "../useElapsed.js";

// What a small local model returns for "cream short-sleeve shirt, band collar,
// patch pocket and embroidered logo on the left chest".
const design = {
  garment: "shirt",
  fit: "unisex",
  sleeve: "short",
  neckline: "band_collar",
  front: "placket",
  back: "not_applicable",
  hem: "not_applicable",
  trim: "none",
  insert_panel: "side_panel",
  motifs: ["hem_band"],
  pattern: "stripes",
  pockets: [{ segment: "left_chest", kind: "patch" }],
  prints: [{ type: "embroidery", segment: "left_chest", description: "logo" }],
  main_color: "#e8dcc0",
  accent_color: "",
  unsupported: [],
  provider: "ollama",
};

describe("designToMaker from a written description", () => {
  it("applies the parts, colours and everything the customer named", () => {
    const r = designToMaker(design, "uniform_shirt", "description");
    expect(r.patch).toMatchObject({ sleeveStyle: "half", collarEnabled: true, collarStyle: "standing", frontStyle: "placket" });
    expect(r.colors).toEqual({ main: "#e8dcc0" });
    // The customer asked for these in words, so a local model's read of them is
    // applied — not held back as a guess the way a photo's would be.
    expect(r.accessories.map((a) => [a.type, a.segment])).toEqual([["pocket", "left_chest"], ["embroidery", "left_chest"]]);
    expect(r.patch.motifs).toEqual(["side", "hem"]);
    expect(r.patch.pattern).toBe("stripes");
    expect(r.mismatch).toBeNull();
  });

  it("still holds a local model's guesses back when it read a photo", () => {
    const r = designToMaker(design, "uniform_shirt", "photo");
    expect(r.accessories).toEqual([]);
    expect(r.patch.motifs).toBeUndefined();
    expect(r.notes.join(" ")).toMatch(/local model thinks there is a patch pocket/);
    expect(r.notes.join(" ")).toMatch(/embroidery/);
  });

  it("defaults to reading a photo, as every existing caller does", () => {
    expect(designToMaker(design, "uniform_shirt").accessories).toEqual([]);
  });

  it("words a garment-type mismatch for the source, and takes only the colours", () => {
    const trousers = { ...design, garment: "pants" };
    const fromText = designToMaker(trousers, "school_shirt", "description");
    expect(fromText.mismatch).toMatch(/^The description sounds like pants, but this order is for a shirt/);
    expect(fromText.colors).toEqual({ main: "#e8dcc0" });
    expect(fromText.patch).toEqual({});
    expect(designToMaker(trousers, "school_shirt", "photo").mismatch).toMatch(/^The photo looks like pants/);
  });
});

describe("when a second reader stepped in", () => {
  it("shows why, first, whichever way the design is read", () => {
    const note = "The Claude API couldn't be used (overloaded), so the local model qwen3-vl:4b read it instead.";
    for (const source of ["photo", "description"]) {
      const r = designToMaker({ ...design, fallback: note }, "uniform_shirt", source);
      expect(r.notes[0]).toBe(note);
    }
    // A garment mismatch returns early; the note must still be there.
    expect(designToMaker({ ...design, fallback: note }, "pants").notes).toContain(note);
    expect(designToMaker(design, "uniform_shirt").notes).not.toContain(note);
  });
});

describe("a polo's contrast collar", () => {
  it("sets Trim on a polo order, since the backend recolours the polo collar itself", () => {
    const polo = { ...design, garment: "polo", neckline: "polo_collar" };
    expect(designToMaker({ ...polo, trim: "contrast_trim" }, "polo_shirt", "description").patch.trim).toBe("contrast");
    expect(designToMaker({ ...polo, trim: "none" }, "polo_shirt", "description").patch.trim).toBe("none");
  });
});

describe("formatElapsed", () => {
  it("shows minutes and zero-padded seconds", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(9)).toBe("0:09");
    expect(formatElapsed(75)).toBe("1:15");
    expect(formatElapsed(600)).toBe("10:00");
  });
});
