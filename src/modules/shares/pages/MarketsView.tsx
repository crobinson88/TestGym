import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3, ChevronLeft, LineChart, Pencil, Plus, Sparkles } from "lucide-react";
import { cn, relativeDay } from "@/lib/utils";
import { useMarketNotes } from "../hooks";
import { MARKET_INDICES, indexLabel, sortIndices } from "../markets";
import { MarketResearchDialog } from "../components/MarketResearchDialog";
import type { MarketIndexKey } from "../markets";
import type { LocalMarketNote } from "@/lib/db";

export default function MarketsView() {
  const notes = useMarketNotes();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<MarketIndexKey | null>(null);
  const [researching, setResearching] = useState<LocalMarketNote | null>(null);

  if (notes === undefined) {
    return <div className="p-6 text-center text-muted">Loading…</div>;
  }

  const shown = filter ? notes.filter((n) => n.indices.includes(filter)) : notes;

  return (
    <div className="space-y-5 p-4 pb-24">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate("/shares")}
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-xl text-text hover:bg-surface2"
            aria-label="Back to Shares"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <h1 className="text-2xl font-bold">Markets</h1>
        </div>
        <button
          onClick={() => navigate("/shares/markets/add")}
          className="flex h-11 items-center gap-1.5 rounded-xl bg-accent px-3 text-sm font-semibold text-bg transition active:scale-[0.98]"
        >
          <Plus className="h-5 w-5" /> Add
        </button>
      </header>

      <div className="flex flex-wrap gap-2">
        <FilterChip active={filter === null} onClick={() => setFilter(null)}>
          All
        </FilterChip>
        {MARKET_INDICES.map((idx) => (
          <FilterChip
            key={idx.key}
            active={filter === idx.key}
            onClick={() => setFilter(filter === idx.key ? null : idx.key)}
          >
            {idx.label}
          </FilterChip>
        ))}
      </div>

      {shown.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-muted">
          <LineChart className="mx-auto mb-3 h-8 w-8 text-accent" />
          {notes.length === 0
            ? "No market notes yet. Jot down a thought and tag the indices it touches."
            : "No notes tagged with this index yet."}
        </div>
      )}

      <ul className="space-y-3">
        {shown.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            onEdit={() => navigate(`/shares/markets/add/${note.id}`)}
            onResearch={() => setResearching(note)}
          />
        ))}
      </ul>

      {researching && (
        <MarketResearchDialog note={researching} onClose={() => setResearching(null)} />
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-9 rounded-full border px-3 text-sm font-medium transition active:scale-95",
        active
          ? "border-accent bg-accent/15 text-accent"
          : "border-line bg-surface text-muted hover:text-text",
      )}
    >
      {children}
    </button>
  );
}

function NoteCard({
  note,
  onEdit,
  onResearch,
}: {
  note: LocalMarketNote;
  onEdit: () => void;
  onResearch: () => void;
}) {
  const researchCount = note.research?.length ?? 0;
  return (
    <li className="flex gap-3 rounded-2xl border border-line bg-surface p-3">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
        <BarChart3 className="h-5 w-5" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {sortIndices(note.indices).map((key) => (
            <span
              key={key}
              className="rounded-full bg-surface2 px-2 py-0.5 text-xs font-semibold text-text"
            >
              {indexLabel(key)}
            </span>
          ))}
          <span className="text-xs text-muted">{relativeDay(note.noted_at)}</span>
        </div>
        <p className="mt-1.5 whitespace-pre-wrap text-sm text-text">{note.body}</p>
        {researchCount > 0 && (
          <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
            <Sparkles className="h-3 w-3" />
            {researchCount} research {researchCount === 1 ? "run" : "runs"}
          </span>
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-1">
        <button
          onClick={onResearch}
          aria-label="Validate with AI research"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-accent hover:bg-accent/10"
        >
          <Sparkles className="h-4 w-4" />
        </button>
        <button
          onClick={onEdit}
          aria-label="Edit"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-surface2 hover:text-text"
        >
          <Pencil className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}
