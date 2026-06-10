import { describe, expect, it } from "vitest";
import {
  categoryRates,
  evenSplit,
  formatMoney,
  weightedSplit,
  type EvenParticipant,
  type SplitCategory,
  type WeightedParticipant,
} from "./calc";

// Reproduces the "Wayla 230714" sheet: Food 244 / Booze 81.
const FOOD = "food";
const BOOZE = "booze";
const waylaCategories: SplitCategory[] = [
  { id: FOOD, name: "Food", amount: 244 },
  { id: BOOZE, name: "Booze", amount: 81 },
];
const wayla: EvenParticipant[] = [
  { id: "1", name: "Rick", joined: { [FOOD]: true, [BOOZE]: true } },
  { id: "2", name: "Chicken", joined: { [FOOD]: true, [BOOZE]: true } },
  { id: "3", name: "Roger", joined: { [FOOD]: true, [BOOZE]: true } },
  { id: "4", name: "Jules", joined: { [FOOD]: true, [BOOZE]: true } },
  { id: "5", name: "Robbo", joined: { [FOOD]: true, [BOOZE]: false } },
  { id: "6", name: "Six", joined: { [FOOD]: false, [BOOZE]: true } },
];

describe("categoryRates", () => {
  it("divides each category by its own participant count", () => {
    const rates = categoryRates(waylaCategories, wayla);
    expect(rates).toEqual([
      { categoryId: FOOD, count: 5, rate: 48.8 },
      { categoryId: BOOZE, count: 5, rate: 16.2 },
    ]);
  });

  it("yields a zero rate when nobody joined", () => {
    const rates = categoryRates(waylaCategories, []);
    expect(rates.map((r) => r.rate)).toEqual([0, 0]);
  });
});

describe("evenSplit", () => {
  it("matches the Wayla owed amounts", () => {
    const { owed } = evenSplit(waylaCategories, wayla);
    const by = Object.fromEntries(owed.map((o) => [o.name, o.amount]));
    expect(by.Rick).toBeCloseTo(65, 10);
    expect(by.Robbo).toBeCloseTo(48.8, 10); // food only
    expect(by.Six).toBeCloseTo(16.2, 10); // booze only
  });

  it("reconciles to the bill total", () => {
    const r = evenSplit(waylaCategories, wayla);
    expect(r.total).toBe(325);
    expect(r.allocated).toBeCloseTo(325, 10);
    expect(r.reconciles).toBe(true);
  });

  it("flags a category with money but no participants", () => {
    const withOrphan = [
      ...waylaCategories,
      { id: "na", name: "Non-alcoholic", amount: 15 },
    ];
    const r = evenSplit(withOrphan, wayla);
    expect(r.total).toBe(340);
    expect(r.allocated).toBeCloseTo(325, 10);
    expect(r.reconciles).toBe(false);
  });
});

describe("weightedSplit", () => {
  // "Drinks" sheet: 350 over weights 1,1,1,0.5,1,0.75,1,1,1,1 (sum 9.25).
  const drinks: WeightedParticipant[] = [1, 1, 1, 0.5, 1, 0.75, 1, 1, 1, 1].map(
    (weight, i) => ({ id: String(i), name: `P${i}`, weight }),
  );

  it("charges each person their weight times the full share", () => {
    const r = weightedSplit(350, drinks);
    expect(r.totalWeight).toBe(9.25);
    expect(r.perShare).toBeCloseTo(37.83783784, 6);
    expect(r.owed[3].amount).toBeCloseTo(18.91891892, 6); // the 0.5
  });

  it("reconciles to the drinks total", () => {
    const r = weightedSplit(350, drinks);
    expect(r.charged).toBeCloseTo(350, 10);
    expect(r.reconciles).toBe(true);
  });

  it("handles zero total weight without dividing by zero", () => {
    const r = weightedSplit(350, []);
    expect(r.perShare).toBe(0);
    expect(r.reconciles).toBe(false);
  });
});

describe("formatMoney", () => {
  it("formats to a currency string", () => {
    expect(formatMoney(48.8)).toBe("$48.80");
    expect(formatMoney(0)).toBe("$0.00");
  });
});
