import type { PLogRow } from "@/lib/database.types";

export type PLogInput = Pick<PLogRow, "id" | "log_date" | "minutes" | "created_at" | "deleted_at">;

export interface PInstance {
  id: string;
  minutes: number | null;
  created_at: string;
}

export interface PDay {
  count: number;
  minutes: number;
  instances: PInstance[];
}

export interface PMonthSummary {
  activeDays: number;
  count: number;
  minutes: number;
}

// Live rows grouped by day: count = instances, minutes = their sum (an untimed
// instance counts but adds no time). Instances read oldest-first.
export function groupPLogs(rows: readonly PLogInput[]): Map<string, PDay> {
  const out = new Map<string, PDay>();
  for (const r of rows) {
    if (r.deleted_at) continue;
    let day = out.get(r.log_date);
    if (!day) {
      day = { count: 0, minutes: 0, instances: [] };
      out.set(r.log_date, day);
    }
    day.count++;
    day.minutes += r.minutes ?? 0;
    day.instances.push({ id: r.id, minutes: r.minutes, created_at: r.created_at });
  }
  for (const day of out.values()) {
    day.instances.sort((a, b) =>
      a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : 1,
    );
  }
  return out;
}

// Totals for one calendar month (`month` is 1-based).
export function monthSummary(days: Map<string, PDay>, year: number, month: number): PMonthSummary {
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  const out: PMonthSummary = { activeDays: 0, count: 0, minutes: 0 };
  for (const [date, day] of days) {
    if (!date.startsWith(prefix) || day.count === 0) continue;
    out.activeDays++;
    out.count += day.count;
    out.minutes += day.minutes;
  }
  return out;
}

// "1h 5m" / "45m" / "0m".
export function formatPMinutes(total: number): string {
  const t = Math.max(0, Math.round(total));
  const h = Math.floor(t / 60);
  const m = t % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// A typed minutes field: blank → null (not timed), else a whole number ≥ 0.
export function parseMinutesInput(raw: string): number | null {
  const s = raw.trim();
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n));
}
