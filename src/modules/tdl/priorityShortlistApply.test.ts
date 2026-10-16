import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Avoid constructing the real Supabase client (needs env) just to import the
// outbox poke; offline mode skips the drain anyway.
vi.mock("@/lib/sync", () => ({ syncEngine: { drain: () => Promise.resolve() } }));

import { db } from "@/lib/db";
import type { LocalTdlItem } from "@/lib/db";
import type { TdlItemRow } from "./types";
import { applyPriorityShortlist, createItem } from "./repo";
import { CUT_QUADRANT } from "./priorityShortlist";

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

const rankOf = async (id: string) =>
  (await db.tdl_items.get(id))?.priority_rank ?? null;
const quadrantOf = async (id: string) =>
  (await db.tdl_items.get(id))?.eisenhower_quadrant ?? null;

describe("applyPriorityShortlist", () => {
  it("spends ranks 1…n down the picked order", async () => {
    const a = await seed({ title: "A" });
    const b = await seed({ title: "B" });

    await applyPriorityShortlist(
      DAY,
      [
        { id: b.id, rank: 1 },
        { id: a.id, rank: 2 },
      ],
      [],
    );

    expect(await rankOf(b.id)).toBe(1);
    expect(await rankOf(a.id)).toBe(2);
  });

  it("pushes the cut ones to Do First and strips any rank they held", async () => {
    const kept = await seed({ title: "Kept" });
    const cut = await seed({ title: "Cut", priority_rank: 7 });

    await applyPriorityShortlist(DAY, [{ id: kept.id, rank: 1 }], [cut.id]);

    expect(await rankOf(cut.id)).toBeNull();
    expect(await quadrantOf(cut.id)).toBe(CUT_QUADRANT);
    expect(await quadrantOf(kept.id)).toBeNull();
  });

  it("swaps two picks' ranks without either losing one to the other", async () => {
    // The permutation case a loop over setPriorityRank gets wrong: assigning
    // rank 1 to `second` would displace `first` before it is given rank 2.
    const first = await seed({ title: "First", priority_rank: 1 });
    const second = await seed({ title: "Second", priority_rank: 2 });

    await applyPriorityShortlist(
      DAY,
      [
        { id: second.id, rank: 1 },
        { id: first.id, rank: 2 },
      ],
      [],
    );

    expect(await rankOf(second.id)).toBe(1);
    expect(await rankOf(first.id)).toBe(2);
  });

  it("displaces an outsider sitting on a rank a pick takes", async () => {
    const outsider = await seed({ title: "Outsider", priority_rank: 1 });
    const pick = await seed({ title: "Pick" });

    await applyPriorityShortlist(DAY, [{ id: pick.id, rank: 1 }], []);

    expect(await rankOf(pick.id)).toBe(1);
    expect(await rankOf(outsider.id)).toBeNull();
    // Displaced, not cut — it was never on the shortlist.
    expect(await quadrantOf(outsider.id)).toBeNull();
  });

  it("leaves an outsider on a rank nobody claims", async () => {
    const outsider = await seed({ title: "Outsider", priority_rank: 9 });
    const pick = await seed({ title: "Pick" });

    await applyPriorityShortlist(DAY, [{ id: pick.id, rank: 1 }], []);

    expect(await rankOf(outsider.id)).toBe(9);
  });

  it("leaves other days alone", async () => {
    const other = await createItem({
      snapshot_date: "2026-06-13",
      section: "work",
      title: "Tomorrow",
      priority_rank: 1,
    });
    const pick = await seed({ title: "Pick" });

    await applyPriorityShortlist(DAY, [{ id: pick.id, rank: 1 }], []);

    expect(await rankOf(other.id)).toBe(1);
  });

  it("never touches a soft-deleted row", async () => {
    const gone = await seed({ title: "Gone", priority_rank: 1 });
    await db.tdl_items.put({
      ...(await db.tdl_items.get(gone.id))!,
      deleted_at: new Date().toISOString(),
    });
    const pick = await seed({ title: "Pick" });

    await applyPriorityShortlist(DAY, [{ id: pick.id, rank: 1 }], []);

    expect(await rankOf(gone.id)).toBe(1);
    expect(await rankOf(pick.id)).toBe(1);
  });

  it("clears every rank when the cut keeps nobody", async () => {
    const a = await seed({ title: "A", priority_rank: 1 });
    const b = await seed({ title: "B", priority_rank: 2 });

    await applyPriorityShortlist(DAY, [], [a.id, b.id]);

    expect(await rankOf(a.id)).toBeNull();
    expect(await rankOf(b.id)).toBeNull();
    expect(await quadrantOf(a.id)).toBe(CUT_QUADRANT);
    expect(await quadrantOf(b.id)).toBe(CUT_QUADRANT);
  });
});
