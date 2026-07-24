import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Avoid constructing the real Supabase client (needs env) just to import the
// outbox poke; offline mode skips the drain anyway.
vi.mock("@/lib/sync", () => ({ syncEngine: { drain: () => Promise.resolve() } }));

import { db } from "@/lib/db";
import type { LocalTdlItem } from "@/lib/db";
import type { TdlItemRow } from "./types";
import {
  archiveItems,
  cancelItems,
  createItem,
  deleteItems,
  moveItemsToSection,
  pauseItems,
  resumeItems,
  setReluctantItems,
  snoozeItems,
  unarchiveItem,
  unsnoozeItems,
} from "./repo";
import { todayIsoDate } from "@/lib/utils";

// pokeOutbox() short-circuits when offline; keep the drain off the network.
beforeAll(() => {
  Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
});

afterEach(async () => {
  await db.tdl_items.clear();
});

const DAY = "2026-06-12";

async function seed(over: Partial<TdlItemRow> = {}): Promise<LocalTdlItem> {
  return createItem({
    snapshot_date: DAY,
    section: over.section ?? "work",
    title: over.title ?? "Task",
    ...over,
  });
}

describe("tdl bulk actions", () => {
  it("archives every id, skipping already-archived ones", async () => {
    const a = await seed();
    const b = await seed();
    const c = await seed({ is_archived: true });

    const changed = await archiveItems([a.id, b.id, c.id]);

    expect(changed).toBe(2);
    expect((await db.tdl_items.get(a.id))?.is_archived).toBe(true);
    expect((await db.tdl_items.get(b.id))?.is_archived).toBe(true);
  });

  it("snoozes every id to a future date, skipping same-day/past dates", async () => {
    const a = await seed();
    const b = await seed();

    const changed = await snoozeItems([a.id, b.id], "2026-06-20");

    expect(changed).toBe(2);
    expect((await db.tdl_items.get(a.id))?.snoozed_until).toBe("2026-06-20");
    expect((await db.tdl_items.get(b.id))?.snoozed_until).toBe("2026-06-20");

    // A wake-up date that isn't in the future is a no-op.
    expect(await snoozeItems([a.id], DAY)).toBe(0);
  });

  it("wakes every snoozed id and skips ones that aren't snoozed", async () => {
    const a = await seed({ snoozed_until: "2026-06-20" });
    const b = await seed();

    const changed = await unsnoozeItems([a.id, b.id]);

    expect(changed).toBe(1);
    expect((await db.tdl_items.get(a.id))?.snoozed_until).toBeNull();
  });

  it("cancels every id, skipping already-cancelled ones", async () => {
    const a = await seed();
    const b = await seed({ status: "cancelled" });

    const changed = await cancelItems([a.id, b.id]);

    expect(changed).toBe(1);
    expect((await db.tdl_items.get(a.id))?.status).toBe("cancelled");
  });

  it("pauses every id, skipping already-paused ones", async () => {
    const a = await seed();
    const b = await seed({ status: "paused" });

    const changed = await pauseItems([a.id, b.id]);

    expect(changed).toBe(1);
    expect((await db.tdl_items.get(a.id))?.status).toBe("paused");
  });

  it("resumes paused ids back to open, skipping non-paused ones", async () => {
    const a = await seed({ status: "paused" });
    const b = await seed({ status: "worked_today" });

    const changed = await resumeItems([a.id, b.id]);

    expect(changed).toBe(1);
    expect((await db.tdl_items.get(a.id))?.status).toBe("open");
    expect((await db.tdl_items.get(b.id))?.status).toBe("worked_today");
  });

  it("surfaces an unarchived item on today's board", async () => {
    const past = await seed({ is_archived: true });
    expect(past.snapshot_date).toBe(DAY);

    await unarchiveItem(past.id);

    const restored = await db.tdl_items.get(past.id);
    expect(restored?.is_archived).toBe(false);
    expect(restored?.snapshot_date).toBe(todayIsoDate());
  });

  it("soft-deletes every id, skipping already-deleted ones", async () => {
    const a = await seed();
    const b = await seed();

    const changed = await deleteItems([a.id, b.id]);

    expect(changed).toBe(2);
    expect((await db.tdl_items.get(a.id))?.deleted_at).not.toBeNull();
    expect((await db.tdl_items.get(b.id))?.deleted_at).not.toBeNull();
    expect(await deleteItems([a.id])).toBe(0);
  });

  it("sets and clears the reluctance flag across ids, clearing the reason", async () => {
    const a = await seed();
    const b = await seed({ is_reluctant: true, reluctance_reason: "boring" });

    expect(await setReluctantItems([a.id, b.id], true)).toBe(1);
    expect((await db.tdl_items.get(a.id))?.is_reluctant).toBe(true);

    expect(await setReluctantItems([a.id, b.id], false)).toBe(2);
    const bb = await db.tdl_items.get(b.id);
    expect(bb?.is_reluctant).toBe(false);
    expect(bb?.reluctance_reason).toBeNull();
  });

  it("moves every id into a section, skipping ones already there", async () => {
    const a = await seed({ section: "work" });
    const b = await seed({ section: "work" });
    const c = await seed({ section: "personal" });

    const changed = await moveItemsToSection([a.id, b.id, c.id], "personal");

    expect(changed).toBe(2);
    expect((await db.tdl_items.get(a.id))?.section).toBe("personal");
    expect((await db.tdl_items.get(b.id))?.section).toBe("personal");
    // Moved items are appended with distinct positions in the target section.
    const posA = (await db.tdl_items.get(a.id))?.position;
    const posB = (await db.tdl_items.get(b.id))?.position;
    expect(posA).not.toBe(posB);
  });
});
