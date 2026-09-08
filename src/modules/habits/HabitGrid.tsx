import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { DAY_OFF_LABEL } from "@/lib/holidays";
import { addDays, cn, prettyDate, todayIsoDate } from "@/lib/utils";
import {
  BED_TASK_NAME,
  HABIT_COLUMNS,
  currentStreak,
  nextMarkValue,
  tallyColumns,
  type HabitCell,
  type HabitDayRow,
  type ManualHabitKey,
} from "./compute";
import { setDayOff, setHabitMark, useHabitRows } from "./hooks";

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
  const [selected, setSelected] = useState<string | null>(null);
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
          <div key={row.date} className="space-y-px">
            <DayRow
              row={row}
              isToday={row.date === today}
              selected={selected === row.date}
              onSelect={() => setSelected((d) => (d === row.date ? null : row.date))}
            />
            {selected === row.date && (
              <DayOffEditor row={row} onClose={() => setSelected(null)} />
            )}
          </div>
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
        5:30 hits when time is logged before 6am; 9:30 when “{BED_TASK_NAME}” is logged by 9:30pm.
        Tap either to override a day (Y → N → back to the time log). The other four are read from
        your hours, to-do list and gym log. Tap a date to mark the day off (sick, PTO) — every
        column stands down and the streaks step over it.
      </div>
    </div>
  );
}

// The left-hand date cell doubles as the day-off toggle: "Off" when the day is
// marked off by hand, "Hol" on an empty US public holiday, else the weekday.
function dateBadge(row: HabitDayRow): string {
  if (row.isDayOff) return "Off";
  if (row.holiday) return "Hol";
  return dowLabel(row.date);
}

function dateTitle(row: HabitDayRow): string {
  const reason = row.isDayOff ? (row.dayOff ?? DAY_OFF_LABEL) : row.holiday;
  return reason ? `${prettyDate(row.date)} — ${reason}` : prettyDate(row.date);
}

function DayRow({
  row,
  isToday,
  selected,
  onSelect,
}: {
  row: HabitDayRow;
  isToday: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div className={cn(ROW_GRID, (row.isWeekend || row.holiday || row.isDayOff) && "opacity-60")}>
      <button
        type="button"
        onClick={onSelect}
        aria-expanded={selected}
        className={cn(
          "flex h-11 flex-col justify-center rounded-l-md px-2 text-left text-[11px] leading-tight transition hover:bg-surface2",
          isToday ? "bg-surface2 font-semibold text-text" : "text-muted",
          selected && "bg-surface2 text-text",
          row.isDayOff && "text-warn",
        )}
        title={dateTitle(row)}
      >
        <span>{dateBadge(row)}</span>
        <span className="tabular-nums">{dmLabel(row.date)}</span>
      </button>
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
        const habit = col.key as ManualHabitKey;
        return (
          <ManualCell
            key={col.key}
            date={row.date}
            habit={habit}
            label={col.label}
            cell={cell}
            override={row.marks[habit]}
            disabled={row.isFuture}
          />
        );
      })}
    </div>
  );
}

// Derived from the time log; tapping cycles a hand-set override on top of it.
function ManualCell({
  date,
  habit,
  label,
  cell,
  override,
  disabled,
}: {
  date: string;
  habit: ManualHabitKey;
  label: string;
  cell: HabitCell;
  override: boolean | null;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => void setHabitMark(date, habit, nextMarkValue(override))}
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

// Tapping a date opens this: mark the day off (sick, PTO) with an optional
// reason. A day off pauses every column and is stepped over by the streaks.
function DayOffEditor({ row, onClose }: { row: HabitDayRow; onClose: () => void }) {
  const [reason, setReason] = useState(row.dayOff ?? "");

  // Re-seed when a sync or another device changes the stored reason.
  useEffect(() => setReason(row.dayOff ?? ""), [row.date, row.dayOff]);

  const save = (off: boolean, text: string) => void setDayOff(row.date, off, text);

  return (
    <div className="rounded-md border border-line bg-surface2 p-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold">{prettyDate(row.date)}</div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {row.isDayOff ? (
        <div className="mt-2 space-y-2">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => save(true, reason)}
            placeholder="Sick, PTO, …"
            aria-label="Reason"
          />
          <button
            type="button"
            onClick={() => {
              save(false, "");
              onClose();
            }}
            className="h-11 w-full rounded-lg border border-line text-sm font-medium text-muted hover:bg-surface"
          >
            Clear day off
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => save(true, reason)}
          className="mt-2 h-11 w-full rounded-lg bg-warn/20 text-sm font-semibold text-warn hover:brightness-125"
        >
          Mark day off
        </button>
      )}
      <p className="mt-2 text-[11px] text-muted">
        Pauses every column and steps the streaks over the day — except Smoke-free, which keeps
        counting. Anything you do log still counts.
      </p>
    </div>
  );
}
