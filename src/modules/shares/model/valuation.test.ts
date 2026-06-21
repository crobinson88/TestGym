import { describe, expect, it } from "vitest";
import { computeTarget } from "./valuation";

describe("forecast valuation", () => {
  it("P/E gives price per share directly", () => {
    expect(computeTarget("pe", 18, 5.2, 0, 0)).toBeCloseTo(93.6, 6);
  });

  it("EV/EBITDA bridges EV → equity → per share", () => {
    // EV = 10 × 250,000 = 2,500,000; − 500,000 net debt = 2,000,000; ÷ 10,000 = 200
    expect(computeTarget("ev_ebitda", 10, 250_000, 500_000, 10_000)).toBeCloseTo(200, 6);
  });

  it("net cash (negative net debt) lifts the equity value", () => {
    // EV = 12 × 100,000 = 1,200,000; − (−200,000) = 1,400,000; ÷ 7,000 = 200
    expect(computeTarget("ev_ebit", 12, 100_000, -200_000, 7_000)).toBeCloseTo(200, 6);
  });

  it("returns null when an enterprise method lacks shares", () => {
    expect(computeTarget("ev_sales", 3, 1_000_000, 0, 0)).toBeNull();
  });

  it("returns null on non-positive multiple or metric", () => {
    expect(computeTarget("pe", 0, 5, 0, 0)).toBeNull();
    expect(computeTarget("pe", 18, 0, 0, 0)).toBeNull();
  });
});
