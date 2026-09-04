import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Minus,
  Pin,
  Plus,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/lib/auth";
import type { SectionConfig } from "../sections";
import type { LocalTdlItem } from "../types";
import {
  DEFAULT_DURATION_MIN,
  DEFAULT_END_MINUTES,
  DEFAULT_START_MINUTES,
  DURATION_STEP_MIN,
  MAX_DURATION_MIN,
  MIN_DURATION_MIN,
  applyCandidateOrder,
  clampDuration,
  collectCalendarCandidates,
  googleCalendarDayUrl,
  groupCandidates,
  matchesCandidateQuery,
  minutesToTime,
  parseTimeToMinutes,
  prettyDuration,
  prettyMinutes,
  reorderByStep,
  reorderForDrop,
  scheduleEvents,
  type BusyInterval,
  type CalendarCandidate,
  type CalendarOverride,
  type CandidateGroup,
  type ScheduledEvent,
} from "../calendar";
import { DayTimeline } from "./DayTimeline";

// Quick block lengths offered next to the stepper.
const DURATION_PRESETS = [15, 30, 45, 60, 90];

// The device's IANA zone, so events land at the wall-clock time the user sees.
function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  } catch {
    return "America/New_York";
  }
}

// The day's UTC window ["YYYY-MM-DDT00:00" local, next midnight local), built
// from the browser's own clock so the offset is correct for the viewed day.
function dayWindowUtc(date: string): { timeMin: string; timeMax: string } {
  const [y, m, d] = date.split("-").map(Number);
  return {
    timeMin: new Date(y, m - 1, d, 0, 0, 0, 0).toISOString(),
    timeMax: new Date(y, m - 1, d + 1, 0, 0, 0, 0).toISOString(),
  };
}

// Convert Google's UTC busy periods into minutes-from-midnight of `date`,
// clamped to the day, so the pure scheduler can slot around them.
function toBusyMinutes(
  periods: readonly { start: string; end: string }[],
  date: string,
): BusyInterval[] {
  const [y, m, d] = date.split("-").map(Number);
  const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  const clamp = (n: number) => Math.max(0, Math.min(24 * 60, n));
  return periods
    .map((p) => ({
      start: clamp(Math.round((new Date(p.start).getTime() - dayStart) / 60000)),
      end: clamp(Math.round((new Date(p.end).getTime() - dayStart) / 60000)),
    }))
    // Drop empty blocks and all-day markers (which span the whole day and would
    // otherwise shove every task past midnight).
    .filter((b) => b.end > b.start && !(b.start <= 0 && b.end >= 24 * 60));
}

