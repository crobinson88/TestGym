import { describe, expect, it } from "vitest";
import {
  buildModel,
  defaultAssumptions,
  defaultSegment,
  toStatements,
  type ForecastBasis,
} from "./engine";

describe("3-statement engine", () => {
  it("produces base + forecast columns", () => {
    const m = buildModel(defaultAssumptions());
    expect(m.years).toHaveLength(6); // base + 5 forecast
    expect(m.revenue).toHaveLength(6);
  });

  it("balance sheet ties out on every basis", () => {
    for (const basis of ["gross_profit", "ebit", "ebitda"] as ForecastBasis[]) {
      const m = buildModel({ ...defaultAssumptions(), basis });
      for (const c of m.balanceCheck) expect(Math.abs(c)).toBeLessThan(1e-6);
    }
  });

  it("stays balanced under varied assumptions (incl. debt, dividends)", () => {
    const m = buildModel({
      ...defaultAssumptions(),
      segments: [{ name: "Core", baseRevenue: 2_000_000, revenueGrowth: 0.25, margin: 0.6 }],
      dividendPayout: 0.4,
      startingDebt: 400_000,
      interestRate: 0.08,
      capexPctRevenue: 0.12,
    });
    for (const c of m.balanceCheck) expect(Math.abs(c)).toBeLessThan(1e-6);
  });

  it("sums revenue and the profit line across segments", () => {
    const m = buildModel({
      ...defaultAssumptions(),
      segments: [
        { name: "A", baseRevenue: 100, revenueGrowth: 0.1, margin: 0.5 },
        { name: "B", baseRevenue: 200, revenueGrowth: 0, margin: 0.3 },
      ],
    });
    expect(m.revenue[0]).toBeCloseTo(300, 6); // 100 + 200
    expect(m.revenue[1]).toBeCloseTo(310, 6); // 110 + 200
    expect(m.basisProfit[0]).toBeCloseTo(110, 6); // 100*0.5 + 200*0.3
    expect(m.grossProfit[0]).toBeCloseTo(110, 6); // GP basis
  });

  it("interprets the margin per chosen basis", () => {
    const seg = { ...defaultSegment(), baseRevenue: 1000, revenueGrowth: 0, margin: 0.2 };
    const ebitda = buildModel({ ...defaultAssumptions(), basis: "ebitda", segments: [seg] });
    expect(ebitda.ebitda[0]).toBeCloseTo(200, 6);
    expect(ebitda.ebit[0]).toBeCloseTo(200 - 1000 * defaultAssumptions().daPctRevenue, 6);

    const ebit = buildModel({ ...defaultAssumptions(), basis: "ebit", segments: [seg] });
    expect(ebit.ebit[0]).toBeCloseTo(200, 6);
    expect(ebit.ebitda[0]).toBeCloseTo(200 + 1000 * defaultAssumptions().daPctRevenue, 6);
  });

  it("derives statements with a balance-check row and segment blocks", () => {
    const single = toStatements(buildModel(defaultAssumptions()));
    expect(single.some((s) => s.title === "Revenue by segment")).toBe(false); // hidden for 1 segment
    expect(single.find((s) => s.title === "Income statement")).toBeTruthy();

    const multi = toStatements(
      buildModel({
        ...defaultAssumptions(),
        segments: [defaultSegment("A"), defaultSegment("B")],
      }),
    );
    expect(multi.some((s) => s.title === "Revenue by segment")).toBe(true);
    expect(multi.find((s) => s.title === "Balance sheet")?.rows.some((r) => r.check)).toBe(true);
  });
});
