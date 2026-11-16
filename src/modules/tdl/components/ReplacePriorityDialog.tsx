import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface ReplaceSlot {
  rank: number;
  title: string;
  categoryLabel: string | null;
}

// Shown when a task is added as a priority but all ten ranks are taken: the
// user taps the priority the new task replaces. It takes that rank and the
// replaced task stays on the board, unranked.
export function ReplacePriorityDialog({
  newTitle,
  slots,
  onPick,
  onAddUnranked,
  onCancel,
}: {
  newTitle: string;
  slots: ReplaceSlot[];
  onPick: (rank: number) => void;
  onAddUnranked: () => void;
  onCancel: () => void;
}) {
  // Capture phase so Escape backs out of this dialog only, not the new-task
  // dialog that may be open underneath it.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onCancel();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Replace a priority"
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl border border-line bg-surface sm:rounded-2xl">
        <header className="flex items-center gap-2 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Priority list is full</h2>
            <p className="truncate text-[11px] text-muted">
              Tap the priority “{newTitle}” replaces
            </p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={onCancel}
            aria-label="Close"
            className="ml-auto h-9 w-9 shrink-0"
          >
            <X className="h-5 w-5" />
          </Button>
        </header>
        <ul className="flex-1 space-y-1.5 overflow-y-auto p-3">
          {slots.map((s) => (
            <li key={s.rank}>
              <button
                type="button"
                onClick={() => onPick(s.rank)}
                className="flex min-h-[44px] w-full items-center gap-3 rounded-xl border border-line px-3 py-2 text-left hover:border-accent hover:bg-accent/10"
              >
                <span className="w-8 shrink-0 text-xs font-semibold text-accent">P{s.rank}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-text">{s.title}</span>
                  {s.categoryLabel && (
                    <span className="block truncate text-[11px] text-muted">{s.categoryLabel}</span>
                  )}
                </span>
                <span className="shrink-0 text-[11px] text-muted">Replace</span>
              </button>
            </li>
          ))}
        </ul>
        <footer className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
          <p className="w-full text-[11px] text-muted">
            The replaced task stays on the board without a rank.
          </p>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Back
          </Button>
          <Button size="sm" variant="ghost" onClick={onAddUnranked} className="ml-auto">
            Add without priority
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
