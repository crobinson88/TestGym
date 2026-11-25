import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { syncEngine } from "@/lib/sync";
import { cn, prettyDate, todayIsoDate } from "@/lib/utils";
import { formatPMinutes, monthSummary, parseMinutesInput, type PDay, type PInstance } from "./compute";

const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
const MONTH_YEAR = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
const MINUTE_PRESETS = [5, 10, 15, 30];

const pad2 = (n: number) => String(n).padStart(2, "0");

export function PCalendar({ days }: { days: Map<string, PDay> }) {
  const today = todayIsoDate();
  const [ty, tm] = today.split("-").map((p) => parseInt(p, 10));
  const [view, setView] = useState({ year: ty, month: tm });
  const [selected, setSelected] = useState<string | null>(null);
  const { year, month } = view;

  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const lead = firstDow === 0 ? 6 : firstDow - 1;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${year}-${pad2(month)}-${pad2(d)}`);

  const summary = monthSummary(days, year, month);
  const atCurrentMonth = year === ty && month === tm;
  const changeMonth = (delta: 1 | -1) => {
    setSelected(null);
    setView((v) => {
      const next = v.month + delta;
      if (next < 1) return { year: v.year - 1, month: 12 };
      if (next > 12) return { year: v.year + 1, month: 1 };
      return { year: v.year, month: next };
    });
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={() => changeMonth(-1)}
          aria-label="Previous month"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface2"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-sm font-semibold">
          {MONTH_YEAR.format(new Date(year, month - 1, 1))}
        </div>
        <button
          onClick={() => changeMonth(1)}
          disabled={atCurrentMonth}
          aria-label="Next month"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface2 disabled:opacity-30"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((w, i) => (
          <div key={i} className="pb-1 text-center text-[10px] font-medium uppercase text-muted">
            {w}
          </div>
        ))}
        {cells.map((iso, i) => {
          if (!iso) return <div key={`b${i}`} />;
          const dayNum = parseInt(iso.slice(8), 10);
          if (iso > today) {
            return (
              <div
                key={iso}
                className="flex aspect-square items-center justify-center rounded-md border border-transparent text-xs tabular-nums text-muted/30"
              >
                {dayNum}
              </div>
            );
          }
          const v = days.get(iso);
          const active = !!v && v.count > 0;
          return (
            <button
              key={iso}
              onClick={() => setSelected((s) => (s === iso ? null : iso))}
              className={cn(
                "flex aspect-square flex-col items-center justify-center rounded-md border text-xs tabular-nums transition",
                active
                  ? "border-accent/40 bg-accent/20 font-semibold text-accent"
                  : "border-line/60 bg-surface2 text-muted hover:bg-surface",
                selected === iso && "ring-2 ring-accent",
              )}
              title={`${prettyDate(iso)}: ${
                active ? `${v!.count}× · ${formatPMinutes(v!.minutes)}` : "none"
              }`}
            >
              <span className={cn(active && "leading-none")}>{dayNum}</span>
              {active && (
                <span className="text-[9px] font-normal leading-none opacity-80">
                  {v!.count}×
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selected && (
        <PDayEditor
          key={selected}
          date={selected}
          day={days.get(selected)}
          onClose={() => setSelected(null)}
        />
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line/70 pt-3 text-xs text-muted">
        <span className="font-medium">{summary.activeDays} days</span>
        <span className="font-medium text-accent">{summary.count} times</span>
        <span className="font-medium">{formatPMinutes(summary.minutes)} total</span>
      </div>
      {!selected && (
        <div className="mt-1 text-center text-[11px] text-muted">Tap a day to count and log time</div>
      )}
    </div>
  );
}

function PDayEditor({
  date,
  day,
  onClose,
}: {
  date: string;
  day: PDay | undefined;
  onClose: () => void;
}) {
  const [minutes, setMinutes] = useState("");
  const instances = day?.instances ?? [];

  const add = async () => {
    await syncEngine.mutations.addPLog(date, parseMinutesInput(minutes));
    setMinutes("");
  };

  return (
    <div className="mt-3 rounded-xl border border-line bg-surface2/60 p-3">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">{prettyDate(date)}</div>
          <div className="text-xs text-muted">
            {instances.length}× · {formatPMinutes(day?.minutes ?? 0)}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface2"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {instances.length > 0 && (
        <ul className="mb-3 space-y-2">
          {instances.map((inst, i) => (
            <PInstanceRow key={inst.id} index={i + 1} instance={inst} />
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="Minutes"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
          }}
          className="flex-1 text-center text-lg font-semibold tabular-nums"
          aria-label="Minutes"
        />
        <Button variant="primary" onClick={add} className="shrink-0">
          <Plus className="mr-1 h-5 w-5" />
          Count
        </Button>
      </div>
      <div className="mt-2 flex gap-2">
        {MINUTE_PRESETS.map((m) => (
          <button
            key={m}
            onClick={() => setMinutes(String(m))}
            className={cn(
              "h-10 flex-1 rounded-lg border text-sm tabular-nums transition",
              minutes === String(m)
                ? "border-accent bg-accent/15 text-accent"
                : "border-line text-muted hover:bg-surface2",
            )}
          >
            {m}m
          </button>
        ))}
      </div>
      <div className="mt-1 text-center text-[11px] text-muted">
        Leave minutes blank to count without a time
      </div>
    </div>
  );
}

function PInstanceRow({ index, instance }: { index: number; instance: PInstance }) {
  const stored = instance.minutes == null ? "" : String(instance.minutes);
  const [value, setValue] = useState(stored);

  const commit = () => {
    const next = parseMinutesInput(value);
    if (next === instance.minutes) return;
    void syncEngine.mutations.updatePLog(instance.id, next);
  };

  return (
    <li className="flex items-center gap-2">
      <span className="w-8 text-center text-xs font-medium tabular-nums text-muted">#{index}</span>
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        placeholder="—"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="flex-1 text-center tabular-nums"
        aria-label={`Minutes for #${index}`}
      />
      <span className="text-xs text-muted">min</span>
      <button
        onClick={() => void syncEngine.mutations.deletePLog(instance.id)}
        aria-label={`Delete #${index}`}
        className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-surface2 hover:text-danger"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}
