import { describe, expect, it } from "vitest";
import { FIXTURES } from "./fixtures.js";
import { printMarks } from "../printMarks.js";

const shirt = () => Object.values(FIXTURES.collarShirt).map((p) => (/back|yoke/i.test(p.name) ? { ...p, foldEdge: "left" } : p));
const logo = (id, segment, extra = {}) => ({ id, type: "sablon", segment, image: "0123456789abcdef0123456789abcdef.png", width: 8, height: 8, ...extra });
const opts = { collarStyle: "convertible", sleeveStyle: "full" };

describe("printMarks", () => {
  it("puts a chest logo on the front piece, on the side of the pair it is on", () => {
    const marks = printMarks(shirt(), [logo("l", "left_chest"), logo("r", "right_chest")], opts);
    const front = marks["Shirt front"];
    expect(front.map((m) => [m.id, m.side])).toEqual([
      ["l", "left"],
      ["r", "right"],
    ]);
    // Both are drawn on the one drafted piece, inside it.
    for (const m of front) {
      expect(m.x).toBeGreaterThan(0);
      expect(m.x + m.width).toBeLessThan(25.5);
      expect(m.width).toBe(8);
    }
  });

  it("puts a back logo on the yoke or the back, whichever it sits on, centred on the fold", () => {
    const marks = printMarks(shirt(), [logo("top", "back", { position: { x: 0, y: 0.09 }, width: 6, height: 4 }), logo("big", "back", { position: { x: 0, y: 0.45 }, width: 24, height: 18 })], opts);
    expect(marks.Yoke.map((m) => [m.id, m.side])).toEqual([["top", "fold"]]);
    expect(marks["Shirt back"].map((m) => [m.id, m.side])).toEqual([["big", "fold"]]);
  });

  it("leaves sleeve logos and pockets unmarked", () => {
    const marks = printMarks(shirt(), [logo("s", "left_sleeve"), { id: "p", type: "pocket", segment: "left_chest" }], opts);
    expect(marks).toEqual({});
  });
});
