import { describe, expect, it } from "vitest";
import { collarDims, flatCollarLeaf, standingCollar, backBand, vNeckBand, backNeckStrip, turnDownCollar, backCollar } from "../collarGeometry.js";
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

describe("collars on a real neckline", () => {
  const front = bodySilhouette(FIXTURES.collarShirt["Shirt front"].pathData);
  const dims = collarDims([FIXTURES.collarShirt["Collar stand"], FIXTURES.collarShirt["Collar leaf"]], "convertible");

  it("draws a point collar as band, inside and leaf, all closed paths on the actual neckline", () => {
    const c = turnDownCollar(front.neckCurve, front.shoulder, dims);
    for (const d of [c.band, c.inner, c.leaf]) {
      expect(d.startsWith("M ")).toBe(true);
      expect(d.trim().endsWith("Z")).toBe(true);
    }
    // The leaves meet at centre front, at the neckline's own depth.
    expect(c.edge[c.edge.length - 1]).toEqual([0, front.neckCurve[0][1]]);
  });

  it("returns null rather than a bogus shape when there's no neckline curve to sit on (a V-neck)", () => {
    expect(turnDownCollar(null, front.shoulder, dims)).toBeNull();
    expect(flatCollarLeaf(null, dims)).toBeNull();
  });

  it("draws a Peter Pan collar as a flat band lying on the body, with a piped edge", () => {
    const peterPanDims = collarDims([FIXTURES.collarShirt["Collar leaf"]], "peter_pan");
    const leaf = flatCollarLeaf(front.neckCurve, peterPanDims);
    expect(leaf.d.trim().endsWith("Z")).toBe(true);
    expect(leaf.edge.length).toBeGreaterThan(10);
  });

  it("stands a band collar up from the neckline: its top edge is the neckline raised by the band", () => {
    const c = standingCollar(front.neckCurve, dims.thick);
    expect(c.front.trim().endsWith("Z")).toBe(true);
    const neckY = front.neckCurve[0][1];
    const frontTop = c.edge[c.edge.length - 1]; // the band's top at centre front
    expect(frontTop[0]).toBeCloseTo(0, 1);
    expect(neckY - frontTop[1]).toBeGreaterThan(dims.thick * 0.8);
  });

  it("returns null for the band helpers when given no curve, instead of throwing", () => {
    expect(standingCollar(null, dims.thick)).toBeNull();
    expect(backBand(null, 3)).toBeNull();
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

describe("turn-down collars drawn the way technical flats draw them", () => {
  const front = bodySilhouette(FIXTURES.collarShirt["Shirt front"].pathData);
  const dims = collarDims([FIXTURES.collarShirt["Collar stand"], FIXTURES.collarShirt["Collar leaf"]], "convertible");

  it("stands the collar above the neck point, arched up to centre back", () => {
    const c = turnDownCollar(front.neckCurve, front.shoulder, dims);
    const peakY = Number(c.band.match(/-?\d+\.?\d*/g)[1]);
    expect(c.rise).toBeCloseTo(dims.standH + 1);
    expect(peakY).toBeLessThan(front.neckCurve[3][1] - c.rise); // centre back higher than the corners
  });

  it("keeps the whole collar on its own side of the centre line", () => {
    const c = turnDownCollar(front.neckCurve, front.shoulder, dims);
    for (const [x] of c.edge) expect(x).toBeGreaterThanOrEqual(-0.01);
  });

  it("spreads a spread collar's points further apart than a point collar's", () => {
    const tip = (edge) => edge[edge.length - 2];
    const point = turnDownCollar(front.neckCurve, front.shoulder, dims).edge;
    const spread = turnDownCollar(front.neckCurve, front.shoulder, { ...dims, alpha: (55 * Math.PI) / 180 }).edge;
    expect(tip(spread)[0]).toBeGreaterThan(tip(point)[0]);
  });

  it("draws the back view as a band with only its sides and top outlined", () => {
    const back = [[0, 2.2], [4, 2.2], [7.2, 1], [7.2, 0]];
    const c = backCollar(back, 4);
    expect(c.edge.startsWith("M 7.20 0.00")).toBe(true);
    expect(c.edge).not.toContain("Z");
    expect(backCollar(null, 4)).toBeNull();
  });
});
