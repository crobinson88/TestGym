import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QuickAdd } from "./QuickAdd";
import type { SectionConfig } from "../sections";

const createItem = vi.fn();

vi.mock("../repo", () => ({
  createItem: (...args: unknown[]) => createItem(...args),
}));

vi.mock("../storage", () => ({
  tdlSignedUrlMap: vi.fn(async () => ({})),
  uploadTdlImages: vi.fn(async () => []),
}));

const CATEGORIES: SectionConfig[] = [
  {
    key: "follow_ups",
    label: "Follow Ups",
    hasDueDate: false,
    hasTimeEstimate: false,
    recurringSeeds: [],
  },
  {
    key: "tgm_tasks",
    label: "TGM Tasks",
    hasDueDate: true,
    hasTimeEstimate: true,
    recurringSeeds: [],
  },
];

function open() {
  render(<QuickAdd snapshot_date="2026-08-31" categories={CATEGORIES} />);
  fireEvent.click(screen.getByRole("button", { name: /quick add task/i }));
}

beforeEach(() => {
  createItem.mockReset();
  createItem.mockResolvedValue({});
});

describe("QuickAdd", () => {
  it("stays collapsed until opened", () => {
    render(<QuickAdd snapshot_date="2026-08-31" categories={CATEGORIES} />);
    expect(screen.queryByLabelText("Task title")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /quick add task/i }));
    expect(screen.getByLabelText("Task title")).toBeTruthy();
    expect(screen.getByLabelText("Category")).toBeTruthy();
  });

  it("saves to the picked category with the quadrant", async () => {
    open();
    fireEvent.change(screen.getByLabelText("Task title"), {
      target: { value: "  Chase the quote  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /DF · Do First/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));

    await waitFor(() => expect(createItem).toHaveBeenCalledOnce());
    expect(createItem).toHaveBeenCalledWith({
      snapshot_date: "2026-08-31",
      section: "follow_ups",
      title: "Chase the quote",
      time_estimate_min: null,
      eisenhower_quadrant: "do_first",
      notes: null,
      images: [],
    });
    expect(await screen.findByText(/Added “Chase the quote” to Follow Ups/)).toBeTruthy();
  });

  it("asks for a quadrant before saving", async () => {
    open();
    fireEvent.change(screen.getByLabelText("Task title"), { target: { value: "No quadrant" } });
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));

    expect(await screen.findByText(/Pick an Eisenhower priority quadrant/)).toBeTruthy();
    expect(createItem).not.toHaveBeenCalled();
  });

  it("asks for minutes only when the picked category requires them", async () => {
    open();
    expect(screen.queryByLabelText(/Time to complete estimate/)).toBeNull();

    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "tgm_tasks" } });
    fireEvent.change(screen.getByLabelText("Task title"), { target: { value: "Reports to Kyp" } });
    fireEvent.click(screen.getByRole("button", { name: /SC · Schedule/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));

    expect(await screen.findByText(/Add a time-to-complete estimate/)).toBeTruthy();
    expect(createItem).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Time to complete estimate/), {
      target: { value: "45" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));

    await waitFor(() => expect(createItem).toHaveBeenCalledOnce());
    expect(createItem).toHaveBeenCalledWith(
      expect.objectContaining({
        section: "tgm_tasks",
        title: "Reports to Kyp",
        time_estimate_min: 45,
        eisenhower_quadrant: "schedule",
      }),
    );
  });

  it("clears the fields after a save so the next task starts fresh", async () => {
    open();
    fireEvent.change(screen.getByLabelText("Task title"), { target: { value: "First" } });
    fireEvent.click(screen.getByRole("button", { name: /DL · Delegate/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));

    await waitFor(() => expect(createItem).toHaveBeenCalledOnce());
    expect((screen.getByLabelText("Task title") as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("button", { name: /DL · Delegate/ }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });
});
