import { describe, expect, it } from "vitest";
import { foldOutline } from "../garmentFlat.js";

describe("foldOutline", () => {
  it("drops the closing edge of a half cut on the fold", () => {
    expect(foldOutline("M 0 2 L 20 0 L 24 60 L 0 60 Z")).toBe("M 0 2 L 20 0 L 24 60 L 0 60");
  });

  it("drops an explicit run down the fold before the close (the yoke)", () => {
    const yoke = "M0.0,2.2 C0.0,0.6 3.6,0.0 7.2,0.0 L19.7,1.0 C21.0,2.8 22.8,7.2 24.1,12.0 L0.0,12.0 L0.0,2.2 Z";
    const out = foldOutline(yoke);
    expect(out).toBe("M 0 2.2 C 0 0.6 3.6 0 7.2 0 L 19.7 1 C 21 2.8 22.8 7.2 24.1 12 L 0 12");
  });

  it("drops a run along the fold at the start (a back panel starting at its yoke seam)", () => {
    expect(foldOutline("M 0 12 L 0 14 L 24 12 L 27 67 L 0 70 Z")).toBe("M 0 14 L 24 12 L 27 67 L 0 70");
  });

  it("leaves pieces that aren't fold halves alone", () => {
    expect(foldOutline("M 5 0 L 20 0 L 20 10 L 5 10 Z")).toBeNull();
    expect(foldOutline("M 0 0 L 20 0 L 20 10")).toBeNull();
  });
});
