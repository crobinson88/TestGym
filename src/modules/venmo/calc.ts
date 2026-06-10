// Bill-splitting math, lifted from the "Venmo Calculator" spreadsheet.
//
// Two independent methodologies, one per spreadsheet half:
//
//  - evenSplit  — "Diner Template": each category total (Food, Booze, …) is
//    divided equally among the people who took part in *that* category. A
//    person owes the sum of the per-person rates for the categories they
//    joined. Generalised to N categories, which also fixes the sheet's bug
//    where "Non Alcoholic" was entered but silently left out of the total.
//
//  - weightedSplit — "Drinks": one total divided by the sum of everyone's
//    weight, then charged back pro-rata (weight 0.5 pays half a share).

export interface SplitCategory {
  id: string;
  name: string;
  amount: number;
}

export interface EvenParticipant {
  id: string;
  name: string;
  joined: Record<string, boolean>; // categoryId -> took part
}

export interface WeightedParticipant {
  id: string;
  name: string;
  weight: number;
}

export interface CategoryRate {
  categoryId: string;
  count: number;
  rate: number; // amount / count, 0 when nobody joined
}

export interface Owed {
  id: string;
  name: string;
  amount: number;
}

export interface EvenResult {
  rates: CategoryRate[];
  owed: Owed[];
  total: number;
  allocated: number;
  reconciles: boolean;
}

export interface WeightedResult {
  perShare: number;
  totalWeight: number;
  owed: Owed[];
  charged: number;
  reconciles: boolean;
}

// Half a cent: anything closer than this is exact for money purposes.
const EPSILON = 0.005;

export function categoryRates(
  categories: SplitCategory[],
  people: EvenParticipant[],
): CategoryRate[] {
  return categories.map((c) => {
    const count = people.reduce((n, p) => (p.joined[c.id] ? n + 1 : n), 0);
    return { categoryId: c.id, count, rate: count > 0 ? c.amount / count : 0 };
  });
}

export function evenSplit(
  categories: SplitCategory[],
  people: EvenParticipant[],
): EvenResult {
  const rates = categoryRates(categories, people);
  const rateById = new Map(rates.map((r) => [r.categoryId, r.rate]));

  const owed: Owed[] = people.map((p) => ({
    id: p.id,
    name: p.name,
    amount: categories.reduce(
      (sum, c) => (p.joined[c.id] ? sum + (rateById.get(c.id) ?? 0) : sum),
      0,
    ),
  }));

  const total = categories.reduce((s, c) => s + c.amount, 0);
  const allocated = owed.reduce((s, o) => s + o.amount, 0);

  return {
    rates,
    owed,
    total,
    allocated,
    // Drops below `total` when a category has money but no participants —
    // that's the signal the sheet used to swallow silently.
    reconciles: Math.abs(total - allocated) < EPSILON,
  };
}

export function weightedSplit(
  total: number,
  people: WeightedParticipant[],
): WeightedResult {
  const totalWeight = people.reduce((s, p) => s + (p.weight || 0), 0);
  const perShare = totalWeight > 0 ? total / totalWeight : 0;

  const owed: Owed[] = people.map((p) => ({
    id: p.id,
    name: p.name,
    amount: (p.weight || 0) * perShare,
  }));

  const charged = owed.reduce((s, o) => s + o.amount, 0);

  return {
    perShare,
    totalWeight,
    owed,
    charged,
    reconciles: Math.abs(charged - total) < EPSILON,
  };
}

export function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}
