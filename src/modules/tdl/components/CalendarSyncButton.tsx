import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarPlus, Check, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import type { SectionConfig } from "../sections";
import type { LocalTdlItem } from "../types";
import {
  CALENDAR_SOURCE_LABEL,
  DEFAULT_START_MINUTES,
  collectCalendarCandidates,
  minutesToTime,
  parseTimeToMinutes,
  scheduleEvents,
  type BusyInterval,
  type ScheduledEvent,
} from "../calendar";

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

// "2026-07-27T09:30:00" → "9:30 AM".
function prettyTime(dateTime: string): string {
  const t = dateTime.split("T")[1] ?? "";
  const [hRaw, m] = t.split(":");
  const h = Number(hRaw);
  if (!Number.isFinite(h)) return t;
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${period}`;
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
  const [busy, setBusy] = useState<BusyInterval[]>([]);
  const [busyLoading, setBusyLoading] = useState(false);
  const [busyError, setBusyError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startMinutes = parseTimeToMinutes(startTime) ?? DEFAULT_START_MINUTES;

  const scheduled = useMemo<ScheduledEvent[]>(() => {
    const candidates = collectCalendarCandidates(items, categories);
    return scheduleEvents(candidates, { date: snapshot_date, startMinutes, busy });
  }, [items, categories, snapshot_date, startMinutes, busy]);

  const selected = scheduled.filter((e) => !excluded.has(e.id));

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

  async function create() {
    if (!session || selected.length === 0 || running) return;
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
          events: selected.map((e) => ({
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

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={openModal}
          disabled={!session || scheduled.length === 0}
          variant="secondary"
          size="sm"
          title={
            scheduled.length === 0
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
            className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl border border-line bg-surface sm:rounded-2xl"
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

            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <label htmlFor="cal-start-time" className="text-sm font-medium text-text">
                Start time
              </label>
              <input
                id="cal-start-time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                disabled={running}
                className="h-11 rounded-xl border border-line bg-surface2 px-3 text-sm text-text focus:border-accent focus:outline-none disabled:opacity-50"
              />
            </div>

            <div className="border-b border-line px-4 py-2 text-xs text-muted">
              Uncheck anything you don't want. {selected.length} of {scheduled.length} selected ·
              from {prettyTime(`d T${minutesToTime(startMinutes)}:00`)},{" "}
              {busyLoading
                ? "checking your calendar…"
                : busyError
                  ? "back-to-back (couldn't read your calendar)"
                  : busy.length > 0
                    ? "slotted around your existing events"
                    : "blocked back-to-back"}
              .
            </div>

            <ul className="flex-1 space-y-1 overflow-y-auto p-2">
              {scheduled.map((e) => {
                const on = !excluded.has(e.id);
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => toggle(e.id)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-surface2"
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                          on ? "border-accent bg-accent text-bg" : "border-line text-transparent"
                        }`}
                        aria-hidden
                      >
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-sm ${on ? "text-text" : "text-muted line-through"}`}>
                          {e.title}
                        </span>
                        <span className="block text-[11px] text-muted">
                          {prettyTime(e.startDateTime)} · {e.durationMin} min ·{" "}
                          {CALENDAR_SOURCE_LABEL[e.source]}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

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
                  disabled={running || selected.length === 0}
                >
                  {running
                    ? "Adding…"
                    : `Create ${selected.length} event${selected.length === 1 ? "" : "s"}`}
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
