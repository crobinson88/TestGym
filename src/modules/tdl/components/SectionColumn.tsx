import { useState } from "react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { LocalTdlItem } from "../types";
import type { SectionConfig } from "../sections";
import { createItem } from "../repo";
import { sectionStatusCounts } from "../hooks";
import { ItemRow } from "./ItemRow";

export function SectionColumn({
  cfg,
  snapshot_date,
  recurring,
  dated,
  focusedId,
}: {
  cfg: SectionConfig;
  snapshot_date: string;
  recurring: LocalTdlItem[];
  dated: LocalTdlItem[];
  focusedId?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const counts = sectionStatusCounts(dated, cfg.key === "product");
  const chips = [
    { key: "open", label: "open", n: counts.open, cls: "bg-surface2 text-muted" },
    {
      key: "worked_today",
      label: "in progress",
      n: counts.inProgress,
      cls: "bg-accent/15 text-accent",
    },
    {
      key: "ready_for_testing",
      label: "testing",
      n: counts.testing,
      cls: "bg-sky-500/15 text-sky-400",
    },
    { key: "done", label: "done", n: counts.done, cls: "bg-success/15 text-success" },
  ].filter((c) => c.key === "open" || c.n > 0);

  async function submit() {
    const title = draft.trim();
    if (!title) {
      setAdding(false);
      return;
    }
    await createItem({ snapshot_date, section: cfg.key, title });
    setDraft("");
    setAdding(true);
  }

  const recurringIds = recurring.map((r) => r.id);
  const datedIds = dated.map((r) => r.id);

  return (
    <section
      className="flex flex-col rounded-2xl border border-line bg-surface"
      data-section-key={cfg.key}
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-3 py-2">
        <h2 className="mr-auto text-sm font-semibold uppercase tracking-wider text-muted">
          {cfg.label}
        </h2>
        {chips.map((c) => (
          <span
            key={c.key}
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] tabular-nums",
              c.cls,
            )}
          >
            {c.n} {c.label}
          </span>
        ))}
      </header>

      {recurring.length > 0 && (
        <div className="border-b border-line/50">
          <div className="px-3 pt-2 text-[10px] uppercase tracking-wider text-muted/70">
            Recurring
          </div>
          <SortableContext items={recurringIds} strategy={verticalListSortingStrategy}>
            <ul>
              {recurring.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  focused={focusedId === item.id}
                />
              ))}
            </ul>
          </SortableContext>
        </div>
      )}

      <SortableContext items={datedIds} strategy={verticalListSortingStrategy}>
        <ul data-dated-section={cfg.key} className="min-h-[40px]">
          {dated.map((item) => (
            <ItemRow key={item.id} item={item} focused={focusedId === item.id} />
          ))}
        </ul>
      </SortableContext>

      <div className="border-t border-line/50 p-2">
        {adding ? (
          <div className="flex gap-2">
            <Input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
                if (e.key === "Escape") {
                  setAdding(false);
                  setDraft("");
                }
              }}
              onBlur={() => {
                if (!draft.trim()) setAdding(false);
              }}
              placeholder="New task..."
              className="h-9 text-sm"
            />
          </div>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setAdding(true)}
            className="w-full justify-start text-muted"
          >
            <Plus className="mr-1 h-4 w-4" /> Add item
          </Button>
        )}
      </div>
    </section>
  );
}
