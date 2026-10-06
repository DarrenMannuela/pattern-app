import { describe, expect, it } from "vitest";
import { consumptionBySize, cutLabel, featuresFor, gradingPieceNames, sampleSize, seamAllowances, sewingSteps } from "../patternSheet.js";

const shirtPieces = ["Shirt front", "Yoke", "Shirt back", "Sleeve", "Cuff", "Cuff slit facing", "Collar stand", "Collar leaf", "Placket"].map((name) => ({ name, width: 20, height: 20 }));
const shirtOpts = { gender: "male", sleeveStyle: "full", collarStyle: "convertible", frontStyle: "placket", hemStyle: "curved" };

describe("featuresFor", () => {
  it("names each motif band's own pattern", () => {
    const pieces = [{ name: "Chest band" }, { name: "Arm band" }];
    const mixed = featuresFor("school_shirt", { motifs: ["chest", "arms"], pattern: "batik", motifPatterns: { arms: "stripes" } }, pieces);
    expect(mixed.some((f) => /chest in batik/i.test(f) && /arms in stripes/i.test(f))).toBe(true);
    const same = featuresFor("school_shirt", { motifs: ["chest", "arms"], pattern: "batik" }, pieces);
    expect(same.some((f) => /^Motif bands \(chest, arms\) in batik/i.test(f))).toBe(true);
  });

  it("describes a long-sleeve school shirt from its options and pieces", () => {
    const f = featuresFor("school_shirt", shirtOpts, shirtPieces, [{ type: "embroidery", segment: "left_chest", label: "SDN 1", width: 7, height: 5 }]);
    expect(f).toEqual(expect.arrayContaining(["Men's fit", "Point collar on a stand", "Full button placket", "Long sleeves with buttoned cuffs", "Back yoke", "Curved shirttail hem"]));
    expect(f.at(-1)).toBe('Embroidery on the left chest: "SDN 1" (7 × 5 cm)');
  });

  it("describes trousers from the pieces they were drafted into", () => {
    const pieces = ["Pants front", "Pants back", "Waistband", "Belt loop", "Slant pocket bag", "Welt strip", "Welt pocket bag", "Fly facing"].map((name) => ({ name }));
    const f = featuresFor("pants", { trousers: { legStyle: "straight" } }, pieces);
    expect(f).toEqual(["Straight leg", "Waistband", "Zip fly", "Slant front pockets", "Welt back pockets", "Belt loops"]);
    const steps = sewingSteps("pants", {}, pieces);
    expect(steps[0]).toMatch(/front pockets/);
    expect(steps.some((s) => /welt/.test(s)) && steps.some((s) => /fly zip/.test(s)) && steps.some((s) => /belt loops/.test(s))).toBe(true);
  });

  it("knows an elastic-waist pair has no fly or buttonhole", () => {
    const pieces = ["Shorts front", "Shorts back", "Waistband (elastic)", "Waist elastic"].map((name) => ({ name }));
    expect(featuresFor("shorts", {}, pieces)).toContain("Elastic waist");
    expect(sewingSteps("shorts", {}, pieces).some((s) => /buttonhole|fly/i.test(s))).toBe(false);
  });
});

describe("cutLabel", () => {
  it("says how many to cut, as a cutting room writes it", () => {
    expect(cutLabel({ name: "Shirt back", qty: 2, foldEdge: "left" })).toBe("Cut 1 on the fold");
    expect(cutLabel({ name: "Yoke", qty: 4, foldEdge: "left" })).toBe("Cut 2 on the fold");
    expect(cutLabel({ name: "Shirt front", qty: 2, foldEdge: "" })).toBe("Cut 2 (a pair)");
    expect(cutLabel({ name: "Upper front", qty: 2, foldEdge: "", fabric: "contrast" })).toBe("Cut 2 (a pair) · contrast fabric");
    expect(cutLabel({ name: "Belt loop", qty: 5 })).toBe("Cut 5");
  });
});

