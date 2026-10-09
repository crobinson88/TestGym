import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SectionConfig } from "../sections";
import type { EmailCandidate } from "../emailReview";
import type { ReviewFetch } from "../emailReviewApi";
import { EmailReviewButton } from "./EmailReviewButton";

let created = 0;
const createItem = vi.fn(async (_input: Record<string, unknown>) => ({
  id: `item-${++created}`,
}));
vi.mock("../repo", () => ({
  createItem: (input: Record<string, unknown>) => createItem(input),
}));

const fetchEmailCandidates = vi.fn();
const recordEmailReviews = vi.fn(
  async (_rows: Record<string, unknown>[]) => undefined,
);
const applyEmailActions = vi.fn(
  async (_token: string, _actions: Record<string, unknown>[]) =>
    [] as { threadId: string; ok: boolean; error?: string }[],
);
vi.mock("../emailReviewApi", () => ({
  fetchEmailCandidates: (
    token: string,
    cursors?: Record<string, string | null>,
  ) => fetchEmailCandidates(token, cursors),
  recordEmailReviews: (rows: Record<string, unknown>[]) =>
    recordEmailReviews(rows),
  applyEmailActions: (token: string, actions: Record<string, unknown>[]) =>
    applyEmailActions(token, actions),
}));

const CATEGORIES: SectionConfig[] = [
  {
    key: "follow_ups",
    label: "Follow Ups",
    hasDueDate: false,
    hasTimeEstimate: false,
    recurringSeeds: [],
  },
];
vi.mock("../categories", () => ({ useCategories: () => CATEGORIES }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ session: { access_token: "tok" } }),
}));

const DAY = "2026-10-04";

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

function result(over: Partial<ReviewFetch> = {}): ReviewFetch {
  return {
    accounts: [],
    candidates: [candidate()],
    scanned: 1,
    matched: 1,
    cursors: {},
    done: true,
    labels: [],
    errors: [],
    ...over,
  };
}

// jsdom lays nothing out, so the card reports width 0 and the swipe falls back
// to its pixel floor. Give it a real width so the ratio branch is the one under
// test, and stub the pointer-capture calls jsdom does not implement.
function swipeableCard(): HTMLElement {
  const el = screen
    .getByText("Ocean Rd quote")
    .closest("[style]") as HTMLElement;
  Object.defineProperty(el, "offsetWidth", { value: 400, configurable: true });
  el.setPointerCapture = () => undefined;
  el.releasePointerCapture = () => undefined;
  return el;
}

function swipe(el: HTMLElement, dx: number, dy = 0) {
  fireEvent.pointerDown(el, { pointerId: 1, clientX: 0, clientY: 0 });
  fireEvent.pointerMove(el, { pointerId: 1, clientX: dx, clientY: dy });
  fireEvent.pointerUp(el, { pointerId: 1, clientX: dx, clientY: dy });
}

async function openPass(fetchResult: ReviewFetch) {
  fetchEmailCandidates.mockResolvedValue(fetchResult);
  render(<EmailReviewButton snapshot_date={DAY} />);
  fireEvent.click(screen.getByRole("button", { name: /review email/i }));
  await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
}

beforeEach(() => {
  created = 0;
  vi.clearAllMocks();
  localStorage.clear();
});

