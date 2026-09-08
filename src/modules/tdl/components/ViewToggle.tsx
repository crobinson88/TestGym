import { Columns3, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TdlViewMode } from "../board";

// List ⇄ Board switch for the day. The choice is a per-device preference, held
// by DayView and persisted there.
export function ViewToggle({
  value,
  onChange,
}: {
  value: TdlViewMode;
  onChange: (next: TdlViewMode) => void;
}) {
  const options: { mode: TdlViewMode; label: string; icon: React.ReactNode }[] = [
    { mode: "list", label: "List View", icon: <Rows3 className="h-4 w-4" /> },
    { mode: "board", label: "Board View", icon: <Columns3 className="h-4 w-4" /> },
  ];
  return (
    <div
      role="group"
      aria-label="Layout"
      className="flex h-10 shrink-0 items-center gap-1 rounded-xl border border-line bg-surface p-1"
    >
      {options.map((o) => (
        <button
          key={o.mode}
          type="button"
          onClick={() => onChange(o.mode)}
          aria-pressed={value === o.mode}
          title={o.label}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm transition",
            value === o.mode
              ? "bg-surface2 font-medium text-text"
              : "text-muted hover:text-text",
          )}
        >
          {o.icon}
          <span className="hidden sm:inline">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
