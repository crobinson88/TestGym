import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LocalTdlItem } from "../types";
import { createWorkstream, setItemsWorkstream, useWorkstreams } from "../workstreams";
import { NO_WORKSTREAM_LABEL } from "../workstreamGroups";

// The "Workstream" submenu inside an item's actions menu: the item's category's
// workstreams, "No workstream", and an inline "New workstream" that creates one
// and files the item under it in one go. Only mounted while expanded, so rows
// don't each hold a live query.
export function WorkstreamMenuItems({
  item,
  targetIds,
  onDone,
}: {
  item: LocalTdlItem;
  // The item alone, or the whole selection when it's part of a multi-select.
  // Selected items from other categories are skipped by setItemsWorkstream.
  targetIds: string[];
  onDone: () => void;
}) {
  const workstreams = useWorkstreams(item.section);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("");
  const bulk = targetIds.length > 1;
  const current = item.workstream_id ?? null;

  async function pick(id: string | null) {
    await setItemsWorkstream(targetIds, id, item.section);
    onDone();
  }

  async function create() {
    if (!label.trim()) return;
    const ws = await createWorkstream(item.section, label);
    await pick(ws.id);
  }

  const options: { id: string | null; label: string }[] = [
    ...(workstreams ?? []).map((w) => ({ id: w.id, label: w.label })),
    { id: null, label: NO_WORKSTREAM_LABEL },
  ];

  return (
    <div className="border-y border-line/50 bg-surface2/30">
      {options.map((o) => {
        const selected = !bulk && o.id === current;
        return (
          <button
            key={o.id ?? "none"}
            type="button"
            disabled={selected}
            onClick={() => void pick(o.id)}
            className={cn(
              "flex w-full items-center gap-2 py-2 pl-9 pr-3 text-left text-sm",
              selected ? "text-muted" : "hover:bg-surface2",
              o.id == null && "text-muted",
            )}
          >
            <span className="truncate">{o.label}</span>
            {selected && <Check className="ml-auto h-4 w-4 shrink-0" />}
          </button>
        );
      })}
      {creating ? (
        <div className="flex items-center gap-1 py-1.5 pl-9 pr-2">
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void create();
              if (e.key === "Escape") setCreating(false);
            }}
            placeholder="Workstream name"
            aria-label="New workstream name"
            className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 text-sm text-text outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={() => void create()}
            disabled={!label.trim()}
            className="h-8 rounded-lg px-2 text-sm text-accent disabled:text-muted"
          >
            Add
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex w-full items-center gap-2 py-2 pl-9 pr-3 text-left text-sm text-accent hover:bg-surface2"
        >
          <Plus className="h-4 w-4" /> New workstream
        </button>
      )}
    </div>
  );
}
