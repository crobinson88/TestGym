import { useMemo, useState } from "react";
import { CalendarPlus, Check, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import type { SectionConfig } from "../sections";
import type { LocalTdlItem } from "../types";
import {
  CALENDAR_SOURCE_LABEL,
  collectCalendarCandidates,
  scheduleEvents,
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
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scheduled = useMemo<ScheduledEvent[]>(() => {
    const candidates = collectCalendarCandidates(items, categories);
    return scheduleEvents(candidates, { date: snapshot_date });
  }, [items, categories, snapshot_date]);

  const selected = scheduled.filter((e) => !excluded.has(e.id));

  function openModal() {
    setExcluded(new Set());
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

      {open && (
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

            <div className="border-b border-line px-4 py-2 text-xs text-muted">
              Uncheck anything you don't want. {selected.length} of {scheduled.length} selected ·
              blocked back-to-back from 9:00 AM.
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
        </div>
      )}
    </>
  );
}
