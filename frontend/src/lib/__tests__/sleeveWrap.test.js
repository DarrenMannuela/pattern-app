import { describe, expect, it } from "vitest";
import { wrapMatrix, rectCorners, overlaps } from "../sleeveWrap.js";
import { bodySilhouette, sleeveTube, sleeveGeoFromPiece } from "../torsoGeometry.js";
import { FIXTURES } from "./fixtures.js";

// A real sleeve, hung off the real front and back shoulder/underarm points,
// so the wrap matrices are built on the same tube shape the app actually
// draws — a made-up tube could hide a bug that only shows up on the real
// (asymmetric front/back) proportions.
const frontSil = bodySilhouette(FIXTURES.collarShirt["Shirt front"].pathData);
const backSil = bodySilhouette(FIXTURES.collarShirt["Shirt back"].pathData);
const geo = sleeveGeoFromPiece(FIXTURES.collarShirt["Sleeve"]);
const tubes = {
  front: sleeveTube(frontSil.shoulder, frontSil.underarm, geo, frontSil.neck),
  back: sleeveTube(backSil.shoulder, backSil.underarm, geo, backSil.neck),
};

function applyMatrix(m, [x, y]) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

describe("wrapMatrix", () => {
  it("is the identity when the source and target view are the same", () => {
    for (const side of ["left", "right"]) {
      for (const view of ["front", "back", "side"]) {
        expect(wrapMatrix(tubes, side, view, view)).toEqual([1, 0, 0, 1, 0, 0]);
      }
    }
  });

  it("round-trips a point: front -> side -> front lands back where it started", () => {
    // This is the property a sleeve extra's position actually depends on —
    // if it drifted, an extra placed on the front view would visibly creep
    // sideways every time it re-crossed into the side view.
    const point = [tubes.front.bicepOuter[0] - 1, tubes.front.bicepOuter[1] + 5];
    const toSide = wrapMatrix(tubes, "left", "front", "side");
    const back = wrapMatrix(tubes, "left", "side", "front");
    const roundTripped = applyMatrix(back, applyMatrix(toSide, point));
    expect(roundTripped[0]).toBeCloseTo(point[0], 6);
    expect(roundTripped[1]).toBeCloseTo(point[1], 6);
  });

  it("round-trips front -> back -> front the same way", () => {
    const point = [tubes.front.bicepOuter[0] - 2, tubes.front.dropTo - 5];
    const there = wrapMatrix(tubes, "left", "front", "back");
    const andBack = wrapMatrix(tubes, "left", "back", "front");
    const roundTripped = applyMatrix(andBack, applyMatrix(there, point));
    expect(roundTripped[0]).toBeCloseTo(point[0], 6);
    expect(roundTripped[1]).toBeCloseTo(point[1], 6);
  });

  it("mirrors the left sleeve's matrix for the right sleeve, not just reusing it", () => {
    const left = wrapMatrix(tubes, "left", "front", "back");
    const right = wrapMatrix(tubes, "right", "front", "back");
    expect(right).not.toEqual(left);
  });
});

describe("rectCorners", () => {
  it("gives the plain axis-aligned corners of an unrotated rect under the identity matrix", () => {
    const corners = rectCorners({ x: 0, y: 0, width: 4, height: 2, rotation: 0 }, [1, 0, 0, 1, 0, 0]);
    expect(corners).toEqual([
      [0, 0],
      [4, 0],
      [4, 2],
      [0, 2],
    ]);
  });

  it("rotates the rectangle about its own centre, not the origin", () => {
    const corners = rectCorners({ x: 0, y: 0, width: 2, height: 2, rotation: 180 }, [1, 0, 0, 1, 0, 0]);
    // A 180° turn of a square centred on (1,1) maps each corner to its
    // opposite corner — the shape's footprint is unchanged.
    for (const [x, y] of corners) {
      expect(x).toBeGreaterThanOrEqual(-0.001);
      expect(x).toBeLessThanOrEqual(2.001);
      expect(y).toBeGreaterThanOrEqual(-0.001);
      expect(y).toBeLessThanOrEqual(2.001);
    }
  });
});

describe("overlaps", () => {
  it("says two overlapping squares overlap", () => {
    const a = [[0, 0], [2, 0], [2, 2], [0, 2]];
    const b = [[1, 1], [3, 1], [3, 3], [1, 3]];
    expect(overlaps(a, b)).toBe(true);
  });

  it("says two far-apart squares don't overlap", () => {
    const a = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const b = [[10, 10], [11, 10], [11, 11], [10, 11]];
    expect(overlaps(a, b)).toBe(false);
  });

  it("treats squares that only just touch as not overlapping, within the slop", () => {
    const a = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const b = [[1, 0], [2, 0], [2, 1], [1, 1]];
    expect(overlaps(a, b)).toBe(false);
  });
});
