import { describe, expect, it } from "vitest";
import { parsePath, bodySilhouette, sleeveGeoFromPiece, sleeveTube, SLEEVE_ANGLE } from "../torsoGeometry.js";
import { FIXTURES } from "./fixtures.js";

describe("parsePath", () => {
  it("reads each command's own points, not the raw number stream", () => {
    const cmds = parsePath("M1,2 L3,4 C5,6 7,8 9,10 Z");
    expect(cmds).toEqual([
      { c: "M", p: [[1, 2]] },
      { c: "L", p: [[3, 4]] },
      { c: "C", p: [[5, 6], [7, 8], [9, 10]] },
      { c: "Z", p: [] },
    ]);
  });
});

describe("bodySilhouette", () => {
  it("reads a real collared front's neck as a curve, not a corner", () => {
    const sil = bodySilhouette(FIXTURES.collarShirt["Shirt front"].pathData);
    expect(sil.neckCurve).not.toBeNull();
    // The neck point is the curve's own endpoint — this is what makes the
    // collar/trim illustration able to sit exactly on the real neckline.
    expect(sil.neck).toEqual(sil.neckCurve[3]);
    expect(sil.neck[0]).toBeCloseTo(7.6, 5);
    expect(sil.neck[1]).toBeCloseTo(0.0, 5);
  });

  it("reads a real V-neck front as straight lines to a point, no curve", () => {
    const sil = bodySilhouette(FIXTURES.vneckShirt["Shirt front"].pathData);
    // This is the exact distinction the preview uses to decide whether to
    // draw a collar or a V — get it wrong and every V-neck shirt would try
    // to grow a collar out of thin air.
    expect(sil.neckCurve).toBeNull();
    expect(sil.neck[0]).toBeCloseTo(7.6, 5);
    expect(sil.neck[1]).toBeCloseTo(0.0, 5);
  });

  it("finds the same shoulder and underarm points on the collar and V-neck cuts of the same base block", () => {
    const collar = bodySilhouette(FIXTURES.collarShirt["Shirt front"].pathData);
    const vneck = bodySilhouette(FIXTURES.vneckShirt["Shirt front"].pathData);
    // Only the neckline should differ between these two options — the rest
    // of the block (shoulder, armhole, hem) is the same front panel.
    expect(vneck.shoulder).toEqual(collar.shoulder);
    expect(vneck.underarm).toEqual(collar.underarm);
    expect(vneck.hemY).toEqual(collar.hemY);
  });

  it("returns null for a piece with no armhole curve (can't be read as a body panel)", () => {
    expect(bodySilhouette(FIXTURES.collarShirt["Cuff"].pathData)).toBeNull();
  });
});

describe("sleeveGeoFromPiece", () => {
  it("reads the real sleeve piece's bicep/wrist/cap numbers off its own path, not a guess", () => {
    const geo = sleeveGeoFromPiece(FIXTURES.collarShirt["Sleeve"]);
    // These come straight from the drafted crown/underarm/wrist points — see
    // draft.go's draftSleeve for what each token position is.
    expect(geo.halfBicep).toBeCloseTo(17.25, 5);
    expect(geo.wristHalf).toBeCloseTo(12.5, 5);
    expect(geo.capHeight).toBeCloseTo(12.8, 5);
    expect(geo.length).toBe(FIXTURES.collarShirt.Sleeve.height);
  });

  it("reads a different, shorter three-quarter sleeve correctly too", () => {
    const geo = sleeveGeoFromPiece(FIXTURES.vneckShirt["Sleeve"]);
    expect(geo.halfBicep).toBeCloseTo(17.25, 5); // same arm measurements, same bicep
    expect(geo.length).toBe(FIXTURES.vneckShirt.Sleeve.height);
    expect(geo.length).toBeLessThan(FIXTURES.collarShirt.Sleeve.height);
  });

  it("falls back to sane numbers when a sleeve piece is missing", () => {
    const geo = sleeveGeoFromPiece(undefined);
    expect(geo.halfBicep).toBeGreaterThan(0);
    expect(geo.wristHalf).toBeGreaterThan(0);
  });
});

describe("sleeveTube", () => {
  const front = bodySilhouette(FIXTURES.collarShirt["Shirt front"].pathData);
  const geo = sleeveGeoFromPiece(FIXTURES.collarShirt["Sleeve"]);
  const tube = sleeveTube(front.shoulder, front.underarm, geo, front.neck);

  it("hangs the sleeve down and out from the real shoulder/underarm points", () => {
    // The cuff sits below the underarm, and the sleeve's outer edge reaches
    // further out than the underarm — a sleeve that hung straight up or
    // collapsed to a point would fail either of these.
    expect(tube.dropTo).toBeGreaterThan(front.underarm[1]);
    expect(tube.outerX).toBeGreaterThanOrEqual(front.underarm[0]);
    expect(tube.cuffInnerX).toBeLessThan(tube.cuffOuterX);
  });

  it("swings out by SLEEVE_ANGLE from vertical, not straight down", () => {
    // axis is the unit vector down the arm; a sleeve hanging exactly
    // vertical would have axis = [0, 1].
    expect(tube.axis[0]).toBeCloseTo(Math.sin(SLEEVE_ANGLE), 6);
    expect(tube.axis[1]).toBeCloseTo(Math.cos(SLEEVE_ANGLE), 6);
  });

  it("produces a closed path: shoulder, one cap curve, four straight edges down and back", () => {
    const cmds = parsePath(tube.d);
    expect(cmds[0].c).toBe("M");
    expect(cmds.filter((c) => c.c === "C")).toHaveLength(1);
    expect(cmds.filter((c) => c.c === "L")).toHaveLength(4);
    expect(cmds.at(-1).c).toBe("Z");
  });

  it("draws the sleeve at roughly a quarter of the arm's round, not half of it", () => {
    // geo.halfBicep is HALF the sleeve piece's own flat width, because the
    // piece is cut in one go all the way around the arm (unlike the body,
    // drafted and drawn as a half panel). Using that full value as the
    // front-view half-width read as a puffed/bishop sleeve instead of a
    // set-in one — see sleeveTube's own comment. This pins the visible
    // bicep offset to well under half of geo.halfBicep, so a regression
    // back toward the old, too-wide silhouette fails loudly.
    const bicepOffset = Math.hypot(tube.bicepOuter[0] - front.underarm[0], tube.bicepOuter[1] - front.underarm[1]);
    expect(bicepOffset).toBeLessThan(geo.halfBicep * 0.6);
    expect(bicepOffset).toBeGreaterThan(geo.halfBicep * 0.3);
  });
});
