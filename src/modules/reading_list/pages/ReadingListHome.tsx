import { useNavigate } from "react-router-dom";
import { BookOpen, Check, ExternalLink, Pencil, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { syncEngine } from "@/lib/sync";
import { useReadingItems } from "../hooks";
import type { LocalReadingItem } from "@/lib/db";

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export default function ReadingListHome() {
  const items = useReadingItems();
  const navigate = useNavigate();

  if (items === undefined) {
    return <div className="p-6 text-center text-muted">Loading…</div>;
  }

  const unread = items.filter((i) => !i.is_read);
  const read = items.filter((i) => i.is_read);

  return (
    <div className="space-y-6 p-4 pb-24">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Reading</h1>
        <button
          onClick={() => navigate("/reading/add")}
          className="flex h-11 items-center gap-1.5 rounded-xl bg-accent px-3 text-sm font-semibold text-bg transition active:scale-[0.98]"
        >
          <Plus className="h-5 w-5" /> Add
        </button>
      </header>

      {items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-muted">
          <BookOpen className="mx-auto mb-3 h-8 w-8 text-accent" />
          Nothing saved yet. Paste a link to an article or podcast you want to get to.
        </div>
      )}

      {unread.length > 0 && (
        <Section title="To read">
          {unread.map((item) => (
            <ItemCard key={item.id} item={item} onEdit={() => navigate(`/reading/add/${item.id}`)} />
          ))}
        </Section>
      )}

      {read.length > 0 && (
        <Section title="Read">
          {read.map((item) => (
            <ItemCard key={item.id} item={item} onEdit={() => navigate(`/reading/add/${item.id}`)} />
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

function ItemCard({ item, onEdit }: { item: LocalReadingItem; onEdit: () => void }) {
  const host = hostOf(item.url);

  async function toggleRead() {
    await syncEngine.mutations.updateReadingItem(item.id, { is_read: !item.is_read });
  }

  return (
    <li
      className={cn(
        "flex gap-3 rounded-2xl border border-line bg-surface p-3",
        item.is_read && "opacity-60",
      )}
    >
      <button
        onClick={toggleRead}
        aria-label={item.is_read ? "Mark as unread" : "Mark as read"}
        aria-pressed={item.is_read}
        className={cn(
          "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition active:scale-95",
          item.is_read
            ? "border-success bg-success/15 text-success"
            : "border-line text-muted hover:border-accent hover:text-accent",
        )}
      >
        <Check className="h-5 w-5" />
      </button>

      <a
        href={item.url}
        target="_blank"
        rel="noreferrer"
        className="min-w-0 flex-1 active:opacity-70"
      >
        <div
          className={cn(
            "flex items-center gap-1.5 font-semibold text-text",
            item.is_read && "line-through",
          )}
        >
          <span className="break-words">{item.title}</span>
          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted" />
        </div>
        {item.description && (
          <p className="mt-1 text-sm text-muted">{item.description}</p>
        )}
        {host && <p className="mt-1 truncate text-xs text-muted">{host}</p>}
      </a>

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
