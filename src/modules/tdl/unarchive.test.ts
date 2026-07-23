import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Avoid constructing the real Supabase client (needs env) just to import the
// outbox poke; offline mode skips the drain anyway.
vi.mock("@/lib/sync", () => ({ syncEngine: { drain: () => Promise.resolve() } }));

import { db } from "@/lib/db";
import type { LocalTdlItem } from "@/lib/db";
import type { TdlItemRow } from "./types";
import { createItem, unarchiveItem } from "./repo";

beforeAll(() => {
  Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
});

afterEach(async () => {
  await db.tdl_items.clear();
});

const PAST = "2026-06-12";
const TODAY = "2026-07-23";

async function seed(over: Partial<TdlItemRow> = {}): Promise<LocalTdlItem> {
  return createItem({
    snapshot_date: over.snapshot_date ?? PAST,
    section: over.section ?? "work",
    title: over.title ?? "Task",
    ...over,
  });
}

describe("unarchiveItem", () => {
  it("moves a restored item onto today's board", async () => {
    const item = await seed({ is_archived: true });

    const out = await unarchiveItem(item.id, TODAY);

    expect(out?.is_archived).toBe(false);
    expect(out?.snapshot_date).toBe(TODAY);
  });

  it("appends after the day's existing items in the same section", async () => {
    await seed({ snapshot_date: TODAY, section: "work" }); // position 0
    await seed({ snapshot_date: TODAY, section: "work" }); // position 1
    const archived = await seed({ is_archived: true, section: "work" });

    const out = await unarchiveItem(archived.id, TODAY);

    expect(out?.position).toBe(2);
  });

  it("keeps recurring/dated position buckets independent", async () => {
    await seed({ snapshot_date: TODAY, section: "work", is_recurring: true }); // recurring pos 0
    const archived = await seed({ is_archived: true, section: "work", is_recurring: false });

    const out = await unarchiveItem(archived.id, TODAY);

    expect(out?.position).toBe(0);
  });

  it("leaves an item already on today in place", async () => {
    const item = await seed({ snapshot_date: TODAY, is_archived: true, position: 5 });

    const out = await unarchiveItem(item.id, TODAY);

    expect(out?.snapshot_date).toBe(TODAY);
    expect(out?.position).toBe(5);
    expect(out?.is_archived).toBe(false);
  });

  it("returns null for an unknown id", async () => {
    expect(await unarchiveItem("missing", TODAY)).toBeNull();
  });
});
