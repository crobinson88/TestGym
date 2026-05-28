import { ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { addDays, prettyDate, todayIsoDate } from "@/lib/utils";
import type { LocalTdlDay, LocalTdlItem } from "../types";
import { dayCompletion } from "../hooks";
import { upsertDay } from "../repo";
import { SECTIONS } from "../sections";

export function DayHeader({
  snapshot_date,
  items,
  day,
  onNavigate,
}: {
  snapshot_date: string;
  items: LocalTdlItem[];
  day: LocalTdlDay | null;
  onNavigate: (next: string) => void;
}) {
  const c = dayCompletion(items);
  const today = todayIsoDate();

  const openBySection = new Map<string, number>();
  for (const s of SECTIONS) openBySection.set(s.key, 0);
  for (const i of items) {
    if (i.is_recurring) continue;
    if (i.status === "open" || i.status === "worked_today" || i.status === "ready_for_testing") {
      openBySection.set(i.section, (openBySection.get(i.section) ?? 0) + 1);
    }
  }

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onNavigate(addDays(snapshot_date, -1))}
            aria-label="Previous day"
            className="h-10 w-10"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Input
            type="date"
            value={snapshot_date}
            onChange={(e) => onNavigate(e.target.value)}
            className="h-10 w-[160px] px-2 text-sm"
          />
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onNavigate(addDays(snapshot_date, 1))}
            aria-label="Next day"
            className="h-10 w-10"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
          <span className="ml-1 text-sm text-muted">
            {snapshot_date === today ? "Today" : prettyDate(snapshot_date)}
          </span>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wider text-muted">Done</div>
          <div className="text-lg font-bold tabular-nums">
            {c.done}/{c.total}
            <span className="ml-1 text-xs font-normal text-muted">
              {c.total === 0 ? "—" : `${Math.round(c.ratio * 100)}%`}
            </span>
          </div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {SECTIONS.map((s) => (
          <span
            key={s.key}
            className="rounded-full bg-surface2 px-2 py-0.5 text-[11px] tabular-nums text-muted"
            title={`${s.label}: ${openBySection.get(s.key) ?? 0} open`}
          >
            {s.label}: {openBySection.get(s.key) ?? 0}
          </span>
        ))}
        <label className="ml-auto flex items-center gap-1 text-[11px] text-muted">
          Limiting factor:
          <input
            type="date"
            value={day?.limiting_factor_date ?? ""}
            onChange={(e) => {
              const v = e.target.value || null;
              void upsertDay(snapshot_date, { limiting_factor_date: v });
            }}
            className="h-7 rounded-md border border-line bg-surface px-1 text-[11px] text-text"
          />
        </label>
      </div>
    </header>
  );
}
