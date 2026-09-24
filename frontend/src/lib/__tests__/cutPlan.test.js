import { describe, expect, it } from "vitest";
import { COMPARE_WIDTHS, DEFAULT_PLAN_FORM, TUBE_WIDTHS, compareActual, metres, planRequest, ratioText, rupiah } from "../cutPlan.js";

describe("planRequest", () => {
  it("turns the default form into a request", () => {
    const { body, error } = planRequest(DEFAULT_PLAN_FORM);
    expect(error).toBeUndefined();
    expect(body).toMatchObject({ fabricWidth: 150, maxPlies: 50, maxGarments: 4, endAllowance: 2, reservePercent: 3, singleSizes: false, oneWay: false });
    expect(body).not.toHaveProperty("gsm");
    expect(body).not.toHaveProperty("contrastWidth");
    expect(body).not.toHaveProperty("compareWidths");
  });

  it("carries optional fields and the widths to compare when given", () => {
    const { body } = planRequest({ ...DEFAULT_PLAN_FORM, gsm: "180", contrastWidth: "110", mixSizes: false, oneWay: true }, COMPARE_WIDTHS);
    expect(body).toMatchObject({ gsm: 180, contrastWidth: 110, singleSizes: true, oneWay: true, compareWidths: COMPARE_WIDTHS });
  });

  it("accepts a decimal comma, as typed in Indonesian", () => {
    expect(planRequest({ ...DEFAULT_PLAN_FORM, endAllowance: "2,5" }).body.endAllowance).toBe(2.5);
  });

  it("says what to fix instead of sending a bad number", () => {
    expect(planRequest({ ...DEFAULT_PLAN_FORM, fabricWidth: "15000" }).error).toMatch(/Fabric width must be between 20 and 500/);
    expect(planRequest({ ...DEFAULT_PLAN_FORM, maxPlies: "" }).error).toMatch(/Plies per lay needs a number/);
    expect(planRequest({ ...DEFAULT_PLAN_FORM, shrinkLength: "-2" }).error).toMatch(/Shrinkage along the length/);
    expect(planRequest({ ...DEFAULT_PLAN_FORM, gsm: "abc" }).error).toMatch(/Fabric weight/);
    expect(planRequest({ ...DEFAULT_PLAN_FORM, stripeLength: "500" }).error).toMatch(/Stripe repeat along the roll/);
  });

  it("sends stripes and tubular knit only when asked", () => {
    expect(planRequest(DEFAULT_PLAN_FORM).body).not.toHaveProperty("stripeLength");
    const { body } = planRequest({ ...DEFAULT_PLAN_FORM, stripeLength: "5", stripeWidth: "2,5", tubular: true });
    expect(body).toMatchObject({ stripeLength: 5, stripeWidth: 2.5, tubular: true });
  });
});

describe("formatting", () => {
  it("writes a marker's size ratio", () => {
    expect(ratioText([{ size: "S", count: 1 }, { size: "M", count: 2 }])).toBe("1 × S + 2 × M");
  });

  it("writes metres", () => {
    expect(metres(3.456)).toBe("3.46 m");
    expect(metres(133.79)).toBe("133.8 m");
  });
});

describe("compareActual", () => {
  const plan = { fabricWidthCm: 150, meters: 100, weightKg: 20.6 };

  it("says when the plan and the real cut agree", () => {
    const c = compareActual(plan, { meters: 103, widthCm: 150 }, 3);
    expect(c).toMatchObject({ sameWidth: true, unit: "m", estimate: 100, real: 103, diffPercent: 3, close: true });
  });

  it("works out the reserve that would have matched a bigger real cut", () => {
    const c = compareActual(plan, { meters: 118 }, 3);
    expect(c).toMatchObject({ diffPercent: 18, close: false, suggestedReserve: 18 });
  });

  it("compares kilos for knit, before the reserve", () => {
    const c = compareActual(plan, { kg: 22, widthCm: 150 }, 3);
    expect(c.unit).toBe("kg");
    expect(c.estimate).toBe(20);
    expect(c.diffPercent).toBe(10);
  });

  it("won't compare a cut on another width", () => {
    expect(compareActual(plan, { meters: 90, widthCm: 115 }, 3)).toEqual({ sameWidth: false, widthCm: 115 });
  });

  it("compares against a plan with a width per lay without asking for a width", () => {
    const c = compareActual({ ...plan, fabricWidthCm: 0 }, { meters: 104, widthCm: 112 }, 3);
    expect(c).toMatchObject({ sameWidth: true, diffPercent: 4 });
  });

  it("needs something recorded", () => {
    expect(compareActual(plan, { note: "x" }, 3)).toBeNull();
    expect(compareActual(plan, null, 3)).toBeNull();
  });
});

describe("prices and per-lay widths", () => {
  it("reads rupiah however it is typed", () => {
    for (const typed of ["25.000", "25000", "25,000", "Rp 25.000"]) {
      expect(planRequest({ ...DEFAULT_PLAN_FORM, pricePerMeter: typed }).body.pricePerMeter).toBe(25000);
    }
    expect(planRequest({ ...DEFAULT_PLAN_FORM, pricePerKg: "95.500" }).body.pricePerKg).toBe(95500);
    expect(planRequest({ ...DEFAULT_PLAN_FORM, pricePerMeter: "abc" }).error).toMatch(/price in rupiah/);
  });

  it("offers the right widths for choosing one per lay", () => {
    expect(planRequest({ ...DEFAULT_PLAN_FORM, widthPerLay: true }).body.layWidths).toEqual(COMPARE_WIDTHS);
    expect(planRequest({ ...DEFAULT_PLAN_FORM, widthPerLay: true, tubular: true }).body.layWidths).toEqual(TUBE_WIDTHS);
    expect(planRequest(DEFAULT_PLAN_FORM).body).not.toHaveProperty("layWidths");
  });

  it("writes rupiah", () => {
    expect(rupiah(3450000)).toBe("Rp 3.450.000");
  });
});
