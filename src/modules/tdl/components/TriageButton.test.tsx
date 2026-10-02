import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SectionConfig } from "../sections";
import type { LocalTdlItem } from "../types";
import { TriageButton } from "./TriageButton";

const archiveItem = vi.fn();
const deleteItem = vi.fn();
const snoozeItem = vi.fn();
const updateItem = vi.fn();
vi.mock("../repo", () => ({
  archiveItem: (...a: unknown[]) => archiveItem(...a),
  deleteItem: (...a: unknown[]) => deleteItem(...a),
  snoozeItem: (...a: unknown[]) => snoozeItem(...a),
  updateItem: (...a: unknown[]) => updateItem(...a),
}));

const CATEGORIES: SectionConfig[] = [
  {
    key: "follow_ups",
    label: "Follow Ups",
    hasDueDate: false,
    hasTimeEstimate: false,
    recurringSeeds: [],
  },
];
vi.mock("../categories", () => ({ useCategories: () => CATEGORIES }));

// 2026-09-16 is a Wednesday.
const DAY = "2026-09-16";

function item(over: Partial<LocalTdlItem> = {}): LocalTdlItem {
  return {
    id: "row-1",
    snapshot_date: DAY,
    section: "follow_ups",
    is_recurring: false,
    position: 0,
    title: "Call Sam",
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
    board_list_id: null,
    workstream_id: null,
    origin_item_id: null,
    origin_snapshot_date: DAY,
    created_at: `${DAY}T08:00:00.000Z`,
    updated_at: `${DAY}T08:00:00.000Z`,
    deleted_at: null,
    client_id: null,
    user_id: null,
    sync_status: "synced",
    ...over,
  } as LocalTdlItem;
}

beforeEach(() => {
  for (const m of [archiveItem, deleteItem, snoozeItem, updateItem]) {
    m.mockReset();
    m.mockResolvedValue(null);
  }
});

function openFlow(items: LocalTdlItem[]) {
  render(<TriageButton snapshot_date={DAY} items={items} />);
  fireEvent.click(screen.getByRole("button", { name: /Triage · / }));
}

