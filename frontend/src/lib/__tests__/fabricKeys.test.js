import { describe, expect, it } from "vitest";
import { fabricKey, fabricName, orderFabrics } from "../fabricKeys.js";

describe("fabric keys", () => {
  it("tells the main, plain contrast and each motif apart", () => {
    expect(fabricKey({ name: "Shirt front" })).toBe("main");
    expect(fabricKey({ fabric: "contrast" })).toBe("contrast");
    expect(fabricKey({ fabric: "contrast", motif: "solid" })).toBe("contrast");
    expect(fabricKey({ fabric: "contrast", motif: "batik" })).toBe("contrast/batik");
    expect(fabricKey({ fabric: "contrast/stripes" })).toBe("contrast/stripes");
  });

  it("names them for people", () => {
    expect(fabricName("main")).toBe("Main fabric");
    expect(fabricName("contrast/parang")).toBe("Contrast fabric — Parang");
  });

  it("orders main first, then plain contrast, then motifs", () => {
    expect(orderFabrics(["contrast/stripes", "main", "contrast/batik", "contrast", "main"])).toEqual(["main", "contrast", "contrast/batik", "contrast/stripes"]);
  });
});
