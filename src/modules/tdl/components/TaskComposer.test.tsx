import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TaskComposer } from "./TaskComposer";
import type { SectionConfig } from "../sections";

const createItem = vi.fn();
const setPriorityRank = vi.fn();
let ranked: { id: string; title: string; section: string; priority_rank: number | null }[] = [];

vi.mock("../repo", () => ({
  createItem: (...args: unknown[]) => createItem(...args),
  setPriorityRank: (...args: unknown[]) => setPriorityRank(...args),
}));

vi.mock("dexie-react-hooks", () => ({
  useLiveQuery: () => ranked,
}));

vi.mock("../workstreams", () => ({
  useWorkstreams: () => [],
}));

vi.mock("../storage", () => ({
  tdlSignedUrlMap: vi.fn(async () => ({})),
  uploadTdlImages: vi.fn(async () => []),
}));

const SECTION: SectionConfig = {
  key: "follow_ups",
  label: "Follow Ups",
  hasDueDate: false,
  hasTimeEstimate: false,
  recurringSeeds: [],
};

function rankedDay(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    title: `Priority ${i + 1}`,
    section: "follow_ups",
    priority_rank: i + 1,
  }));
}

function fillAndSubmit() {
  render(
    <TaskComposer
      snapshot_date="2026-11-16"
      categories={[SECTION]}
      fixedSection={SECTION}
      onCancel={() => {}}
    />,
  );
  fireEvent.change(screen.getByLabelText("Task title"), { target: { value: "Ship it" } });
  fireEvent.click(screen.getByRole("button", { name: /DF · Do First/ }));
  fireEvent.click(screen.getByRole("button", { name: /Add as priority/ }));
  fireEvent.click(screen.getByRole("button", { name: "Add task" }));
}

beforeEach(() => {
  createItem.mockReset();
  createItem.mockResolvedValue({ id: "new" });
  setPriorityRank.mockReset();
  setPriorityRank.mockResolvedValue({});
  ranked = [];
});

describe("TaskComposer · add as priority", () => {
  it("leaves the task unranked unless the toggle is on", async () => {
    render(
      <TaskComposer
        snapshot_date="2026-11-16"
        categories={[SECTION]}
        fixedSection={SECTION}
        onCancel={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText("Task title"), { target: { value: "Ship it" } });
    fireEvent.click(screen.getByRole("button", { name: /DF · Do First/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));
    await waitFor(() => expect(createItem).toHaveBeenCalledOnce());
    expect(setPriorityRank).not.toHaveBeenCalled();
  });

  it("takes the first free rank when the list has room", async () => {
    ranked = rankedDay(3);
    fillAndSubmit();
    await waitFor(() => expect(setPriorityRank).toHaveBeenCalledWith("new", 4));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("asks which priority to replace when all ten are taken", async () => {
    ranked = rankedDay(10);
    fillAndSubmit();
    const dialog = await screen.findByRole("dialog", { name: "Replace a priority" });
    expect(createItem).not.toHaveBeenCalled();
    expect(dialog).toHaveTextContent("Priority 10");

    fireEvent.click(screen.getByRole("button", { name: /P7 Priority 7/ }));
    await waitFor(() => expect(setPriorityRank).toHaveBeenCalledWith("new", 7));
    expect(createItem).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("backs out of the replace dialog without saving", async () => {
    ranked = rankedDay(10);
    fillAndSubmit();
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(createItem).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Task title") as HTMLInputElement).value).toBe("Ship it");
  });

  it("can add the task without a rank from the replace dialog", async () => {
    ranked = rankedDay(10);
    fillAndSubmit();
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Add without priority" }));
    await waitFor(() => expect(createItem).toHaveBeenCalledOnce());
    expect(setPriorityRank).not.toHaveBeenCalled();
  });
});