export function CalendarSyncButton({
  snapshot_date,
  items,
  categories,
}: {
  snapshot_date: string;
  items: LocalTdlItem[];
  categories: SectionConfig[];
}) {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [startTime, setStartTime] = useState(minutesToTime(DEFAULT_START_MINUTES));
  const [endTime, setEndTime] = useState(minutesToTime(DEFAULT_END_MINUTES));
  const [overrides, setOverrides] = useState<Record<string, CalendarOverride>>({});
  // Hand-picked block order from dragging the day view; null = the canonical
  // Priorities → Do First → Daily Tasks → other categories order.
  const [order, setOrder] = useState<string[] | null>(null);
  const [query, setQuery] = useState("");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pane, setPane] = useState<"list" | "day">("list");
  // Category headings the user has folded away, by label.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<BusyInterval[]>([]);
  const [busyLoading, setBusyLoading] = useState(false);
  const [busyError, setBusyError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  const startMinutes = parseTimeToMinutes(startTime) ?? DEFAULT_START_MINUTES;
  // The latest a block may end. Nothing is booked past it — anything left over
  // is flagged in the list instead of spilling into the evening.
  const endMinutes = parseTimeToMinutes(endTime) ?? DEFAULT_END_MINUTES;
  const windowInvalid = endMinutes <= startMinutes;
  const calendarUrl = googleCalendarDayUrl(snapshot_date);

  // Canonical order: Priorities → Do First → Daily Tasks → other categories.
  const candidates = useMemo(
    () => collectCalendarCandidates(items, categories),
    [items, categories],
  );

  // …re-sequenced by whatever the user dragged. Both the list and the timeline
  // read from this, so a block moved on the day view moves its row too.
  const ordered = useMemo(() => applyCandidateOrder(candidates, order), [candidates, order]);

  // Only the checked items get a slot, so unchecking one frees its time and the
  // rest of the day compacts up.
  const scheduled = useMemo<ScheduledEvent[]>(
    () =>
      scheduleEvents(
        ordered.filter((c) => !excluded.has(c.id)),
        { date: snapshot_date, startMinutes, endMinutes, busy, overrides },
      ),
    [ordered, excluded, snapshot_date, startMinutes, endMinutes, busy, overrides],
  );

  const byId = useMemo(
    () => new Map(scheduled.map((e) => [e.id, e])),
    [scheduled],
  );

  // Picked, but the day ran out before they could be placed. They aren't
  // created — the list flags them so it's obvious what got left behind.
  const overflow = useMemo(
    () => ordered.filter((c) => !excluded.has(c.id) && !byId.has(c.id)),
    [ordered, excluded, byId],
  );

  const visible = useMemo(
    () => ordered.filter((c) => matchesCandidateQuery(c, query)),
    [ordered, query],
  );
  const searching = query.trim().length > 0;

  // The list reads under a heading per source group rather than as one long run
  // of rows, so a 130-task day is scannable.
  const groups = useMemo(() => groupCandidates(visible), [visible]);

  // Keep the list row for a block picked on the timeline in view.
  useEffect(() => {
    if (!focusedId) return;
    rowRefs.current.get(focusedId)?.scrollIntoView({ block: "nearest" });
  }, [focusedId, visible]);

  // On open, read the day's existing calendar events so new blocks land in the
  // gaps rather than clashing. A failure isn't fatal — we fall back to a plain
  // back-to-back chain and say so.
  useEffect(() => {
    if (!open || !session) return;
    let cancelled = false;
    setBusyLoading(true);
    setBusyError(null);
    const { timeMin, timeMax } = dayWindowUtc(snapshot_date);
    fetch("/api/fireflies-import", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "calendar-busy",
        timeZone: localTimeZone(),
        timeMin,
        timeMax,
      }),
    })
      .then(async (res) => {
        const b = (await res.json().catch(() => null)) as
          | { busy?: { start: string; end: string }[]; error?: string }
          | null;
        if (!res.ok || !b?.busy) throw new Error(b?.error ?? `Failed (${res.status})`);
        if (!cancelled) setBusy(toBusyMinutes(b.busy, snapshot_date));
      })
      .catch((e) => {
        if (cancelled) return;
        setBusy([]);
        setBusyError(e instanceof Error ? e.message : "Couldn't read your calendar");
      })
      .finally(() => {
        if (!cancelled) setBusyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, session, snapshot_date]);

  function openModal() {
    // The three headline groups start checked; the rest of the day's categories
    // are listed but opt-in, so opening the modal never queues the whole board.
    setExcluded(new Set(candidates.filter((c) => c.source === "category").map((c) => c.id)));
    setStartTime(minutesToTime(DEFAULT_START_MINUTES));
    setEndTime(minutesToTime(DEFAULT_END_MINUTES));
    setOverrides({});
    setOrder(null);
    setQuery("");
    setFocusedId(null);
    setExpandedId(null);
    setPane("list");
    setCollapsed(new Set());
    setBusy([]);
    setBusyError(null);
    setResult(null);
    setError(null);
    setOpen(true);
  }

  function toggle(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Bulk-toggle whatever the search is currently showing.
  function setAllVisible(on: boolean) {
    setExcluded((prev) => {
      const next = new Set(prev);
      for (const c of visible) {
        if (on) next.delete(c.id);
        else next.add(c.id);
      }
      return next;
    });
  }

  // Tick or untick a whole heading. All on → clear it; anything else → fill it.
  function toggleGroup(group: CandidateGroup) {
    const allOn = group.candidates.every((c) => !excluded.has(c.id));
    setExcluded((prev) => {
      const next = new Set(prev);
      for (const c of group.candidates) {
        if (allOn) next.add(c.id);
        else next.delete(c.id);
      }
      return next;
    });
  }

  function toggleCollapsed(label: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  function patchOverride(id: string, patch: CalendarOverride) {
    setOverrides((prev) => {
      const merged = { ...(prev[id] ?? {}), ...patch };
      const next = { ...prev };
      if (merged.durationMin == null && merged.startMinutes == null) delete next[id];
      else next[id] = merged;
      return next;
    });
  }

  // The block length a row is showing: its scheduled block when selected, else
  // the override or the item's own estimate — so an unchecked row can still be
  // adjusted before it goes back on the day.
  function durationOf(c: CalendarCandidate): number {
    const scheduledBlock = byId.get(c.id);
    if (scheduledBlock) return scheduledBlock.durationMin;
    const override = overrides[c.id]?.durationMin;
    if (override != null && override > 0) return clampDuration(override);
    return c.timeEstimateMin != null && c.timeEstimateMin > 0
      ? c.timeEstimateMin
      : DEFAULT_DURATION_MIN;
  }

  function bumpDuration(c: CalendarCandidate, delta: number) {
    patchOverride(c.id, { durationMin: clampDuration(durationOf(c) + delta) });
  }

  // Picking a block on the timeline pulls its row up in the list, opened for
  // editing — the "find it and adjust it" path from the drawn day.
  function focusFromTimeline(id: string) {
    setQuery("");
    const label = candidates.find((c) => c.id === id)?.sourceLabel;
    if (label) {
      setCollapsed((prev) => {
        if (!prev.has(label)) return prev;
        const next = new Set(prev);
        next.delete(label);
        return next;
      });
    }
    setFocusedId(id);
    setExpandedId(id);
    setPane("list");
  }

  // Dropping a block on the day view. A pinned block keeps its own time, so the
  // drag just moves the pin; anything else is re-sequenced, and the whole chain
  // re-flows — every following block's start and end shift to suit.
  function moveBlock(id: string, dropStartMinutes: number) {
    const event = byId.get(id);
    if (!event) return;
    setFocusedId(id);
    if (event.pinned) {
      patchOverride(id, { startMinutes: dropStartMinutes });
      return;
    }
    setOrder(
      reorderForDrop(
        ordered.map((c) => c.id),
        scheduled.filter((e) => !e.pinned),
        id,
        dropStartMinutes,
      ),
    );
  }

  // Keyboard equivalent: arrow a focused block one slot earlier or later.
  function nudgeBlock(id: string, delta: number) {
    setFocusedId(id);
    setOrder(
      reorderByStep(
        ordered.map((c) => c.id),
        scheduled.filter((e) => !e.pinned).map((e) => e.id),
        id,
        delta,
      ),
    );
  }

  async function create() {
    if (!session || scheduled.length === 0 || running) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      // Multiplexed onto the fireflies-import endpoint (action discriminator) to
      // stay within the Hobby-plan 12-Serverless-Function budget.
      const res = await fetch("/api/fireflies-import", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "calendar-sync",
          timeZone: localTimeZone(),
          events: scheduled.map((e) => ({
            title: e.title,
            description: `${e.sourceLabel} · from TDL`,
            startDateTime: e.startDateTime,
            endDateTime: e.endDateTime,
          })),
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; created?: number; failed?: number; error?: string }
        | null;
      if (!res.ok || !body) {
        throw new Error(body?.error ?? `Sync failed (${res.status})`);
      }
      const created = body.created ?? 0;
      const failed = body.failed ?? 0;
      setResult(
        `Added ${created} event${created === 1 ? "" : "s"}` +
          (failed > 0 ? ` · ${failed} failed${body.error ? `: ${body.error}` : ""}` : ""),
      );
      if (failed === 0) setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setRunning(false);
    }
  }

  const timelineHint = busyLoading
    ? "checking your calendar…"
    : busyError
      ? "back-to-back (couldn't read your calendar)"
      : busy.length > 0
        ? "slotted around your existing events"
        : "blocked back-to-back";

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={openModal}
          disabled={!session || candidates.length === 0}
          variant="secondary"
          size="sm"
          title={
            candidates.length === 0
              ? "No Priorities, Daily Tasks or Do First items to add"
              : "Add these items to your Google Calendar"
          }
        >
          <CalendarPlus className="mr-1 h-4 w-4" />
          Add Calendar
        </Button>
        {result && !open && (
          <span className="flex items-center gap-2 text-xs text-success">
            {result}
            <a
              href={calendarUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline"
            >
              <ExternalLink className="h-3 w-3" />
              Open Calendar
            </a>
          </span>
        )}
        {error && !open && <span className="text-xs text-danger">{error}</span>}
      </div>

      {open && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => (running ? null : setOpen(false))}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-t-2xl border border-line bg-surface sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <CalendarPlus className="h-5 w-5 shrink-0 text-accent" />
                <h2 className="truncate text-base font-semibold">Add to Google Calendar</h2>
              </div>
              <a
                href={calendarUrl}
                target="_blank"
                rel="noreferrer"
                className="ml-auto flex h-9 shrink-0 items-center gap-1 rounded-xl px-2 text-xs text-muted hover:bg-surface2 hover:text-text"
                title="Open this day in Google Calendar"
              >
                <ExternalLink className="h-4 w-4" />
                <span className="hidden sm:inline">Open Calendar</span>
              </a>
              <button
                onClick={() => setOpen(false)}
                disabled={running}
                aria-label="Close"
                className="flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-surface2 hover:text-text disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="space-y-2 border-b border-line px-4 py-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <Input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search these tasks…"
                  aria-label="Search tasks to schedule"
                  disabled={running}
                  className="h-11 pl-9 text-sm"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <label htmlFor="cal-start-time">Schedule between</label>
                <input
                  id="cal-start-time"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  disabled={running}
                  title="When the day's blocks start"
                  className="h-11 rounded-xl border border-line bg-surface2 px-3 text-sm text-text focus:border-accent focus:outline-none disabled:opacity-50"
                />
                <label htmlFor="cal-end-time">and</label>
                <input
                  id="cal-end-time"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  disabled={running}
                  title="The latest a block may end — nothing is booked past this"
                  className={`h-11 rounded-xl border bg-surface2 px-3 text-sm text-text focus:outline-none disabled:opacity-50 ${
                    windowInvalid ? "border-danger" : "border-line focus:border-accent"
                  }`}
                />
                {windowInvalid && (
                  <span className="text-danger">End time must be after the start.</span>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                <span>
                  {scheduled.length} of {candidates.length} scheduled ·{" "}
                  {prettyMinutes(startMinutes)}–{prettyMinutes(endMinutes)}, {timelineHint}
                  {searching ? ` · ${visible.length} matching “${query.trim()}”` : ""}
                </span>
                <span className="flex items-center gap-1">
                  {order && (
                    <button
                      type="button"
                      onClick={() => setOrder(null)}
                      disabled={running}
                      className="rounded-lg px-2 py-1 hover:bg-surface2 hover:text-text disabled:opacity-50"
                      title="Back to Priorities → Daily Tasks → Do First"
                    >
                      Reset order
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setAllVisible(true)}
                    disabled={running || visible.length === 0}
                    className="rounded-lg px-2 py-1 hover:bg-surface2 hover:text-text disabled:opacity-50"
                  >
                    {searching ? "Select matching" : "Select all"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAllVisible(false)}
                    disabled={running || visible.length === 0}
                    className="rounded-lg px-2 py-1 hover:bg-surface2 hover:text-text disabled:opacity-50"
                  >
                    None
                  </button>
                </span>
              </div>
              <div className="flex gap-1 rounded-xl bg-surface2 p-1 lg:hidden">
                {(["list", "day"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPane(p)}
                    className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium ${
                      pane === p ? "bg-surface text-text" : "text-muted"
                    }`}
                  >
                    {p === "list" ? "Tasks" : "Day view"}
                  </button>
                ))}
              </div>
              {overflow.length > 0 && (
                <div className="flex items-start gap-2 rounded-xl border border-warn/60 bg-warn/10 px-3 py-2 text-xs text-warn">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {overflow.length} task{overflow.length === 1 ? "" : "s"} won&rsquo;t fit before{" "}
                    {prettyMinutes(endMinutes)} — highlighted below, and not added. Extend the day,
                    shorten some blocks, or untick them.
                  </span>
                </div>
              )}
            </div>

            <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_26rem]">
              <div
                className={`min-h-0 space-y-2 overflow-y-auto p-2 ${pane === "list" ? "" : "hidden"} lg:block`}
              >
                {visible.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted">
                    No tasks match “{query.trim()}”.
                  </p>
                )}
                {groups.map((group) => {
                  const selectedCount = group.candidates.filter((c) => !excluded.has(c.id)).length;
                  const allOn = selectedCount === group.candidates.length;
                  // A search shows every match, folded heading or not.
                  const shut = !searching && collapsed.has(group.label);
                  return (
                    <section key={group.label}>
                      <header className="sticky top-0 z-10 flex items-center gap-1 bg-surface/95 pb-1 backdrop-blur">
                        <button
                          type="button"
                          onClick={() => toggleGroup(group)}
                          aria-pressed={allOn}
                          aria-label={
                            allOn ? `Skip every ${group.label}` : `Include every ${group.label}`
                          }
                          className="flex h-11 w-9 shrink-0 items-center justify-center"
                        >
                          <span
                            className={`flex h-5 w-5 items-center justify-center rounded border ${
                              allOn
                                ? "border-accent bg-accent text-bg"
                                : selectedCount > 0
                                  ? "border-accent text-accent"
                                  : "border-line text-transparent"
                            }`}
                            aria-hidden
                          >
                            {allOn ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <Minus className="h-3.5 w-3.5" />
                            )}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleCollapsed(group.label)}
                          aria-expanded={!shut}
                          className="flex min-w-0 flex-1 items-center gap-1 py-2 text-left"
                        >
                          {shut ? (
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
                          ) : (
                            <ChevronDown className="h-4 w-4 shrink-0 text-muted" />
                          )}
                          <span className="truncate text-xs font-semibold uppercase tracking-wide text-text">
                            {group.label}
                          </span>
                          <span className="shrink-0 text-[11px] text-muted">
                            {selectedCount}/{group.candidates.length}
                          </span>
                        </button>
                      </header>
                      {!shut && (
                        <ul className="space-y-1">
                          {group.candidates.map((c) => {
                            const event = byId.get(c.id);
                            const selected = !excluded.has(c.id);
                            // Picked but past the end of the day — flagged rather than booked.
                            const doesNotFit = selected && !event;
                            const expanded = expandedId === c.id;
                            const duration = durationOf(c);
                            return (
                              <li
                                key={c.id}
                                ref={(el) => {
                                  if (el) rowRefs.current.set(c.id, el);
                                  else rowRefs.current.delete(c.id);
                                }}
                                className={`rounded-xl ${
                                  doesNotFit
                                    ? "bg-warn/10 ring-1 ring-warn/60"
                                    : focusedId === c.id
                                      ? "bg-surface2"
                                      : ""
                                }`}
                              >
                                <div className="flex items-center gap-2 rounded-xl px-1 hover:bg-surface2">
                                  <button
                                    type="button"
                                    onClick={() => toggle(c.id)}
                                    aria-pressed={selected}
                                    aria-label={selected ? `Skip ${c.title}` : `Include ${c.title}`}
                                    className="flex h-11 w-9 shrink-0 items-center justify-center"
                                  >
                                    <span
                                      className={`flex h-5 w-5 items-center justify-center rounded border ${
                                        doesNotFit
                                          ? "border-warn bg-warn text-bg"
                                          : selected
                                            ? "border-accent bg-accent text-bg"
                                            : "border-line text-transparent"
                                      }`}
                                      aria-hidden
                                    >
                                      <Check className="h-3.5 w-3.5" />
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setFocusedId(c.id);
                                      setExpandedId(expanded ? null : c.id);
                                    }}
                                    className="min-w-0 flex-1 py-2 text-left"
                                  >
                                    <span
                                      className={`block truncate text-sm ${
                                        selected ? "text-text" : "text-muted line-through"
                                      }`}
                                    >
                                      {c.title}
                                    </span>
                                    <span
                                      className={`flex items-center gap-1 text-[11px] ${
                                        doesNotFit ? "text-warn" : "text-muted"
                                      }`}
                                    >
                                      {event?.pinned && <Pin className="h-3 w-3 text-accent" />}
                                      {doesNotFit && <AlertTriangle className="h-3 w-3" />}
                                      {event
                                        ? `${prettyMinutes(event.startMinutes)} · ${prettyDuration(event.durationMin)}`
                                        : doesNotFit
                                          ? `Won't fit before ${prettyMinutes(endMinutes)} · ${prettyDuration(duration)}`
                                          : "Not scheduled"}
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setFocusedId(c.id);
                                      setExpandedId(expanded ? null : c.id);
                                    }}
                                    aria-label={`Adjust time for ${c.title}`}
                                    aria-expanded={expanded}
                                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                                      expanded ? "bg-surface2 text-accent" : "text-muted hover:text-text"
                                    }`}
                                  >
                                    <Clock className="h-4 w-4" />
                                  </button>
                                </div>

                                {expanded && (
                                  <div className="mb-1 ml-9 mr-1 space-y-3 rounded-xl border border-line bg-surface2/60 p-3">
                                    <div className="flex items-center gap-2">
                                      <span className="w-14 shrink-0 text-xs text-muted">Start</span>
                                      <input
                                        type="time"
                                        value={minutesToTime(
                                          overrides[c.id]?.startMinutes ?? event?.startMinutes ?? startMinutes,
                                        )}
                                        onChange={(e) => {
                                          const mins = parseTimeToMinutes(e.target.value);
                                          if (mins != null) patchOverride(c.id, { startMinutes: mins });
                                        }}
                                        disabled={running}
                                        aria-label={`Start time for ${c.title}`}
                                        className="h-11 rounded-xl border border-line bg-surface px-3 text-sm text-text focus:border-accent focus:outline-none disabled:opacity-50"
                                      />
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={running || overrides[c.id]?.startMinutes == null}
                                        onClick={() => patchOverride(c.id, { startMinutes: null })}
                                        title="Let this block flow with the rest of the day"
                                      >
                                        Auto
                                      </Button>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="w-14 shrink-0 text-xs text-muted">Length</span>
                                      <div className="flex items-center gap-1">
                                        <button
                                          type="button"
                                          onClick={() => bumpDuration(c, -DURATION_STEP_MIN)}
                                          disabled={running || duration <= MIN_DURATION_MIN}
                                          aria-label="Shorten by 5 minutes"
                                          className="flex h-11 w-11 items-center justify-center rounded-xl border border-line text-muted hover:text-text disabled:opacity-40"
                                        >
                                          <Minus className="h-4 w-4" />
                                        </button>
                                        <input
                                          type="number"
                                          inputMode="numeric"
                                          min={MIN_DURATION_MIN}
                                          max={MAX_DURATION_MIN}
                                          step={DURATION_STEP_MIN}
                                          value={duration}
                                          onChange={(e) => {
                                            const n = Number(e.target.value);
                                            if (Number.isFinite(n) && n > 0)
                                              patchOverride(c.id, { durationMin: clampDuration(n) });
                                          }}
                                          disabled={running}
                                          aria-label={`Minutes for ${c.title}`}
                                          className="h-11 w-20 rounded-xl border border-line bg-surface px-3 text-center text-sm text-text focus:border-accent focus:outline-none disabled:opacity-50"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => bumpDuration(c, DURATION_STEP_MIN)}
                                          disabled={running || duration >= MAX_DURATION_MIN}
                                          aria-label="Lengthen by 5 minutes"
                                          className="flex h-11 w-11 items-center justify-center rounded-xl border border-line text-muted hover:text-text disabled:opacity-40"
                                        >
                                          <Plus className="h-4 w-4" />
                                        </button>
                                        <span className="text-xs text-muted">min</span>
                                      </div>
                                      <div className="flex flex-wrap gap-1">
                                        {DURATION_PRESETS.map((p) => (
                                          <button
                                            key={p}
                                            type="button"
                                            onClick={() => patchOverride(c.id, { durationMin: p })}
                                            disabled={running}
                                            className={`rounded-lg border px-2 py-1 text-[11px] ${
                                              duration === p
                                                ? "border-accent text-accent"
                                                : "border-line text-muted hover:text-text"
                                            }`}
                                          >
                                            {prettyDuration(p)}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </section>
                  );
                })}
              </div>

              <div
                className={`min-h-0 overflow-y-auto border-line p-3 lg:block lg:border-l ${
                  pane === "day" ? "" : "hidden"
                }`}
              >
                <div className="mb-1 flex items-center justify-between text-xs text-muted">
                  <span className="text-sm font-medium text-text">Your day</span>
                  <span>{prettyDuration(scheduled.reduce((n, e) => n + e.durationMin, 0))}</span>
                </div>
                <p className="mb-3 text-xs text-muted">
                  Drag a block by its handle to reorder your day — everything else shifts to fit.
                  Nothing is booked after {prettyMinutes(endMinutes)}.
                </p>
                {scheduled.length === 0 && busy.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted">Nothing scheduled.</p>
                ) : (
                  <DayTimeline
                    events={scheduled}
                    busy={busy}
                    fromMinutes={startMinutes}
                    untilMinutes={windowInvalid ? null : endMinutes}
                    focusedId={focusedId}
                    onSelect={focusFromTimeline}
                    onMove={moveBlock}
                    onNudge={nudgeBlock}
                  />
                )}
              </div>
            </div>

            <footer className="space-y-2 border-t border-line px-4 py-3">
              {error && <div className="text-xs text-danger">{error}</div>}
              {result && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-success">
                  <span>{result}</span>
                  <a
                    href={calendarUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    See it in Google Calendar
                  </a>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={running}>
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  size="sm"
                  onClick={create}
                  disabled={running || scheduled.length === 0}
                >
                  {running
                    ? "Adding…"
                    : `Create ${scheduled.length} event${scheduled.length === 1 ? "" : "s"}`}
                </Button>
              </div>
            </footer>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
