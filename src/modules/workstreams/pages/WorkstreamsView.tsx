import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Check,
  CircleDot,
  Globe,
  Loader2,
  Mail,
  PauseCircle,
  Plus,
  RefreshCw,
  Pencil,
  Search,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import type { WorkstreamRow, WorkstreamStatus, WorkstreamType } from "@/lib/database.types";
import {
  FILTER_TABS,
  STATUS_LABEL,
  TAB_LABEL,
  TYPE_LABEL,
  type FilterTab,
  displayTitle,
  isStale,
  relativeTime,
  subtitle,
  summaryMetrics,
  visibleWorkstreams,
  workstreamLabel,
} from "../compute";
import { useIsDesktop, useNow, useWorkstreams } from "../hooks";
import {
  addWorkstream,
  clearCompleted,
  dismissWorkstream,
  setWorkstreamLabel,
  setWorkstreamStatus,
  triageEmail,
} from "../api";

const TYPE_ICON: Record<WorkstreamType, typeof Terminal> = {
  code_cli: Terminal,
  web_chat: Globe,
  email_task: Mail,
};

const STATUS_STYLE: Record<WorkstreamStatus, string> = {
  in_progress: "bg-accent/10 text-accent ring-accent/30",
  waiting_input: "bg-warn/10 text-warn ring-warn/30",
  completed: "bg-success/10 text-success ring-success/30",
  failed: "bg-danger/10 text-danger ring-danger/30",
};

const STATUS_ICON: Record<WorkstreamStatus, typeof CircleDot> = {
  in_progress: CircleDot,
  waiting_input: PauseCircle,
  completed: Check,
  failed: AlertTriangle,
};

