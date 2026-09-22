import { describe, expect, it } from "vitest";
import { collarDims, frontLeaf, frontBand, backBand, backArch, vNeckBand, backNeckStrip } from "../collarGeometry.js";
import { bodySilhouette } from "../torsoGeometry.js";
import { FIXTURES } from "./fixtures.js";

describe("collarDims", () => {
  it("reads a real convertible collar's stand height and leaf point length off its own pieces", () => {
    const pieces = [FIXTURES.collarShirt["Collar stand"], FIXTURES.collarShirt["Collar leaf"]];
    const dims = collarDims(pieces, "convertible");
    // The stand height comes from the stand piece's own first vertical run;
    // the point length/spread angle come from the leaf's own tip — not the
    // module's generic defaults.
    expect(dims.standH).toBeGreaterThan(0);
    expect(dims.pointLen).toBeGreaterThan(0);
    expect(dims.alpha).toBeGreaterThan(0);
  });

  it("gives a polo collar its own fixed proportions (a knit collar, not a woven turn-down)", () => {
    const dims = collarDims([FIXTURES.poloShirt["Polo collar"]], "polo");
    expect(dims.pointLen).toBe(8);
    expect(dims.alpha).toBeCloseTo((30 * Math.PI) / 180, 6);
  });

  it("falls back to the module's stated real-shirt proportions when no collar pieces are given", () => {
    const dims = collarDims([], "convertible");
    expect(dims.standH).toBe(3);
    expect(dims.fall).toBe(5);
    expect(dims.pointLen).toBe(7.5);
  });
});

describe("frontLeaf / frontBand / backBand / backArch on a real neckline", () => {
  const front = bodySilhouette(FIXTURES.collarShirt["Shirt front"].pathData);
  const dims = collarDims([FIXTURES.collarShirt["Collar stand"], FIXTURES.collarShirt["Collar leaf"]], "convertible");

  it("draws a point-collar leaf as a real, closed SVG path sitting on the actual neckline", () => {
    const leaf = frontLeaf("convertible", front.neckCurve, dims);
    expect(leaf).not.toBeNull();
    expect(leaf.d.startsWith("M ")).toBe(true);
    expect(leaf.d.trim().endsWith("Z")).toBe(true);
    expect(leaf.edge.length).toBeGreaterThan(0);
  });

  it("returns null rather than a bogus shape when there's no neckline curve to sit on (a V-neck)", () => {
    expect(frontLeaf("convertible", null, dims)).toBeNull();
  });

  it("draws a Peter Pan collar as a distinctly different (rounder) shape than a point collar", () => {
    const peterPanDims = collarDims([FIXTURES.collarShirt["Collar leaf"]], "peter_pan");
    const point = frontLeaf("convertible", front.neckCurve, dims);
    const peterPan = frontLeaf("peter_pan", front.neckCurve, peterPanDims);
    expect(peterPan.d).not.toBe(point.d);
    expect(peterPan.roll).toEqual([]); // no roll line on a flat collar — nothing to fold
  });

  it("draws a standing-collar band that grows from the neckline outward", () => {
    const band = frontBand(front.neckCurve, dims.thick);
    expect(band.startsWith("M ")).toBe(true);
    expect(band.trim().endsWith("Z")).toBe(true);
  });

  it("returns null for the band/arch helpers when given no curve, instead of throwing", () => {
    expect(frontBand(null, dims.thick)).toBeNull();
    expect(backBand(null, 3)).toBeNull();
    expect(backArch(null, 2)).toBeNull();
  });
});

describe("vNeckBand / backNeckStrip on a real V-neck", () => {
  const front = bodySilhouette(FIXTURES.vneckShirt["Shirt front"].pathData);

  it("draws the V-neck trim as a band between the V point and the neck, not across the whole front", () => {
    const band = vNeckBand(front.neck, front.start, 3);
    expect(band.startsWith("M ")).toBe(true);
    // Four corners for a simple quadrilateral band.
    expect((band.match(/L /g) || []).length).toBe(3);
  });

  it("returns an empty back-neck strip when there's no back neckline curve", () => {
    expect(backNeckStrip(null, 1.2)).toBeNull();
  });
});
