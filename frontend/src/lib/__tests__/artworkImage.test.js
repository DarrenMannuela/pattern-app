import { describe, expect, it } from "vitest";
import { borderColor, contentBounds, hasTransparency, inkPalette, printSize, removePlainBackground } from "../artworkImage.js";

// A picture as ImageData-like pixels, painted by paint(x, y) -> [r, g, b, a?].
function picture(width, height, paint) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a = 255] = paint(x, y);
      data.set([r, g, b, a], (y * width + x) * 4);
    }
  }
  return { data, width, height };
}
const alphaAt = (img, x, y) => img.data[(y * img.width + x) * 4 + 3];

const WHITE = [255, 255, 255];
const NAVY = [20, 40, 110];
const RED = [210, 30, 40];

// A navy ring on white, with white inside the ring: a typical school badge.
const badge = () =>
  picture(40, 40, (x, y) => {
    const d = Math.hypot(x - 20, y - 20);
    return d > 8 && d < 14 ? NAVY : WHITE;
  });

describe("removePlainBackground", () => {
  it("clears the white round a logo but keeps the white inside it", () => {
    const img = badge();
    expect(hasTransparency(img)).toBe(false);
    expect(removePlainBackground(img)).toBe(true);
    expect(alphaAt(img, 0, 0)).toBe(0);
    expect(alphaAt(img, 39, 20)).toBe(0);
    expect(alphaAt(img, 20, 20)).toBe(255); // the white middle of the badge stays
    expect(alphaAt(img, 20, 9)).toBe(255); // the ring
    expect(hasTransparency(img)).toBe(true);
  });

  it("leaves a picture alone when its edge isn't one plain colour", () => {
    const img = picture(30, 30, (x, y) => [(x * 37) % 256, (y * 53) % 256, ((x + y) * 29) % 256]);
    expect(borderColor(img)).toBeNull();
    expect(removePlainBackground(img)).toBe(false);
    expect(hasTransparency(img)).toBe(false);
  });

  it("clears a coloured card behind the logo too", () => {
    const img = picture(20, 20, (x, y) => (x > 6 && x < 13 && y > 6 && y < 13 ? RED : [240, 220, 120]));
    expect(removePlainBackground(img)).toBe(true);
    expect(alphaAt(img, 1, 1)).toBe(0);
    expect(alphaAt(img, 10, 10)).toBe(255);
  });
});

describe("contentBounds", () => {
  it("is the box round what is visible", () => {
    const img = picture(20, 10, (x, y) => (x >= 5 && x <= 8 && y >= 2 && y <= 6 ? [...NAVY, 255] : [0, 0, 0, 0]));
    expect(contentBounds(img)).toEqual({ x: 5, y: 2, width: 4, height: 5 });
  });

  it("is null for a blank picture", () => {
    expect(contentBounds(picture(5, 5, () => [0, 0, 0, 0]))).toBeNull();
  });
});

describe("inkPalette", () => {
  it("counts a two-colour logo as two inks, commonest first", () => {
    const img = picture(30, 30, (x) => (x < 20 ? NAVY : RED));
    const { colors, fullColour } = inkPalette(img);
    expect(fullColour).toBe(false);
    expect(colors).toEqual(["#14286e", "#d21e28"]);
  });

  it("treats JPEG-like noise round a colour as the same colour", () => {
    const img = picture(30, 30, (x, y) => {
      const n = ((x * 7 + y * 13) % 9) - 4;
      return x < 15 ? [NAVY[0] + n, NAVY[1] + n, NAVY[2] + n] : [WHITE[0] - Math.abs(n), WHITE[1] - Math.abs(n), WHITE[2] - Math.abs(n)];
    });
    expect(inkPalette(img).colors).toHaveLength(2);
  });

  it("ignores the cleared background", () => {
    const img = badge();
    removePlainBackground(img);
    expect(inkPalette(img).colors).toEqual(["#14286e", "#ffffff"]);
  });

  it("calls a smooth gradient full colour", () => {
    const img = picture(64, 64, (x, y) => [x * 4, y * 4, 255 - x * 2]);
    expect(inkPalette(img)).toEqual({ colors: [], fullColour: true });
  });
});

describe("printSize", () => {
  it("fits a logo into the usual size for where it goes, in its own proportions", () => {
    expect(printSize("left_chest", 1)).toEqual({ width: 8, height: 8 });
    expect(printSize("left_chest", 0.5)).toEqual({ width: 8, height: 4 });
    expect(printSize("left_chest", 2)).toEqual({ width: 4, height: 8 });
    expect(printSize("back", 0.25)).toEqual({ width: 24, height: 6 });
  });

  it("copes with an unknown place or a bad aspect", () => {
    expect(printSize("somewhere", NaN)).toEqual({ width: 8, height: 8 });
  });
});

describe("inkSummary", () => {
  it("says what the colours mean for making the print", async () => {
    const { inkSummary } = await import("../artworkImage.js");
    expect(inkSummary("sablon", ["#000000", "#ffffff", "#ff0000"])).toBe("3 colours: 3 screens");
    expect(inkSummary("embroidery", ["#000000"])).toBe("1 thread colour");
    expect(inkSummary("sablon", [], true)).toMatch(/DTF/);
    expect(inkSummary("sablon", [])).toBe("");
  });
});