describe("sewingSteps", () => {
  it("follows the shirt's own construction, logos first and pressing last", () => {
    const steps = sewingSteps("school_shirt", shirtOpts, shirtPieces, [{ type: "sablon", segment: "back" }]);
    expect(steps[0]).toMatch(/logos/);
    expect(steps.some((s) => /yoke/.test(s))).toBe(true);
    expect(steps.some((s) => /cuffs/.test(s))).toBe(true);
    expect(steps.findIndex((s) => /shoulders/.test(s))).toBeLessThan(steps.findIndex((s) => /sleeves into/.test(s)));
    expect(steps.at(-1)).toMatch(/press/);
  });

  it("leaves out what the garment doesn't have", () => {
    const tee = sewingSteps("pe_shirt", { sleeveStyle: "half" }, [{ name: "Shirt front" }, { name: "Shirt back" }, { name: "Sleeve" }, { name: "Neck facing" }]);
    expect(tee.some((s) => /yoke|cuff|buttonhole/i.test(s))).toBe(false);
    expect(tee).toContain("Hem the sleeves.");
  });

  it("sews a Peter Pan collar as a flat collar, not a stand collar", () => {
    const steps = sewingSteps("uniform_shirt", { ...shirtOpts, collarStyle: "peter_pan" }, shirtPieces);
    expect(steps.some((s) => /flat collar/.test(s))).toBe(true);
    expect(steps.some((s) => /stand to the neckline/.test(s))).toBe(false);
  });
});

describe("the rest of the sheet", () => {
  it("lists the allowances in the cutting lines", () => {
    expect(seamAllowances("school_shirt")).toContainEqual(["Sleeve hem", "2.5 cm"]);
    expect(seamAllowances("pants")).toContainEqual(["Hem", "4 cm"]);
    // The shop's uniform block is cut with Dad's allowances.
    expect(seamAllowances("uniform_shirt", { block: "konveksi" })).toContainEqual(["Seams", "0.5 cm"]);
    expect(seamAllowances("uniform_shirt", { block: "konveksi" })).toContainEqual(["Shirt hem", "1.5 cm"]);
    expect(seamAllowances("polo_shirt", { block: "konveksi" })).toContainEqual(["Seams", "1 cm"]);
  });

  it("reads fabric per garment and size off a one-garment-per-marker plan", () => {
    const result = { plans: [{ fabric: "main", lays: [{ ratio: [{ size: "M", count: 1 }], garments: 10, fabricCm: 1320 }] }, { fabric: "contrast", lays: [{ ratio: [{ size: "M", count: 1 }], garments: 10, fabricCm: 210 }] }] };
    expect(consumptionBySize(result)).toEqual({ M: { main: 1.32, contrast: 0.21 } });
  });

  it("picks the big body pieces every size has for the grading nest", () => {
    const bySize = {
      S: [{ name: "Shirt front", width: 25, height: 70 }, { name: "Sleeve", width: 40, height: 24 }, { name: "Cuff", width: 22, height: 6 }, { name: "Shirt back", width: 27, height: 60 }],
      M: [{ name: "Shirt front", width: 26, height: 72 }, { name: "Sleeve", width: 41, height: 25 }, { name: "Cuff", width: 23, height: 6 }, { name: "Shirt back", width: 28, height: 62 }],
    };
    expect(gradingPieceNames(bySize)).toEqual(["Shirt front", "Shirt back", "Sleeve"]);
  });

  it("draws the pieces in M, or the middle size", () => {
    expect(sampleSize(["S", "M", "L"])).toBe("M");
    expect(sampleSize(["7", "8", "9", "10"])).toBe("8");
  });
});

describe("logos in the design list", () => {
  it("names a logo print, its size and how many colours it takes", () => {
    const f = featuresFor("pe_shirt", {}, [], [
      { type: "sablon", segment: "back", image: "0123456789abcdef0123456789abcdef.png", width: 24, height: 17.3333, inkColors: ["#112233", "#ffffff"] },
      { type: "embroidery", segment: "left_chest", image: "0123456789abcdef0123456789abcdef.png", width: 8, height: 8, fullColour: true },
    ]);
    expect(f).toContain("Screen print of the logo on the back (24 × 17.3 cm), 2 colours");
    expect(f).toContain("Embroidery of the logo on the left chest (8 × 8 cm), full colour");
  });
});
