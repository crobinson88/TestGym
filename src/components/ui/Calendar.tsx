import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn, todayIsoDate } from "@/lib/utils";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

const MONTH_YEAR = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });

function firstOfMonth(iso: string): string {
  const [y, m] = iso.split("-").map((p) => parseInt(p, 10));
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

function addMonths(iso: string, months: number): string {
  const [y, m] = iso.split("-").map((p) => parseInt(p, 10));
  const date = new Date(Date.UTC(y, m - 1 + months, 1));
  return date.toISOString().slice(0, 10);
}

// Days of the displayed month, padded with leading nulls so the first day lands
// on the correct Monday-start weekday column.
function monthGrid(monthIso: string): (string | null)[] {
  const [y, m] = monthIso.split("-").map((p) => parseInt(p, 10));
  const first = new Date(Date.UTC(y, m - 1, 1));
  const leading = (first.getUTCDay() + 6) % 7; // Mon = 0 … Sun = 6
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < leading; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return cells;
}

export function Calendar({
  value,
  min,
  onSelect,
  className,
}: {
  value?: string | null;
  min?: string;
  onSelect: (iso: string) => void;
  className?: string;
}) {
  const today = todayIsoDate();
  const [view, setView] = useState(() => firstOfMonth(value ?? min ?? today));
  const cells = monthGrid(view);

  return (
    <div className={cn("w-[260px] rounded-2xl border border-line bg-surface p-3 shadow-lg", className)}>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setView((v) => addMonths(v, -1))}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface2 hover:text-text"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-sm font-medium" aria-live="polite">
          {MONTH_YEAR.format(new Date(`${view}T00:00:00`))}
        </div>
        <button
          type="button"
          onClick={() => setView((v) => addMonths(v, 1))}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface2 hover:text-text"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[11px] text-muted">
        {WEEKDAYS.map((d, i) => (
          <div key={i} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((iso, i) =>
          iso == null ? (
            <div key={i} />
          ) : (
            <button
              key={i}
              type="button"
              disabled={min != null && iso < min}
              aria-pressed={iso === value}
              aria-label={iso}
              onClick={() => onSelect(iso)}
              className={cn(
                "flex h-9 items-center justify-center rounded-lg text-sm tabular-nums",
                "disabled:cursor-not-allowed disabled:text-muted/30 disabled:hover:bg-transparent",
                iso === value
                  ? "bg-accent font-semibold text-bg"
                  : "text-text hover:bg-surface2",
                iso === today && iso !== value && "ring-1 ring-inset ring-accent/40",
              )}
            >
              {parseInt(iso.slice(8, 10), 10)}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
