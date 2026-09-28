import { describe, expect, it } from "vitest";
import { dropClassifyPatch, groupByWorkstream, reorderIds, sortWorkstreams } from "./workstreamGroups";

const ws = (id: string, label: string, sort_order: number, deleted_at: string | null = null) => ({
  id,
  label,
  sort_order,
  deleted_at,
});
const item = (id: string, workstream_id: string | null) => ({ id, workstream_id });

describe("sortWorkstreams", () => {
  it("drops deleted rows and orders by sort_order then label", () => {
    const rows = [ws("c", "Zeta", 1), ws("a", "Beta", 0), ws("b", "Alpha", 1), ws("d", "Gone", 0, "x")];
    expect(sortWorkstreams(rows).map((w) => w.id)).toEqual(["a", "b", "c"]);
  });
});

describe("groupByWorkstream", () => {
  const streams = [ws("w2", "Onboarding", 1), ws("w1", "Billing", 0)];

  it("groups in workstream order with ungrouped last, keeping item order", () => {
    const items = [item("i1", null), item("i2", "w2"), item("i3", "w1"), item("i4", "w2")];
    const groups = groupByWorkstream(items, streams);
    expect(groups.map((g) => g.workstream?.id ?? null)).toEqual(["w1", "w2", null]);
    expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([["i3"], ["i2", "i4"], ["i1"]]);
  });

  it("treats a deleted or foreign workstream as ungrouped", () => {
    const items = [item("i1", "gone"), item("i2", "w1")];
    const groups = groupByWorkstream(items, [...streams, ws("gone", "Old", 2, "x")]);
    expect(groups.at(-1)).toMatchObject({ workstream: null });
    expect(groups.at(-1)!.items.map((i) => i.id)).toEqual(["i1"]);
  });

  it("keeps empty workstreams by default and drops them on request", () => {
    const items = [item("i1", "w1")];
    expect(groupByWorkstream(items, streams).map((g) => g.workstream?.id)).toEqual(["w1", "w2"]);
    expect(
      groupByWorkstream(items, streams, { includeEmpty: false }).map((g) => g.workstream?.id),
    ).toEqual(["w1"]);
  });

  it("omits the ungrouped bucket when every item is grouped", () => {
    const groups = groupByWorkstream([item("i1", "w1")], streams);
    expect(groups.some((g) => g.workstream === null)).toBe(false);
  });
});

describe("reorderIds", () => {
  it("swaps with the neighbour", () => {
    expect(reorderIds(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(reorderIds(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
  });

  it("returns the same array when the move falls off an end", () => {
    const ids = ["a", "b"];
    expect(reorderIds(ids, "a", -1)).toBe(ids);
    expect(reorderIds(ids, "b", 1)).toBe(ids);
    expect(reorderIds(ids, "z", 1)).toBe(ids);
  });
});

describe("dropClassifyPatch", () => {
  const row = (section: string, q: "do_first" | "schedule" | null, w: string | null) => ({
    section,
    eisenhower_quadrant: q,
    workstream_id: w,
  });

  it("is empty for a reorder inside the same group", () => {
    expect(dropClassifyPatch(row("product", "schedule", "w1"), row("product", "schedule", "w1"))).toEqual({});
  });

  it("adopts the target's workstream and quadrant within a category", () => {
    expect(dropClassifyPatch(row("product", null, "w1"), row("product", "do_first", "w2"))).toEqual({
      eisenhower_quadrant: "do_first",
      workstream_id: "w2",
    });
    expect(dropClassifyPatch(row("product", null, "w1"), row("product", null, null))).toEqual({
      workstream_id: null,
    });
  });

  it("across categories only patches a non-null target workstream", () => {
    expect(dropClassifyPatch(row("product", null, "w1"), row("sales", null, null))).toEqual({});
    expect(dropClassifyPatch(row("product", null, "w1"), row("sales", null, "s1"))).toEqual({
      workstream_id: "s1",
    });
  });
});