describe("EmailReviewButton", () => {
  it("writes nothing until the pass is confirmed", async () => {
    await openPass(result());
    fireEvent.click(screen.getByRole("button", { name: /add to to-do/i }));
    expect(createItem).not.toHaveBeenCalled();
    expect(recordEmailReviews).not.toHaveBeenCalled();
  });

  it("creates a task carrying the email's details, and records the ruling", async () => {
    await openPass(result());
    fireEvent.click(screen.getByRole("button", { name: /add to to-do/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm 1/i }));

    await waitFor(() => expect(createItem).toHaveBeenCalledTimes(1));
    const task = createItem.mock.calls[0][0];
    expect(task.snapshot_date).toBe(DAY);
    expect(task.section).toBe("follow_ups");
    expect(task.title).toBe("Reply to Kyp on the Ocean Rd quote");
    expect(task.notes).toContain("https://mail.google.com/mail/u/0/#inbox/t1");
    expect(task.notes).toContain("Mailbox: The Glass Market");

    const rows = recordEmailReviews.mock.calls[0][0];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      thread_id: "t1",
      ruling: "added",
      item_id: "item-1",
    });
  });

  it("carries an edited title onto the task", async () => {
    await openPass(result());
    fireEvent.change(screen.getByPlaceholderText(/what needs doing/i), {
      target: { value: "Call Kyp about Ocean Rd" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add to to-do/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm 1/i }));

    await waitFor(() => expect(createItem).toHaveBeenCalledTimes(1));
    expect(createItem.mock.calls[0][0].title).toBe("Call Kyp about Ocean Rd");
  });

  it("records a skip without creating a task", async () => {
    await openPass(result());
    fireEvent.click(screen.getByRole("button", { name: /not a task/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm 1/i }));

    await waitFor(() => expect(recordEmailReviews).toHaveBeenCalledTimes(1));
    expect(createItem).not.toHaveBeenCalled();
    const rows = recordEmailReviews.mock.calls[0][0];
    expect(rows[0]).toMatchObject({ ruling: "skipped", item_id: null });
  });

  it("leaves no trace of a 'decide later', so the thread comes back next pass", async () => {
    await openPass(result());
    fireEvent.click(screen.getByRole("button", { name: /decide later/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm 1/i }));

    await waitFor(() => expect(recordEmailReviews).toHaveBeenCalledTimes(1));
    expect(recordEmailReviews.mock.calls[0][0]).toEqual([]);
    expect(createItem).not.toHaveBeenCalled();
  });

  it("undoes the last ruling and steps back onto that email", async () => {
    await openPass(
      result({
        candidates: [
          candidate({ threadId: "t1" }),
          candidate({ threadId: "t2", subject: "Invoice" }),
        ],
        scanned: 2,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /add to to-do/i }));
    expect(screen.getByText("2 of 2")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: /undo last decision/i }),
    );
    expect(screen.getByText("1 of 2")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /not a task/i }));
    fireEvent.click(screen.getByRole("button", { name: /not a task/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm 2/i }));

    await waitFor(() => expect(recordEmailReviews).toHaveBeenCalledTimes(1));
    const rows = recordEmailReviews.mock.calls[0][0];
    expect(rows.map((r) => r.ruling)).toEqual(["skipped", "skipped"]);
  });

  it("skips the email on a left swipe past the threshold", async () => {
    await openPass(
      result({ candidates: [candidate(), candidate({ threadId: "t2" })] }),
    );
    swipe(swipeableCard(), -200);
    await waitFor(() => expect(screen.getByText("2 of 2")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /confirm 1/i }));
    await waitFor(() => expect(recordEmailReviews).toHaveBeenCalled());
    expect(createItem).not.toHaveBeenCalled();
    expect(recordEmailReviews.mock.calls[0][0]).toEqual([
      expect.objectContaining({ thread_id: "t1", ruling: "skipped" }),
    ]);
  });

  it("snaps back on a short pull without ruling", async () => {
    await openPass(
      result({ candidates: [candidate(), candidate({ threadId: "t2" })] }),
    );
    swipe(swipeableCard(), -80);
    expect(screen.getByText("1 of 2")).toBeTruthy();
    expect(screen.getByRole("button", { name: /confirm 0/i })).toBeDisabled();
  });

  it("leaves a vertical drag to the modal's scroller", async () => {
    await openPass(
      result({ candidates: [candidate(), candidate({ threadId: "t2" })] }),
    );
    swipe(swipeableCard(), -200, 300);
    expect(screen.getByText("1 of 2")).toBeTruthy();
  });

  it("ignores a rightward swipe", async () => {
    await openPass(
      result({ candidates: [candidate(), candidate({ threadId: "t2" })] }),
    );
    swipe(swipeableCard(), 300);
    expect(screen.getByText("1 of 2")).toBeTruthy();
  });

  it("undoes a swipe like any other ruling", async () => {
    await openPass(
      result({ candidates: [candidate(), candidate({ threadId: "t2" })] }),
    );
    swipe(swipeableCard(), -200);
    await waitFor(() => expect(screen.getByText("2 of 2")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Undo last decision" }));
    expect(screen.getByText("1 of 2")).toBeTruthy();
  });

  it("names a mailbox it could not read rather than showing an empty inbox", async () => {
    await openPass(
      result({
        candidates: [],
        scanned: 0,
        errors: [
          { accountId: "acct-2", label: "Personal", message: "refresh failed" },
        ],
      }),
    );
    expect(screen.getByText(/Personal could not be read/i)).toBeTruthy();
    expect(screen.getByText(/nothing new to review/i)).toBeTruthy();
  });

  it("says so when a half-made pass is closed without saving", async () => {
    await openPass(result());
    fireEvent.click(screen.getByRole("button", { name: /add to to-do/i }));
    fireEvent.click(screen.getByRole("button", { name: /^close$/i }));

    expect(recordEmailReviews).not.toHaveBeenCalled();
    expect(screen.getByText(/1 decision discarded/i)).toBeTruthy();
  });
});

