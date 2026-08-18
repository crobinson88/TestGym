import type { WorkstreamRow, WorkstreamStatus, WorkstreamType } from "@/lib/database.types";

export const STATUS_LABEL: Record<WorkstreamStatus, string> = {
  in_progress: "Running",
  waiting_input: "Waiting on you",
  completed: "Done",
  failed: "Failed",
};

export const TYPE_LABEL: Record<WorkstreamType, string> = {
  code_cli: "CLI",
  web_chat: "Web",
  email_task: "Email",
};

export const FILTER_TABS = ["all", "active", "waiting_input", "completed"] as const;
export type FilterTab = (typeof FILTER_TABS)[number];

export const TAB_LABEL: Record<FilterTab, string> = {
  all: "All",
  active: "Active",
  waiting_input: "Waiting input",
  completed: "Completed",
};

// A CLI session whose process dies takes its Stop hook with it, leaving a row
// stuck at in_progress forever. Anything untouched for this long is shown as
// stale rather than live, so the "Total active" count stays honest.
export const STALE_AFTER_MS = 30 * 60 * 1000;

export interface Metrics {
  totalActive: number;
  waitingInput: number;
  codeSessions: number;
  pendingEmail: number;
}

function isActive(status: WorkstreamStatus): boolean {
  return status === "in_progress" || status === "waiting_input";
}

export function isStale(row: WorkstreamRow, now: number): boolean {
  if (!isActive(row.status)) return false;
  return now - Date.parse(row.updated_at) > STALE_AFTER_MS;
}

// FR-4 header cards. "Total active" counts anything still in flight; a stale row
// is still counted (it hasn't been resolved), but the table dims it so the
// difference is visible.
export function summaryMetrics(rows: readonly WorkstreamRow[]): Metrics {
  let totalActive = 0;
  let waitingInput = 0;
  let codeSessions = 0;
  let pendingEmail = 0;
  for (const row of rows) {
    const active = isActive(row.status);
    if (active) totalActive += 1;
    if (row.status === "waiting_input") waitingInput += 1;
    if (row.type === "code_cli" && active) codeSessions += 1;
    if (row.type === "email_task" && active) pendingEmail += 1;
  }
  return { totalActive, waitingInput, codeSessions, pendingEmail };
}

// The name you typed for a workstream, kept in metadata so the CLI hook — which
// rewrites `title` from repo + branch on every turn — can never overwrite it.
export function workstreamLabel(row: WorkstreamRow): string | null {
  const label = (row.metadata as { label?: unknown })?.label;
  return typeof label === "string" && label.trim() ? label.trim() : null;
}

// Your name leads when you set one; otherwise the system title stands alone.
export function displayTitle(row: WorkstreamRow): string {
  return workstreamLabel(row) ?? row.title;
}

// The line under the title. When a label is showing, the system title is kept
// here so the board never hides where a session actually is — you always see
// both the human name and the repo/branch or sender it came from.
export function subtitle(row: WorkstreamRow): string | null {
  const meta = row.metadata as { cwd?: unknown; branch?: unknown; from?: unknown };
  const cwd = typeof meta?.cwd === "string" ? meta.cwd : null;
  const branch = typeof meta?.branch === "string" && meta.branch ? meta.branch : null;
  const from = typeof meta?.from === "string" ? meta.from : null;

  const source = branch ? [cwd, branch].filter(Boolean).join(" · ") : (from ?? cwd);
  const system = workstreamLabel(row) ? row.title : null;
  const parts = [system, source].filter((p): p is string => Boolean(p));
  return parts.length ? parts.join(" · ") : null;
}

export function matchesTab(row: WorkstreamRow, tab: FilterTab): boolean {
  switch (tab) {
    case "all":
      return true;
    case "active":
      return isActive(row.status);
    case "waiting_input":
      return row.status === "waiting_input";
    case "completed":
      return row.status === "completed";
  }
}

export function matchesSearch(row: WorkstreamRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    row.title,
    workstreamLabel(row) ?? "",
    row.last_action ?? "",
    STATUS_LABEL[row.status],
    TYPE_LABEL[row.type],
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

// Waiting-on-you first (that's the whole point of the board), then running, then
// finished; most recently touched first within each band.
const STATUS_RANK: Record<WorkstreamStatus, number> = {
  waiting_input: 0,
  in_progress: 1,
  failed: 2,
  completed: 3,
};

export function sortWorkstreams(rows: readonly WorkstreamRow[]): WorkstreamRow[] {
  return [...rows].sort((a, b) => {
    const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (rank !== 0) return rank;
    return a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0;
  });
}

// FR-5: search + tab, applied over the sorted list.
export function visibleWorkstreams(
  rows: readonly WorkstreamRow[],
  tab: FilterTab,
  query: string,
): WorkstreamRow[] {
  return sortWorkstreams(rows.filter((r) => matchesTab(r, tab) && matchesSearch(r, query)));
}

export function relativeTime(iso: string, now: number): string {
  const diff = now - Date.parse(iso);
  if (!Number.isFinite(diff)) return "—";
  if (diff < 0) return "just now";
  const secs = Math.floor(diff / 1000);
  if (secs < 45) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
