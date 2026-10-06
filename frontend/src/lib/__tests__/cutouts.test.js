import { describe, expect, it } from "vitest";
import { flattenPath, bounds } from "../svgPathFlatten.js";
import { pack, pieceTemplate, buildCutouts } from "../cutouts.js";
import { rollsText } from "../cutPlan.js";

describe("flattenPath", () => {
  it("keeps corners exact and reads relative and shorthand commands", () => {
    const [s] = flattenPath("M 0 0 h 10 v 5 H 0 z");
    expect(s.closed).toBe(true);
    expect(s.points).toEqual([[0, 0], [10, 0], [10, 5], [0, 5]]);
  });

  it("follows arcs and curves to the tolerance", () => {
    // A half circle of radius 10 from (0,0) to (20,0), bulging up (y down).
    const [s] = flattenPath("M 0 0 A 10 10 0 0 1 20 0", 0.01);
    for (const [x, y] of s.points) expect(Math.hypot(x - 10, y)).toBeCloseTo(10, 5);
    expect(Math.min(...s.points.map((p) => p[1]))).toBeCloseTo(-10, 1);
    const b = bounds(flattenPath("M0 0 C 0 10 10 10 10 0"));
    expect(b.maxY).toBeCloseTo(7.5, 1);
  });
});

const rect = (name, w, h) => pieceTemplate({ name, pathData: `M0 0 L${w} 0 L${w} ${h} L0 ${h} Z`, width: w, height: h }, "M", "");

describe("pack", () => {
  it("never overlaps pieces and stays inside the paper", () => {
    const pieces = [rect("a", 30, 70), rect("b", 30, 70), rect("c", 50, 60), rect("d", 10, 40), rect("e", 20, 8), rect("f", 6, 6)];
    const { placed, problems } = pack(pieces, 54);
    expect(problems).toEqual([]);
    expect(placed).toHaveLength(6);
    for (const p of placed) expect(p.bx + p.width).toBeLessThanOrEqual(54 + 1e-6);
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i], b = placed[j];
      const apart = a.bx + a.width <= b.bx || b.bx + b.width <= a.bx || a.by + a.height <= b.by || b.by + b.height <= a.by;
      expect(apart).toBe(true);
    }
  });

  it("turns a piece that's too wide and reports one that won't fit at all", () => {
    expect(pack([rect("long", 100, 30)], 50).placed[0].rotated).toBe(true);
    expect(pack([rect("huge", 100, 80)], 50).problems).toHaveLength(1);
  });
});

describe("buildCutouts", () => {
  it("makes a PDF with a cover plus sheets, or one roll page", async () => {
    const sizes = [{ label: "M", pieces: [{ name: "Front", pathData: "M0 0 L40 0 L40 70 L0 70 Z", width: 40, height: 70, qty: 2 }] }];
    const tiles = buildCutouts({ title: "Test", sizes, mode: "tiles" });
    expect(tiles.pages).toBeGreaterThan(2);
    const head = new TextDecoder().decode((await tiles.blob.arrayBuffer()).slice(0, 8));
    expect(head).toBe("%PDF-1.4");
    const roll = buildCutouts({ title: "Test", sizes, mode: "roll", rollWidth: 91.4 });
    expect(roll.pages).toBe(1);
  });
});


describe("rollsText", () => {
  it("counts whole SAI rolls (30 yd = 27.4 m) and the rest", () => {
    expect(rollsText(28.5)).toBe("1 roll of 30 yd + 1.1 m");
    expect(rollsText(27.432 * 3)).toBe("3 rolls of 30 yd");
    expect(rollsText(12)).toBe("less than a roll (1 roll of 30 yd = 27.4 m)");
  });
});
