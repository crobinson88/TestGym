import { useState } from "react";
import { BellOff, ChevronLeft, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { dayMonth, todayIsoDate } from "@/lib/utils";
import { useSnoozedItems } from "../hooks";
import { useCategories } from "../categories";
import { matchesQuery } from "../search";
import { UNCATEGORISED, UNCATEGORISED_KEY } from "../sections";
import { unsnoozeItem } from "../repo";
import type { LocalTdlItem } from "../types";

export default function SnoozedView() {
  const navigate = useNavigate();
  const items = useSnoozedItems();
  const categories = useCategories();

  const [query, setQuery] = useState("");
  const filtered = (items ?? []).filter((i) => matchesQuery(i, query));

  const liveKeys = new Set(categories.map((c) => c.key));
  const labelByKey = new Map(categories.map((c) => [c.key, c.label]));
  const bySection = new Map<string, LocalTdlItem[]>();
  for (const item of filtered) {
    const key = liveKeys.has(item.section) ? item.section : UNCATEGORISED_KEY;
    const arr = bySection.get(key) ?? [];
    arr.push(item);
    bySection.set(key, arr);
  }
  const groups = [...categories, UNCATEGORISED].filter(
    (s) => (bySection.get(s.key)?.length ?? 0) > 0,
  );

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
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search snoozed…"
                aria-label="Search snoozed items"
                className="h-10 pl-9 text-sm"
              />
            </div>
            {groups.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted">
                No snoozed items match “{query.trim()}”.
              </div>
            ) : (
              groups.map((s) => (
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
                        <span>{labelByKey.get(item.section) ?? item.section}</span>
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
          </>
        )}
      </div>
    </div>
  );
}