describe("TriageButton", () => {
  it("disables the button when there is nothing to triage", () => {
    render(<TriageButton snapshot_date={DAY} items={[item({ status: "done" })]} />);
    const btn = screen.getByRole("button", { name: "Nothing to triage" });
    expect(btn).toBeDisabled();
  });

  it("shows one card at a time, most-stalled first", () => {
    openFlow([
      item({ id: "fresh", title: "Fresh task" }),
      item({ id: "old", title: "Old task", origin_snapshot_date: "2026-09-10" }),
    ]);
    expect(screen.getByText("Old task")).toBeTruthy();
    expect(screen.queryByText("Fresh task")).toBeNull();
    expect(screen.getByText("1 of 2")).toBeTruthy();
    expect(screen.getByText("No progress in 6 days")).toBeTruthy();
  });

  it("keeps a task without writing anything and advances", async () => {
    openFlow([item({ id: "a", title: "First" }), item({ id: "b", title: "Second", position: 1 })]);
    fireEvent.click(screen.getByRole("button", { name: /Keep/ }));
    await waitFor(() => expect(screen.getByText("Second")).toBeTruthy());
    expect(archiveItem).not.toHaveBeenCalled();
    expect(deleteItem).not.toHaveBeenCalled();
    expect(snoozeItem).not.toHaveBeenCalled();
    expect(screen.getByText("2 of 2")).toBeTruthy();
  });

  it("archives and deletes the shown card", async () => {
    openFlow([item({ id: "a", title: "First" }), item({ id: "b", title: "Second", position: 1 })]);
    fireEvent.click(screen.getByRole("button", { name: /Archive/ }));
    await waitFor(() => expect(archiveItem).toHaveBeenCalledWith("a"));
    fireEvent.click(screen.getByRole("button", { name: /Delete/ }));
    await waitFor(() => expect(deleteItem).toHaveBeenCalledWith("b"));
  });

  it("offers the four snooze horizons with their resolved dates", async () => {
    openFlow([item({ id: "a" })]);
    fireEvent.click(screen.getByRole("button", { name: /Snooze/ }));
    for (const label of ["Tomorrow", "2 business days", "Next week", "Next month"]) {
      expect(screen.getByRole("button", { name: new RegExp(label) })).toBeTruthy();
    }
    // Wed 16 Sep → Thu 17th / Fri 18th / Mon 21st / 1 Oct.
    fireEvent.click(screen.getByRole("button", { name: /2 business days/ }));
    await waitFor(() => expect(snoozeItem).toHaveBeenCalledWith("a", "2026-09-18"));
  });

  it("snoozes to next week and next month off the viewed day", async () => {
    openFlow([item({ id: "a" }), item({ id: "b", position: 1 })]);
    fireEvent.click(screen.getByRole("button", { name: /^Snooze/ }));
    fireEvent.click(screen.getByRole("button", { name: /Next week/ }));
    await waitFor(() => expect(snoozeItem).toHaveBeenCalledWith("a", "2026-09-21"));
    fireEvent.click(screen.getByRole("button", { name: /^Snooze/ }));
    fireEvent.click(screen.getByRole("button", { name: /Next month/ }));
    await waitFor(() => expect(snoozeItem).toHaveBeenCalledWith("b", "2026-10-01"));
  });

  it("backs out of the horizons without writing", () => {
    openFlow([item({ id: "a" })]);
    fireEvent.click(screen.getByRole("button", { name: /^Snooze/ }));
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(screen.getByRole("button", { name: /Keep/ })).toBeTruthy();
    expect(snoozeItem).not.toHaveBeenCalled();
  });

  it("undoes the last ruling, restoring the fields it changed", async () => {
    openFlow([item({ id: "a", title: "First" }), item({ id: "b", title: "Second", position: 1 })]);
    fireEvent.click(screen.getByRole("button", { name: /Archive/ }));
    await waitFor(() => expect(screen.getByText("Second")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Undo last decision" }));
    await waitFor(() =>
      expect(updateItem).toHaveBeenCalledWith("a", {
        is_archived: false,
        deleted_at: null,
        snoozed_until: null,
      }),
    );
    expect(screen.getByText("First")).toBeTruthy();
  });

  it("writes nothing when undoing a keep", async () => {
    openFlow([item({ id: "a", title: "First" })]);
    fireEvent.click(screen.getByRole("button", { name: /Keep/ }));
    await waitFor(() => expect(screen.getByText("Pass complete")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Undo last decision" }));
    await waitFor(() => expect(screen.getByText("First")).toBeTruthy());
    expect(updateItem).not.toHaveBeenCalled();
  });

  it("summarises the pass and reports it on close", async () => {
    openFlow([item({ id: "a", title: "First" }), item({ id: "b", title: "Second", position: 1 })]);
    fireEvent.click(screen.getByRole("button", { name: /Keep/ }));
    await waitFor(() => expect(screen.getByText("Second")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Delete/ }));
    await waitFor(() => expect(screen.getByText("Pass complete")).toBeTruthy());
    expect(screen.getByText("Triaged 2 tasks · 1 kept, 1 deleted")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() =>
      expect(screen.getByText("Triaged 2 tasks · 1 kept, 1 deleted")).toBeTruthy(),
    );
  });

  it("holds the queue still while its own writes land", async () => {
    const { rerender } = render(
      <TriageButton
        snapshot_date={DAY}
        items={[item({ id: "a", title: "First" }), item({ id: "b", title: "Second", position: 1 })]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Triage · 2/ }));
    fireEvent.click(screen.getByRole("button", { name: /Archive/ }));
    await waitFor(() => expect(archiveItem).toHaveBeenCalled());
    // The board re-renders without the archived row; the pass keeps its length.
    rerender(
      <TriageButton snapshot_date={DAY} items={[item({ id: "b", title: "Second", position: 1 })]} />,
    );
    expect(screen.getByText("2 of 2")).toBeTruthy();
    expect(screen.getByText("Second")).toBeTruthy();
  });
});
