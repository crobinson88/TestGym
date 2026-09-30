import { useMemo, useState } from "react";
import {
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Layers,
  RotateCcw,
  StickyNote,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { cn, dayMonth, todayIsoDate } from "@/lib/utils";
import type { LocalTdlCompletion } from "@/lib/db";
import { SearchBox } from "../components/SearchBox";
import { SectionFilter } from "../components/SectionFilter";
import { CloseOutWeekButton } from "../components/CloseOutWeekButton";
import { useCategories } from "../categories";
import { UNCATEGORISED } from "../sections";
import {
  formatMinutes,
  groupByWeek,
  matchesCompletionQuery,
  summariseWeek,
  weekLabel,
  weekRangeLabel,
} from "../completed";
import { removeCompletion, setCompletionNote, useCompletions } from "../completions";

// The Completed list: what you finished, week by week. Entries are snapshots —
// the title and category were copied in at completion time, so the log still
// reads right after the task itself is archived, renamed or deleted.
export default function CompletedView() {
  const navigate = useNavigate();
  const entries = useCompletions();
  const categories = useCategories();
  const today = todayIsoDate();

  const [query, setQuery] = useState("");
  const [section, setSection] = useState<string | null>(null);

  const categoryOf = useMemo(() => {
    const byKey = new Map(categories.map((c) => [c.key, c]));
    return (key: string | null) => (key ? (byKey.get(key) ?? UNCATEGORISED) : UNCATEGORISED);
  }, [categories]);

  const matching = (entries ?? []).filter((e) => matchesCompletionQuery(e, query));

  // Category chips over the whole log, so the counts don't move as a week is
  // filtered out.
  const groups = useMemo(() => {
    const byKey = new Map<string, LocalTdlCompletion[]>();
    for (const e of matching) {
      const key = categoryOf(e.category_key).key;
      const arr = byKey.get(key) ?? [];
      arr.push(e);
      byKey.set(key, arr);
    }
    return [...categories, UNCATEGORISED]
      .filter((cfg) => (byKey.get(cfg.key)?.length ?? 0) > 0)
      .map((cfg) => ({ cfg, items: byKey.get(cfg.key)! }));
  }, [matching, categories, categoryOf]);

  const shown = section
    ? matching.filter((e) => categoryOf(e.category_key).key === section)
    : matching;
  const weeks = groupByWeek(shown);
  const allTime = summariseWeek(shown);

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => navigate(`/tdl/${today}`)}
          aria-label="Back to today"
          className="h-10 w-10"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-base font-semibold">Completed</h1>
        <span className="ml-auto rounded-full bg-surface2 px-2 py-0.5 text-[11px] tabular-nums text-muted">
          {entries?.length ?? 0}
        </span>
      </header>

      <div className="space-y-4 p-3">
        {!entries ? (
          <div className="p-6 text-center text-muted">Loading...</div>
        ) : entries.length === 0 ? (
          <div className="space-y-3 p-6 text-center">
            <p className="text-muted">Nothing completed yet.</p>
            <p className="text-xs text-muted">
              Send a task here from its “More” menu, a workstream from its header menu, or sweep up
              the week from the day view.
            </p>
            <div className="flex justify-center">
              <CloseOutWeekButton snapshot_date={today} />
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <SearchBox
                  value={query}
                  onChange={setQuery}
                  placeholder="Search completed…"
                  ariaLabel="Search completed work"
                  className="basis-full sm:flex-1"
                />
                <CloseOutWeekButton snapshot_date={today} />
              </div>
              <SectionFilter
                groups={groups}
                total={matching.length}
                value={section}
                onChange={setSection}
              />
              <p className="px-1 text-[11px] text-muted">
                {allTime.total} logged · {allTime.items} task
                {allTime.items === 1 ? "" : "s"} · {allTime.workstreams} workstream
                {allTime.workstreams === 1 ? "" : "s"} · {formatMinutes(allTime.minutes)}
              </p>
            </div>

            {weeks.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted">
                {query.trim()
                  ? `Nothing completed matches “${query.trim()}”.`
                  : "Nothing completed in this category."}
              </div>
            ) : (
              weeks.map((w) => (
                <section key={w.week_start} className="space-y-1">
                  <div className="flex items-baseline gap-2 px-1">
                    <h2 className="text-sm font-semibold">{weekLabel(w.week_start, today)}</h2>
                    <span className="text-[11px] text-muted">{weekRangeLabel(w.week_start)}</span>
                    <span className="ml-auto text-[11px] tabular-nums text-muted">
                      {w.summary.total} · {formatMinutes(w.summary.minutes)}
                    </span>
                  </div>
                  {w.summary.byCategory.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 px-1">
                      {w.summary.byCategory.map((c) => (
                        <span
                          key={c.key}
                          className="rounded-full bg-surface2 px-2 py-0.5 text-[11px] tabular-nums text-muted"
                        >
                          {categoryOf(c.key).label} {c.count}
                        </span>
                      ))}
                      {w.summary.sweptItems > 0 && (
                        <span className="rounded-full bg-surface2 px-2 py-0.5 text-[11px] tabular-nums text-muted">
                          +{w.summary.sweptItems} in workstreams
                        </span>
                      )}
                    </div>
                  )}
                  <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
                    {w.entries.map((e) => (
                      <EntryRow
                        key={e.id}
                        entry={e}
                        categoryLabel={categoryOf(e.category_key).label}
                      />
                    ))}
                  </ul>
                </section>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}

function EntryRow({
  entry,
  categoryLabel,
}: {
  entry: LocalTdlCompletion;
  categoryLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [draft, setDraft] = useState(entry.note ?? "");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const isWorkstream = entry.kind === "workstream";
  const swept = entry.swept_items.length;

  async function commitNote() {
    setEditingNote(false);
    await setCompletionNote(entry.id, draft);
  }

  return (
    <li className="border-b border-line/50 last:border-b-0">
      <div className="flex items-start gap-2 px-3 py-2">
        {isWorkstream ? (
          <Layers className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        ) : (
          <CheckCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm">{entry.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
            <span>{categoryLabel}</span>
            <span>·</span>
            <span>{dayMonth(entry.completed_on)}</span>
            {entry.time_estimate_min != null && (
              <>
                <span>·</span>
                <span>{formatMinutes(entry.time_estimate_min)}</span>
              </>
            )}
            {isWorkstream && (
              <>
                <span>·</span>
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  aria-expanded={expanded}
                  className="flex items-center gap-0.5 text-accent"
                >
                  {swept} task{swept === 1 ? "" : "s"}
                  <ChevronRight
                    className={cn("h-3 w-3 transition-transform", expanded && "rotate-90")}
                  />
                </button>
              </>
            )}
          </div>
          {entry.note && !editingNote && (
            <p className="mt-1 whitespace-pre-wrap text-xs text-muted">{entry.note}</p>
          )}
          {editingNote && (
            <textarea
              autoFocus
              value={draft}
              onChange={(ev) => setDraft(ev.target.value)}
              onBlur={() => void commitNote()}
              placeholder="What shipped, and why it mattered…"
              aria-label="Completion note"
              className="mt-1 w-full rounded-lg border border-line bg-bg px-2 py-1.5 text-xs text-text outline-none focus:border-accent"
              rows={2}
            />
          )}
          {expanded && swept > 0 && (
            <ul className="mt-1 space-y-0.5 border-l border-line pl-2">
              {entry.swept_items.map((s) => (
                <li key={s.item_id} className="truncate text-xs text-muted">
                  {s.title}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setDraft(entry.note ?? "");
            setEditingNote((v) => !v);
          }}
          aria-label={entry.note ? "Edit note" : "Add a note"}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-surface2",
            entry.note ? "text-accent" : "text-muted",
          )}
        >
          <StickyNote className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            if (!confirmRemove) {
              setConfirmRemove(true);
              return;
            }
            void removeCompletion(entry.id);
          }}
          onBlur={() => setConfirmRemove(false)}
          aria-label={
            isWorkstream ? "Put the workstream back on the board" : "Put the task back on the board"
          }
          title={
            isWorkstream
              ? "Re-opens the workstream; its swept tasks stay archived"
              : "Unarchives the task onto today's board"
          }
          className={cn(
            "flex h-9 shrink-0 items-center justify-center gap-1 rounded-lg px-2 text-xs hover:bg-surface2",
            confirmRemove ? "text-warn" : "text-muted",
          )}
        >
          <RotateCcw className="h-4 w-4" />
          {confirmRemove && "Sure?"}
        </button>
      </div>
    </li>
  );
}
