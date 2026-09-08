import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { BoardList } from "./BoardList";
import type { SectionConfig } from "../sections";
import type { LocalTdlItem } from "../types";
import type { LocalTdlBoardList } from "@/lib/db";

const cycleStatus = vi.fn();
const renameBoardList = vi.fn();
const deleteBoardList = vi.fn();

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
}));

vi.mock("../boardLists", () => ({
  renameBoardList: (...a: unknown[]) => renameBoardList(...a),
  deleteBoardList: (...a: unknown[]) => deleteBoardList(...a),
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

const LIST: LocalTdlBoardList = {
  id: "list-doing",
  category_key: "tgm_tasks",
  label: "In progress",
  sort_order: 1,
  created_at: "",
  updated_at: "",
  deleted_at: null,
  sync_status: "synced",
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
    board_list_id: "list-doing",
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
        list={LIST}
        cfg={CFG}
        categories={[CFG]}
        snapshot_date="2026-09-08"
        cards={cards}
        {...props}
      />
    </DndContext>,
  );
}

beforeEach(() => {
  cycleStatus.mockReset();
  renameBoardList.mockReset();
  deleteBoardList.mockReset();
});

describe("BoardList", () => {
  it("renders each card in the list with its badges", () => {
    renderLane([item()]);
    expect(screen.getByText("In progress")).toBeTruthy();
    expect(screen.getByText("Reconcile the deck")).toBeTruthy();
    expect(screen.getByText("P3")).toBeTruthy();
    expect(screen.getByText("DF")).toBeTruthy();
    expect(screen.getByText("60m")).toBeTruthy();
  });

  it("counts what is still outstanding in the lane", () => {
    renderLane([item(), item({ id: "b", status: "done" }), item({ id: "c", status: "worked_today" })]);
    // The badge reads "2 · 1✓": two still to do, one done.
    expect(screen.getByText("· 1✓").parentElement?.textContent).toBe("2 · 1✓");
  });

  it("cycles a card's status without leaving the board", () => {
    renderLane([item()]);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(cycleStatus).toHaveBeenCalledWith("item-1");
  });

  it("offers an empty list as a drop target", () => {
    renderLane([]);
    expect(screen.getByText("Drop a card here.")).toBeTruthy();
  });

  it("renames the list in place", () => {
    renderLane([item()]);
    fireEvent.click(screen.getByRole("button", { name: /More options for In progress/ }));
    fireEvent.click(screen.getByRole("button", { name: /Rename list/ }));
    const input = screen.getByLabelText("List name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  Doing  " } });
    fireEvent.blur(input);
    expect(renameBoardList).toHaveBeenCalledWith("list-doing", "Doing");
  });

  it("takes two taps to delete a list, and says where the cards go", async () => {
    renderLane([item()]);
    fireEvent.click(screen.getByRole("button", { name: /More options for In progress/ }));
    fireEvent.click(screen.getByRole("button", { name: /Delete list/ }));
    expect(deleteBoardList).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /1 card move to the first list/ }));
    await waitFor(() => expect(deleteBoardList).toHaveBeenCalledWith("list-doing"));
  });
});
