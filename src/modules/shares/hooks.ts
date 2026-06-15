import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { computePositions } from "./types";

export function useShareTrades() {
  return useLiveQuery(async () => {
    const all = await db.share_trades.toArray();
    return all
      .filter((t) => !t.deleted_at)
      .sort((a, b) =>
        a.traded_at < b.traded_at
          ? 1
          : a.traded_at > b.traded_at
            ? -1
            : a.created_at < b.created_at
              ? 1
              : -1,
      );
  }, []);
}

export function useShareTrade(id?: string) {
  return useLiveQuery(async () => {
    if (!id) return undefined;
    return db.share_trades.get(id);
  }, [id]);
}

export function usePositions() {
  return useLiveQuery(async () => {
    const all = await db.share_trades.toArray();
    return computePositions(all.filter((t) => !t.deleted_at));
  }, []);
}

export function useTradesForTicker(ticker?: string) {
  return useLiveQuery(async () => {
    if (!ticker) return [];
    const all = await db.share_trades.where("ticker").equals(ticker).toArray();
    return all
      .filter((t) => !t.deleted_at)
      .sort((a, b) => (a.traded_at < b.traded_at ? 1 : a.traded_at > b.traded_at ? -1 : 0));
  }, [ticker]);
}

export function useStockByTicker(ticker?: string) {
  return useLiveQuery(async () => {
    if (!ticker) return undefined;
    const all = await db.stocks.toArray();
    return all.find((s) => s.ticker === ticker && !s.deleted_at) ?? null;
  }, [ticker]);
}
