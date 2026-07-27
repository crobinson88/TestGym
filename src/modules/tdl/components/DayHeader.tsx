import { Archive, ChevronLeft, ChevronRight, Clock, Tags } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { addDays, prettyDate, todayIsoDate } from "@/lib/utils";
import type { LocalTdlDay, LocalTdlItem } from "../types";
import { dayCompletion } from "../hooks";
import { useCategories } from "../categories";
import { UNCATEGORISED, UNCATEGORISED_KEY } from "../sections";
import { isSnoozed } from "../snooze";
import { CalendarSyncButton } from "./CalendarSyncButton";
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
  const categories = useCategories();

  const liveKeys = new Set(categories.map((s) => s.key));
  const openBySection = new Map<string, number>();
  for (const s of categories) openBySection.set(s.key, 0);
  for (const i of items) {
    if (i.is_recurring || isSnoozed(i)) continue;
    if (i.status === "open" || i.status === "worked_today" || i.status === "ready_for_testing") {
      const key = liveKeys.has(i.section) ? i.section : UNCATEGORISED_KEY;
      openBySection.set(key, (openBySection.get(key) ?? 0) + 1);
    }
  }
  const chipCategories =
    (openBySection.get(UNCATEGORISED_KEY) ?? 0) > 0 ? [...categories, UNCATEGORISED] : categories;

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur">
      <div className="mb-3">
        <TargetPies
          engaged={c.active}
          priorityEngaged={c.priorityActive}
          reluctantDone={c.reluctantDone}
        />
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
        <Button
          variant="ghost"
          onClick={() => onNavigate(today)}
          disabled={snapshot_date === today}
          aria-label="Go to today"
          className="h-10 shrink-0 px-3 text-sm"
        >
          Today
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
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onNavigate("categories")}
            aria-label="Manage categories"
            className="h-10 w-10 shrink-0"
          >
            <Tags className="h-5 w-5" />
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
          <div className="text-[11px] tabular-nums text-muted">
            Did anyway {c.reluctantDone}/{c.reluctantTotal}
          </div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {snapshot_date === today && <ImportMeetingsButton />}
        <CalendarSyncButton snapshot_date={snapshot_date} items={items} categories={categories} />
        <ResetStatusesButton snapshot_date={snapshot_date} items={items} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {chipCategories.map((s) => (
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
