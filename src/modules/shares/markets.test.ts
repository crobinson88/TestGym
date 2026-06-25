import { afterEach, describe, expect, it } from "vitest";
import type { GymDB } from "@/lib/db";
import { createMutations } from "@/lib/sync/mutations";
import { createOutbox } from "@/lib/sync/outbox";
import { makeMockClient, newTestDb } from "@/lib/sync/test-helpers";
import { MARKET_INDICES, indexLabel, isMarketIndexKey, sortIndices } from "./markets";

let db: GymDB;
afterEach(async () => {
  if (db) await db.delete();
});

describe("markets helpers", () => {
  it("exposes the three taggable indices", () => {
    expect(MARKET_INDICES.map((i) => i.key)).toEqual(["sp500", "asx200", "nasdaq"]);
    expect(indexLabel("sp500")).toBe("S&P 500");
    expect(indexLabel("asx200")).toBe("ASX 200");
    expect(indexLabel("nasdaq")).toBe("Nasdaq Composite");
  });

  it("validates index keys", () => {
    expect(isMarketIndexKey("sp500")).toBe(true);
    expect(isMarketIndexKey("dow")).toBe(false);
  });

  it("sorts tags into the canonical index order", () => {
    expect(sortIndices(["nasdaq", "sp500"])).toEqual(["sp500", "nasdaq"]);
  });
});

describe("market note mutations", () => {
  it("addMarketNote writes pending, trims body, keeps tags, sets stable client_id", async () => {
    db = await newTestDb();
    let notified = 0;
    const m = createMutations({ db, onChange: () => notified++ });

    const note = await m.addMarketNote({
      indices: ["sp500", "nasdaq"],
      body: "  broad rally on soft CPI  ",
    });

    expect(note.sync_status).toBe("pending");
    expect(note.body).toBe("broad rally on soft CPI");
    expect(note.indices).toEqual(["sp500", "nasdaq"]);
    expect(note.client_id).toBe(note.id);
    expect(note.noted_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(notified).toBe(1);

    const stored = await db.market_notes.get(note.id);
    expect(stored?.body).toBe("broad rally on soft CPI");
  });

  it("updateMarketNote re-tags, bumps updated_at, and re-pends", async () => {
    db = await newTestDb();
    let t = 1_700_000_000_000;
    const m = createMutations({ db, now: () => new Date(++t).toISOString() });
    const note = await m.addMarketNote({ indices: ["asx200"], body: "watching iron ore" });
    const before = note.updated_at;

    const updated = await m.updateMarketNote(note.id, { indices: ["asx200", "sp500"] });
    expect(updated?.indices).toEqual(["asx200", "sp500"]);
    expect((updated?.updated_at ?? "") > before).toBe(true);
    expect(updated?.sync_status).toBe("pending");

    expect(await m.updateMarketNote("missing", { body: "x" })).toBeNull();
  });

  it("deleteMarketNote soft-deletes and re-pends", async () => {
    db = await newTestDb();
    const m = createMutations({ db });
    const note = await m.addMarketNote({ indices: ["nasdaq"], body: "tech leadership" });
    await m.deleteMarketNote(note.id);

    const after = await db.market_notes.get(note.id);
    expect(after?.deleted_at).not.toBeNull();
    expect(after?.sync_status).toBe("pending");
  });
});

describe("market note outbox", () => {
  it("drains pending notes and strips local-only fields", async () => {
    db = await newTestDb();
    const m = createMutations({ db });
    await m.addMarketNote({ indices: ["sp500"], body: "new highs" });

    const { client, calls } = makeMockClient();
    const outbox = createOutbox({ client: client as never, db });
    const result = await outbox.drain();

    expect(result.pushed).toBe(1);
    const call = calls.find((c) => c.table === "market_notes");
    const payload = call?.payload[0] as Record<string, unknown>;
    expect(payload.sync_status).toBeUndefined();
    expect(payload.created_at).toBeUndefined();
    expect(payload.indices).toEqual(["sp500"]);
    expect(await db.market_notes.where("sync_status").equals("pending").count()).toBe(0);
  });
});
