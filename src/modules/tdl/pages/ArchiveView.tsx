import { useState } from "react";
import { ArchiveRestore, ChevronLeft, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { dayMonth, todayIsoDate } from "@/lib/utils";
import { useArchivedItems } from "../hooks";
import { useCategories } from "../categories";
import { matchesQuery } from "../search";
import { unarchiveItem } from "../repo";

export default function ArchiveView() {
  const navigate = useNavigate();
  const items = useArchivedItems();
  const categories = useCategories();
  const labelByKey = new Map(categories.map((c) => [c.key, c.label]));

  const [query, setQuery] = useState("");
  const filtered = (items ?? []).filter((i) => matchesQuery(i, query));

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

      <div className="p-3">
        {!items ? (
          <div className="p-6 text-center text-muted">Loading...</div>
        ) : items.length === 0 ? (
          <div className="p-6 text-center text-muted">Nothing archived.</div>
        ) : (
          <>
            <div className="relative mb-3">
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
            {filtered.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted">
                No archived items match “{query.trim()}”.
              </div>
            ) : (
          <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
            {filtered.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-2 border-b border-line/50 px-3 py-2 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{item.title}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                    <span>{labelByKey.get(item.section) ?? item.section}</span>
                    <span>·</span>
                    <span>{dayMonth(item.origin_snapshot_date ?? item.snapshot_date)}</span>
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
            )}
          </>
        )}
      </div>
    </div>
  );
}
