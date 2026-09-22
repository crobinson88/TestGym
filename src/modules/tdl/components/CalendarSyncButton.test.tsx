import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { TdlQuadrant } from "@/lib/database.types";
import type { SectionConfig } from "../sections";
import type { LocalTdlItem, TdlStatus } from "../types";
import { CalendarSyncButton } from "./CalendarSyncButton";

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ session: { access_token: "token" } }),
}));

function item(over: Partial<LocalTdlItem> = {}): LocalTdlItem {
  return {
    id: over.id ?? `id-${over.title ?? "x"}`,
    snapshot_date: "2026-07-27",
    section: "product",
    is_recurring: false,
    position: 0,
    title: "Task",
    due_date: null,
    time_estimate_min: null,
    status: "open" as TdlStatus,
    priority_rank: null,
    eisenhower_quadrant: null as TdlQuadrant | null,
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
    created_at: "2026-07-27T08:00:00.000Z",
    updated_at: "2026-07-27T08:00:00.000Z",
    deleted_at: null,
    sync_status: "synced",
    ...over,
  };
}

function cat(key: string, label: string): SectionConfig {
  return { key, label, hasDueDate: true, hasTimeEstimate: true, recurringSeeds: [] };
}

const CATEGORIES = [cat("daily-uuid", "Daily Tasks"), cat("product", "Product")];

// Two quick Priorities, one long one, a Daily Task, and a plain category task
// (opt-out on open) — enough to tell a per-heading bulk action apart from a
// length-range one that cuts across headings.
const ITEMS = [
  item({ id: "p1", title: "Quick prio", priority_rank: 1, time_estimate_min: 5 }),
  item({ id: "p2", title: "Short prio", priority_rank: 2, time_estimate_min: 15 }),
  item({ id: "p3", title: "Long prio", priority_rank: 3, time_estimate_min: 120 }),
  item({ id: "d1", title: "Quick daily", section: "daily-uuid", time_estimate_min: 10 }),
  item({ id: "c1", title: "Quick product", time_estimate_min: 10 }),
];

function openModal() {
  render(
    <CalendarSyncButton snapshot_date="2026-07-27" items={ITEMS} categories={CATEGORIES} />,
  );
  fireEvent.click(screen.getByRole("button", { name: /add calendar/i }));
}

// "3 of 4 scheduled …" — the count line is the readout for what is picked.
function scheduledCount(): number {
  const text = screen.getByText(/of \d+ scheduled/).textContent ?? "";
  return Number(/^(\d+) of/.exec(text.trim())?.[1] ?? -1);
}

// Titles are drawn twice — once as a row, once as a block on the day view — so
// every list assertion is scoped to the task pane.
function list() {
  return within(screen.getByRole("group", { name: "Tasks to schedule" }));
}

function groupHeader(label: string): HTMLElement {
  return list().getByText(label).closest("header") as HTMLElement;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ busy: [] }) })));
});

describe("CalendarSyncButton category selection", () => {
  it("deselects and reselects every task under one heading", () => {
    openModal();
    // The three headline groups open ticked; a plain category is opt-in.
    expect(scheduledCount()).toBe(4);

    fireEvent.click(within(groupHeader("Priority")).getByRole("button", { name: /^None$/ }));
    expect(scheduledCount()).toBe(1);
    expect(within(groupHeader("Priority")).getByText("0/3")).toBeTruthy();

    fireEvent.click(within(groupHeader("Priority")).getByRole("button", { name: /^All$/ }));
    expect(scheduledCount()).toBe(4);
    expect(within(groupHeader("Priority")).getByText("3/3")).toBeTruthy();
  });

  it("selects a category that starts opt-out without touching the others", () => {
    openModal();
    expect(within(groupHeader("Product")).getByText("0/1")).toBeTruthy();

    fireEvent.click(within(groupHeader("Product")).getByRole("button", { name: /^All$/ }));
    expect(scheduledCount()).toBe(5);
    expect(within(groupHeader("Priority")).getByText("3/3")).toBeTruthy();
  });
});

describe("CalendarSyncButton length range", () => {
  function openLengthPanel() {
    openModal();
    fireEvent.click(screen.getByRole("button", { name: /length/i }));
  }

  it("narrows the list to blocks in the range", () => {
    openLengthPanel();
    fireEvent.click(screen.getByRole("button", { name: "15m or less" }));

    expect(list().getByText("Quick prio")).toBeTruthy();
    expect(list().getByText("Short prio")).toBeTruthy();
    expect(list().queryByText("Long prio")).toBeNull();
    // An unticked category is still listed — the filter is orthogonal to
    // selection, so its short tasks can be picked up too.
    expect(list().getByText("Quick product")).toBeTruthy();
  });

  it("selects exactly the tasks in the range, across categories", () => {
    openLengthPanel();
    fireEvent.click(screen.getByRole("button", { name: "Deselect every task shown" }));
    expect(scheduledCount()).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: "15m or less" }));
    fireEvent.click(screen.getByRole("button", { name: /^Select these 4$/ }));
    expect(scheduledCount()).toBe(4);

    // The 2h block stays out once the filter is lifted.
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(list().getByText("Long prio")).toBeTruthy();
    expect(scheduledCount()).toBe(4);
  });

  it("takes a hand-typed window and deselects what it shows", () => {
    openLengthPanel();
    fireEvent.change(screen.getByLabelText(/minimum block length/i), {
      target: { value: "100" },
    });
    expect(list().queryByText("Quick prio")).toBeNull();
    expect(list().getByText("Long prio")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^Deselect these 1$/ }));
    expect(scheduledCount()).toBe(3);
  });

  it("stacks with the search box", () => {
    openLengthPanel();
    fireEvent.click(screen.getByRole("button", { name: "15m or less" }));
    fireEvent.change(screen.getByLabelText(/search tasks to schedule/i), {
      target: { value: "prio" },
    });
    expect(list().getByText("Quick prio")).toBeTruthy();
    expect(list().queryByText("Quick daily")).toBeNull();
    expect(screen.getByRole("button", { name: /^Select these 2$/ })).toBeTruthy();
  });
});

describe("CalendarSyncButton across several days", () => {
  it("moves a task that won't fit today onto the next day, whole", () => {
    openModal();
    fireEvent.change(screen.getByLabelText("and"), { target: { value: "11:00" } });
    const longRow = () => list().getByText("Long prio").closest("li") as HTMLElement;
    expect(longRow().textContent).toMatch(/won't fit before 11:00 AM/i);
    const before = scheduledCount();

    fireEvent.change(screen.getByLabelText("across"), { target: { value: "2" } });
    expect(longRow().textContent).toMatch(/Tue, Jul 28 · 9:00 AM · 2h/);
    expect(scheduledCount()).toBe(before + 1);
    expect(screen.getByRole("tab", { name: /Jul 28/ })).toBeTruthy();
  });
});
