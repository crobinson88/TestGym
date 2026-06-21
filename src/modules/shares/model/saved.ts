// A generated model is stored as an .xlsx in the share-images bucket, but we
// also stash its assumptions on the same TradeModel entry so the Stock page can
// rebuild the forecast locally (offline) without parsing the workbook. These
// extra fields are additive on the `models` jsonb — older entries simply lack
// them and are ignored by the forecast view.
import type { LocalShareTrade } from "@/lib/db";
import type { TradeModel } from "@/lib/database.types";
import type { ModelAssumptions } from "./engine";

export interface GeneratedModel extends TradeModel {
  assumptions: ModelAssumptions;
  createdAt: string;
}

export interface SavedModel {
  assumptions: ModelAssumptions;
  createdAt: string;
  name: string;
}

export function withAssumptions(
  model: TradeModel,
  a: ModelAssumptions,
  createdAt: string,
): GeneratedModel {
  return { ...model, assumptions: a, createdAt };
}

// The most recently saved generated model across a ticker's trades, or null.
export function latestGeneratedModel(trades?: LocalShareTrade[]): SavedModel | null {
  let best: SavedModel | null = null;
  for (const t of trades ?? []) {
    for (const m of t.models ?? []) {
      const a = (m as Partial<GeneratedModel>).assumptions;
      if (!a) continue;
      const createdAt = (m as Partial<GeneratedModel>).createdAt ?? t.created_at;
      if (!best || createdAt > best.createdAt) best = { assumptions: a, createdAt, name: m.name };
    }
  }
  return best;
}
