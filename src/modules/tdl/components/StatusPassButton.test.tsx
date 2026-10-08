import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SectionConfig } from "../sections";
import type { LocalTdlItem } from "../types";
import { StatusPassButton } from "./StatusPassButton";

const updateItem = vi.fn();
const archiveItem = vi.fn();
const setPriorityRank = vi.fn();
vi.mock("../repo", () => ({
  updateItem: (...a: unknown[]) => updateItem(...a),
  archiveItem: (...a: unknown[]) => archiveItem(...a),
  setPriorityRank: (...a: unknown[]) => setPriorityRank(...a),
}));

const CATEGORIES: SectionConfig[] = [
  {
    key: "follow_ups",
    label: "Follow Ups",
    hasDueDate: false,
    hasTimeEstimate: false,
    recurringSeeds: [],
  },
  {
    key: "product",
    label: "Product",
    hasDueDate: true,
    hasTimeEstimate: true,
    recurringSeeds: [],
  },
];
vi.mock("../categories", () => ({ useCategories: () => CATEGORIES }));

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
  for (const fn of [updateItem, archiveItem, setPriorityRank]) {
    fn.mockReset();
    fn.mockResolvedValue(null);
  }
});

function openFlow(items: LocalTdlItem[]) {
  render(<StatusPassButton snapshot_date={DAY} items={items} />);
  fireEvent.click(screen.getByRole("button", { name: /Statuses · / }));
}

