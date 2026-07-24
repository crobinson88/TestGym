import { cn } from "@/lib/utils";
import type { TdlSection, TdlStatus } from "../types";

const LABELS: Record<TdlStatus, string> = {
  open: "Open",
  worked_today: "In progress",
  ready_for_testing: "Ready for testing",
  paused: "Paused",
  done: "Done",
  cancelled: "Cancelled",
};

const CLASSES: Record<TdlStatus, string> = {
  open: "bg-surface2 text-muted border border-line",
  worked_today: "bg-accent/15 text-accent border border-accent/40",
  ready_for_testing: "bg-sky-500/15 text-sky-400 border border-sky-500/40",
  paused: "bg-warn/15 text-warn border border-warn/40",
  done: "bg-success/15 text-success border border-success/40",
  cancelled: "bg-danger/10 text-danger/70 border border-danger/30",
};

export function StatusPill({
  status,
  section,
  onClick,
  compact = false,
  className,
}: {
  status: TdlStatus;
  section: TdlSection;
  onClick?: () => void;
  compact?: boolean;
  className?: string;
}) {
  const label = status === "ready_for_testing" && section !== "product" ? LABELS.worked_today : LABELS[status];
  const cls = CLASSES[status];
  const sizing = compact ? "h-7 px-2 text-[11px]" : "h-9 px-3 text-xs";
  if (!onClick) {
    return (
      <span
        className={cn(
          "inline-flex items-center whitespace-nowrap rounded-full font-medium",
          sizing,
          cls,
          className,
        )}
      >
        {label}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full font-medium transition active:scale-[0.97]",
        sizing,
        cls,
        className,
      )}
    >
      {label}
    </button>
  );
}
