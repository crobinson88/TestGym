import { describe, expect, it } from "vitest";
import { v4 as uuid } from "uuid";
import type { LocalTdlItem } from "@/lib/db";
import type { TdlItemRow, TdlSection } from "./types";
import { groupBySection, selectCategoryTargets } from "./grouping";
import { UNCATEGORISED_KEY, type SectionConfig } from "./sections";

function makeItem(
  snapshot_date: string,
  section: TdlSection,
  over: Partial<TdlItemRow> = {},
): LocalTdlItem {
  const ts = `${snapshot_date}T08:00:00.000Z`;
  const row: TdlItemRow = {
    id: uuid(),
    snapshot_date,
    section,
    is_recurring: false,
    position: 0,
    title: "Task",
    due_date: null,
    time_estimate_min: null,
    status: "open",
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

function cat(key: string, label: string): SectionConfig {
  return { key, label, hasDueDate: true, hasTimeEstimate: true, recurringSeeds: [] };
}

const CATEGORIES = [cat("tanya", "Tanya"), cat("product", "Product")];
const DAY = "2026-06-12";

describe("groupBySection", () => {
  it("buckets items by category in board order, dropping empty groups", () => {
    const groups = groupBySection(
      [
        makeItem(DAY, "product", { title: "P1" }),
        makeItem(DAY, "tanya", { title: "T1" }),
        makeItem(DAY, "tanya", { title: "T2" }),
      ],
      CATEGORIES,
    );

    expect(groups.map((g) => [g.cfg.key, g.items.length])).toEqual([
      ["tanya", 2],
      ["product", 1],
    ]);
  });

  it("puts items of dead or archived categories in Uncategorised, last", () => {
    const groups = groupBySection(
      [makeItem(DAY, "gone", { title: "Orphan" }), makeItem(DAY, "tanya")],
      CATEGORIES,
    );

    expect(groups.map((g) => g.cfg.key)).toEqual(["tanya", UNCATEGORISED_KEY]);
    expect(groups[1].items[0].title).toBe("Orphan");
  });

  it("returns nothing for an empty list", () => {
    expect(groupBySection([], CATEGORIES)).toEqual([]);
  });
});

describe("selectCategoryTargets", () => {
  it("takes only live board items of the given day and sections", () => {
    const keep = makeItem(DAY, "tanya", { title: "keep" });
    const rows = [
      keep,
      makeItem("2026-06-11", "tanya", { title: "other day" }),
      makeItem(DAY, "product", { title: "other section" }),
      makeItem(DAY, "tanya", { title: "archived", is_archived: true }),
      makeItem(DAY, "tanya", { title: "snoozed", snoozed_until: "2026-06-20" }),
      makeItem(DAY, "tanya", { title: "deleted", deleted_at: `${DAY}T09:00:00.000Z` }),
    ];

    expect(selectCategoryTargets(rows, DAY, ["tanya"]).map((r) => r.title)).toEqual(["keep"]);
    expect(keep.snapshot_date).toBe(DAY);
  });

  it("spans several section keys at once (the Uncategorised column)", () => {
    const rows = [
      makeItem(DAY, "gone_a", { title: "a" }),
      makeItem(DAY, "gone_b", { title: "b" }),
      makeItem(DAY, "tanya", { title: "c" }),
    ];

    expect(
      selectCategoryTargets(rows, DAY, ["gone_a", "gone_b"]).map((r) => r.title),
    ).toEqual(["a", "b"]);
  });

  it("takes recurring items too — they sit on the board like any other", () => {
    const rows = [makeItem(DAY, "tanya", { title: "daily", is_recurring: true })];
    expect(selectCategoryTargets(rows, DAY, ["tanya"])).toHaveLength(1);
  });
});
