import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { LocalTdlItem } from "../types";
import type { SectionConfig } from "../sections";
import type { PushedCard } from "../trello";
import { PushToTrelloDialog } from "./PushToTrelloDialog";

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ session: { access_token: "tok" } }),
}));

let rows: LocalTdlItem[] = [];
vi.mock("@/lib/db", () => ({
  db: { tdl_items: { toArray: async () => rows } },
}));

vi.mock("../storage", () => ({
  tdlSignedUrlMap: async (paths: string[]) =>
    Object.fromEntries(paths.map((p) => [p, `https://signed/${p}`])),
  uploadTdlImages: async () => ["tdl/new.jpg"],
}));

const pushToTrello = vi.fn();
let pushedRows: PushedCard[] = [];
vi.mock("../trelloApi", () => ({
  fetchTrelloBoards: async () => ({
    workspace: "TGM",
    boards: [
      { id: "board-1", name: "Ops", url: "https://trello.com/b/1" },
      { id: "board-2", name: "Personal", url: "https://trello.com/b/2" },
    ],
  }),
  fetchTrelloBoard: async (_t: string, id: string) => ({
    id,
    name: id === "board-1" ? "Ops" : "Personal",
    lists: [
      { id: "list-1", name: "To do" },
      { id: "list-2", name: "Doing" },
    ],
    labels: [{ id: "label-1", name: "Urgent", color: "red" }],
    members: [{ id: "mem-1", fullName: "Sam Lee", username: "samlee" }],
  }),
  fetchPushedCards: async () => pushedRows,
  pushToTrello: (...a: unknown[]) => pushToTrello(...a),
}));

const CATEGORIES: SectionConfig[] = [
  { key: "product", label: "Product", hasDueDate: true, hasTimeEstimate: true, recurringSeeds: [] },
];

function item(over: Partial<LocalTdlItem> = {}): LocalTdlItem {
  return {
    id: "row-1",
    snapshot_date: "2026-11-11",
    section: "product",
    is_recurring: false,
    position: 0,
    title: "Ship the thing",
    due_date: "2026-11-20",
    time_estimate_min: 30,
    status: "open",
    priority_rank: null,
    eisenhower_quadrant: null,
    is_archived: false,
    snoozed_until: null,
    is_reluctant: false,
    reluctance_reason: null,
    last_worked_at: null,
    notes: "Check the copy",
    images: ["tdl/a.jpg"],
    board_list_id: null,
    workstream_id: null,
    origin_item_id: null,
    origin_snapshot_date: null,
    created_at: "2026-11-11T08:00:00.000Z",
    updated_at: "2026-11-11T08:00:00.000Z",
    deleted_at: null,
    sync_status: "synced",
    ...over,
  } as LocalTdlItem;
}

beforeEach(() => {
  localStorage.clear();
  pushToTrello.mockReset();
  pushToTrello.mockResolvedValue([
    { itemId: "row-1", ok: true, cardId: "c1", url: "https://trello.com/c/abc" },
  ]);
  pushedRows = [];
  rows = [
    item({ id: "root", snapshot_date: "2026-11-10" }),
    item({ origin_item_id: "root", origin_snapshot_date: "2026-11-10" }),
  ];
});

async function pickBoard(name = "Board") {
  expect(await screen.findByText("Board · TGM workspace")).toBeInTheDocument();
  await screen.findByRole("option", { name: "Ops" });
  fireEvent.change(screen.getByLabelText(name), { target: { value: "board-1" } });
  await screen.findByRole("option", { name: "To do" });
}

describe("PushToTrelloDialog", () => {
  it("pushes the edited card with the chosen list, labels, people and images", async () => {
    render(<PushToTrelloDialog itemIds={["row-1"]} categories={CATEGORIES} onClose={() => {}} />);

    const name = await screen.findByLabelText("Card name");
    expect(name).toHaveValue("Ship the thing");
    expect(screen.getByLabelText("Description")).toHaveValue(
      "Check the copy\n\n---\nFrom to-do list · Product · 30 min",
    );
    expect(screen.getByRole("button", { name: "Push to Trello" })).toBeDisabled();

    await pickBoard();
    fireEvent.change(screen.getByLabelText("List"), { target: { value: "list-2" } });
    fireEvent.click(await screen.findByRole("button", { name: /Urgent/ }));
    fireEvent.click(screen.getByRole("button", { name: /Sam Lee/ }));
    fireEvent.change(name, { target: { value: "Ship it" } });
    fireEvent.click(screen.getByRole("button", { name: "Add images" }));
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: { files: [new File(["x"], "new.jpg", { type: "image/jpeg" })] },
    });
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Leave image off the card" })).toHaveLength(2),
    );

    fireEvent.click(screen.getByRole("button", { name: "Push to Trello" }));
    await screen.findByText("1 card created");

    const [token, target, labels, members, cards] = pushToTrello.mock.calls[0];
    expect(token).toBe("tok");
    expect(target).toEqual({ boardId: "board-1", boardName: "Ops", listId: "list-2", listName: "Doing" });
    expect(labels).toEqual(["label-1"]);
    expect(members).toEqual(["mem-1"]);
    expect(cards).toEqual([
      expect.objectContaining({
        itemId: "row-1",
        // Keyed on the roll-forward chain root, not today's row.
        threadId: "root",
        name: "Ship it",
        images: ["tdl/a.jpg", "tdl/new.jpg"],
      }),
    ]);
    expect(screen.getByRole("link", { name: /Open card/ })).toHaveAttribute(
      "href",
      "https://trello.com/c/abc",
    );
    // The board + list are remembered for next time.
    expect(JSON.parse(localStorage.getItem("tdl:trelloTarget")!)).toEqual({
      boardId: "board-1",
      listId: "list-2",
    });
  });

  it("flags a task already on Trello and asks to push again", async () => {
    pushedRows = [
      {
        thread_id: "root",
        card_url: "https://trello.com/c/old",
        card_name: "Ship the thing",
        board_name: "Ops",
        list_name: "To do",
        created_at: "2026-11-10T10:00:00Z",
      },
    ];
    render(<PushToTrelloDialog itemIds={["row-1"]} categories={CATEGORIES} onClose={() => {}} />);
    await screen.findByText(/Already on Trello · Ops › To do/);
    await pickBoard();
    expect(screen.getByRole("button", { name: "Push again" })).toBeEnabled();
  });

  it("pushes a multi-selection as one card each, leaving out unticked tasks", async () => {
    rows = [item({ id: "a", title: "First" }), item({ id: "b", title: "Second" })];
    pushToTrello.mockResolvedValue([{ itemId: "a", ok: true, url: "https://trello.com/c/a" }]);
    render(<PushToTrelloDialog itemIds={["a", "b"]} categories={CATEGORIES} onClose={() => {}} />);

    await pickBoard();
    expect(screen.getByRole("button", { name: "Push 2 cards" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Leave out Second" }));
    fireEvent.click(screen.getByRole("button", { name: "Push to Trello" }));

    await waitFor(() => expect(pushToTrello).toHaveBeenCalled());
    const cards = pushToTrello.mock.calls[0][4] as { itemId: string }[];
    expect(cards.map((c) => c.itemId)).toEqual(["a"]);
  });
});
