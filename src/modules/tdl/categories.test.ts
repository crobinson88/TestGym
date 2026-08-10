import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { v4 as uuid } from "uuid";

// Avoid constructing the real Supabase client (needs env) just to import the
// outbox poke; offline mode skips the drain anyway.
vi.mock("@/lib/sync", () => ({ syncEngine: { drain: () => Promise.resolve() } }));

import { db } from "@/lib/db";
import type { LocalTdlItem } from "@/lib/db";
import type { TdlItemRow, TdlStatus } from "./types";
import {
  blockingItemCount,
  createCategory,
  deleteCategory,
  renameCategory,
  reorderCategories,
  setCategoryArchived,
} from "./categories";

// pokeOutbox() short-circuits when offline; keep the drain from touching the
// network during tests.
beforeAll(() => {
  Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
});

afterEach(async () => {
  await db.tdl_items.clear();
  await db.tdl_categories.clear();
});

const TODAY = "2026-06-12";

function item(section: string, over: Partial<TdlItemRow> = {}): LocalTdlItem {
  const ts = `${TODAY}T08:00:00.000Z`;
  const row: TdlItemRow = {
    id: uuid(),
    snapshot_date: TODAY,
    section,
    is_recurring: false,
    position: 0,
    title: "Task",
    due_date: null,
    time_estimate_min: null,
    status: "open" as TdlStatus,
    priority_rank: null,
    eisenhower_quadrant: null,
    is_archived: false,
    snoozed_until: null,
    is_reluctant: false,
    reluctance_reason: null,
    last_worked_at: null,
    notes: null,
    images: [],
    origin_item_id: null,
    origin_snapshot_date: null,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
    ...over,
  };
  return { ...row, sync_status: "synced" };
}

describe("createCategory", () => {
  it("assigns a unique opaque key and the next sort order", async () => {
    const a = await createCategory("  Reading  ");
    const b = await createCategory("Errands");
    expect(a.label).toBe("Reading");
    expect(a.key).not.toBe(a.id);
    expect(b.key).not.toBe(a.key);
    expect(b.sort_order).toBe(a.sort_order + 1);
    expect(a.sync_status).toBe("pending");
  });

  it("starts unarchived", async () => {
    const a = await createCategory("Reading");
    expect(a.is_archived).toBe(false);
  });

  it("rejects a blank label", async () => {
    await expect(createCategory("   ")).rejects.toThrow();
  });
});

describe("renameCategory", () => {
  it("changes the label but leaves the key stable", async () => {
    const cat = await createCategory("Old");
    const renamed = await renameCategory(cat.id, "New");
    expect(renamed?.label).toBe("New");
    expect(renamed?.key).toBe(cat.key);
  });
});

describe("reorderCategories", () => {
  it("rewrites sort_order to match the given id order", async () => {
    const a = await createCategory("A");
    const b = await createCategory("B");
    const c = await createCategory("C");
    await reorderCategories([c.id, a.id, b.id]);
    const rows = await db.tdl_categories.toArray();
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(c.id)?.sort_order).toBe(0);
    expect(byId.get(a.id)?.sort_order).toBe(1);
    expect(byId.get(b.id)?.sort_order).toBe(2);
    expect(byId.get(c.id)?.sync_status).toBe("pending");
    // Untouched row keeps its already-correct order without a rewrite.
    expect(byId.get(a.id)?.sync_status).toBe("pending");
  });

  it("skips unknown or deleted ids", async () => {
    const a = await createCategory("A");
    const b = await createCategory("B");
    await deleteCategory(b.id);
    await expect(
      reorderCategories([uuid(), b.id, a.id]),
    ).resolves.toBeUndefined();
    const still = await db.tdl_categories.get(a.id);
    expect(still?.sort_order).toBe(2);
  });
});

describe("blockingItemCount", () => {
  it("counts active and snoozed items, ignoring done/cancelled/archived", async () => {
    const cat = await createCategory("Work");
    await db.tdl_items.bulkPut([
      item(cat.key, { status: "open" }),
      item(cat.key, { status: "worked_today" }),
      item(cat.key, { snoozed_until: "2026-07-01" }),
      item(cat.key, { status: "done" }),
      item(cat.key, { status: "cancelled" }),
      item(cat.key, { is_archived: true }),
      item(cat.key, { deleted_at: `${TODAY}T09:00:00.000Z` }),
      item("other", { status: "open" }),
    ]);
    expect(await blockingItemCount(cat.key, TODAY)).toBe(3);
  });
});

describe("setCategoryArchived", () => {
  it("archives and unarchives, marking the row pending each time", async () => {
    const cat = await createCategory("Work");
    const archived = await setCategoryArchived(cat.id, true);
    expect(archived?.is_archived).toBe(true);
    expect(archived?.sync_status).toBe("pending");

    const restored = await setCategoryArchived(cat.id, false);
    expect(restored?.is_archived).toBe(false);
    expect(restored?.sync_status).toBe("pending");
  });

  it("is unrestricted even with active items (they orphan to Uncategorised)", async () => {
    const cat = await createCategory("Work");
    await db.tdl_items.put(item(cat.key, { status: "worked_today" }));
    const archived = await setCategoryArchived(cat.id, true);
    expect(archived?.is_archived).toBe(true);
  });

  it("no-ops when already in the requested state", async () => {
    const cat = await createCategory("Work");
    const same = await setCategoryArchived(cat.id, false);
    expect(same?.updated_at).toBe(cat.updated_at);
    expect(same?.sync_status).toBe(cat.sync_status);
  });

  it("returns null for an unknown id", async () => {
    expect(await setCategoryArchived(uuid(), true)).toBeNull();
  });
});

describe("deleteCategory", () => {
  it("blocks deletion while active or snoozed items remain", async () => {
    const cat = await createCategory("Work");
    await db.tdl_items.put(item(cat.key, { status: "worked_today" }));
    await expect(deleteCategory(cat.id)).rejects.toThrow(/active or snoozed/i);
    const still = await db.tdl_categories.get(cat.id);
    expect(still?.deleted_at).toBeNull();
  });

  it("soft-deletes when only done/archived history remains", async () => {
    const cat = await createCategory("Work");
    await db.tdl_items.put(item(cat.key, { status: "done" }));
    const deleted = await deleteCategory(cat.id);
    expect(deleted?.deleted_at).not.toBeNull();
    expect(deleted?.sync_status).toBe("pending");
  });
});
