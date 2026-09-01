import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, cn, prettyDate, todayIsoDate } from "@/lib/utils";
import {
  HABIT_COLUMNS,
  currentStreak,
  nextMarkValue,
  tallyColumns,
  type HabitCell,
  type HabitDayRow,
  type ManualHabitKey,
} from "./compute";
import { setHabitMark, useHabitRows } from "./hooks";

const WINDOW_DAYS = 14;

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dowLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map((p) => parseInt(p, 10));
  return DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

// d/m, matching the spreadsheet this grid replaces (lib's dayMonth is "12 Mar").
function dmLabel(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${parseInt(d, 10)}/${parseInt(m, 10)}`;
}

const STATE_CLASS: Record<HabitCell["state"], string> = {
  hit: "bg-success/20 text-success",
  miss: "bg-danger/20 text-danger",
  none: "bg-surface2 text-muted/60",
};

// Grid template shared by the header, every day row and the tally footer.
const ROW_GRID = "grid grid-cols-[4.5rem_repeat(6,minmax(0,1fr))] gap-px";

export function HabitGrid() {
  const today = todayIsoDate();
  const [offset, setOffset] = useState(0);
  const endDate = addDays(today, offset * WINDOW_DAYS);
  const rows = useHabitRows(endDate, WINDOW_DAYS);

  if (!rows) return <div className="py-10 text-center text-sm text-muted">Loading…</div>;

  // Newest day first: today stays at the top of the phone screen.
  const ordered = [...rows].reverse();
  const tallies = tallyColumns(rows);
  const startDate = rows[0].date;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={() => setOffset((o) => o - 1)}
          aria-label="Earlier days"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface2"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-sm font-semibold tabular-nums">
          {dmLabel(startDate)} – {dmLabel(endDate)}
        </div>
        <button
          onClick={() => setOffset((o) => o + 1)}
          disabled={offset >= 0}
          aria-label="Later days"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface2 disabled:opacity-30"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className={cn(ROW_GRID, "mb-1")}>
        <div />
        {HABIT_COLUMNS.map((col) => (
          <div
            key={col.key}
            title={col.hint}
            className="pb-1 text-center text-[10px] font-medium uppercase leading-tight text-muted"
          >
            {col.short}
          </div>
        ))}
      </div>

      <div className="space-y-px">
        {ordered.map((row) => (
          <DayRow key={row.date} row={row} isToday={row.date === today} />
        ))}
      </div>

      <div className={cn(ROW_GRID, "mt-2 border-t border-line/70 pt-2")}>
        <div className="text-[10px] uppercase tracking-wide text-muted">Hit</div>
        {tallies.map((t) => (
          <div key={t.key} className="text-center text-[11px] tabular-nums text-muted">
            {t.marked === 0 ? "—" : `${t.hit}/${t.marked}`}
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-line/70 pt-3 text-[11px] text-muted">
        {HABIT_COLUMNS.filter((c) => c.manual).map((c) => (
          <span key={c.key}>
            {c.label}: <span className="font-medium text-text">{currentStreak(rows, c.key)}</span>{" "}
            day streak
          </span>
        ))}
      </div>
      <div className="mt-1 text-[11px] text-muted">
        Tap 5:30 / 9:30 to cycle Y → N → blank. The other four are read from your hours, to-do list
        and gym log.
      </div>
    </div>
  );
}

function DayRow({ row, isToday }: { row: HabitDayRow; isToday: boolean }) {
  return (
    <div className={cn(ROW_GRID, row.isWeekend && "opacity-60")}>
      <div
        className={cn(
          "flex h-11 flex-col justify-center rounded-l-md px-2 text-[11px] leading-tight",
          isToday ? "bg-surface2 font-semibold text-text" : "text-muted",
        )}
        title={prettyDate(row.date)}
      >
        <span>{dowLabel(row.date)}</span>
        <span className="tabular-nums">{dmLabel(row.date)}</span>
      </div>
      {HABIT_COLUMNS.map((col) => {
        const cell = row.cells[col.key];
        if (!col.manual) {
          return (
            <div
              key={col.key}
              title={`${col.label} — ${cell.title}`}
              className={cn(
                "flex h-11 items-center justify-center text-xs font-semibold tabular-nums",
                STATE_CLASS[cell.state],
              )}
            >
              {cell.text}
            </div>
          );
        }
        return (
          <ManualCell
            key={col.key}
            date={row.date}
            habit={col.key as ManualHabitKey}
            label={col.label}
            cell={cell}
            disabled={row.isFuture}
          />
        );
      })}
    </div>
  );
}

function ManualCell({
  date,
  habit,
  label,
  cell,
  disabled,
}: {
  date: string;
  habit: ManualHabitKey;
  label: string;
  cell: HabitCell;
  disabled: boolean;
}) {
  const current = cell.state === "hit" ? true : cell.state === "miss" ? false : null;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => void setHabitMark(date, habit, nextMarkValue(current))}
      title={`${label} — ${cell.title}`}
      className={cn(
        "flex h-11 items-center justify-center text-xs font-semibold transition disabled:opacity-40",
        STATE_CLASS[cell.state],
        !disabled && "hover:brightness-125",
      )}
    >
      {cell.text}
    </button>
  );
}
