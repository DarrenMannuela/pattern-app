import { describe, expect, it } from "vitest";
import { draftKey, draftedExtras, lookOf, payloadOf } from "../draftCache.js";

describe("draftedExtras", () => {
  it("keeps what changes a drafted piece and drops where an extra sits", () => {
    const pocket = { id: "p", type: "pocket", segment: "left_chest", shape: "pointed", width: 12, height: 13, fabric: "contrast", view: "front", position: { x: 0.3, y: 0.2 }, rotation: 15 };
    const logo = { id: "l", type: "sablon", segment: "back", image: "abc.png", width: 20, height: 18, position: { x: 0, y: 0.4 } };
    expect(draftedExtras([pocket, logo])).toEqual([{ id: "p", type: "pocket", segment: "left_chest", shape: "pointed", width: 12, height: 13, fabric: "contrast", view: "front" }]);
  });

  it("gives the same draft for a pocket moved or turned, and a new one for a pocket resized", () => {
    const at = (extra) => draftKey("7", { sleeveStyle: "half", accessories: draftedExtras([{ id: "p", type: "pocket", segment: "left_chest", width: 10, height: 11, ...extra }]) });
    expect(at({ position: { x: 0.2, y: 0.3 }, rotation: 0 })).toBe(at({ position: { x: 0.5, y: 0.1 }, rotation: 30 }));
    expect(at({ width: 12 })).not.toBe(at({}));
  });
});

describe("draft keys and looks", () => {
  it("reads back what a key asks for", () => {
    const payload = { gender: "female", sleeveStyle: "full", collarStyle: "peter_pan", pattern: "batik", dartPosition: "side", sizes: [{ label: "M" }] };
    const key = draftKey("12", payload);
    expect(payloadOf(key)).toEqual(payload);
    expect(lookOf(payloadOf(key))).toEqual({ gender: "female", dartPosition: "side", sleeveStyle: "full", collarStyle: "peter_pan", pattern: "batik", merchItem: undefined });
  });

  it("separates orders and takes the merch item from the merch options", () => {
    expect(draftKey("1", { a: 1 })).not.toBe(draftKey("2", { a: 1 }));
    expect(lookOf({ merch: { item: "tote_bag" } })).toMatchObject({ merchItem: "tote_bag", pattern: "solid" });
  });
});
