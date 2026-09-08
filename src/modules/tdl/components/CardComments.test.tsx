import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CardComments } from "./CardComments";
import type { LocalTdlComment } from "@/lib/db";

const addComment = vi.fn();
const updateComment = vi.fn();
const deleteComment = vi.fn();
let comments: LocalTdlComment[] = [];

vi.mock("../comments", () => ({
  useComments: () => comments,
  addComment: (...a: unknown[]) => addComment(...a),
  updateComment: (...a: unknown[]) => updateComment(...a),
  deleteComment: (...a: unknown[]) => deleteComment(...a),
}));

function comment(over: Partial<LocalTdlComment> = {}): LocalTdlComment {
  const ts = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  return {
    id: "c1",
    thread_id: "t1",
    item_id: "i1",
    body: "Chase Gregg for the tracking number.",
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
    sync_status: "synced",
    ...over,
  } as LocalTdlComment;
}

beforeEach(() => {
  addComment.mockReset().mockResolvedValue({});
  updateComment.mockReset();
  deleteComment.mockReset();
  comments = [];
});

describe("CardComments", () => {
  it("shows the thread with a relative timestamp", () => {
    comments = [comment()];
    render(<CardComments threadId="t1" itemId="i1" />);
    expect(screen.getByText("Chase Gregg for the tracking number.")).toBeTruthy();
    expect(screen.getByText("3h ago")).toBeTruthy();
  });

  it("marks a comment that was edited after it was posted", () => {
    comments = [comment({ updated_at: new Date().toISOString() })];
    render(<CardComments threadId="t1" itemId="i1" />);
    expect(screen.getByText("· edited")).toBeTruthy();
  });

  it("posts a comment against the card's thread", async () => {
    render(<CardComments threadId="t1" itemId="i1" />);
    fireEvent.change(screen.getByLabelText("New comment"), {
      target: { value: "  Tracking is WI-4471.  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Comment" }));
    await waitFor(() =>
      expect(addComment).toHaveBeenCalledWith("t1", "i1", "  Tracking is WI-4471.  "),
    );
  });

  it("will not post an empty comment", () => {
    render(<CardComments threadId="t1" itemId="i1" />);
    const button = screen.getByRole("button", { name: "Comment" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("New comment"), { target: { value: "   " } });
    expect(button.disabled).toBe(true);
  });

  it("edits a comment in place", () => {
    comments = [comment()];
    render(<CardComments threadId="t1" itemId="i1" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit comment" }));
    fireEvent.change(screen.getByLabelText("Edit comment"), {
      target: { value: "Chased — shipping Thursday." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(updateComment).toHaveBeenCalledWith("c1", "Chased — shipping Thursday.");
  });

  it("deletes a comment", () => {
    comments = [comment()];
    render(<CardComments threadId="t1" itemId="i1" />);
    fireEvent.click(screen.getByRole("button", { name: "Delete comment" }));
    expect(deleteComment).toHaveBeenCalledWith("c1");
  });
});
