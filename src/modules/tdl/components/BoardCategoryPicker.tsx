import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SectionConfig } from "../sections";

// Board View shows one category at a time, so the category is chosen here —
// a dropdown on small screens, a chip rail (with card counts) from `sm` up.
export function BoardCategoryPicker({
  categories,
  value,
  counts,
  onChange,
}: {
  categories: SectionConfig[];
  value: string | null;
  // Category key → how many cards it holds on this day.
  counts: Map<string, number>;
  onChange: (key: string) => void;
}) {
  if (categories.length === 0) return null;
  return (
    <div className="mb-3">
      <div className="relative sm:hidden">
        <select
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Board category"
          className="h-11 w-full appearance-none rounded-xl border border-line bg-surface px-3 pr-9 text-sm font-medium outline-none focus:border-accent"
        >
          {categories.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label} ({counts.get(c.key) ?? 0})
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      </div>
      <div
        role="tablist"
        aria-label="Board category"
        className="hidden flex-wrap items-center gap-1.5 sm:flex"
      >
        {categories.map((c) => {
          const active = c.key === value;
          return (
            <button
              key={c.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(c.key)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition",
                active
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-line bg-surface text-muted hover:text-text",
              )}
            >
              {c.label}
              <span className="tabular-nums opacity-70">{counts.get(c.key) ?? 0}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
