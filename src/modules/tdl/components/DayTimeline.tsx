import { useCallback, useEffect, useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import {
  layoutLanes,
  prettyDuration,
  prettyHourLabel,
  prettyMinutes,
  snapMinutes,
  timelineRange,
  type BusyInterval,
  type ScheduledEvent,
} from "../calendar";

// Pixels per hour on the drawn day. Roomy enough that a 30-minute block reads
// at body size and a 15-minute one still shows its title — a taller day you
// scroll beats a dense one you have to squint at.
const HOUR_PX = 128;
const GUTTER = "4.25rem";
// A press has to travel this far before it counts as a drag rather than a tap.
const DRAG_THRESHOLD_PX = 4;
// Dragging within this much of the scroller's edge pulls the day along with it.
const EDGE_PX = 56;
const EDGE_SPEED_PX = 14;

type Block =
  | { kind: "busy"; start: number; end: number; id: string }
  | { kind: "event"; start: number; end: number; id: string; event: ScheduledEvent };

const SOURCE_TINT: Record<ScheduledEvent["source"], string> = {
  priorities: "border-accent/70 bg-accent/20 text-text",
  do_first: "border-warn/60 bg-warn/15 text-text",
  daily_tasks: "border-success/60 bg-success/15 text-text",
  category: "border-line bg-surface2 text-text",
};

interface DragState {
  id: string;
  pointerId: number;
  el: HTMLElement;
  // Minutes between the block's start and where it was grabbed, so the block
  // keeps that point under the pointer as it moves.
  grabOffsetMin: number;
  originY: number;
  lastY: number;
  lastStart: number;
  moved: boolean;
  scroller: HTMLElement | null;
  raf: number;
}

// Nearest ancestor that actually scrolls, for edge auto-scroll while dragging.
function findScroller(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const overflow = getComputedStyle(node).overflowY;
    if (/(auto|scroll)/.test(overflow) && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
}

// A day grid: hour lines, the calendar's existing busy blocks in grey, and the
// tasks about to be created as tinted blocks at their real times, so the shape
// of the day is visible before anything is written to Google.
//
// Blocks drag up and down to reorganise the day: `onMove` is called with the
// minute the block was dropped on, live through the drag, so the caller can
// re-flow every other block's start and end around it.
export function DayTimeline({
  events,
  busy,
  fromMinutes,
  focusedId,
  onSelect,
  onMove,
  onNudge,
}: {
  events: readonly ScheduledEvent[];
  busy: readonly BusyInterval[];
  fromMinutes: number;
  focusedId: string | null;
  onSelect: (id: string) => void;
  onMove?: (id: string, startMinutes: number) => void;
  onNudge?: (id: string, delta: number) => void;
}) {
  const focusedRef = useRef<HTMLButtonElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const rangeRef = useRef({ start: fromMinutes, end: fromMinutes });
  // A drag ends with a click on the block; swallow that one so moving a block
  // doesn't also count as picking it.
  const swallowClickRef = useRef(false);
  const [drag, setDrag] = useState<{ id: string; startMinutes: number } | null>(null);

  // The frame loop below runs off a closure captured when the drag started, so
  // it reads the caller's current handler through a ref rather than a stale one.
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  const movable = !!onMove;

  useEffect(() => {
    if (!drag) focusedRef.current?.scrollIntoView({ block: "nearest" });
  }, [focusedId, drag]);

  // Don't leave a frame loop running if we unmount mid-drag.
  useEffect(
    () => () => {
      if (dragRef.current) cancelAnimationFrame(dragRef.current.raf);
    },
    [],
  );

  // The block under the pointer floats above the grid at its dropped time; the
  // rest lay out normally, so only the day beneath it re-flows.
  const dragged = drag ? (events.find((e) => e.id === drag.id) ?? null) : null;
  const draggedSpan =
    dragged && drag
      ? { start: drag.startMinutes, end: drag.startMinutes + dragged.durationMin }
      : null;

  const blocks: Block[] = [
    ...busy.map((b, i) => ({ kind: "busy" as const, start: b.start, end: b.end, id: `busy-${i}` })),
    ...events
      .filter((e) => e.id !== dragged?.id)
      .map((e) => ({
        kind: "event" as const,
        start: e.startMinutes,
        end: e.endMinutes,
        id: e.id,
        event: e,
      })),
  ];

  const range = timelineRange(draggedSpan ? [...blocks, draggedSpan] : blocks, {
    from: fromMinutes,
  });
  rangeRef.current = range;
  const hours: number[] = [];
  for (let m = range.start; m <= range.end; m += 60) hours.push(m);
  const laid = layoutLanes(blocks);
  const top = (min: number) => ((min - range.start) / 60) * HOUR_PX;

  // Pointer Y → the block start that puts the grabbed point back under it.
  const startForPointer = useCallback((clientY: number, grabOffsetMin: number) => {
    const containerTop = containerRef.current?.getBoundingClientRect().top ?? 0;
    const pointerMin = rangeRef.current.start + ((clientY - containerTop) / HOUR_PX) * 60;
    return snapMinutes(Math.max(0, pointerMin - grabOffsetMin));
  }, []);

  // One frame loop drives both the auto-scroll and the re-flow, so the day
  // keeps moving while the pointer is parked at the edge of the scroller.
  const tick = useCallback(() => {
    const d = dragRef.current;
    if (!d) return;
    if (d.moved) {
      if (d.scroller) {
        const rect = d.scroller.getBoundingClientRect();
        if (d.lastY < rect.top + EDGE_PX) d.scroller.scrollTop -= EDGE_SPEED_PX;
        else if (d.lastY > rect.bottom - EDGE_PX) d.scroller.scrollTop += EDGE_SPEED_PX;
      }
      const start = startForPointer(d.lastY, d.grabOffsetMin);
      if (start !== d.lastStart) {
        d.lastStart = start;
        setDrag({ id: d.id, startMinutes: start });
        onMoveRef.current?.(d.id, start);
      }
    }
    d.raf = requestAnimationFrame(tick);
  }, [startForPointer]);

  function beginDrag(e: React.PointerEvent<HTMLElement>, block: ScheduledEvent, viaGrip: boolean) {
    swallowClickRef.current = false;
    if (!onMove || dragRef.current) return;
    // On touch only the grip starts a drag — pressing anywhere else keeps
    // scrolling the day. A mouse or pen can grab the block anywhere.
    if (e.pointerType === "touch" && !viaGrip) return;
    if (e.button > 0) return;
    const el = e.currentTarget;
    // Capture keeps the moves coming when the pointer leaves the block; not
    // every engine implements it, and a stale pointer id throws.
    try {
      el.setPointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
    const containerTop = containerRef.current?.getBoundingClientRect().top ?? 0;
    const pointerMin = rangeRef.current.start + ((e.clientY - containerTop) / HOUR_PX) * 60;
    dragRef.current = {
      id: block.id,
      pointerId: e.pointerId,
      el,
      grabOffsetMin: pointerMin - block.startMinutes,
      originY: e.clientY,
      lastY: e.clientY,
      lastStart: block.startMinutes,
      moved: false,
      scroller: findScroller(containerRef.current),
      raf: requestAnimationFrame(tick),
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    d.lastY = e.clientY;
    if (!d.moved && Math.abs(e.clientY - d.originY) >= DRAG_THRESHOLD_PX) {
      d.moved = true;
      setDrag({ id: d.id, startMinutes: d.lastStart });
    }
  }

  function endDrag(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    cancelAnimationFrame(d.raf);
    try {
      d.el.releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
    dragRef.current = null;
    setDrag(null);
    // A press that never travelled is a tap — let its click through to select.
    swallowClickRef.current = d.moved;
  }

  // `start` is where the block is drawn (under the pointer while dragging);
  // `labelStart` is the time it will actually take once the day re-flows.
  function eventBlock(
    e: ScheduledEvent,
    start: number,
    style: React.CSSProperties,
    moving: boolean,
    labelStart = start,
  ) {
    const height = Number(style.height) || 0;
    const focused = focusedId === e.id;
    return (
      <button
        key={e.id}
        ref={focused && !moving ? focusedRef : undefined}
        type="button"
        onPointerDown={(ev) => beginDrag(ev, e, false)}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={() => {
          if (swallowClickRef.current) {
            swallowClickRef.current = false;
            return;
          }
          onSelect(e.id);
        }}
        onKeyDown={(ev) => {
          if (!onNudge) return;
          if (ev.key === "ArrowUp") {
            ev.preventDefault();
            onNudge(e.id, -1);
          } else if (ev.key === "ArrowDown") {
            ev.preventDefault();
            onNudge(e.id, 1);
          }
        }}
        style={style}
        title={`${e.title} · ${prettyMinutes(labelStart)} · ${prettyDuration(e.durationMin)} · ${
          e.sourceLabel
        }${movable ? " — drag to move it, or arrow keys to reorder" : ""}`}
        className={`absolute select-none overflow-hidden rounded-lg border pr-2 text-left ${
          height < 34 ? "py-0.5" : "py-1.5"
        } ${movable ? "pl-8" : "pl-2"} ${SOURCE_TINT[e.source]} ${
          moving
            ? "z-20 cursor-grabbing opacity-95 shadow-lg ring-2 ring-inset ring-accent"
            : `${movable ? "sm:cursor-grab" : ""} ${focused ? "z-10 ring-2 ring-inset ring-accent" : ""}`
        }`}
      >
        {movable && (
          <span
            onPointerDown={(ev) => {
              ev.stopPropagation();
              beginDrag(ev, e, true);
            }}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onClick={(ev) => ev.stopPropagation()}
            aria-hidden
            style={{ touchAction: "none" }}
            className="absolute inset-y-0 left-0 flex w-8 items-center justify-center text-muted"
          >
            <GripVertical className="h-4 w-4" />
          </span>
        )}
        <span className="block truncate text-sm font-medium leading-tight">
          {e.pinned ? "📌 " : ""}
          {e.title}
        </span>
        {height > 40 && (
          <span className="block truncate text-xs leading-tight opacity-70">
            {prettyMinutes(labelStart)} · {prettyDuration(e.durationMin)}
          </span>
        )}
        {height > 74 && (
          <span className="mt-1 block truncate text-xs leading-tight opacity-60">
            {e.sourceLabel}
          </span>
        )}
      </button>
    );
  }

  const blockHeight = (start: number, end: number) =>
    Math.max(24, ((end - start) / 60) * HOUR_PX - 3);

  return (
    <div
      ref={containerRef}
      className="relative"
      style={{ height: ((range.end - range.start) / 60) * HOUR_PX + 8 }}
    >
      {hours.map((m) => (
        <div key={m} className="absolute inset-x-0 flex items-start" style={{ top: top(m) }}>
          <span className="w-16 shrink-0 pr-2 text-right text-xs leading-none text-muted">
            {prettyHourLabel(m)}
          </span>
          <span className="mt-[-1px] h-px flex-1 bg-line" />
        </div>
      ))}

      {laid.map(({ block, lane, lanes }) => {
        const style = {
          top: top(block.start),
          height: blockHeight(block.start, block.end),
          width: `calc((100% - ${GUTTER}) / ${lanes})`,
          left: `calc(${GUTTER} + (100% - ${GUTTER}) * ${lane} / ${lanes})`,
        };

        if (block.kind === "busy") {
          return (
            <div
              key={block.id}
              className={`absolute overflow-hidden rounded-lg border border-line bg-surface2/80 px-2 text-xs leading-5 text-muted ${
                style.height < 34 ? "py-0.5" : "py-1.5"
              }`}
              style={style}
              title={`Busy ${prettyMinutes(block.start)}–${prettyMinutes(block.end)}`}
            >
              Busy
            </div>
          );
        }
        return eventBlock(block.event, block.start, style, false);
      })}

      {dragged && draggedSpan && (
        <>
          {/* Where the block lands once the day re-flows around it. */}
          <div
            aria-hidden
            className="absolute rounded-lg border-2 border-dashed border-accent/50"
            style={{
              top: top(dragged.startMinutes),
              height: blockHeight(dragged.startMinutes, dragged.endMinutes),
              width: `calc(100% - ${GUTTER})`,
              left: GUTTER,
            }}
          />
          {eventBlock(
            dragged,
            draggedSpan.start,
            {
              top: top(draggedSpan.start),
              height: blockHeight(draggedSpan.start, draggedSpan.end),
              width: `calc(100% - ${GUTTER})`,
              left: GUTTER,
            },
            true,
            dragged.startMinutes,
          )}
        </>
      )}
    </div>
  );
}
