import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SectionConfig } from "../sections";
import type { LocalTdlItem } from "../types";
import { SuggestSnoozeButton } from "./SuggestSnoozeButton";

const snoozeItems = vi.fn();
vi.mock("../repo", () => ({ snoozeItems: (...a: unknown[]) => snoozeItems(...a) }));

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
    origin_item_id: null,
    origin_snapshot_date: "2026-09-01",
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
  snoozeItems.mockReset();
  // Mirrors the real bulk write, which returns how many rows it changed.
  snoozeItems.mockImplementation((ids: string[]) => Promise.resolve(ids.length));
});

describe("SuggestSnoozeButton", () => {
  it("disables itself when the day has nothing worth snoozing", () => {
    render(<SuggestSnoozeButton snapshot_date={DAY} items={[item({ origin_snapshot_date: DAY })]} />);
    expect(screen.getByRole("button", { name: /nothing to snooze/i })).toBeDisabled();
  });

  it("counts the suggestions on the button", () => {
    render(
      <SuggestSnoozeButton
        snapshot_date={DAY}
        items={[item({ id: "a" }), item({ id: "b" }), item({ id: "c", priority_rank: 2 })]}
      />,
    );
    expect(screen.getByRole("button", { name: /suggest snoozes · 2/i })).toBeEnabled();
  });

  it("snoozes the ticked tasks to their pre-filled date", async () => {
    render(<SuggestSnoozeButton snapshot_date={DAY} items={[item({ id: "a" }), item({ id: "b" })]} />);
    fireEvent.click(screen.getByRole("button", { name: /suggest snoozes/i }));
    fireEvent.click(screen.getByRole("button", { name: /^snooze 2 tasks$/i }));
    await waitFor(() => expect(snoozeItems).toHaveBeenCalledTimes(1));
    expect(snoozeItems).toHaveBeenCalledWith(["a", "b"], "2026-09-23");
    await screen.findByText("Snoozed 2 tasks");
  });

  it("drops an unticked task from the write", async () => {
    render(<SuggestSnoozeButton snapshot_date={DAY} items={[item({ id: "a" }), item({ id: "b", title: "Chase invoice" })]} />);
    fireEvent.click(screen.getByRole("button", { name: /suggest snoozes/i }));
    fireEvent.click(screen.getByRole("button", { name: /snooze chase invoice/i }));
    fireEvent.click(screen.getByRole("button", { name: /^snooze 1 task$/i }));
    await waitFor(() => expect(snoozeItems).toHaveBeenCalledWith(["a"], "2026-09-23"));
  });

  it("writes once per distinct wake-up date when a row is hand-edited", async () => {
    render(<SuggestSnoozeButton snapshot_date={DAY} items={[item({ id: "a" }), item({ id: "b", title: "Chase invoice" })]} />);
    fireEvent.click(screen.getByRole("button", { name: /suggest snoozes/i }));
    fireEvent.change(screen.getByLabelText(/wake chase invoice on/i), {
      target: { value: "2026-10-05" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^snooze 2 tasks$/i }));
    await waitFor(() => expect(snoozeItems).toHaveBeenCalledTimes(2));
    expect(snoozeItems).toHaveBeenCalledWith(["a"], "2026-09-23");
    expect(snoozeItems).toHaveBeenCalledWith(["b"], "2026-10-05");
  });

  it("re-dates every ticked row from a horizon chip", async () => {
    render(<SuggestSnoozeButton snapshot_date={DAY} items={[item({ id: "a" })]} />);
    fireEvent.click(screen.getByRole("button", { name: /suggest snoozes/i }));
    fireEvent.click(screen.getByRole("button", { name: "2 weeks" }));
    fireEvent.click(screen.getByRole("button", { name: /^snooze 1 task$/i }));
    await waitFor(() => expect(snoozeItems).toHaveBeenCalledWith(["a"], "2026-09-30"));
  });

  it("explains why a paused task is being offered", () => {
    render(<SuggestSnoozeButton snapshot_date={DAY} items={[item({ status: "paused", origin_snapshot_date: DAY })]} />);
    fireEvent.click(screen.getByRole("button", { name: /suggest snoozes/i }));
    expect(screen.getByText(/paused — on hold by hand/i)).toBeTruthy();
    expect(screen.queryByText(/no progress in/i)).toBeNull();
  });
});
