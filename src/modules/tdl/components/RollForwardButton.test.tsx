import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SectionConfig } from "../sections";
import type { LocalTdlItem } from "../types";
import type { RollForwardPlan } from "../rollForward";
import { RollForwardButton } from "./RollForwardButton";

const planRollForward = vi.fn();
const applyRollForward = vi.fn();

vi.mock("../rollForward", () => ({
  planRollForward: (...a: unknown[]) => planRollForward(...a),
  applyRollForward: (...a: unknown[]) => applyRollForward(...a),
}));

vi.mock("@/lib/sync", () => ({ syncEngine: { drain: vi.fn() } }));

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

vi.mock("../hooks", () => ({
  usePrevDateWithItems: () => "2026-09-10",
  useKnownDates: () => ["2026-09-08", "2026-09-09", "2026-09-10"],
}));

function item(over: Partial<LocalTdlItem> = {}): LocalTdlItem {
  return {
    id: "row-1",
    snapshot_date: "2026-09-11",
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
    origin_snapshot_date: null,
    created_at: "2026-09-11T08:00:00.000Z",
    updated_at: "2026-09-11T08:00:00.000Z",
    deleted_at: null,
    sync_status: "pending",
    ...over,
  } as LocalTdlItem;
}

function plan(over: Partial<RollForwardPlan> = {}): RollForwardPlan {
  return {
    fromDate: "2026-09-10",
    toDate: "2026-09-11",
    carry: [],
    duplicates: [],
    ...over,
  };
}

function openPicker() {
  render(<RollForwardButton toDate="2026-09-11" />);
  fireEvent.click(screen.getByRole("button", { name: /roll forward/i }));
}

beforeEach(() => {
  planRollForward.mockReset();
  applyRollForward.mockReset();
  applyRollForward.mockResolvedValue({ created: 1, carried: 1, skipped: 0, daySeeded: false });
});

describe("RollForwardButton", () => {
  it("defaults the source date to the last day with tasks", () => {
    openPicker();
    expect(screen.getByLabelText(/carry tasks from/i)).toHaveValue("2026-09-10");
  });

  it("rolls from any date the user picks, not just yesterday", async () => {
    planRollForward.mockResolvedValue(plan({ fromDate: "2026-09-08", carry: [item()] }));
    openPicker();
    fireEvent.change(screen.getByLabelText(/carry tasks from/i), {
      target: { value: "2026-09-08" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^roll forward from/i }));
    await waitFor(() => expect(planRollForward).toHaveBeenCalledWith("2026-09-08", "2026-09-11"));
  });

  it("offers recent days with tasks as one-tap picks", async () => {
    planRollForward.mockResolvedValue(plan({ carry: [item()] }));
    openPicker();
    fireEvent.click(screen.getByRole("button", { name: /Sep 8$/ }));
    fireEvent.click(screen.getByRole("button", { name: /^roll forward from/i }));
    await waitFor(() => expect(planRollForward).toHaveBeenCalledWith("2026-09-08", "2026-09-11"));
  });

  it("applies straight away when nothing looks like a duplicate", async () => {
    const row = item();
    planRollForward.mockResolvedValue(plan({ carry: [row] }));
    openPicker();
    fireEvent.click(screen.getByRole("button", { name: /^roll forward from/i }));
    await waitFor(() => expect(applyRollForward).toHaveBeenCalledWith("2026-09-11", [row]));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the duplicates for confirmation instead of adding them", async () => {
    const dupe = item({ id: "dupe-1", title: "Call Sam" });
    planRollForward.mockResolvedValue(
      plan({
        carry: [item({ id: "new-1", title: "Email Kyp" })],
        duplicates: [{ row: dupe, existing: item({ id: "there" }), reason: "title" }],
      }),
    );
    openPicker();
    fireEvent.click(screen.getByRole("button", { name: /^roll forward from/i }));

    await screen.findByText(/check these duplicates/i);
    expect(applyRollForward).not.toHaveBeenCalled();
    expect(screen.getByText("Call Sam")).toBeInTheDocument();
    expect(screen.getByText(/already in this category today/i)).toBeInTheDocument();
  });

  it("skips duplicates by default, carrying only the new tasks", async () => {
    const fresh = item({ id: "new-1", title: "Email Kyp" });
    const dupe = item({ id: "dupe-1" });
    planRollForward.mockResolvedValue(
      plan({
        carry: [fresh],
        duplicates: [{ row: dupe, existing: item({ id: "there" }), reason: "chain" }],
      }),
    );
    openPicker();
    fireEvent.click(screen.getByRole("button", { name: /^roll forward from/i }));
    fireEvent.click(await screen.findByRole("button", { name: /add 1 task/i }));
    await waitFor(() => expect(applyRollForward).toHaveBeenCalledWith("2026-09-11", [fresh]));
  });

  it("adds a duplicate the user confirms is genuinely separate", async () => {
    const fresh = item({ id: "new-1", title: "Email Kyp" });
    const dupe = item({ id: "dupe-1", title: "Call Sam" });
    planRollForward.mockResolvedValue(
      plan({
        carry: [fresh],
        duplicates: [{ row: dupe, existing: item({ id: "there" }), reason: "title" }],
      }),
    );
    openPicker();
    fireEvent.click(screen.getByRole("button", { name: /^roll forward from/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Call Sam/i }));
    fireEvent.click(screen.getByRole("button", { name: /add 2 tasks/i }));
    await waitFor(() =>
      expect(applyRollForward).toHaveBeenCalledWith("2026-09-11", [fresh, dupe]),
    );
  });

  it("says so when the chosen day has nothing to carry", async () => {
    planRollForward.mockResolvedValue(plan());
    openPicker();
    fireEvent.click(screen.getByRole("button", { name: /^roll forward from/i }));
    expect(await screen.findByText(/nothing to carry from/i)).toBeInTheDocument();
    expect(applyRollForward).not.toHaveBeenCalled();
  });
});
