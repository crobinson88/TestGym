import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NewTaskDialog } from "./NewTaskDialog";
import type { SectionConfig } from "../sections";

const createItem = vi.fn();
const categories = vi.fn<() => SectionConfig[]>();

vi.mock("../repo", () => ({
  createItem: (...args: unknown[]) => createItem(...args),
}));

vi.mock("../categories", () => ({
  useCategories: () => categories(),
}));

vi.mock("../workstreams", () => ({
  useWorkstreams: () => [],
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

beforeEach(() => {
  createItem.mockReset();
  createItem.mockResolvedValue({});
  categories.mockReturnValue(CATEGORIES);
  localStorage.clear();
});

describe("NewTaskDialog", () => {
  it("opens the composer on the remembered category", () => {
    localStorage.setItem("tdl:quickAddCategory", "follow_ups");
    render(<NewTaskDialog onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "New task" })).toBeTruthy();
    expect((screen.getByLabelText("Category") as HTMLSelectElement).value).toBe("follow_ups");
  });

  it("writes the task and confirms without closing", async () => {
    const onClose = vi.fn();
    render(<NewTaskDialog onClose={onClose} />);
    fireEvent.change(screen.getByLabelText("Task title"), { target: { value: "Call the glazier" } });
    fireEvent.change(screen.getByLabelText(/Time to complete estimate/i), {
      target: { value: "15" },
    });
    fireEvent.click(screen.getByRole("button", { name: /urgent & important/i }));
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));

    await waitFor(() => expect(createItem).toHaveBeenCalledTimes(1));
    expect(createItem.mock.calls[0][0]).toMatchObject({
      section: "tgm_tasks",
      title: "Call the glazier",
      time_estimate_min: 15,
    });
    await screen.findByText(/Added “Call the glazier” to TGM Tasks/);
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Task title") as HTMLInputElement).value).toBe("");
  });

  it("closes on Escape and on the close button", () => {
    const onClose = vi.fn();
    render(<NewTaskDialog onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("says so when there are no categories to add to", () => {
    categories.mockReturnValue([]);
    render(<NewTaskDialog onClose={() => {}} />);
    expect(screen.queryByLabelText("Task title")).toBeNull();
    expect(screen.getByText(/No categories yet/)).toBeTruthy();
  });
});
