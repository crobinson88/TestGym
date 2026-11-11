import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { boardMeta, listBoards, pushCards } from "./_trello";
import type { Db } from "./_fireflies";

const BOARD = "a".repeat(24);
const LIST = "b".repeat(24);
const LABEL = "c".repeat(24);
const MEMBER = "d".repeat(24);

type Call = { url: string; init: RequestInit };
let calls: Call[];

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function fakeDb() {
  const inserts: unknown[] = [];
  const downloads: string[] = [];
  const db = {
    storage: {
      from: () => ({
        download: async (path: string) => {
          downloads.push(path);
          return { data: new Blob(["img"], { type: "image/png" }), error: null };
        },
      }),
    },
    from: () => ({
      insert: async (row: unknown) => {
        inserts.push(row);
        return { error: null };
      },
    }),
  };
  return { db: db as unknown as Db, inserts, downloads };
}

beforeEach(() => {
  process.env.TRELLO_API_KEY = "key";
  process.env.TRELLO_TOKEN = "tok";
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      if (url.endsWith("/cards")) return respond({ id: "card1", shortUrl: "https://trello.com/c/x" });
      if (url.includes("/attachments")) return respond({ id: "att" });
      return respond({});
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pushCards", () => {
  it("creates the card with labels + members, attaches tdl/ images and logs it", async () => {
    const { db, inserts, downloads } = fakeDb();
    const results = await pushCards(db, {
      boardId: BOARD,
      boardName: "Ops",
      listId: LIST,
      listName: "To do",
      labelIds: [LABEL, "not-an-id"],
      memberIds: [MEMBER],
      cards: [
        {
          itemId: "item-1",
          threadId: "root-1",
          name: " Call Sam ",
          desc: "notes",
          due: "2026-11-20T14:00:00.000Z",
          images: ["tdl/a.png", "trades/secret.png"],
        },
      ],
    });

    expect(results).toEqual([
      { itemId: "item-1", ok: true, cardId: "card1", url: "https://trello.com/c/x", attachFailed: 1 },
    ]);
    const create = calls.find((c) => c.url.endsWith("/cards"))!;
    expect(JSON.parse(String(create.init.body))).toMatchObject({
      idList: LIST,
      name: "Call Sam",
      desc: "notes",
      due: "2026-11-20T14:00:00.000Z",
      idLabels: LABEL,
      idMembers: MEMBER,
    });
    expect(String((create.init.headers as Record<string, string>).Authorization)).toContain(
      'oauth_token="tok"',
    );
    expect(create.url).not.toContain("tok");
    // Only the to-do list's own objects leave the bucket.
    expect(downloads).toEqual(["tdl/a.png"]);
    expect(calls.filter((c) => c.url.includes("/attachments"))).toHaveLength(1);
    expect(inserts).toEqual([
      expect.objectContaining({
        thread_id: "root-1",
        item_id: "item-1",
        board_id: BOARD,
        list_id: LIST,
        card_id: "card1",
        card_url: "https://trello.com/c/x",
        card_name: "Call Sam",
      }),
    ]);
  });

  it("reports a failed card without stopping the rest", async () => {
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/cards") && n++ === 0) return new Response("invalid list", { status: 400 });
        return respond({ id: "card2", url: "https://trello.com/c/y" });
      }),
    );
    const { db } = fakeDb();
    const results = await pushCards(db, {
      boardId: BOARD,
      listId: LIST,
      cards: [
        { itemId: "a", name: "One" },
        { itemId: "b", name: "Two" },
      ],
    });
    expect(results[0]).toMatchObject({ itemId: "a", ok: false });
    expect(results[0].error).toContain("400");
    expect(results[1]).toMatchObject({ itemId: "b", ok: true, url: "https://trello.com/c/y" });
  });

  it("refuses a push with no target or no named cards", async () => {
    const { db } = fakeDb();
    await expect(pushCards(db, { boardId: BOARD, cards: [{ itemId: "a", name: "x" }] })).rejects.toThrow(
      "pick a board and a list",
    );
    await expect(
      pushCards(db, { boardId: BOARD, listId: LIST, cards: [{ itemId: "a", name: "  " }] }),
    ).rejects.toThrow("no cards");
  });
});

describe("boardMeta", () => {
  it("orders lists by position and normalises labels", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        respond({
          id: BOARD,
          name: "Ops",
          lists: [
            { id: "l2", name: "Doing", pos: 200 },
            { id: "l1", name: "To do", pos: 100 },
          ],
          labels: [{ id: "x", name: null, color: null }],
          members: [{ id: "m", fullName: "Sam", username: "sam" }],
        }),
      ),
    );
    const meta = await boardMeta(BOARD);
    expect(meta.lists.map((l) => l.name)).toEqual(["To do", "Doing"]);
    expect(meta.labels).toEqual([{ id: "x", name: "", color: null }]);
    expect(meta.members).toEqual([{ id: "m", fullName: "Sam", username: "sam" }]);
  });

  it("rejects a malformed board id before calling Trello", async () => {
    await expect(boardMeta("../members/me")).rejects.toThrow("bad board id");
  });
});

describe("listBoards", () => {
  it("returns every board with its workspace, sorted by workspace then name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        respond([
          { id: "1", name: "Zeta", url: "u1", organization: { displayName: "TGM" } },
          { id: "2", name: "Alpha", url: "u2", organization: null },
          { id: "3", name: "Beta", url: "u3", organization: { displayName: "TGM" } },
        ]),
      ),
    );
    const boards = await listBoards();
    expect(boards.map((b) => [b.workspace, b.name])).toEqual([
      ["TGM", "Beta"],
      ["TGM", "Zeta"],
      [null, "Alpha"],
    ]);
  });
});
