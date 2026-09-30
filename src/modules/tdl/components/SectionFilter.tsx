import { cn } from "@/lib/utils";
import type { SectionConfig } from "../sections";

// Anything already bucketed per category: `SectionGroup` (items) and the
// Completed list's week entries both satisfy it — only the count is read here.
export interface FilterGroup {
  cfg: SectionConfig;
  items: readonly unknown[];
}

// Category chips over the Archive, Snoozed and Completed lists: tap one to
// narrow the view to that section, tap it again (or "All") to widen back out.
// Counts come from the already-grouped rows so they track the search box.
export function SectionFilter({
  groups,
  total,
  value,
  onChange,
}: {
  groups: readonly FilterGroup[];
  total: number;
  value: string | null;
  onChange: (key: string | null) => void;
}) {
  if (groups.length === 0) return null;
  const chip = (key: string | null, label: string, n: number) => {
    const active = value === key;
    return (
      <button
        key={key ?? "__all__"}
        type="button"
        onClick={() => onChange(active ? null : key)}
        aria-pressed={active}
        className={cn(
          "shrink-0 rounded-full px-3 py-1.5 text-xs",
          active
            ? "bg-accent/15 text-accent ring-1 ring-accent/40"
            : "bg-surface2 text-muted hover:text-text",
        )}
      >
        {label} <span className="tabular-nums">{n}</span>
      </button>
    );
  };
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {chip(null, "All", total)}
      {groups.map((g) => chip(g.cfg.key, g.cfg.label, g.items.length))}
    </div>
  );
}
