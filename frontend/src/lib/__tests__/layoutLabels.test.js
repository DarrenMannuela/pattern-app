import { describe, expect, it } from "vitest";
import { pieceLabel, placedBox, shortPieceName } from "../layoutLabels.js";

describe("cutting layout labels", () => {
  it("shortens an order piece's name to the piece and size", () => {
    expect(shortPieceName("Shirt front — tes S")).toBe("Shirt front · S");
    expect(shortPieceName("Cuff — SDN 01 Menteng XL")).toBe("Cuff · XL");
    expect(shortPieceName("Bodice front")).toBe("Bodice front");
  });

  it("finds a piece's centre whichever way it was turned", () => {
    const base = { origWidth: 20, origHeight: 10 };
    expect(placedBox({ ...base, tx: 5, ty: 5, rotation: 0 })).toMatchObject({ cx: 15, cy: 10 });
    // Turned 180 about its origin, it spans -20..0 then is moved by tx, ty.
    expect(placedBox({ ...base, tx: 25, ty: 15, rotation: 180 })).toMatchObject({ cx: 15, cy: 10 });
    const q = placedBox({ ...base, tx: 10, ty: 0, rotation: 90 });
    expect(q).toMatchObject({ cx: 5, cy: 10, w: 10, h: 20 });
  });

  it("sizes the label to fit and drops it on tiny pieces", () => {
    const big = pieceLabel({ name: "Shirt back — tes S", origWidth: 50, origHeight: 60, tx: 0, ty: 0, rotation: 0 });
    expect(big.size).toBeLessThanOrEqual(3.2);
    const tiny = pieceLabel({ name: "Cuff slit facing — tes S", origWidth: 2, origHeight: 6, tx: 0, ty: 0, rotation: 0 });
    expect(tiny).toBeNull();
  });

  it("turns the label to run along a tall, narrow strip", () => {
    const strip = pieceLabel({ name: "Hidden placket — tes S", origWidth: 7, origHeight: 70, tx: 0, ty: 0, rotation: 0 });
    expect(strip.rotate).toBe(-90);
    expect(strip.size).toBeGreaterThanOrEqual(1.2);
    const wide = pieceLabel({ name: "Shirt back — tes S", origWidth: 50, origHeight: 60, tx: 0, ty: 0, rotation: 0 });
    expect(wide.rotate).toBe(0);
  });
});
