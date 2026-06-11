import { Archive, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { addDays, prettyDate, todayIsoDate } from "@/lib/utils";
import type { LocalTdlDay, LocalTdlItem } from "../types";
import { dayCompletion } from "../hooks";
import { SECTIONS } from "../sections";
import { isSnoozed } from "../snooze";
import { ImportMeetingsButton } from "./ImportMeetingsButton";
import { ResetStatusesButton } from "./ResetStatusesButton";
import { TargetPies } from "./TargetPies";

export function DayHeader({
  snapshot_date,
  items,
  completionItems,
  onNavigate,
}: {
  snapshot_date: string;
  items: LocalTdlItem[];
  completionItems: LocalTdlItem[];
  day: LocalTdlDay | null;
  onNavigate: (next: string) => void;
}) {
  const c = dayCompletion(completionItems);
  const today = todayIsoDate();

  const openBySection = new Map<string, number>();
  for (const s of SECTIONS) openBySection.set(s.key, 0);
  for (const i of items) {
    if (i.is_recurring || isSnoozed(i)) continue;
    if (i.status === "open" || i.status === "worked_today" || i.status === "ready_for_testing") {
      openBySection.set(i.section, (openBySection.get(i.section) ?? 0) + 1);
    }
  }

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur">
      <div className="mb-3">
        <TargetPies engaged={c.active} priorityEngaged={c.priorityActive} />
      </div>
      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onNavigate(addDays(snapshot_date, -1))}
          aria-label="Previous day"
          className="h-10 w-10 shrink-0"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <Input
          type="date"
          value={snapshot_date}
          onChange={(e) => onNavigate(e.target.value)}
          className="h-10 min-w-0 flex-1 px-2 text-sm"
        />
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onNavigate(addDays(snapshot_date, 1))}
          aria-label="Next day"
          className="h-10 w-10 shrink-0"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <span className="truncate text-sm text-muted">
            {snapshot_date === today ? "Today" : prettyDate(snapshot_date)}
          </span>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onNavigate("snoozed")}
            aria-label="Snoozed items"
            className="h-10 w-10 shrink-0"
          >
            <Clock className="h-5 w-5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onNavigate("archive")}
            aria-label="Archived items"
            className="h-10 w-10 shrink-0"
          >
            <Archive className="h-5 w-5" />
          </Button>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[11px] uppercase tracking-wider text-muted">Active</div>
          <div className="text-lg font-bold tabular-nums">
            {c.active}/{c.total}
            <span className="ml-1 text-xs font-normal text-muted">
              {c.total === 0 ? "—" : `${Math.round(c.activeRatio * 100)}%`}
            </span>
          </div>
          <div className="text-[11px] tabular-nums text-muted">
            Priority {c.priorityActive}/{c.priorityTotal}
          </div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {snapshot_date === today && <ImportMeetingsButton />}
        <ResetStatusesButton snapshot_date={snapshot_date} items={items} />
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
      </div>
    </header>
  );
}