describe("StatusPassButton", () => {
  it("disables the button when nothing is in flight", () => {
    render(
      <StatusPassButton
        snapshot_date={DAY}
        items={[item({ status: "done" })]}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Nothing to update" }),
    ).toBeDisabled();
  });

  it("shows one card at a time, priorities first", () => {
    openFlow([
      item({ id: "plain", title: "Plain task" }),
      item({ id: "p1", title: "Top task", priority_rank: 1, position: 1 }),
    ]);
    expect(screen.getByText("Top task")).toBeTruthy();
    expect(screen.queryByText("Plain task")).toBeNull();
    expect(screen.getByText("1 of 2")).toBeTruthy();
  });

  it("offers the standard cycle plus paused and cancelled", () => {
    openFlow([item()]);
    for (const label of [
      "Open",
      "In progress",
      "Done",
      "Paused",
      "Cancelled",
    ]) {
      expect(
        screen.getByRole("button", { name: new RegExp(`^${label}`) }),
      ).toBeTruthy();
    }
    expect(
      screen.queryByRole("button", { name: /^Ready for testing/ }),
    ).toBeNull();
  });

  it("offers ready-for-testing on a Product card", () => {
    openFlow([item({ section: "product" })]);
    expect(
      screen.getByRole("button", { name: /^Ready for testing/ }),
    ).toBeTruthy();
  });

  it("sets the status of the shown card and advances", async () => {
    openFlow([
      item({ id: "a", title: "First" }),
      item({ id: "b", title: "Second", position: 1 }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: /^Done/ }));
    await waitFor(() =>
      expect(updateItem).toHaveBeenCalledWith("a", { status: "done" }),
    );
    expect(screen.getByText("Second")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Paused/ }));
    await waitFor(() =>
      expect(updateItem).toHaveBeenCalledWith("b", { status: "paused" }),
    );
  });

  it("includes recurring dailies, which triage leaves out", () => {
    openFlow([item({ id: "daily", title: "Inbox zero", is_recurring: true })]);
    expect(screen.getByText("Inbox zero")).toBeTruthy();
    expect(screen.getByText("Daily")).toBeTruthy();
  });

  it("skips without writing and advances", async () => {
    openFlow([
      item({ id: "a", title: "First" }),
      item({ id: "b", title: "Second", position: 1 }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: /Skip/ }));
    await waitFor(() => expect(screen.getByText("Second")).toBeTruthy());
    expect(updateItem).not.toHaveBeenCalled();
  });

  it("marks the current status and writes nothing when it is re-picked", async () => {
    openFlow([item({ id: "a", status: "worked_today" })]);
    expect(screen.getByText("Current")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^In progress/ }));
    await waitFor(() => expect(screen.getByText("Pass complete")).toBeTruthy());
    expect(updateItem).not.toHaveBeenCalled();
  });

  it("undoes the last ruling, restoring the status and its last-worked stamp", async () => {
    openFlow([
      item({
        id: "a",
        title: "First",
        status: "worked_today",
        last_worked_at: "2026-09-14T10:00:00.000Z",
      }),
      item({ id: "b", title: "Second", position: 1 }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: /^Done/ }));
    await waitFor(() => expect(screen.getByText("Second")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Undo last decision" }));
    await waitFor(() =>
      expect(updateItem).toHaveBeenCalledWith("a", {
        status: "worked_today",
        last_worked_at: "2026-09-14T10:00:00.000Z",
      }),
    );
    expect(screen.getByText("First")).toBeTruthy();
  });

  it("writes nothing when undoing a skip", async () => {
    openFlow([item({ id: "a", title: "First" })]);
    fireEvent.click(screen.getByRole("button", { name: /Skip/ }));
    await waitFor(() => expect(screen.getByText("Pass complete")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Undo last decision" }));
    await waitFor(() => expect(screen.getByText("First")).toBeTruthy());
    expect(updateItem).not.toHaveBeenCalled();
  });

  it("summarises the pass and reports it on close", async () => {
    openFlow([
      item({ id: "a", title: "First" }),
      item({ id: "b", title: "Second", position: 1 }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: /^Done/ }));
    await waitFor(() => expect(screen.getByText("Second")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Skip/ }));
    await waitFor(() => expect(screen.getByText("Pass complete")).toBeTruthy());
    expect(
      screen.getByText("Updated 1 task · 1 done · 1 skipped"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() =>
      expect(
        screen.getByText("Updated 1 task · 1 done · 1 skipped"),
      ).toBeTruthy(),
    );
  });

  it("archives the shown card and advances", async () => {
    openFlow([
      item({ id: "a", title: "First" }),
      item({ id: "b", title: "Second", position: 1 }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: /Archive/ }));
    await waitFor(() => expect(archiveItem).toHaveBeenCalledWith("a"));
    expect(updateItem).not.toHaveBeenCalled();
    expect(screen.getByText("Second")).toBeTruthy();
  });

  it("undoes an archive by putting the flag back", async () => {
    openFlow([item({ id: "a", title: "First" })]);
    fireEvent.click(screen.getByRole("button", { name: /Archive/ }));
    await waitFor(() => expect(screen.getByText("Pass complete")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Undo last decision" }));
    await waitFor(() =>
      expect(updateItem).toHaveBeenCalledWith("a", { is_archived: false }),
    );
    expect(screen.getByText("First")).toBeTruthy();
  });

  it("ranks the shown card without advancing the pass", async () => {
    openFlow([
      item({ id: "a", title: "First" }),
      item({ id: "b", title: "Second", position: 1 }),
    ]);
    fireEvent.change(screen.getByLabelText("Priority rank"), {
      target: { value: "2" },
    });
    await waitFor(() => expect(setPriorityRank).toHaveBeenCalledWith("a", 2));
    expect(screen.getByText("First")).toBeTruthy();
    expect(screen.getByText("1 of 2")).toBeTruthy();
    expect(screen.getByText("P2")).toBeTruthy();
  });

  it("disables ranks another task on the day already holds", () => {
    openFlow([
      item({ id: "p1", title: "First", priority_rank: 1 }),
      item({ id: "p3", title: "Second", priority_rank: 3, position: 1 }),
    ]);
    const picker = screen.getByLabelText("Priority rank") as HTMLSelectElement;
    const optionFor = (v: string) =>
      Array.from(picker.options).find((o) => o.value === v);
    expect(optionFor("3")?.disabled).toBe(true);
    // Its own rank stays pickable, so re-confirming it is never blocked.
    expect(optionFor("1")?.disabled).toBe(false);
    expect(optionFor("2")?.disabled).toBe(false);
  });

  it("carries a rank set on a skipped card into the summary", async () => {
    openFlow([item({ id: "a", title: "First" })]);
    fireEvent.change(screen.getByLabelText("Priority rank"), {
      target: { value: "1" },
    });
    await waitFor(() => expect(setPriorityRank).toHaveBeenCalledWith("a", 1));
    fireEvent.click(screen.getByRole("button", { name: /Skip/ }));
    await waitFor(() => expect(screen.getByText("Pass complete")).toBeTruthy());
    expect(screen.getByText("Updated 1 task · 1 prioritised")).toBeTruthy();
  });

  it("undoes a rank alongside the ruling it rode with", async () => {
    openFlow([item({ id: "a", title: "First", priority_rank: 4 })]);
    fireEvent.change(screen.getByLabelText("Priority rank"), {
      target: { value: "1" },
    });
    await waitFor(() => expect(setPriorityRank).toHaveBeenCalledWith("a", 1));
    fireEvent.click(screen.getByRole("button", { name: /^Done/ }));
    await waitFor(() => expect(screen.getByText("Pass complete")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Undo last decision" }));
    await waitFor(() => expect(setPriorityRank).toHaveBeenCalledWith("a", 4));
    expect(updateItem).toHaveBeenCalledWith("a", {
      status: "open",
      last_worked_at: null,
    });
  });

  it("holds the queue still while its own writes land", async () => {
    const { rerender } = render(
      <StatusPassButton
        snapshot_date={DAY}
        items={[
          item({ id: "a", title: "First" }),
          item({ id: "b", title: "Second", position: 1 }),
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Statuses · 2/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Done/ }));
    await waitFor(() => expect(updateItem).toHaveBeenCalled());
    // The board re-renders without the finished row; the pass keeps its length.
    rerender(
      <StatusPassButton
        snapshot_date={DAY}
        items={[item({ id: "b", title: "Second", position: 1 })]}
      />,
    );
    expect(screen.getByText("2 of 2")).toBeTruthy();
    expect(screen.getByText("Second")).toBeTruthy();
  });
});
