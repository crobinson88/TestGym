import { CalendarRange, X } from "lucide-react";
import { cn, todayIsoDate } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  CREATED_RANGE_PRESETS,
  EMPTY_CREATED_RANGE,
  createdRangePreset,
  describeCreatedRange,
  isCreatedRangeActive,
  matchingPreset,
  type CreatedRange,
} from "../createdRange";

// Narrow the board to tasks added within a date window. The panel drops below
// the search row (phone-first: full width, no floating popover) with presets for
// the common windows and two date inputs for anything else.
export function CreatedRangeFilter({
  value,
  onChange,
  open,
  onToggle,
  today = todayIsoDate(),
}: {
  value: CreatedRange;
  onChange: (range: CreatedRange) => void;
  open: boolean;
  onToggle: () => void;
  today?: string;
}) {
  const active = isCreatedRangeActive(value);
  const preset = matchingPreset(value, today);

  return (
    <>
      <Button
        variant={active ? "secondary" : "ghost"}
        onClick={onToggle}
        aria-expanded={open}
        aria-pressed={active}
        className="h-10 shrink-0 px-3 text-sm"
        title="Filter by the date a task was added"
      >
        <CalendarRange className="h-4 w-4 sm:mr-1" />
        <span className="hidden sm:inline">
          {active ? describeCreatedRange(value, today) : "Added"}
        </span>
      </Button>
      {open && (
        <div className="order-last w-full rounded-2xl border border-line bg-surface p-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              Added between
            </span>
            {active && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onChange(EMPTY_CREATED_RANGE)}
                className="ml-auto h-8 px-2 text-xs text-muted"
              >
                <X className="mr-1 h-3.5 w-3.5" /> Clear
              </Button>
            )}
          </div>
          <div
            role="group"
            aria-label="Added date presets"
            className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1"
          >
            {CREATED_RANGE_PRESETS.map((p) => {
              const on = preset === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() =>
                    onChange(on ? EMPTY_CREATED_RANGE : createdRangePreset(p.key, today))
                  }
                  aria-pressed={on}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-2 text-xs",
                    on
                      ? "bg-accent/15 text-accent ring-1 ring-accent/40"
                      : "bg-surface2 text-muted hover:text-text",
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <label className="flex-1">
              <span className="mb-1 block text-[11px] text-muted">From</span>
              <Input
                type="date"
                value={value.from ?? ""}
                max={value.to ?? undefined}
                onChange={(e) => onChange({ ...value, from: e.target.value || null })}
                aria-label="Added from"
                className="h-11 px-3 text-sm"
              />
            </label>
            <label className="flex-1">
              <span className="mb-1 block text-[11px] text-muted">To</span>
              <Input
                type="date"
                value={value.to ?? ""}
                min={value.from ?? undefined}
                onChange={(e) => onChange({ ...value, to: e.target.value || null })}
                aria-label="Added to"
                className="h-11 px-3 text-sm"
              />
            </label>
          </div>
        </div>
      )}
    </>
  );
}
