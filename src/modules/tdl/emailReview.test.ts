import { describe, expect, it } from "vitest";
import {
  type EmailCandidate,
  type ReviewRuling,
  SWIPE_COMMIT_MIN_PX,
  SWIPE_SLOP_PX,
  appendCandidates,
  candidateKey,
  describeReview,
  isHorizontalSwipe,
  ledgerRows,
  orderCandidates,
  resolveTitle,
  reviewNotes,
  senderName,
  suggestedCount,
  summariseReview,
  swipeCommitted,
  swipeOffset,
  swipeProgress,
  swipeThreshold,
} from "./emailReview";

function candidate(over: Partial<EmailCandidate> = {}): EmailCandidate {
  return {
    accountId: "acct-1",
    accountLabel: "The Glass Market",
    threadId: "t1",
    from: '"Kyp B" <kyp@example.com>',
    subject: "Ocean Rd quote",
    snippet: "Can you confirm the glazing spec",
    url: "https://mail.google.com/mail/u/0/#inbox/t1",
    receivedAt: "2026-10-02T09:00:00.000Z",
    suggested: true,
    title: "Reply to Kyp on the Ocean Rd quote",
    action: "Wants the glazing spec confirmed by Friday.",
    ...over,
  };
}

function ruling(over: Partial<ReviewRuling> = {}): ReviewRuling {
  return {
    candidate: candidate(),
    action: "add",
    title: "Reply to Kyp on the Ocean Rd quote",
    section: "tgm_tasks",
    ...over,
  };
}

describe("candidateKey", () => {
  it("scopes a thread to its mailbox, so the same thread in two accounts is two cards", () => {
    const a = candidate({ accountId: "acct-1", threadId: "shared" });
    const b = candidate({ accountId: "acct-2", threadId: "shared" });
    expect(candidateKey(a)).not.toBe(candidateKey(b));
  });
});

describe("orderCandidates", () => {
  it("puts Claude's picks first, newest first within each group", () => {
    const list = [
      candidate({
        threadId: "old-pick",
        suggested: true,
        receivedAt: "2026-10-01T09:00:00.000Z",
      }),
      candidate({
        threadId: "new-skip",
        suggested: false,
        receivedAt: "2026-10-03T09:00:00.000Z",
      }),
      candidate({
        threadId: "new-pick",
        suggested: true,
        receivedAt: "2026-10-03T10:00:00.000Z",
      }),
    ];
    expect(orderCandidates(list).map((c) => c.threadId)).toEqual([
      "new-pick",
      "old-pick",
      "new-skip",
    ]);
  });

  it("sorts undated mail last rather than letting it jump the queue", () => {
    const list = [
      candidate({ threadId: "undated", receivedAt: null }),
      candidate({ threadId: "dated", receivedAt: "2026-09-01T09:00:00.000Z" }),
    ];
    expect(orderCandidates(list).map((c) => c.threadId)).toEqual([
      "dated",
      "undated",
    ]);
  });

  it("drops a thread offered twice for the same mailbox", () => {
    const list = [candidate(), candidate()];
    expect(orderCandidates(list)).toHaveLength(1);
  });

  it("leaves the input array alone", () => {
    const list = [
      candidate({ threadId: "b", suggested: false }),
      candidate({ threadId: "a", suggested: true }),
    ];
    orderCandidates(list);
    expect(list.map((c) => c.threadId)).toEqual(["b", "a"]);
  });
});

describe("suggestedCount", () => {
  it("counts only what Claude flagged as a task", () => {
    expect(
      suggestedCount([
        candidate({ threadId: "a", suggested: true }),
        candidate({ threadId: "b", suggested: false }),
        candidate({ threadId: "c", suggested: true }),
      ]),
    ).toBe(2);
  });
});

describe("senderName", () => {
  it("reads the display name out of a full From header", () => {
    expect(senderName('"Kyp B" <kyp@example.com>')).toBe("Kyp B");
    expect(senderName("Kyp B <kyp@example.com>")).toBe("Kyp B");
  });

  it("falls back to the address when there is no name", () => {
    expect(senderName("<kyp@example.com>")).toBe("kyp@example.com");
    expect(senderName("kyp@example.com")).toBe("kyp@example.com");
  });

  it("is empty for an empty header", () => {
    expect(senderName("   ")).toBe("");
  });
});

describe("reviewNotes", () => {
  it("carries the sender, subject, mailbox, the ask and the link back", () => {
    expect(reviewNotes(candidate())).toBe(
      [
        'From: "Kyp B" <kyp@example.com>',
        "Subject: Ocean Rd quote",
        "Mailbox: The Glass Market",
        "Wants the glazing spec confirmed by Friday.",
        "https://mail.google.com/mail/u/0/#inbox/t1",
      ].join("\n"),
    );
  });

  it("leaves out an empty subject and an empty ask", () => {
    expect(reviewNotes(candidate({ subject: "  ", action: "" }))).toBe(
      [
        'From: "Kyp B" <kyp@example.com>',
        "Mailbox: The Glass Market",
        "https://mail.google.com/mail/u/0/#inbox/t1",
      ].join("\n"),
    );
  });
});

describe("resolveTitle", () => {
  it("prefers the edited title", () => {
    expect(resolveTitle(candidate(), "  Call Kyp instead ")).toBe(
      "Call Kyp instead",
    );
  });

  it("falls back through the suggestion, then the subject", () => {
    expect(resolveTitle(candidate(), "   ")).toBe(
      "Reply to Kyp on the Ocean Rd quote",
    );
    expect(resolveTitle(candidate({ title: "" }), null)).toBe("Ocean Rd quote");
  });

  it("never returns an empty title", () => {
    expect(resolveTitle(candidate({ title: "", subject: "" }), "")).toBe(
      "(no subject)",
    );
  });
});

