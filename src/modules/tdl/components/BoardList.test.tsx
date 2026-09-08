import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { BoardList } from "./BoardList";
import type { SectionConfig } from "../sections";
import type { LocalTdlItem } from "../types";

const cycleStatus = vi.fn();
const countCategoryItems = vi.fn();
const archiveCategoryItems = vi.fn();
const renameCategory = vi.fn();
const deleteCategory = vi.fn();

vi.mock("../repo", () => ({
  cycleStatus: (...a: unknown[]) => cycleStatus(...a),
  snoozeItems: vi.fn(),
  updateItem: vi.fn(),
  archiveItems: vi.fn(),
  cancelItems: vi.fn(),
  deleteItems: vi.fn(),
  moveItemsToSection: vi.fn(),
  pauseItems: vi.fn(),
  resumeItems: vi.fn(),
  setReluctantItems: vi.fn(),
  unsnoozeItems: vi.fn(),
  createItem: vi.fn(),
  countCategoryItems: (...a: unknown[]) => countCategoryItems(...a),
  archiveCategoryItems: (...a: unknown[]) => archiveCategoryItems(...a),
  snoozeCategoryItems: vi.fn(),
}));

vi.mock("../categories", () => ({
  renameCategory: (...a: unknown[]) => renameCategory(...a),
  deleteCategory: (...a: unknown[]) => deleteCategory(...a),
  setCategoryArchived: vi.fn(),
}));

vi.mock("../storage", () => ({
  tdlSignedUrlMap: vi.fn(async () => ({})),
  uploadTdlImages: vi.fn(async () => []),
}));

const CFG: SectionConfig = {
  key: "tgm_tasks",
  label: "TGM Tasks",
  hasDueDate: true,
  hasTimeEstimate: true,
  recurringSeeds: [],
};

function item(over: Partial<LocalTdlItem> = {}): LocalTdlItem {
  return {
    id: "item-1",
    snapshot_date: "2026-09-08",
    section: "tgm_tasks",
    is_recurring: false,
    position: 0,
    title: "Reconcile the deck",
    due_date: null,
    time_estimate_min: 60,
    status: "open",
    priority_rank: 3,
    eisenhower_quadrant: "do_first",
    is_archived: false,
    snoozed_until: null,
    is_reluctant: false,
    reluctance_reason: null,
    last_worked_at: null,
    notes: null,
    images: [],
    origin_item_id: null,
    origin_snapshot_date: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    deleted_at: null,
    sync_status: "synced",
    ...over,
  } as LocalTdlItem;
}

function renderLane(cards: LocalTdlItem[], props: Record<string, unknown> = {}) {
  return render(
    <DndContext>
      <BoardList
        cfg={CFG}
        categories={[CFG]}
        snapshot_date="2026-09-08"
        cards={cards}
        rowId="cat-row-1"
        {...props}
      />
    </DndContext>,
  );
}

beforeEach(() => {
  cycleStatus.mockReset();
  countCategoryItems.mockReset().mockResolvedValue(2);
  renameCategory.mockReset();
  deleteCategory.mockReset();
});

describe("BoardList", () => {
  it("renders each item as a card with its badges", () => {
    renderLane([item()]);
    expect(screen.getByText("Reconcile the deck")).toBeTruthy();
    expect(screen.getByText("P3")).toBeTruthy();
    expect(screen.getByText("DF")).toBeTruthy();
    expect(screen.getByText("60m")).toBeTruthy();
  });

  it("counts what is still outstanding in the lane", () => {
    renderLane([item(), item({ id: "b", status: "done" }), item({ id: "c", status: "worked_today" })]);
    expect(screen.getByText(/^2$/)).toBeTruthy();
    expect(screen.getByText("· 1✓")).toBeTruthy();
  });

  it("cycles a card's status straight from the board", () => {
    renderLane([item()]);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(cycleStatus).toHaveBeenCalledWith("item-1");
  });

  it("offers an empty lane as a drop target", () => {
    renderLane([]);
    expect(screen.getByText("Drop a card here.")).toBeTruthy();
  });

  it("renames the list in place", () => {
    renderLane([item()]);
    fireEvent.click(screen.getByRole("button", { name: /More options for TGM Tasks/ }));
    fireEvent.click(screen.getByRole("button", { name: /Rename list/ }));
    const input = screen.getByLabelText("List name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  TGM  " } });
    fireEvent.blur(input);
    expect(renameCategory).toHaveBeenCalledWith("cat-row-1", "TGM");
  });

  it("takes two taps to delete a list", async () => {
    renderLane([item()]);
    fireEvent.click(screen.getByRole("button", { name: /More options for TGM Tasks/ }));
    fireEvent.click(screen.getByRole("button", { name: /Delete list/ }));
    expect(deleteCategory).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Delete this list\?/ }));
    await waitFor(() => expect(deleteCategory).toHaveBeenCalledWith("cat-row-1"));
  });

  it("mirror lanes are read-only: no composer, no drag handles", () => {
    renderLane([item()], { mirror: "do_first", rowId: undefined });
    expect(screen.queryByRole("button", { name: /Add a card/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Drag Reconcile the deck/ })).toBeNull();
  });
});
