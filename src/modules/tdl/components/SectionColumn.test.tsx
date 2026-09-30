import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent, within } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { SectionColumn } from "./SectionColumn";
import type { SectionConfig } from "../sections";
import type { LocalTdlItem } from "../types";
import type { LocalTdlWorkstream } from "@/lib/db";

const createWorkstream = vi.fn();

vi.mock("../completions", () => ({
  completeItems: vi.fn(),
  completeWorkstream: vi.fn(),
}));

vi.mock("../repo", () => ({
  archiveCategoryItems: vi.fn(),
  countCategoryItems: vi.fn(async () => 0),
  snoozeCategoryItems: vi.fn(),
  cycleStatus: vi.fn(),
  updateItem: vi.fn(),
  setPriorityRank: vi.fn(),
  setQuadrant: vi.fn(),
  snoozeItem: vi.fn(),
  snoozeItems: vi.fn(),
  archiveItems: vi.fn(),
  cancelItems: vi.fn(),
  deleteItems: vi.fn(),
  moveItemsToSection: vi.fn(),
  pauseItems: vi.fn(),
  resumeItems: vi.fn(),
  setReluctantItems: vi.fn(),
  unsnoozeItems: vi.fn(),
  createItem: vi.fn(),
  setReluctanceReason: vi.fn(),
  MAX_PRIORITY_RANK: 10,
}));

vi.mock("../workstreams", () => ({
  createWorkstream: (...a: unknown[]) => createWorkstream(...a),
  deleteWorkstream: vi.fn(),
  moveWorkstream: vi.fn(),
  renameWorkstream: vi.fn(),
  setItemsWorkstream: vi.fn(),
  useWorkstreams: () => [],
}));

vi.mock("../storage", () => ({
  tdlSignedUrlMap: vi.fn(async () => ({})),
  uploadTdlImages: vi.fn(async () => []),
}));

const CFG: SectionConfig = {
  key: "product",
  label: "Product",
  hasDueDate: false,
  hasTimeEstimate: false,
  recurringSeeds: [],
};

function ws(id: string, label: string, sort_order: number): LocalTdlWorkstream {
  return {
    id,
    category_key: "product",
    label,
    sort_order,
    completed_at: null,
    created_at: "",
    updated_at: "",
    deleted_at: null,
    sync_status: "synced",
  };
}

function item(id: string, title: string, workstream_id: string | null, position: number): LocalTdlItem {
  return {
    id,
    snapshot_date: "2026-09-28",
    section: "product",
    is_recurring: false,
    position,
    title,
    due_date: null,
    time_estimate_min: null,
    status: "open",
    priority_rank: null,
    eisenhower_quadrant: "schedule",
    is_archived: false,
    snoozed_until: null,
    is_reluctant: false,
    reluctance_reason: null,
    last_worked_at: null,
    notes: null,
    images: [],
    board_list_id: null,
    workstream_id,
    origin_item_id: null,
    origin_snapshot_date: "2026-09-28",
    created_at: "2026-09-28T00:00:00.000Z",
    updated_at: "2026-09-28T00:00:00.000Z",
    deleted_at: null,
    sync_status: "synced",
  } as LocalTdlItem;
}

function renderColumn(props: Partial<Parameters<typeof SectionColumn>[0]> = {}) {
  return render(
    <DndContext>
      <SectionColumn
        cfg={CFG}
        categories={[CFG]}
        snapshot_date="2026-09-28"
        recurring={[]}
        dated={[
          item("a", "Loose task", null, 0),
          item("b", "Invoice PDF", "w-billing", 1),
          item("c", "Welcome email", "w-onboard", 2),
        ]}
        takenRanks={new Set<number>()}
        {...props}
      />
    </DndContext>,
  );
}

beforeEach(() => {
  cleanup();
  createWorkstream.mockReset();
});

function groupOf(title: string) {
  return screen.getByText(title).closest("[data-workstream-group]")!.getAttribute("data-workstream-group");
}

describe("SectionColumn workstreams", () => {
  it("renders flat quadrant groups when the category has no workstreams", () => {
    const { container } = renderColumn();
    expect(container.querySelector("[data-workstream-group]")).toBeNull();
    expect(screen.getByText("Loose task")).toBeTruthy();
  });

  it("sub-groups items under their workstream, ungrouped last", () => {
    const { container } = renderColumn({
      workstreams: [ws("w-onboard", "Onboarding", 1), ws("w-billing", "Billing", 0), ws("w-empty", "Later", 2)],
    });
    const order = [...container.querySelectorAll("[data-workstream-group]")].map((el) =>
      el.getAttribute("data-workstream-group"),
    );
    expect(order).toEqual(["w-billing", "w-onboard", "w-empty", "none"]);
    expect(groupOf("Invoice PDF")).toBe("w-billing");
    expect(groupOf("Welcome email")).toBe("w-onboard");
    expect(groupOf("Loose task")).toBe("none");
    expect(screen.getByText("No workstream")).toBeTruthy();
    const empty = container.querySelector('[data-workstream-group="w-empty"]') as HTMLElement;
    expect(within(empty).getByText("No tasks yet.")).toBeTruthy();
  });

  it("collapses a workstream from its header", () => {
    renderColumn({ workstreams: [ws("w-billing", "Billing", 0)] });
    fireEvent.click(screen.getByRole("button", { name: "Collapse Billing" }));
    expect(screen.getByRole("button", { name: "Expand Billing" })).toBeTruthy();
    expect(screen.getByText("Invoice PDF").closest(".hidden")).not.toBeNull();
  });

  it("creates a workstream from the column menu", async () => {
    renderColumn();
    fireEvent.click(screen.getByRole("button", { name: "More options for Product" }));
    fireEvent.click(screen.getByRole("button", { name: /New workstream/ }));
    const input = screen.getByLabelText("New workstream name");
    fireEvent.change(input, { target: { value: "  Billing  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(createWorkstream).toHaveBeenCalledWith("product", "Billing");
  });

  it("opens an add-task composer inside a workstream", () => {
    renderColumn({ workstreams: [ws("w-billing", "Billing", 0)] });
    fireEvent.click(screen.getByRole("button", { name: "Add task to Billing" }));
    const group = document.querySelector('[data-workstream-group="w-billing"]') as HTMLElement;
    expect(within(group).getByLabelText("Task title")).toBeTruthy();
  });
});