describe("EmailReviewButton paging", () => {
  it("walks the next page as the user nears the end, passing the cursor back", async () => {
    fetchEmailCandidates
      .mockResolvedValueOnce(
        result({
          candidates: [candidate({ threadId: "t1" })],
          scanned: 1,
          matched: 1400,
          cursors: { "acct-1": "page-2" },
          done: false,
        }),
      )
      .mockResolvedValueOnce(
        result({
          candidates: [candidate({ threadId: "t2", subject: "Invoice" })],
          scanned: 1,
          matched: 1400,
          cursors: {},
          done: true,
        }),
      );

    render(<EmailReviewButton snapshot_date={DAY} />);
    fireEvent.click(screen.getByRole("button", { name: /review email/i }));

    // The prefetch fires off the back of the first page (one card is well
    // inside PREFETCH_AHEAD), carrying the cursor it was handed.
    await waitFor(() => expect(fetchEmailCandidates).toHaveBeenCalledTimes(2));
    expect(fetchEmailCandidates.mock.calls[0][1]).toBeUndefined();
    expect(fetchEmailCandidates.mock.calls[1][1]).toEqual({
      "acct-1": "page-2",
    });

    // Both pages are in one queue, in page order.
    await waitFor(() => expect(screen.getByText("1 of 2")).toBeTruthy());
  });

  it("states the size of the window rather than implying the inbox is handled", async () => {
    await openPass(
      result({ matched: 1400, scanned: 20, done: false, cursors: {} }),
    );
    expect(screen.getByText(/~1,400 emails addressed to you/i)).toBeTruthy();
    expect(screen.getByText(/20 read so far/i)).toBeTruthy();
  });

  it("stops fetching once the window is exhausted", async () => {
    await openPass(result({ done: true, cursors: {} }));
    fireEvent.click(screen.getByRole("button", { name: /not a task/i }));
    await waitFor(() =>
      expect(screen.getByText(/pass complete/i)).toBeTruthy(),
    );
    expect(fetchEmailCandidates).toHaveBeenCalledTimes(1);
  });
});

describe("EmailReviewButton Gmail actions", () => {
  async function openWithArchive(fetchResult = result()) {
    await openPass(fetchResult);
    fireEvent.click(screen.getByRole("checkbox", { name: /archive in gmail/i }));
  }

  it("touches nothing in Gmail unless you ask it to", async () => {
    await openPass(result());
    fireEvent.click(screen.getByRole("button", { name: /add to to-do/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm 1/i }));

    await waitFor(() => expect(recordEmailReviews).toHaveBeenCalledTimes(1));
    expect(applyEmailActions).not.toHaveBeenCalled();
  });

  it("archives the thread when the toggle is on", async () => {
    await openWithArchive();
    fireEvent.click(screen.getByRole("button", { name: /add to to-do/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm 1/i }));

    await waitFor(() => expect(applyEmailActions).toHaveBeenCalledTimes(1));
    expect(applyEmailActions.mock.calls[0][1]).toEqual([
      { accountId: "acct-1", threadId: "t1", archive: true, labelNames: [] },
    ]);
  });

  it("never archives a 'decide later' ruling, even with the toggle on", async () => {
    // An archived thread leaves the window, so archiving one you deferred
    // would silently lose it — the rule this test exists to protect.
    await openWithArchive();
    fireEvent.click(screen.getByRole("button", { name: /decide later/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm 1/i }));

    await waitFor(() => expect(recordEmailReviews).toHaveBeenCalledTimes(1));
    expect(applyEmailActions).not.toHaveBeenCalled();
  });

  it("applies a label picked from the mailbox's own labels", async () => {
    await openPass(
      result({ labels: [{ accountId: "acct-1", id: "Label_1", name: "To-do" }] }),
    );
    fireEvent.change(screen.getByRole("combobox", { name: /gmail label/i }), {
      target: { value: "To-do" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add to to-do/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm 1/i }));

    await waitFor(() => expect(applyEmailActions).toHaveBeenCalledTimes(1));
    expect(applyEmailActions.mock.calls[0][1]).toEqual([
      { accountId: "acct-1", threadId: "t1", archive: false, labelNames: ["To-do"] },
    ]);
  });

  it("sends a newly typed label by name, for the server to create", async () => {
    await openPass(result({ labels: [] }));
    fireEvent.change(screen.getByRole("combobox", { name: /gmail label/i }), {
      target: { value: "__new__" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /new label name/i }), {
      target: { value: " Needs reply " },
    });
    fireEvent.click(screen.getByRole("button", { name: /add to to-do/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm 1/i }));

    await waitFor(() => expect(applyEmailActions).toHaveBeenCalledTimes(1));
    expect(applyEmailActions.mock.calls[0][1][0].labelNames).toEqual(["Needs reply"]);
  });

  it("records what was done to the mailbox on the ledger row", async () => {
    await openWithArchive();
    fireEvent.click(screen.getByRole("button", { name: /add to to-do/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm 1/i }));

    await waitFor(() => expect(recordEmailReviews).toHaveBeenCalledTimes(1));
    expect(recordEmailReviews.mock.calls[0][0][0]).toMatchObject({ archived: true });
  });

  it("reports threads Gmail refused instead of claiming a clean pass", async () => {
    applyEmailActions.mockResolvedValueOnce([
      { threadId: "t1", ok: false, error: "insufficient permission" },
    ]);
    await openWithArchive();
    fireEvent.click(screen.getByRole("button", { name: /add to to-do/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm 1/i }));

    await waitFor(() => expect(screen.getByText(/1 not updated in Gmail/i)).toBeTruthy());
    // The task and the ledger still landed — a Gmail refusal is not a rollback.
    expect(createItem).toHaveBeenCalledTimes(1);
    expect(recordEmailReviews).toHaveBeenCalledTimes(1);
  });
});
