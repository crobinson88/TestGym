import { useState } from "react";
import { ArchiveRestore, ChevronLeft, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { dayMonth, todayIsoDate } from "@/lib/utils";
import { useArchivedItems } from "../hooks";
import { useCategories } from "../categories";
import { groupBySection } from "../grouping";
import { matchesQuery } from "../search";
import {
  EMPTY_CREATED_RANGE,
  isCreatedRangeActive,
  matchesCreatedRange,
  type CreatedRange,
} from "../createdRange";
import { SectionFilter } from "../components/SectionFilter";
import { CreatedRangeFilter } from "../components/CreatedRangeFilter";
import { unarchiveItem } from "../repo";

export default function ArchiveView() {
  const navigate = useNavigate();
  const items = useArchivedItems();
  const categories = useCategories();

  const [query, setQuery] = useState("");
  const [section, setSection] = useState<string | null>(null);
  const [createdRange, setCreatedRange] = useState<CreatedRange>(EMPTY_CREATED_RANGE);
  const [rangeOpen, setRangeOpen] = useState(false);

  const filtered = (items ?? []).filter(
    (i) => matchesQuery(i, query) && matchesCreatedRange(i, createdRange),
  );
  const groups = groupBySection(filtered, categories);
  const shown = section ? groups.filter((g) => g.cfg.key === section) : groups;

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
        <h1 className="text-base font-semibold">Archived items</h1>
        <span className="ml-auto rounded-full bg-surface2 px-2 py-0.5 text-[11px] tabular-nums text-muted">
          {items?.length ?? 0}
        </span>
      </header>

      <div className="space-y-4 p-3">
        {!items ? (
          <div className="p-6 text-center text-muted">Loading...</div>
        ) : items.length === 0 ? (
          <div className="p-6 text-center text-muted">Nothing archived.</div>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <Input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search archived…"
                    aria-label="Search archived items"
                    className="h-10 pl-9 text-sm"
                  />
                </div>
                <CreatedRangeFilter
                  value={createdRange}
                  onChange={setCreatedRange}
                  open={rangeOpen}
                  onToggle={() => setRangeOpen((v) => !v)}
                />
              </div>
              <SectionFilter
                groups={groups}
                total={filtered.length}
                value={section}
                onChange={setSection}
              />
            </div>
            {shown.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted">
                {query.trim()
                  ? `No archived items match “${query.trim()}”.`
                  : isCreatedRangeActive(createdRange)
                    ? "No archived items added in this range."
                    : "No archived items in this category."}
              </div>
            ) : (
              shown.map((g) => (
                <div key={g.cfg.key}>
                  <h2 className="mb-1 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
                    {g.cfg.label}
                    <span className="tabular-nums text-muted/70">{g.items.length}</span>
                  </h2>
                  <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
                    {g.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center gap-2 border-b border-line/50 px-3 py-2 last:border-b-0"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm">{item.title}</div>
                          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                            <span>
                              {dayMonth(item.origin_snapshot_date ?? item.snapshot_date)}
                            </span>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void unarchiveItem(item.id)}
                          className="text-muted"
                        >
                          <ArchiveRestore className="mr-1 h-4 w-4" /> Unarchive
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
