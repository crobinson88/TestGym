import { afterEach, describe, expect, it } from "vitest";
import { v4 as uuid } from "uuid";
import type { GymDB, LocalShareTrade } from "@/lib/db";
import { createMutations } from "@/lib/sync/mutations";
import { createOutbox } from "@/lib/sync/outbox";
import { makeMockClient, newTestDb } from "@/lib/sync/test-helpers";
import { computePositions, impliedCagr } from "./types";

let db: GymDB;
afterEach(async () => {
  if (db) await db.delete();
});

function makeLocalTrade(over: Partial<LocalShareTrade> = {}): LocalShareTrade {
  const ts = new Date().toISOString();
  const id = over.id ?? uuid();
  return {
    id,
    ticker: "AAPL",
    side: "buy",
    quantity: 10,
    price: 100,
    currency: "USD",
    traded_at: "2026-06-01",
    notes: null,
    target_price: null,
    target_date: null,
    links: [],
    images: [],
    models: [],
    is_opening: false,
    total: 1000,
    client_id: id,
    user_id: null,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
    sync_status: "pending",
    sync_attempts: 0,
    sync_last_error: null,
    ...over,
  };
}

describe("shares mutations", () => {
  it("addShareTrade writes pending, upcases ticker, sets stable client_id", async () => {
    db = await newTestDb();
    let notified = 0;
    const m = createMutations({ db, onChange: () => notified++ });

    const trade = await m.addShareTrade({
      ticker: " aapl ",
      side: "buy",
      quantity: 5,
      price: 190.25,
    });

    expect(trade.sync_status).toBe("pending");
    expect(trade.ticker).toBe("AAPL");
    expect(trade.currency).toBe("USD");
    expect(trade.client_id).toBe(trade.id);
    expect(trade.total).toBeNull(); // server-generated
    expect(trade.traded_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(trade.is_opening).toBe(false); // defaults to a real trade
    expect(notified).toBe(1);

    const stored = await db.share_trades.get(trade.id);
    expect(stored?.quantity).toBe(5);
  });

  it("addShareTrade flags an opening holding and still rolls into the position", async () => {
    db = await newTestDb();
    const m = createMutations({ db });
    const holding = await m.addShareTrade({
      ticker: "NVDA",
      side: "buy",
      quantity: 12,
      price: 100,
      is_opening: true,
    });
    expect(holding.is_opening).toBe(true);

    const all = await db.share_trades.toArray();
    const [pos] = computePositions(all);
    expect(pos.ticker).toBe("NVDA");
    expect(pos.netShares).toBe(12);
    expect(pos.avgBuyPrice).toBe(100);
  });

  it("addShareTrade stores attached models (sheet + file)", async () => {
    db = await newTestDb();
    const m = createMutations({ db });
    const trade = await m.addShareTrade({
      ticker: "TSLA",
      side: "buy",
      quantity: 1,
      price: 250,
      models: [
        { kind: "sheet", name: "https://docs.google.com/x", url: "https://docs.google.com/x", path: null },
        { kind: "file", name: "model.xlsx", url: null, path: "models/abc.xlsx" },
      ],
    });
    expect(trade.models).toHaveLength(2);
    expect(trade.models[0].kind).toBe("sheet");
    expect(trade.models[1].path).toBe("models/abc.xlsx");
  });

  it("deleteShareTrade soft-deletes and re-pends", async () => {
    db = await newTestDb();
    const m = createMutations({ db });
    const trade = await m.addShareTrade({
      ticker: "MSFT",
      side: "buy",
      quantity: 1,
      price: 400,
    });
    await m.deleteShareTrade(trade.id);

    const after = await db.share_trades.get(trade.id);
    expect(after?.deleted_at).not.toBeNull();
    expect(after?.sync_status).toBe("pending");
  });
});

describe("shares outbox", () => {
  it("drains pending trades and strips server-owned / local fields", async () => {
    db = await newTestDb();
    await db.share_trades.put(makeLocalTrade());

    const { client, calls } = makeMockClient();
    const outbox = createOutbox({ client: client as never, db });
    const result = await outbox.drain();

    expect(result.pushed).toBe(1);
    const call = calls.find((c) => c.table === "share_trades");
    const payload = call?.payload[0] as Record<string, unknown>;
    expect(payload.sync_status).toBeUndefined();
    expect(payload.total).toBeUndefined();
    expect(payload.created_at).toBeUndefined();
    expect(payload.ticker).toBe("AAPL");
    expect(await db.share_trades.where("sync_status").equals("pending").count()).toBe(0);
  });
});

describe("stock mutations", () => {
  it("ensureStock creates a pending row, upcases ticker, and dedupes by ticker", async () => {
    db = await newTestDb();
    const m = createMutations({ db });

    const a = await m.ensureStock(" nvda ", "NVIDIA");
    expect(a.ticker).toBe("NVDA");
    expect(a.name).toBe("NVIDIA");
    expect(a.sync_status).toBe("pending");

    const b = await m.ensureStock("NVDA");
    expect(b.id).toBe(a.id); // same ticker → same row, not a duplicate
    expect(await db.stocks.count()).toBe(1);
  });

  it("updateStock writes notes and re-pends sync", async () => {
    db = await newTestDb();
    const m = createMutations({ db });
    const s = await m.ensureStock("AAPL");
    await db.stocks.update(s.id, { sync_status: "synced" });

    const updated = await m.updateStock(s.id, { notes: "Strong services growth" });
    expect(updated?.notes).toBe("Strong services growth");
    expect(updated?.sync_status).toBe("pending");
  });

  it("outbox drains pending stocks and strips local fields", async () => {
    db = await newTestDb();
    const m = createMutations({ db });
    await m.ensureStock("MSFT");

    const { client, calls } = makeMockClient();
    const outbox = createOutbox({ client: client as never, db });
    const result = await outbox.drain();

    expect(result.pushed).toBeGreaterThanOrEqual(1);
    const call = calls.find((c) => c.table === "stocks");
    const payload = call?.payload[0] as Record<string, unknown>;
    expect(payload.ticker).toBe("MSFT");
    expect(payload.sync_status).toBeUndefined();
    expect(await db.stocks.where("sync_status").equals("pending").count()).toBe(0);
  });
});

describe("forecast mutations", () => {
  it("addForecast writes a pending row with upcased ticker and a made_on date", async () => {
    db = await newTestDb();
    const m = createMutations({ db });
    const f = await m.addForecast({
      ticker: "nvda",
      base_price: 100,
      target_price: 150,
      target_date: "2027-06-15",
    });
    expect(f.ticker).toBe("NVDA");
    expect(f.sync_status).toBe("pending");
    expect(f.made_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(f.currency).toBe("USD");
  });

  it("deleteForecast soft-deletes and re-pends", async () => {
    db = await newTestDb();
    const m = createMutations({ db });
    const f = await m.addForecast({
      ticker: "MSFT",
      base_price: 400,
      target_price: 500,
      target_date: "2027-01-01",
    });
    await m.deleteForecast(f.id);
    const after = await db.forecasts.get(f.id);
    expect(after?.deleted_at).not.toBeNull();
    expect(after?.sync_status).toBe("pending");
  });

  it("outbox drains pending forecasts", async () => {
    db = await newTestDb();
    const m = createMutations({ db });
    await m.addForecast({
      ticker: "AAPL",
      base_price: 200,
      target_price: 260,
      target_date: "2027-03-01",
    });
    const { client, calls } = makeMockClient();
    const outbox = createOutbox({ client: client as never, db });
    const result = await outbox.drain();
    expect(result.pushed).toBeGreaterThanOrEqual(1);
    const call = calls.find((c) => c.table === "forecasts");
    expect((call?.payload[0] as Record<string, unknown>).ticker).toBe("AAPL");
    expect(await db.forecasts.where("sync_status").equals("pending").count()).toBe(0);
  });
});

describe("impliedCagr", () => {
  it("computes the annualised rate from buy price to target over the horizon", () => {
    // Double in exactly one year => 100% CAGR.
    expect(impliedCagr(100, 200, "2026-01-01", "2027-01-01")).toBeCloseTo(1, 2);
    // +21% over two years => ~10% CAGR.
    expect(impliedCagr(100, 121, "2026-01-01", "2028-01-01")).toBeCloseTo(0.1, 2);
  });

  it("returns null for non-positive horizons or prices", () => {
    expect(impliedCagr(100, 150, "2026-06-01", "2026-06-01")).toBeNull();
    expect(impliedCagr(0, 150, "2026-01-01", "2027-01-01")).toBeNull();
  });
});

describe("computePositions", () => {
  it("nets buys against sells per ticker", () => {
    const positions = computePositions([
      makeLocalTrade({ ticker: "AAPL", side: "buy", quantity: 10, price: 100 }),
      makeLocalTrade({ ticker: "AAPL", side: "buy", quantity: 10, price: 120 }),
      makeLocalTrade({ ticker: "AAPL", side: "sell", quantity: 5, price: 150 }),
    ]);
    expect(positions).toHaveLength(1);
    const p = positions[0];
    expect(p.netShares).toBe(15);
    expect(p.avgBuyPrice).toBeCloseTo(110); // (1000 + 1200) / 20
    expect(p.netCash).toBeCloseTo(150 * 5 - 2200); // proceeds - cost = -1450
    expect(p.tradeCount).toBe(3);
  });

  it("keeps separate tickers apart", () => {
    const positions = computePositions([
      makeLocalTrade({ ticker: "AAPL", side: "buy", quantity: 1, price: 100 }),
      makeLocalTrade({ ticker: "TSLA", side: "buy", quantity: 2, price: 200 }),
    ]);
    expect(positions.map((p) => p.ticker).sort()).toEqual(["AAPL", "TSLA"]);
  });
});
