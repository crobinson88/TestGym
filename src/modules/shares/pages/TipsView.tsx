import { useNavigate } from "react-router-dom";
import { ChevronLeft, Eye, EyeOff, Lightbulb, Pencil, Plus } from "lucide-react";
import { cn, relativeDay } from "@/lib/utils";
import { syncEngine } from "@/lib/sync";
import { useTips } from "../hooks";
import type { LocalTip } from "@/lib/db";

export default function TipsView() {
  const tips = useTips();
  const navigate = useNavigate();

  if (tips === undefined) {
    return <div className="p-6 text-center text-muted">Loading…</div>;
  }

  const watching = tips.filter((t) => t.status === "watching");
  const dismissed = tips.filter((t) => t.status === "dismissed");

  return (
    <div className="space-y-6 p-4 pb-24">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate("/shares")}
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-xl text-text hover:bg-surface2"
            aria-label="Back to Shares"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <h1 className="text-2xl font-bold">Tip list</h1>
        </div>
        <button
          onClick={() => navigate("/shares/tips/add")}
          className="flex h-11 items-center gap-1.5 rounded-xl bg-accent px-3 text-sm font-semibold text-bg transition active:scale-[0.98]"
        >
          <Plus className="h-5 w-5" /> Add
        </button>
      </header>

      {tips.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-muted">
          <Lightbulb className="mx-auto mb-3 h-8 w-8 text-accent" />
          No tips yet. Add a stock a friend flagged for you to watch.
        </div>
      )}

      {watching.length > 0 && (
        <Section title="Watching">
          {watching.map((tip) => (
            <TipCard key={tip.id} tip={tip} onEdit={() => navigate(`/shares/tips/add/${tip.id}`)} />
          ))}
        </Section>
      )}

      {dismissed.length > 0 && (
        <Section title="Dismissed">
          {dismissed.map((tip) => (
            <TipCard key={tip.id} tip={tip} onEdit={() => navigate(`/shares/tips/add/${tip.id}`)} />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-xs uppercase tracking-wider text-muted">{title}</h2>
      <ul className="space-y-3">{children}</ul>
    </section>
  );
}

function TipCard({ tip, onEdit }: { tip: LocalTip; onEdit: () => void }) {
  const dismissed = tip.status === "dismissed";

  async function toggleStatus() {
    await syncEngine.mutations.updateTip(tip.id, {
      status: dismissed ? "watching" : "dismissed",
    });
  }

  return (
    <li
      className={cn(
        "flex gap-3 rounded-2xl border border-line bg-surface p-3",
        dismissed && "opacity-60",
      )}
    >
      <button
        onClick={toggleStatus}
        aria-label={dismissed ? "Move back to watching" : "Dismiss tip"}
        aria-pressed={dismissed}
        className={cn(
          "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition active:scale-95",
          dismissed
            ? "border-line text-muted hover:border-accent hover:text-accent"
            : "border-accent bg-accent/15 text-accent",
        )}
      >
        {dismissed ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>

      <div className="min-w-0 flex-1">
        <div className={cn("flex items-baseline gap-2 font-semibold text-text", dismissed && "line-through")}>
          <span className="text-base">{tip.ticker}</span>
          <span className="truncate text-xs font-normal text-muted">
            from {tip.tipped_by} · {relativeDay(tip.received_at)}
          </span>
        </div>
        {tip.note && <p className="mt-1 text-sm text-muted">{tip.note}</p>}
      </div>

      <button
        onClick={onEdit}
        aria-label="Edit"
        className="flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-xl text-muted hover:bg-surface2 hover:text-text"
      >
        <Pencil className="h-4 w-4" />
      </button>
    </li>
  );
}
