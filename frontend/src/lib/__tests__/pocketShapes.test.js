import { describe, expect, it } from "vitest";
import { pocketPath } from "../pocketShapes.js";

describe("pocketPath", () => {
  it("draws a square pocket as a plain rectangle, no curves", () => {
    expect(pocketPath("square", 10, 12)).toBe("M 0 0 L 10 0 L 10 12 L 0 12 Z");
  });

  it("draws a pointed pocket as a pentagon (a point at the bottom)", () => {
    const d = pocketPath("pointed", 10, 12);
    expect(d).toBe("M 0 0 L 10 0 L 10 8.64 L 5 12 L 0 8.64 Z");
  });

  it("rounds the classic and rounded shapes with the SAME cubic circular-arc formula backend/draft/addons.go's draftPatchPocket uses (k = r*0.552), not an approximated quadratic corner", () => {
    // This mirrors draftPatchPocket exactly: r is a fraction of min(w,h), and
    // each rounded corner is a cubic bezier with the endpoints offset by r
    // and the control points offset by k = r*0.552 along the tangent. The
    // two were previously two different curve shapes approximating the same
    // real rounded corner — this pins them to be the identical formula.
    const w = 10;
    const h = 12;
    const r = Math.min(w, h) * 0.18; // "classic"
    const k = r * 0.552;
    const expected = `M 0 0 L ${w} 0 L ${w} ${h - r} C ${w} ${h - r + k} ${w - r + k} ${h} ${w - r} ${h} L ${r} ${h} C ${r - k} ${h} 0 ${h - r + k} 0 ${h - r} Z`;
    expect(pocketPath("classic", w, h)).toBe(expected);
  });

  it("gives the rounded shape a bigger corner radius than the classic shape on the same size", () => {
    const classic = pocketPath("classic", 10, 12);
    const rounded = pocketPath("rounded", 10, 12);
    expect(rounded).not.toBe(classic);
    // Both should still be well-formed, single-path rounded rectangles.
    for (const d of [classic, rounded]) {
      expect(d.startsWith("M 0 0 L 10 0")).toBe(true);
      expect(d.endsWith("Z")).toBe(true);
      expect((d.match(/C /g) || []).length).toBe(2);
    }
  });
});
