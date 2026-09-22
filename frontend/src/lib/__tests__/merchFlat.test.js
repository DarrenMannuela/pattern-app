import { describe, expect, it } from "vitest";
import { layoutMerchView } from "../merchFlat.js";

// A backend patch piece's pathData varies by shape (circle, shield, rounded,
// rect) — the string itself doesn't matter to this test, only that the
// inner topstitch reuses it rather than substituting a fixed rounded rect,
// which used to cut straight across circular and shield-shaped patches
// instead of tracing their curve.
function patchPiece(pathData, width = 8, height = 8) {
  return { name: "Patch", pathData, width, height, foldEdge: "", notes: "", landmarks: {} };
}

describe("layoutMerchView patch", () => {
  it("insets the topstitch by scaling the patch's own outline around its center, for any shape", () => {
    const circleD = "M4.0,0.0 C6.2,0.0 8.0,1.8 8.0,4.0 C8.0,6.2 6.2,8.0 4.0,8.0 C1.8,8.0 0.0,6.2 0.0,4.0 C0.0,1.8 1.8,0.0 4.0,0.0 Z";
    const layout = layoutMerchView([patchPiece(circleD)], "front", { merchItem: "patch" });
    const stitch = layout.items.find((i) => i.key === "stitch");
    expect(stitch.kind).toBe("path");
    expect(stitch.d).toBe(circleD); // the same outline, not a hardcoded rect
    expect(stitch.transform).toMatch(/scale\(0\.76\)/); // inset = min(w,h)*0.12 -> scale 1 - 2*0.12 = 0.76
    expect(stitch.noFill).toBe(true);
  });

  it("scales a non-square (shield) patch the same way, still tracing its own outline", () => {
    const shieldD = "M0.0,0.0 L8.0,0.0 L8.0,4.4 C8.0,6.8 5.2,7.6 4.0,8.0 C2.8,7.6 0.0,6.8 0.0,4.4 Z";
    const layout = layoutMerchView([patchPiece(shieldD)], "front", { merchItem: "patch" });
    const stitch = layout.items.find((i) => i.key === "stitch");
    expect(stitch.d).toBe(shieldD);
    expect(stitch.kind).toBe("path");
  });
});
