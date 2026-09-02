import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { DayTimeline } from "./DayTimeline";
import { scheduleEvents, type CalendarCandidate } from "../calendar";

const HOUR_PX = 128;

function events() {
  const candidates: CalendarCandidate[] = [
    { id: "a", title: "Alpha", timeEstimateMin: 60, source: "priorities", sourceLabel: "Priority" },
    {
      id: "b",
      title: "Bravo",
      timeEstimateMin: 60,
      source: "daily_tasks",
      sourceLabel: "Daily Task",
    },
    { id: "c", title: "Charlie", timeEstimateMin: 60, source: "do_first", sourceLabel: "Do First" },
  ];
  return scheduleEvents(candidates, { date: "2026-07-27", startMinutes: 540 });
}

// The grid starts at 9am at y=0; a minute is HOUR_PX/60 pixels down from there.
function yFor(minutes: number): number {
  return ((minutes - 540) / 60) * HOUR_PX;
}

beforeEach(() => {
  // jsdom/happy-dom lay nothing out, so pin the grid's origin at y=0.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    top: 0,
    bottom: 1000,
    left: 0,
    right: 400,
    width: 400,
    height: 1000,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DayTimeline drag", () => {
  it("reports the dropped start time as the block is dragged", async () => {
    const onMove = vi.fn();
    render(
      <DayTimeline
        events={events()}
        busy={[]}
        fromMinutes={540}
        focusedId={null}
        onSelect={vi.fn()}
        onMove={onMove}
      />,
    );

    const block = screen.getByTitle(/^Alpha ·/);
    // Grab Alpha at its very top (9:00) and drag down to 11:00.
    fireEvent.pointerDown(block, { pointerId: 1, button: 0, clientY: yFor(540) });
    fireEvent.pointerMove(block, { pointerId: 1, clientY: yFor(660) });
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });

    expect(onMove).toHaveBeenCalledWith("a", 660);
    fireEvent.pointerUp(block, { pointerId: 1 });
  });

  it("keeps the grabbed point under the pointer", async () => {
    const onMove = vi.fn();
    render(
      <DayTimeline
        events={events()}
        busy={[]}
        fromMinutes={540}
        focusedId={null}
        onSelect={vi.fn()}
        onMove={onMove}
      />,
    );

    const block = screen.getByTitle(/^Bravo ·/);
    // Bravo runs 10:00–11:00; grab it halfway down and drop that point at 12:30.
    fireEvent.pointerDown(block, { pointerId: 1, button: 0, clientY: yFor(630) });
    fireEvent.pointerMove(block, { pointerId: 1, clientY: yFor(750) });
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });

    expect(onMove).toHaveBeenCalledWith("b", 720);
    fireEvent.pointerUp(block, { pointerId: 1 });
  });

  it("treats a press that never travels as a tap, not a drag", async () => {
    const onSelect = vi.fn();
    const onMove = vi.fn();
    render(
      <DayTimeline
        events={events()}
        busy={[]}
        fromMinutes={540}
        focusedId={null}
        onSelect={onSelect}
        onMove={onMove}
      />,
    );

    const block = screen.getByTitle(/^Charlie ·/);
    fireEvent.pointerDown(block, { pointerId: 1, button: 0, clientY: yFor(660) });
    fireEvent.pointerUp(block, { pointerId: 1, clientY: yFor(660) });
    fireEvent.click(block);
    expect(onMove).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith("c");
  });

  it("doesn't select the block a drag just moved", async () => {
    const onSelect = vi.fn();
    render(
      <DayTimeline
        events={events()}
        busy={[]}
        fromMinutes={540}
        focusedId={null}
        onSelect={onSelect}
        onMove={vi.fn()}
      />,
    );

    const block = screen.getByTitle(/^Alpha ·/);
    fireEvent.pointerDown(block, { pointerId: 1, button: 0, clientY: yFor(540) });
    fireEvent.pointerMove(block, { pointerId: 1, clientY: yFor(660) });
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });
    fireEvent.pointerUp(block, { pointerId: 1 });
    fireEvent.click(block);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("ignores a touch press on the block body so the day still scrolls", () => {
    const onMove = vi.fn();
    render(
      <DayTimeline
        events={events()}
        busy={[]}
        fromMinutes={540}
        focusedId={null}
        onSelect={vi.fn()}
        onMove={onMove}
      />,
    );

    const block = screen.getByTitle(/^Alpha ·/);
    fireEvent.pointerDown(block, { pointerId: 1, pointerType: "touch", clientY: yFor(540) });
    fireEvent.pointerMove(block, { pointerId: 1, pointerType: "touch", clientY: yFor(660) });
    expect(onMove).not.toHaveBeenCalled();
  });

  it("steps a block through the day with the arrow keys", () => {
    const onNudge = vi.fn();
    render(
      <DayTimeline
        events={events()}
        busy={[]}
        fromMinutes={540}
        focusedId={null}
        onSelect={vi.fn()}
        onMove={vi.fn()}
        onNudge={onNudge}
      />,
    );

    const block = screen.getByTitle(/^Bravo ·/);
    fireEvent.keyDown(block, { key: "ArrowUp" });
    fireEvent.keyDown(block, { key: "ArrowDown" });
    expect(onNudge.mock.calls).toEqual([
      ["b", -1],
      ["b", 1],
    ]);
  });

  it("doesn't offer a grip when the day isn't rearrangeable", () => {
    render(
      <DayTimeline
        events={events()}
        busy={[]}
        fromMinutes={540}
        focusedId={null}
        onSelect={vi.fn()}
      />,
    );
    const block = screen.getByTitle(/^Alpha ·/);
    fireEvent.pointerDown(block, { pointerId: 1, button: 0, clientY: yFor(540) });
    fireEvent.pointerMove(block, { pointerId: 1, clientY: yFor(660) });
    expect(block.title).not.toMatch(/drag/);
  });
});
