import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarPlus, Check, Clock, Minus, Pin, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/lib/auth";
import type { SectionConfig } from "../sections";
import type { LocalTdlItem } from "../types";
import {
  CALENDAR_SOURCE_LABEL,
  DEFAULT_DURATION_MIN,
  DEFAULT_START_MINUTES,
  DURATION_STEP_MIN,
  MAX_DURATION_MIN,
  MIN_DURATION_MIN,
  clampDuration,
  collectCalendarCandidates,
  matchesCandidateQuery,
  minutesToTime,
  parseTimeToMinutes,
  prettyDuration,
  prettyMinutes,
  scheduleEvents,
  type BusyInterval,
  type CalendarCandidate,
  type CalendarOverride,
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
  const [overrides, setOverrides] = useState<Record<string, CalendarOverride>>({});
  const [query, setQuery] = useState("");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pane, setPane] = useState<"list" | "day">("list");
  const [busy, setBusy] = useState<BusyInterval[]>([]);
  const [busyLoading, setBusyLoading] = useState(false);
  const [busyError, setBusyError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  const startMinutes = parseTimeToMinutes(startTime) ?? DEFAULT_START_MINUTES;

  // Canonical order (Priorities → Daily Tasks → Do First) — the list keeps it
  // so rows don't jump around as blocks are moved; the timeline shows the
  // actual chronological shape of the day.
  const candidates = useMemo(
    () => collectCalendarCandidates(items, categories),
    [items, categories],
  );

  // Only the checked items get a slot, so unchecking one frees its time and the
  // rest of the day compacts up.
  const scheduled = useMemo<ScheduledEvent[]>(
    () =>
      scheduleEvents(
        candidates.filter((c) => !excluded.has(c.id)),
        { date: snapshot_date, startMinutes, busy, overrides },
      ),
    [candidates, excluded, snapshot_date, startMinutes, busy, overrides],
  );

  const byId = useMemo(
    () => new Map(scheduled.map((e) => [e.id, e])),
    [scheduled],
  );

  const visible = useMemo(
    () => candidates.filter((c) => matchesCandidateQuery(c, query)),
    [candidates, query],
  );
  const searching = query.trim().length > 0;

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
    setExcluded(new Set());
    setStartTime(minutesToTime(DEFAULT_START_MINUTES));
    setOverrides({});
    setQuery("");
    setFocusedId(null);
    setExpandedId(null);
    setPane("list");
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
    setFocusedId(id);
    setExpandedId(id);
    setPane("list");
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
            description: `${CALENDAR_SOURCE_LABEL[e.source]} · from TDL`,
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
        {result && !open && <span className="text-xs text-success">{result}</span>}
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
            className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-t-2xl border border-line bg-surface sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
              <div className="flex items-center gap-2">
                <CalendarPlus className="h-5 w-5 text-accent" />
                <h2 className="text-base font-semibold">Add to Google Calendar</h2>
              </div>
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
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
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
                <label htmlFor="cal-start-time" className="sr-only">
                  Start time
                </label>
                <input
                  id="cal-start-time"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  disabled={running}
                  title="When the day's blocks start"
                  className="h-11 rounded-xl border border-line bg-surface2 px-3 text-sm text-text focus:border-accent focus:outline-none disabled:opacity-50"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                <span>
                  {scheduled.length} of {candidates.length} selected · from{" "}
                  {prettyMinutes(startMinutes)}, {timelineHint}
                  {searching ? ` · ${visible.length} matching “${query.trim()}”` : ""}
                </span>
                <span className="flex items-center gap-1">
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
            </div>

            <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <ul
                className={`min-h-0 space-y-1 overflow-y-auto p-2 ${pane === "list" ? "" : "hidden"} lg:block`}
              >
                {visible.length === 0 && (
                  <li className="py-8 text-center text-sm text-muted">
                    No tasks match “{query.trim()}”.
                  </li>
                )}
                {visible.map((c) => {
                  const event = byId.get(c.id);
                  const on = !!event;
                  const expanded = expandedId === c.id;
                  const duration = durationOf(c);
                  return (
                    <li
                      key={c.id}
                      ref={(el) => {
                        if (el) rowRefs.current.set(c.id, el);
                        else rowRefs.current.delete(c.id);
                      }}
                      className={`rounded-xl ${focusedId === c.id ? "bg-surface2" : ""}`}
                    >
                      <div className="flex items-center gap-2 rounded-xl px-1 hover:bg-surface2">
                        <button
                          type="button"
                          onClick={() => toggle(c.id)}
                          aria-pressed={on}
                          aria-label={on ? `Skip ${c.title}` : `Include ${c.title}`}
                          className="flex h-11 w-9 shrink-0 items-center justify-center"
                        >
                          <span
                            className={`flex h-5 w-5 items-center justify-center rounded border ${
                              on ? "border-accent bg-accent text-bg" : "border-line text-transparent"
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
                            className={`block truncate text-sm ${on ? "text-text" : "text-muted line-through"}`}
                          >
                            {c.title}
                          </span>
                          <span className="flex items-center gap-1 text-[11px] text-muted">
                            {event?.pinned && <Pin className="h-3 w-3 text-accent" />}
                            {event
                              ? `${prettyMinutes(event.startMinutes)} · ${prettyDuration(event.durationMin)}`
                              : "Not scheduled"}
                            {" · "}
                            {CALENDAR_SOURCE_LABEL[c.source]}
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

              <div
                className={`min-h-0 overflow-y-auto border-line p-3 lg:block lg:border-l ${
                  pane === "day" ? "" : "hidden"
                }`}
              >
                <div className="mb-2 flex items-center justify-between text-xs text-muted">
                  <span className="font-medium text-text">Your day</span>
                  <span>{prettyDuration(scheduled.reduce((n, e) => n + e.durationMin, 0))}</span>
                </div>
                {scheduled.length === 0 && busy.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted">Nothing scheduled.</p>
                ) : (
                  <DayTimeline
                    events={scheduled}
                    busy={busy}
                    fromMinutes={startMinutes}
                    focusedId={focusedId}
                    onSelect={focusFromTimeline}
                  />
                )}
              </div>
            </div>

            <footer className="space-y-2 border-t border-line px-4 py-3">
              {error && <div className="text-xs text-danger">{error}</div>}
              {result && <div className="text-xs text-success">{result}</div>}
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
