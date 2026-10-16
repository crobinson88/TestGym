import { describe, expect, it } from "vitest";
import {
  appendCandidates,
  appendNotes,
  candidateKey,
  commKey,
  defaultRange,
  describeCommsReview,
  doneCount,
  evidenceNote,
  isValidRange,
  ledgerRows,
  newestCommAt,
  orderCandidates,
  rangeDays,
  shiftDate,
  summariseCommsReview,
  type Comm,
  type CommsCandidate,
} from "./commsReview";

function comm(over: Partial<Comm> = {}): Comm {
  return {
    source: "slack",
    key: "1760000000.000100",
    accountLabel: "TGM",
    heading: "#general",
    text: "Sent the report over",
    url: "https://slack.com/archives/C1/p1760000000000100",
    at: "2026-10-13T17:31:53.000Z",
    ...over,
  };
}

function candidate(over: Partial<CommsCandidate> = {}): CommsCandidate {
  return {
    threadId: "task-1",
    itemId: "row-1",
    itemTitle: "Send the 50 Hillside report",
    categoryLabel: "Product",
    status: "open",
    verdict: "connected",
    reason: "Discussed but not sent",
    comms: [comm()],
    ...over,
  };
}

describe("date range", () => {
  it("shifts dates in UTC, across month and year ends", () => {
    expect(shiftDate("2026-10-16", -1)).toBe("2026-10-15");
    expect(shiftDate("2026-10-01", -1)).toBe("2026-09-30");
    expect(shiftDate("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDate("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("defaults to a week ending today, inclusive of both ends", () => {
    const range = defaultRange("2026-10-16");
    expect(range).toEqual({ from: "2026-10-10", to: "2026-10-16" });
    // Seven days, not eight — the off-by-one this exists to pin down.
    expect(rangeDays(range.from, range.to)).toBe(7);
  });

  it("accepts a single day and rejects a reversed or malformed range", () => {
    expect(isValidRange("2026-10-16", "2026-10-16")).toBe(true);
    expect(rangeDays("2026-10-16", "2026-10-16")).toBe(1);
    expect(isValidRange("2026-10-17", "2026-10-16")).toBe(false);
    expect(isValidRange("16/10/2026", "2026-10-16")).toBe(false);
    expect(isValidRange("", "")).toBe(false);
    expect(rangeDays("2026-10-17", "2026-10-16")).toBe(0);
  });
});

describe("keys", () => {
  it("identifies a card by its chain root, not the day's row", () => {
    expect(candidateKey(candidate({ threadId: "chain", itemId: "monday" }))).toBe(
      candidateKey(candidate({ threadId: "chain", itemId: "tuesday" })),
    );
  });

  it("scopes a comm key by its source", () => {
    expect(commKey({ source: "slack", key: "abc" })).not.toBe(
      commKey({ source: "email", key: "abc" }),
    );
  });
});

describe("orderCandidates", () => {
  it("puts done first, then the best-evidenced, then the most recent", () => {
    const ordered = orderCandidates([
      candidate({ threadId: "c", verdict: "connected", comms: [comm()] }),
      candidate({ threadId: "a", verdict: "done", comms: [comm()] }),
      candidate({
        threadId: "b",
        verdict: "connected",
        comms: [comm(), comm({ key: "2", source: "email" })],
      }),
    ]);
    expect(ordered.map((c) => c.threadId)).toEqual(["a", "b", "c"]);
  });

  it("sorts undated evidence last rather than first", () => {
    const ordered = orderCandidates([
      candidate({ threadId: "undated", comms: [comm({ at: null })] }),
      candidate({ threadId: "dated", comms: [comm({ at: "2026-10-12T00:00:00.000Z" })] }),
    ]);
    expect(ordered.map((c) => c.threadId)).toEqual(["dated", "undated"]);
  });

  it("drops a duplicate card within one page", () => {
    expect(orderCandidates([candidate(), candidate()])).toHaveLength(1);
  });
});

describe("newestCommAt", () => {
  it("takes the latest timestamp on the card", () => {
    expect(
      newestCommAt(
        candidate({
          comms: [
            comm({ at: "2026-10-11T00:00:00.000Z" }),
            comm({ key: "2", at: "2026-10-14T00:00:00.000Z" }),
            comm({ key: "3", at: null }),
          ],
        }),
      ),
    ).toBe("2026-10-14T00:00:00.000Z");
  });
});

describe("appendCandidates", () => {
  it("appends a new card to the end, leaving the worked queue alone", () => {
    const queue = [candidate({ threadId: "first" })];
    const next = appendCandidates(queue, [candidate({ threadId: "second", verdict: "done" })]);
    // "done" sorts first within a page but must NOT jump the existing queue.
    expect(next.map((c) => c.threadId)).toEqual(["first", "second"]);
  });

  it("folds a later page's evidence into the card already queued", () => {
    const queue = [candidate({ threadId: "t", comms: [comm({ key: "a" })] })];
    const next = appendCandidates(queue, [
      candidate({ threadId: "t", comms: [comm({ key: "b" })] }),
    ]);
    expect(next).toHaveLength(1);
    expect(next[0].comms.map((c) => c.key)).toEqual(["a", "b"]);
  });

  it("ignores evidence already on the card", () => {
    const queue = [candidate({ threadId: "t", comms: [comm({ key: "a" })] })];
    const next = appendCandidates(queue, [
      candidate({ threadId: "t", comms: [comm({ key: "a" })] }),
    ]);
    expect(next[0].comms).toHaveLength(1);
  });

  it("upgrades a connected card when a later page proves it shipped", () => {
    const queue = [candidate({ threadId: "t", verdict: "connected", comms: [comm({ key: "a" })] })];
    const next = appendCandidates(queue, [
      candidate({
        threadId: "t",
        verdict: "done",
        reason: "Signed and returned",
        comms: [comm({ key: "b" })],
      }),
    ]);
    expect(next[0].verdict).toBe("done");
    expect(next[0].reason).toBe("Signed and returned");
  });

  it("never downgrades a done card to connected", () => {
    const queue = [candidate({ threadId: "t", verdict: "done", reason: "Shipped", comms: [comm({ key: "a" })] })];
    const next = appendCandidates(queue, [
      candidate({ threadId: "t", verdict: "connected", reason: "Chasing", comms: [comm({ key: "b" })] }),
    ]);
    expect(next[0].verdict).toBe("done");
    expect(next[0].reason).toBe("Shipped");
  });
});

describe("doneCount", () => {
  it("counts only the done verdicts", () => {
    expect(
      doneCount([
        candidate({ threadId: "a", verdict: "done" }),
        candidate({ threadId: "b", verdict: "connected" }),
      ]),
    ).toBe(1);
  });
});

describe("notes", () => {
  it("writes the reason and a link per piece of evidence", () => {
    const note = evidenceNote(
      candidate({
        reason: "Report forwarded to Gregg",
        comms: [
          comm({ heading: "#projects", url: "https://slack.example/1" }),
          comm({
            key: "t1",
            source: "email",
            accountLabel: "The Glass Market",
            heading: "Re: 50 Hillside Avenue Report",
            url: "https://mail.example/t1",
            at: "2026-10-13T18:57:12.000Z",
          }),
        ],
      }),
    );
    expect(note).toContain("Comms: Report forwarded to Gregg");
    expect(note).toContain("Slack · TGM · #projects");
    expect(note).toContain("Email · The Glass Market · Re: 50 Hillside Avenue Report · 2026-10-13");
    expect(note).toContain("https://mail.example/t1");
  });

  it("appends to a description instead of replacing it", () => {
    expect(appendNotes("Original note", "Comms: x")).toBe("Original note\n\nComms: x");
    expect(appendNotes("", "Comms: x")).toBe("Comms: x");
    expect(appendNotes(null, "Comms: x")).toBe("Comms: x");
    expect(appendNotes(undefined, "Comms: x")).toBe("Comms: x");
  });
});

describe("ledgerRows", () => {
  it("writes one row per (task, communication) pair", () => {
    const rows = ledgerRows([
      {
        candidate: candidate({
          comms: [comm({ key: "a" }), comm({ key: "b", source: "email" })],
        }),
        action: "done",
      },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => [r.source, r.comm_key])).toEqual([
      ["slack", "a"],
      ["email", "b"],
    ]);
    expect(rows.every((r) => r.ruling === "done")).toBe(true);
    expect(rows.every((r) => r.thread_id === "task-1")).toBe(true);
  });

  it("snapshots the title and an excerpt so the log survives a rename", () => {
    const [row] = ledgerRows([
      { candidate: candidate({ itemTitle: "Send the report" }), action: "connected" },
    ]);
    expect(row.item_title).toBe("Send the report");
    expect(row.comm_excerpt).toBe("Sent the report over");
  });

  it("caps a long excerpt and nulls an empty one", () => {
    const [long] = ledgerRows([
      { candidate: candidate({ comms: [comm({ text: "x".repeat(500) })] }), action: "skip" },
    ]);
    expect(long.comm_excerpt).toHaveLength(280);
    const [empty] = ledgerRows([
      { candidate: candidate({ comms: [comm({ text: "   " })] }), action: "skip" },
    ]);
    expect(empty.comm_excerpt).toBeNull();
  });

  it("maps skip to skipped and writes nothing for later", () => {
    expect(ledgerRows([{ candidate: candidate(), action: "skip" }])[0].ruling).toBe("skipped");
    expect(ledgerRows([{ candidate: candidate(), action: "later" }])).toEqual([]);
  });
});

describe("summary", () => {
  it("tallies each ruling", () => {
    expect(
      summariseCommsReview([
        { candidate: candidate({ threadId: "a" }), action: "done" },
        { candidate: candidate({ threadId: "b" }), action: "done" },
        { candidate: candidate({ threadId: "c" }), action: "connected" },
        { candidate: candidate({ threadId: "d" }), action: "skip" },
        { candidate: candidate({ threadId: "e" }), action: "later" },
      ]),
    ).toEqual({ done: 2, connected: 1, skipped: 1, later: 1 });
  });

  it("describes a pass, pluralising the task count", () => {
    expect(
      describeCommsReview([
        { candidate: candidate({ threadId: "a" }), action: "done" },
        { candidate: candidate({ threadId: "b" }), action: "connected" },
        { candidate: candidate({ threadId: "c" }), action: "skip" },
        { candidate: candidate({ threadId: "d" }), action: "later" },
      ]),
    ).toBe("1 task completed, 1 linked, 1 not a match, 1 left for later");
    expect(
      describeCommsReview([
        { candidate: candidate({ threadId: "a" }), action: "done" },
        { candidate: candidate({ threadId: "b" }), action: "done" },
      ]),
    ).toBe("2 tasks completed");
  });

  it("says so when nothing was ruled", () => {
    expect(describeCommsReview([])).toBe("Nothing reviewed");
  });
});
