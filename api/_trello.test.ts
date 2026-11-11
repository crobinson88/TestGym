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

const TGM = { name: "tgm123", displayName: "TGM" };
function boardBody(organization: unknown = TGM) {
  return {
    id: BOARD,
    name: "Ops",
    organization,
    lists: [{ id: LIST, name: "To do", pos: 1 }],
    labels: [{ id: LABEL, name: "Urgent", color: "red" }],
    members: [{ id: MEMBER, fullName: "Sam", username: "sam" }],
  };
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
      if (url.includes("/boards/")) return respond(boardBody());
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
      // The second label isn't on the board, so it's dropped.
      labelIds: [LABEL, "e".repeat(24)],
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
        if (url.includes("/boards/")) return respond(boardBody());
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

  it("refuses a board outside the TGM workspace, or a list not on the board", async () => {
    const { db } = fakeDb();
    vi.stubGlobal("fetch", vi.fn(async () => respond(boardBody({ name: "ddc", displayName: "DDC" }))));
    await expect(
      pushCards(db, { boardId: BOARD, listId: LIST, cards: [{ itemId: "a", name: "x" }] }),
    ).rejects.toThrow("not in the TGM workspace");

    vi.stubGlobal("fetch", vi.fn(async () => respond(boardBody())));
    await expect(
      pushCards(db, { boardId: BOARD, listId: "f".repeat(24), cards: [{ itemId: "a", name: "x" }] }),
    ).rejects.toThrow("isn't on this board");
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
          organization: TGM,
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
  it("offers only the TGM workspace's boards, sorted by name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        respond([
          { id: "1", name: "TGM Spec", url: "u1", organization: { name: "x", displayName: "TGM" } },
          { id: "2", name: "Loose", url: "u2", organization: null },
          { id: "3", name: "Areej Testing", url: "u3", organization: { name: "tgm", displayName: "Renamed" } },
          { id: "4", name: "DDC board", url: "u4", organization: { name: "ddc", displayName: "DDC" } },
          { id: "5", name: "Guest", url: "u5", organization: { name: "creatif", displayName: "Creatif" } },
        ]),
      ),
    );
    const boards = await listBoards();
    // Matched on display name or short name, case-insensitively.
    expect(boards.map((b) => b.name)).toEqual(["Areej Testing", "TGM Spec"]);
  });
});
