import { BellOff, ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { dayMonth, todayIsoDate } from "@/lib/utils";
import { useSnoozedItems } from "../hooks";
import { SECTIONS, SECTION_BY_KEY } from "../sections";
import { unsnoozeItem } from "../repo";
import type { LocalTdlItem } from "../types";

export default function SnoozedView() {
  const navigate = useNavigate();
  const items = useSnoozedItems();

  const bySection = new Map<string, LocalTdlItem[]>();
  for (const item of items ?? []) {
    const arr = bySection.get(item.section) ?? [];
    arr.push(item);
    bySection.set(item.section, arr);
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => navigate(`/tdl/${todayIsoDate()}`)}
          aria-label="Back to today"
          className="h-10 w-10"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-base font-semibold">Snoozed items</h1>
        <span className="ml-auto rounded-full bg-surface2 px-2 py-0.5 text-[11px] tabular-nums text-muted">
          {items?.length ?? 0}
        </span>
      </header>

      <div className="space-y-4 p-3">
        {!items ? (
          <div className="p-6 text-center text-muted">Loading...</div>
        ) : items.length === 0 ? (
          <div className="p-6 text-center text-muted">Nothing snoozed.</div>
        ) : (
          SECTIONS.filter((s) => (bySection.get(s.key)?.length ?? 0) > 0).map((s) => (
            <div key={s.key}>
              <h2 className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
                {s.label}
              </h2>
              <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
                {bySection.get(s.key)!.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-2 border-b border-line/50 px-3 py-2 last:border-b-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{item.title}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                        <span className="text-accent">
                          snoozed until {item.snoozed_until ? dayMonth(item.snoozed_until) : "—"}
                        </span>
                        <span>·</span>
                        <span>{SECTION_BY_KEY[item.section]?.label ?? item.section}</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void unsnoozeItem(item.id)}
                      className="text-muted"
                    >
                      <BellOff className="mr-1 h-4 w-4" /> Wake up
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
