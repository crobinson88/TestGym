import type { MarketIndexKey } from "@/lib/database.types";

export type { MarketIndexKey } from "@/lib/database.types";

export interface MarketIndex {
  key: MarketIndexKey;
  label: string;
  // Short tag shown on cramped chips.
  short: string;
}

// The taggable market indices. Fixed client-side list (not a table) — the note
// row stores the `key`s in its `indices` array.
export const MARKET_INDICES: readonly MarketIndex[] = [
  { key: "sp500", label: "S&P 500", short: "S&P 500" },
  { key: "asx200", label: "ASX 200", short: "ASX 200" },
  { key: "nasdaq", label: "Nasdaq Composite", short: "Nasdaq" },
];

const BY_KEY = new Map(MARKET_INDICES.map((i) => [i.key, i]));

export function indexLabel(key: MarketIndexKey): string {
  return BY_KEY.get(key)?.label ?? key;
}

export function isMarketIndexKey(value: string): value is MarketIndexKey {
  return BY_KEY.has(value as MarketIndexKey);
}

// Order a note's tags by the canonical index order so chips render consistently.
export function sortIndices(keys: MarketIndexKey[]): MarketIndexKey[] {
  const order = MARKET_INDICES.map((i) => i.key);
  return [...keys].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}
