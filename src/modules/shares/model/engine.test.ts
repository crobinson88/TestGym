import { describe, expect, it } from "vitest";
import { buildModel, defaultAssumptions, toStatements } from "./engine";

describe("3-statement engine", () => {
  it("produces base + forecast columns", () => {
    const m = buildModel(defaultAssumptions());
    expect(m.years).toHaveLength(6); // base + 5 forecast
    expect(m.revenue).toHaveLength(6);
  });

  it("balance sheet ties out every year", () => {
    const m = buildModel(defaultAssumptions());
    for (const c of m.balanceCheck) expect(Math.abs(c)).toBeLessThan(1e-6);
  });

  it("stays balanced under varied assumptions (incl. debt, dividends)", () => {
    const m = buildModel({
      ...defaultAssumptions(),
      revenueGrowth: 0.25,
      dividendPayout: 0.4,
      startingDebt: 400_000,
      interestRate: 0.08,
      capexPctRevenue: 0.12,
    });
    for (const c of m.balanceCheck) expect(Math.abs(c)).toBeLessThan(1e-6);
  });

  it("grows revenue at the growth rate", () => {
    const m = buildModel({ ...defaultAssumptions(), baseRevenue: 100, revenueGrowth: 0.1 });
    expect(m.revenue[0]).toBe(100);
    expect(m.revenue[1]).toBeCloseTo(110, 6);
    expect(m.revenue[2]).toBeCloseTo(121, 6);
  });

  it("derives statements with a balance-check row", () => {
    const m = buildModel(defaultAssumptions());
    const [is, bs, cf] = toStatements(m);
    expect(is.title).toBe("Income statement");
    expect(bs.rows.some((r) => r.check)).toBe(true);
    expect(cf.title).toBe("Cash flow");
  });
});