export default function WorkstreamsView() {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const { session } = useAuth();
  const { rows, error, refresh } = useWorkstreams();
  const now = useNow();

  const [tab, setTab] = useState<FilterTab>("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const metrics = useMemo(() => summaryMetrics(rows ?? []), [rows]);
  const visible = useMemo(() => visibleWorkstreams(rows ?? [], tab, query), [rows, tab, query]);
  const completedIds = useMemo(
    () => (rows ?? []).filter((r) => r.status === "completed").map((r) => r.id),
    [rows],
  );

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "action failed");
    } finally {
      setBusy(null);
    }
  }

  async function onTriage() {
    const token = session?.access_token;
    if (!token) {
      setNotice("Not signed in.");
      return;
    }
    await run("triage", async () => {
      const result = await triageEmail(token);
      setNotice(
        result.logged > 0
          ? `Triaged ${result.scanned} email${result.scanned === 1 ? "" : "s"} → ${result.logged} task${result.logged === 1 ? "" : "s"}.`
          : `Scanned ${result.scanned} email${result.scanned === 1 ? "" : "s"} — nothing actionable.`,
      );
      await refresh();
    });
  }

  if (!isDesktop) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
        <Terminal className="h-10 w-10 text-accent" />
        <div>
          <h1 className="text-xl font-bold">Command Center is desktop-only</h1>
          <p className="mt-2 max-w-sm text-sm text-muted">
            The workstream table needs a wide screen and a pointer. Open this on your laptop.
          </p>
        </div>
        <button
          onClick={() => navigate("/")}
          className="min-h-tap rounded-xl border border-line px-4 text-sm font-medium hover:bg-surface2"
        >
          Back to Today
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Workstream Command Center</h1>
          <p className="text-sm text-muted">
            Every live Claude session, chat and email task in one table. Updates push in over
            Realtime — no reload.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAdding(true)}
            className="flex h-10 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium hover:bg-surface2"
          >
            <Plus className="h-4 w-4" /> Web session
          </button>
          <button
            onClick={onTriage}
            disabled={busy === "triage"}
            className="flex h-10 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium hover:bg-surface2 disabled:opacity-50"
          >
            {busy === "triage" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            Triage email
          </button>
          <button
            onClick={() => void run("refresh", refresh)}
            disabled={busy === "refresh"}
            aria-label="Refresh"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-line hover:bg-surface2 disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", busy === "refresh" && "animate-spin")} />
          </button>
          <button
            onClick={() => navigate("/")}
            aria-label="Close command center"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-line hover:bg-surface2"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {(error || notice) && (
        <div
          className={cn(
            "rounded-xl border px-4 py-2.5 text-sm",
            error ? "border-danger/40 bg-danger/10 text-danger" : "border-line bg-surface text-muted",
          )}
        >
          {error ?? notice}
        </div>
      )}

      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="Total active" value={metrics.totalActive} tone="accent" />
        <MetricCard label="Waiting input" value={metrics.waitingInput} tone="warn" />
        <MetricCard label="Code sessions" value={metrics.codeSessions} tone="text" />
        <MetricCard label="Pending email tasks" value={metrics.pendingEmail} tone="text" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          {FILTER_TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "h-9 rounded-lg px-3 text-sm font-medium transition",
                tab === t ? "bg-accent text-bg" : "text-muted hover:bg-surface2",
              )}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {completedIds.length > 0 && (
            <button
              onClick={() => void run("clear", () => clearCompleted(completedIds))}
              disabled={busy === "clear"}
              className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-muted hover:bg-surface2 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" /> Clear {completedIds.length} completed
            </button>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, action, status…"
              className="h-9 w-72 rounded-lg border border-line bg-surface pl-9 pr-3 text-sm outline-none placeholder:text-muted focus:border-accent"
            />
          </div>
        </div>
      </div>

      {adding && <AddWebSessionRow onClose={() => setAdding(false)} onSaved={refresh} />}

      <div className="overflow-hidden rounded-2xl border border-line">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-surface text-left text-xs uppercase tracking-wider text-muted">
              <th className="w-24 px-4 py-2.5 font-medium">Source</th>
              <th className="px-4 py-2.5 font-medium">Title</th>
              <th className="w-44 px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Last action</th>
              <th className="w-28 px-4 py-2.5 font-medium">Updated</th>
              <th className="w-40 px-4 py-2.5 font-medium">Quick actions</th>
            </tr>
          </thead>
          <tbody>
            {rows === undefined && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  Loading…
                </td>
              </tr>
            )}
            {rows !== undefined && visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  {rows.length === 0
                    ? "No workstreams yet. Install the CLI hook, or add a web session by hand."
                    : "Nothing matches that filter."}
                </td>
              </tr>
            )}
            {visible.map((row) => (
              <Row
                key={row.id}
                row={row}
                now={now}
                busy={busy === row.id}
                onStatus={(s) => void run(row.id, () => setWorkstreamStatus(row.id, s))}
                onDismiss={() => void run(row.id, () => dismissWorkstream(row.id))}
                onRename={(name) => void run(row.id, () => setWorkstreamLabel(row, name))}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "accent" | "warn" | "text";
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3">
      <div className="text-xs uppercase tracking-wider text-muted">{label}</div>
      <div
        className={cn(
          "mt-1 text-3xl font-bold tabular-nums",
          tone === "accent" && "text-accent",
          tone === "warn" && value > 0 && "text-warn",
          tone === "text" && "text-text",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function Row({
  row,
  now,
  busy,
  onStatus,
  onDismiss,
  onRename,
}: {
  row: WorkstreamRow;
  now: number;
  busy: boolean;
  onStatus: (s: WorkstreamStatus) => void;
  onDismiss: () => void;
  onRename: (name: string) => void;
}) {
  const TypeIcon = TYPE_ICON[row.type];
  const StatusIcon = STATUS_ICON[row.status];
  const stale = isStale(row, now);
  const meta = row.metadata as { url?: string };
  const sub = subtitle(row);
  const label = workstreamLabel(row);

  return (
    <tr className={cn("border-b border-line/60 last:border-0 hover:bg-surface/60", stale && "opacity-50")}>
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted">
          <TypeIcon className="h-4 w-4" />
          {TYPE_LABEL[row.type]}
        </span>
      </td>
      <td className="px-4 py-3">
        <TitleCell
          value={label ?? ""}
          display={displayTitle(row)}
          named={label !== null}
          onRename={onRename}
        />
        {sub && <div className="mt-0.5 truncate text-xs text-muted">{sub}</div>}
      </td>
      <td className="px-4 py-3">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1",
            STATUS_STYLE[row.status],
          )}
        >
          <StatusIcon className="h-3.5 w-3.5" />
          {STATUS_LABEL[row.status]}
          {stale && " · stale"}
        </span>
      </td>
      <td className="max-w-0 px-4 py-3">
        <div className="truncate text-muted" title={row.last_action ?? undefined}>
          {row.last_action ?? "—"}
        </div>
      </td>
      <td className="px-4 py-3 tabular-nums text-muted">{relativeTime(row.updated_at, now)}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          {row.status !== "completed" && (
            <button
              onClick={() => onStatus("completed")}
              disabled={busy}
              aria-label="Mark done"
              title="Mark done"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface2 hover:text-success disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
            </button>
          )}
          {row.status !== "in_progress" && (
            <button
              onClick={() => onStatus("in_progress")}
              disabled={busy}
              aria-label="Mark running"
              title="Mark running"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface2 hover:text-accent disabled:opacity-50"
            >
              <CircleDot className="h-4 w-4" />
            </button>
          )}
          {meta.url && (
            <a
              href={meta.url}
              target="_blank"
              rel="noreferrer"
              aria-label="Open source"
              title="Open source"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface2 hover:text-accent"
            >
              <Globe className="h-4 w-4" />
            </a>
          )}
          <button
            onClick={onDismiss}
            disabled={busy}
            aria-label="Dismiss"
            title="Dismiss"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface2 hover:text-danger disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// Click the title to name a workstream. The typed name is stored alongside the
// system title, never over it — the row below keeps showing where the session
// actually is, and the next CLI hook fire leaves the name alone.
function TitleCell({
  value,
  display,
  named,
  onRename,
}: {
  value: string;
  display: string;
  named: boolean;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function commit() {
    setEditing(false);
    if (draft.trim() !== value) onRename(draft);
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        placeholder="Name this workstream"
        className="h-8 w-full rounded-lg border border-accent bg-bg px-2 text-sm outline-none placeholder:text-muted"
      />
    );
  }

  return (
    <button
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      title={named ? "Rename" : "Name this workstream"}
      className="group flex max-w-full items-center gap-1.5 text-left font-medium hover:text-accent"
    >
      <span className="truncate">{display}</span>
      <Pencil className="h-3 w-3 shrink-0 text-muted opacity-0 transition group-hover:opacity-100" />
    </button>
  );
}

function AddWebSessionRow({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      await addWorkstream({
        title,
        type: "web_chat",
        metadata: url.trim() ? { url: url.trim() } : {},
      });
      await onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "save failed");
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") onClose();
          }}
          placeholder="What is this chat working on?"
          className="h-10 flex-1 rounded-lg border border-line bg-bg px-3 text-sm outline-none placeholder:text-muted focus:border-accent"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") onClose();
          }}
          placeholder="claude.ai link (optional)"
          className="h-10 w-72 rounded-lg border border-line bg-bg px-3 text-sm outline-none placeholder:text-muted focus:border-accent"
        />
        <button
          onClick={() => void save()}
          disabled={saving || !title.trim()}
          className="h-10 rounded-lg bg-accent px-4 text-sm font-semibold text-bg disabled:opacity-50"
        >
          Add
        </button>
        <button
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-surface2"
          aria-label="Cancel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {err && <div className="mt-2 text-sm text-danger">{err}</div>}
    </div>
  );
}
