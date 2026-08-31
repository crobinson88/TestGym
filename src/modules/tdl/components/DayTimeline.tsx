import { useEffect, useRef } from "react";
import {
  CALENDAR_SOURCE_LABEL,
  layoutLanes,
  prettyDuration,
  prettyHourLabel,
  prettyMinutes,
  timelineRange,
  type BusyInterval,
  type ScheduledEvent,
} from "../calendar";

// Pixels per hour on the drawn day. Tall enough that a 15-minute block still
// shows its title on a phone.
const HOUR_PX = 72;
const GUTTER = "3.5rem";

type Block =
  | { kind: "busy"; start: number; end: number; id: string }
  | { kind: "event"; start: number; end: number; id: string; event: ScheduledEvent };

const SOURCE_TINT: Record<ScheduledEvent["source"], string> = {
  priorities: "border-accent/70 bg-accent/20 text-text",
  daily_tasks: "border-success/60 bg-success/15 text-text",
  do_first: "border-warn/60 bg-warn/15 text-text",
};

// A dummy day grid: hour lines, the calendar's existing busy blocks in grey,
// and the tasks about to be created as tinted blocks at their real times, so
// the shape of the day is visible before anything is written to Google.
export function DayTimeline({
  events,
  busy,
  fromMinutes,
  focusedId,
  onSelect,
}: {
  events: readonly ScheduledEvent[];
  busy: readonly BusyInterval[];
  fromMinutes: number;
  focusedId: string | null;
  onSelect: (id: string) => void;
}) {
  const focusedRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    focusedRef.current?.scrollIntoView({ block: "nearest" });
  }, [focusedId]);

  const blocks: Block[] = [
    ...busy.map((b, i) => ({ kind: "busy" as const, start: b.start, end: b.end, id: `busy-${i}` })),
    ...events.map((e) => ({
      kind: "event" as const,
      start: e.startMinutes,
      end: e.endMinutes,
      id: e.id,
      event: e,
    })),
  ];

  const range = timelineRange(blocks, { from: fromMinutes });
  const hours: number[] = [];
  for (let m = range.start; m <= range.end; m += 60) hours.push(m);
  const laid = layoutLanes(blocks);
  const top = (min: number) => ((min - range.start) / 60) * HOUR_PX;

  return (
    <div className="relative" style={{ height: ((range.end - range.start) / 60) * HOUR_PX + 8 }}>
      {hours.map((m) => (
        <div key={m} className="absolute inset-x-0 flex items-start" style={{ top: top(m) }}>
          <span className="w-14 shrink-0 pr-2 text-right text-[10px] leading-none text-muted">
            {prettyHourLabel(m)}
          </span>
          <span className="mt-[-1px] h-px flex-1 bg-line" />
        </div>
      ))}

      {laid.map(({ block, lane, lanes }) => {
        const height = Math.max(16, ((block.end - block.start) / 60) * HOUR_PX - 2);
        const width = `calc((100% - ${GUTTER}) / ${lanes})`;
        const left = `calc(${GUTTER} + (100% - ${GUTTER}) * ${lane} / ${lanes})`;
        const style = { top: top(block.start), height, width, left } as const;
        // A very short block has no room for vertical padding.
        const padY = height < 24 ? "py-0" : "py-1";

        if (block.kind === "busy") {
          return (
            <div
              key={block.id}
              className={`absolute overflow-hidden rounded-md border border-line bg-surface2/80 px-2 text-[10px] leading-4 text-muted ${padY}`}
              style={style}
              title={`Busy ${prettyMinutes(block.start)}–${prettyMinutes(block.end)}`}
            >
              Busy
            </div>
          );
        }

        const e = block.event;
        const focused = focusedId === e.id;
        return (
          <button
            key={block.id}
            ref={focused ? focusedRef : undefined}
            type="button"
            onClick={() => onSelect(e.id)}
            style={style}
            title={`${e.title} · ${prettyMinutes(e.startMinutes)} · ${prettyDuration(e.durationMin)} · ${CALENDAR_SOURCE_LABEL[e.source]}`}
            className={`absolute overflow-hidden rounded-md border px-2 text-left ${padY} ${SOURCE_TINT[e.source]} ${
              focused ? "ring-2 ring-inset ring-accent" : ""
            }`}
          >
            <span className="block truncate text-[11px] font-medium leading-tight">
              {e.pinned ? "📌 " : ""}
              {e.title}
            </span>
            {height > 26 && (
              <span className="block truncate text-[10px] leading-tight opacity-70">
                {prettyMinutes(e.startMinutes)} · {prettyDuration(e.durationMin)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
