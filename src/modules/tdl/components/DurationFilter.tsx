import type { ReactNode } from "react";
import { Timer, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  DURATION_RANGE_PRESETS,
  EMPTY_DURATION_RANGE,
  describeDurationRange,
  durationRangePreset,
  isDurationRangeActive,
  matchingDurationPreset,
  type DurationRange,
} from "../duration";

const STEP_MIN = 5;

// Narrow a list to tasks of a given time requirement — "15m or less", "5 – 15m",
// or a hand-typed window. Used twice: on the day board (Time) and in the
// add-to-calendar modal (Length), so a window reads the same in both. The panel
// drops below the row it sits in (phone-first: full width, no popover).
export function DurationFilter({
  value,
  onChange,
  open,
  onToggle,
  disabled = false,
  label = "Time",
  heading = "Tasks of this length",
  title = "Filter by how long a task takes",
  minLabel = "Minimum block length in minutes",
  maxLabel = "Maximum block length in minutes",
  className,
  panelClassName,
  buttonClassName,
  footer,
}: {
  value: DurationRange;
  onChange: (range: DurationRange) => void;
  open: boolean;
  onToggle: () => void;
  disabled?: boolean;
  label?: string;
  heading?: string;
  title?: string;
  minLabel?: string;
  maxLabel?: string;
  className?: string;
  panelClassName?: string;
  buttonClassName?: string;
  footer?: ReactNode;
}) {
  const active = isDurationRangeActive(value);
  const preset = matchingDurationPreset(value);

  return (
    <>
      <Button
        variant={active ? "secondary" : "ghost"}
        onClick={onToggle}
        aria-expanded={open}
        aria-pressed={active}
        disabled={disabled}
        className={cn("h-10 shrink-0 px-3 text-sm", buttonClassName)}
        title={title}
      >
        <Timer className="h-4 w-4 sm:mr-1" />
        <span className="hidden sm:inline">{active ? describeDurationRange(value) : label}</span>
      </Button>
      {open && (
        <div
          className={cn(
            "order-last w-full rounded-2xl border border-line bg-surface p-3",
            className,
            panelClassName,
          )}
        >
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              {heading}
            </span>
            {active && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onChange(EMPTY_DURATION_RANGE)}
                disabled={disabled}
                className="ml-auto h-8 px-2 text-xs text-muted"
              >
                <X className="mr-1 h-3.5 w-3.5" /> Clear
              </Button>
            )}
          </div>
          <div
            role="group"
            aria-label="Block length presets"
            className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1"
          >
            {DURATION_RANGE_PRESETS.map((p) => {
              const on = preset === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => onChange(on ? EMPTY_DURATION_RANGE : durationRangePreset(p.key))}
                  aria-pressed={on}
                  disabled={disabled}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-2 text-xs disabled:opacity-50",
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
          <div className="mt-2 flex items-end gap-2">
            <label className="flex-1">
              <span className="mb-1 block text-[11px] text-muted">At least (min)</span>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                step={STEP_MIN}
                value={value.minMin ?? ""}
                onChange={(e) =>
                  onChange({ ...value, minMin: e.target.value === "" ? null : Number(e.target.value) })
                }
                disabled={disabled}
                aria-label={minLabel}
                className="h-11 px-3 text-sm"
              />
            </label>
            <label className="flex-1">
              <span className="mb-1 block text-[11px] text-muted">At most (min)</span>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                step={STEP_MIN}
                value={value.maxMin ?? ""}
                onChange={(e) =>
                  onChange({ ...value, maxMin: e.target.value === "" ? null : Number(e.target.value) })
                }
                disabled={disabled}
                aria-label={maxLabel}
                className="h-11 px-3 text-sm"
              />
            </label>
          </div>
          {footer}
        </div>
      )}
    </>
  );
}