describe("ledgerRows", () => {
  it("records added and skipped rulings, and nothing for a left-for-later one", () => {
    const rows = ledgerRows([
      ruling({ candidate: candidate({ threadId: "a" }), action: "add" }),
      ruling({ candidate: candidate({ threadId: "b" }), action: "skip" }),
      ruling({ candidate: candidate({ threadId: "c" }), action: "later" }),
    ]);
    expect(rows.map((r) => [r.thread_id, r.ruling])).toEqual([
      ["a", "added"],
      ["b", "skipped"],
    ]);
  });

  it("attaches the created task id to the ruling it came from", () => {
    const added = candidate({ threadId: "a" });
    const skipped = candidate({ threadId: "b" });
    const rows = ledgerRows(
      [
        ruling({ candidate: added, action: "add" }),
        ruling({ candidate: skipped, action: "skip" }),
      ],
      new Map([[candidateKey(added), "item-1"]]),
    );
    expect(rows[0].item_id).toBe("item-1");
    expect(rows[1].item_id).toBeNull();
  });
});

describe("summariseReview / describeReview", () => {
  it("tallies each kind of ruling", () => {
    const rulings = [
      ruling({ action: "add", candidate: candidate({ threadId: "a" }) }),
      ruling({ action: "add", candidate: candidate({ threadId: "b" }) }),
      ruling({ action: "skip", candidate: candidate({ threadId: "c" }) }),
      ruling({ action: "later", candidate: candidate({ threadId: "d" }) }),
    ];
    expect(summariseReview(rulings)).toEqual({
      added: 2,
      skipped: 1,
      later: 1,
    });
    expect(describeReview(rulings)).toBe(
      "2 tasks added, 1 skipped, 1 left for later",
    );
  });

  it("says so when the pass ruled on nothing", () => {
    expect(describeReview([])).toBe("Nothing reviewed");
  });

  it("singularises one task", () => {
    expect(describeReview([ruling({ action: "add" })])).toBe("1 task added");
  });
});

describe("appendCandidates", () => {
  it("orders each page on its own and adds it to the end", () => {
    const first = orderCandidates([
      candidate({
        threadId: "a",
        suggested: true,
        receivedAt: "2026-10-01T09:00:00.000Z",
      }),
    ]);
    const page = [
      candidate({
        threadId: "b",
        suggested: false,
        receivedAt: "2026-10-05T09:00:00.000Z",
      }),
      candidate({
        threadId: "c",
        suggested: true,
        receivedAt: "2026-10-04T09:00:00.000Z",
      }),
    ];
    // "c" leads its own page, but neither page member jumps ahead of "a".
    expect(appendCandidates(first, page).map((c) => c.threadId)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  it("drops a thread that straddles two pages", () => {
    const first = appendCandidates([], [candidate({ threadId: "a" })]);
    const second = appendCandidates(first, [
      candidate({ threadId: "a" }),
      candidate({ threadId: "b" }),
    ]);
    expect(second.map((c) => c.threadId)).toEqual(["a", "b"]);
  });

  it("never reorders cards the user may already have passed", () => {
    let queue = appendCandidates(
      [],
      [candidate({ threadId: "a", suggested: false })],
    );
    queue = appendCandidates(queue, [
      candidate({ threadId: "b", suggested: true }),
    ]);
    expect(queue.map((c) => c.threadId)).toEqual(["a", "b"]);
  });
});

describe("swipe geometry", () => {
  it("only lets the card travel left", () => {
    expect(swipeOffset(-40)).toBe(-40);
    expect(swipeOffset(0)).toBe(0);
    expect(swipeOffset(90)).toBe(0);
  });

  it("keeps a near-vertical drag with the scroller", () => {
    expect(isHorizontalSwipe(-30, 4)).toBe(true);
    expect(isHorizontalSwipe(-30, 40)).toBe(false);
    // A tie is vertical: the modal body scrolls rather than the card moving.
    expect(isHorizontalSwipe(-30, 30)).toBe(false);
  });

  it("ignores movement inside the slop", () => {
    expect(isHorizontalSwipe(-SWIPE_SLOP_PX, 0)).toBe(false);
    expect(isHorizontalSwipe(-(SWIPE_SLOP_PX + 1), 0)).toBe(true);
  });

  it("takes a share of a wide card's width and a floor on a narrow one", () => {
    expect(swipeThreshold(400)).toBe(120);
    expect(swipeThreshold(100)).toBe(SWIPE_COMMIT_MIN_PX);
  });

  it("commits only once the card is past its threshold", () => {
    expect(swipeCommitted(-119, 400)).toBe(false);
    expect(swipeCommitted(-120, 400)).toBe(true);
    expect(swipeCommitted(-500, 400)).toBe(true);
  });

  it("never commits on a rightward pull", () => {
    expect(swipeCommitted(500, 400)).toBe(false);
  });

  it("reports progress toward the threshold, capped at the commit point", () => {
    expect(swipeProgress(0, 400)).toBe(0);
    expect(swipeProgress(-60, 400)).toBe(0.5);
    expect(swipeProgress(-240, 400)).toBe(1);
    expect(swipeProgress(40, 400)).toBe(0);
  });

  it("stays at rest when the card has not been measured yet", () => {
    expect(swipeProgress(-50, 0)).toBeCloseTo(50 / SWIPE_COMMIT_MIN_PX);
    expect(swipeCommitted(-10, 0)).toBe(false);
  });
});
