import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { SectionConfig } from "../sections";
import type { LocalTdlItem } from "../types";
import type { SweepCandidate } from "../completed";
import { CloseOutWeekButton } from "./CloseOutWeekButton";

const logSweep = vi.fn();
let candidates: SweepCandidate<LocalTdlItem>[] = [];

vi.mock("../completions", () => ({
  logSweep: (...a: unknown[]) => logSweep(...a),
  useSweepCandidates: () => candidates,
}));

const CATEGORIES: SectionConfig[] = [
  {
    key: "product",
    label: "Product",
    hasDueDate: true,
    hasTimeEstimate: true,
    recurringSeeds: [],
  },
];
vi.mock("../categories", () => ({ useCategories: () => CATEGORIES }));

const DAY = "2026-09-30"; // Wednesday

function candidate(over: Partial<LocalTdlItem> = {}): SweepCandidate<LocalTdlItem> {
  const item = {
    id: over.id ?? "row-1",
    snapshot_date: over.snapshot_date ?? DAY,
    section: over.section ?? "product",
    is_recurring: false,
    position: 0,
    title: over.title ?? "Ship the thing",
    due_date: null,
    time_estimate_min: over.time_estimate_min ?? null,
    status: "done",
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
    origin_snapshot_date: null,
    created_at: `${DAY}T08:00:00.000Z`,
    updated_at: `${DAY}T08:00:00.000Z`,
    deleted_at: null,
    sync_status: "synced",
    ...over,
  } as LocalTdlItem;
  return { item, threadId: over.id ?? "row-1" };
}

beforeEach(() => {
  logSweep.mockReset();
  logSweep.mockImplementation((rows: SweepCandidate<LocalTdlItem>[]) => Promise.resolve(rows.length));
  candidates = [];
});

describe("CloseOutWeekButton", () => {
  it("stays out of the way when the week has nothing to log", () => {
    render(<CloseOutWeekButton snapshot_date={DAY} />);
    expect(screen.queryByRole("button", { name: /close out week/i })).toBeNull();
  });

  it("counts what the week is holding", () => {
    candidates = [candidate({ id: "a" }), candidate({ id: "b" })];
    render(<CloseOutWeekButton snapshot_date={DAY} />);
    expect(screen.getByRole("button", { name: /close out week \(2\)/i })).toBeEnabled();
  });

  it("writes nothing until the sweep is confirmed", () => {
    candidates = [candidate({ id: "a" })];
    render(<CloseOutWeekButton snapshot_date={DAY} />);
    fireEvent.click(screen.getByRole("button", { name: /close out week/i }));
    expect(screen.getByText(/nothing is written until you confirm/i)).toBeTruthy();
    expect(logSweep).not.toHaveBeenCalled();
  });

  it("shows the week the sweep covers, not the day it is run on", () => {
    candidates = [candidate({ id: "a" })];
    render(<CloseOutWeekButton snapshot_date={DAY} />);
    fireEvent.click(screen.getByRole("button", { name: /close out week/i }));
    expect(screen.getByText(/28 Sep – 04 Oct/)).toBeTruthy();
  });

  it("logs the ticked tasks", async () => {
    candidates = [candidate({ id: "a" }), candidate({ id: "b" })];
    render(<CloseOutWeekButton snapshot_date={DAY} />);
    fireEvent.click(screen.getByRole("button", { name: /close out week/i }));
    fireEvent.click(screen.getByRole("button", { name: /^complete 2$/i }));
    await waitFor(() => expect(logSweep).toHaveBeenCalledTimes(1));
    expect(logSweep.mock.calls[0][0].map((c: SweepCandidate) => c.threadId)).toEqual(["a", "b"]);
    await screen.findByText(/logged 2 tasks to this week/i);
  });

  it("drops an unticked task from the write", async () => {
    candidates = [candidate({ id: "a" }), candidate({ id: "b", title: "Chase invoice" })];
    render(<CloseOutWeekButton snapshot_date={DAY} />);
    fireEvent.click(screen.getByRole("button", { name: /close out week/i }));
    fireEvent.click(screen.getByRole("button", { name: /skip chase invoice/i }));
    fireEvent.click(screen.getByRole("button", { name: /^complete 1$/i }));
    await waitFor(() => expect(logSweep).toHaveBeenCalledTimes(1));
    expect(logSweep.mock.calls[0][0].map((c: SweepCandidate) => c.threadId)).toEqual(["a"]);
  });

  it("can't confirm an empty sweep", () => {
    candidates = [candidate({ id: "a" })];
    render(<CloseOutWeekButton snapshot_date={DAY} />);
    fireEvent.click(screen.getByRole("button", { name: /close out week/i }));
    fireEvent.click(screen.getByRole("button", { name: /skip ship the thing/i }));
    expect(screen.getByRole("button", { name: /^complete 0$/i })).toBeDisabled();
  });

  it("totals the ticked work", () => {
    candidates = [
      candidate({ id: "a", time_estimate_min: 90 }),
      candidate({ id: "b", time_estimate_min: 45 }),
    ];
    render(<CloseOutWeekButton snapshot_date={DAY} />);
    fireEvent.click(screen.getByRole("button", { name: /close out week/i }));
    expect(screen.getByText(/2 of 2 ticked · 2h 15m of work/i)).toBeTruthy();
  });
});
