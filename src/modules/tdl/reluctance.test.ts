import { describe, expect, it } from "vitest";
import { isReluctantMember, reluctantCounts, selectReluctantItems } from "./reluctance";
import type { TdlStatus } from "./types";

function item(
  is_reluctant: boolean,
  overrides: Partial<{
    position: number;
    priority_rank: number | null;
    title: string;
    status: TdlStatus;
    is_archived: boolean;
    deleted_at: string | null;
    snoozed_until: string | null;
  }> = {},
) {
  return {
    is_reluctant,
    position: 0,
    priority_rank: null as number | null,
    title: "",
    status: "open" as TdlStatus,
    is_archived: false,
    deleted_at: null as string | null,
    snoozed_until: null as string | null,
    snapshot_date: "2026-09-11",
    ...overrides,
  };
}

describe("selectReluctantItems", () => {
  it("keeps only reluctant items", () => {
    const items = [
      item(true, { position: 0, title: "a" }),
      item(false, { position: 1, title: "b" }),
      item(true, { position: 2, title: "c" }),
    ];
    expect(selectReluctantItems(items).map((i) => i.title)).toEqual(["a", "c"]);
  });

  it("orders ranked items first (1 → 10), then the rest by position", () => {
    const items = [
      item(true, { position: 2, title: "unranked-late" }),
      item(true, { position: 0, title: "rank3", priority_rank: 3 }),
      item(true, { position: 5, title: "unranked-early" }),
      item(true, { position: 9, title: "rank1", priority_rank: 1 }),
    ];
    expect(selectReluctantItems(items).map((i) => i.title)).toEqual([
      "rank1",
      "rank3",
      "unranked-late",
      "unranked-early",
    ]);
  });

  it("returns an empty list when nothing is flagged", () => {
    expect(selectReluctantItems([item(false), item(false)])).toEqual([]);
  });

  it("drops deleted, snoozed, cancelled and paused items", () => {
    const items = [
      item(true, { title: "live" }),
      item(true, { title: "deleted", deleted_at: "2026-09-10T00:00:00Z" }),
      item(true, { title: "snoozed", snoozed_until: "2026-09-29" }),
      item(true, { title: "cancelled", status: "cancelled" }),
      item(true, { title: "paused", status: "paused" }),
    ];
    expect(selectReluctantItems(items).map((i) => i.title)).toEqual(["live"]);
  });

  it("keeps a done item through archiving but drops an unfinished one", () => {
    const items = [
      item(true, { title: "done-archived", status: "done", is_archived: true }),
      item(true, { title: "open-archived", is_archived: true }),
    ];
    expect(selectReluctantItems(items).map((i) => i.title)).toEqual(["done-archived"]);
  });

  it("wakes a snoozed item once the day reaches its wake-up date", () => {
    expect(isReluctantMember(item(true, { snoozed_until: "2026-09-11" }))).toBe(true);
    expect(isReluctantMember(item(true, { snoozed_until: "2026-09-12" }))).toBe(false);
  });
});

describe("reluctantCounts", () => {
  it("splits the shared set into total / done / outstanding", () => {
    const items = [
      item(true, { status: "done" }),
      item(true, { status: "done", is_archived: true }),
      item(true, { status: "worked_today" }),
      item(true, { status: "ready_for_testing" }),
      item(true, { status: "open" }),
      item(true, { status: "cancelled" }),
      item(true, { status: "paused" }),
      item(false, { status: "done" }),
    ];
    expect(reluctantCounts(items)).toEqual({ total: 5, done: 2, outstanding: 3 });
  });

  it("counts the same rows selectReluctantItems renders", () => {
    const items = [
      item(true, { title: "a", status: "done" }),
      item(true, { title: "b", snoozed_until: "2026-09-29" }),
      item(true, { title: "c", status: "cancelled" }),
      item(true, { title: "d" }),
      item(false, { title: "e" }),
    ];
    expect(reluctantCounts(items).total).toBe(selectReluctantItems(items).length);
  });

  it("is all zeroes when nothing is flagged", () => {
    expect(reluctantCounts([item(false)])).toEqual({ total: 0, done: 0, outstanding: 0 });
  });
});
