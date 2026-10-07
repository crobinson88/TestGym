import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { todayIsoDate } from "@/lib/utils";
import { useCategories } from "../categories";
import {
  loadQuickAddCategory,
  rememberQuickAddCategory,
  resolveQuickAddCategory,
} from "../composer";
import { TaskComposer } from "./TaskComposer";

// The new-task flow behind the floating + button, so a task can be logged from
// any screen without navigating to the board first. Same composer and same
// remembered category default as the day's quick-add bar; it stays open after
// a save (with a confirmation) so several tasks go in on one trip.
export function NewTaskDialog({ onClose }: { onClose: () => void }) {
  const categories = useCategories();
  const [added, setAdded] = useState<{ title: string; label: string } | null>(null);
  const [defaultKey, setDefaultKey] = useState(loadQuickAddCategory);
  const date = todayIsoDate();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New task"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:p-8"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-2xl border border-line bg-bg shadow-2xl">
        <header className="flex items-center gap-2 border-b border-line p-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold leading-snug">New task</h2>
            <p className="mt-1 text-[11px] uppercase tracking-wide text-muted">{date}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface2"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="p-4">
          {categories.length === 0 ? (
            <p className="text-sm text-muted">
              No categories yet — add one from the to-do list first.
            </p>
          ) : (
            <TaskComposer
              snapshot_date={date}
              categories={categories}
              defaultSectionKey={resolveQuickAddCategory(defaultKey, categories)}
              onSectionChange={(key) => {
                setDefaultKey(key);
                rememberQuickAddCategory(key);
              }}
              onCancel={onClose}
              onCreated={(title, cfg) => setAdded({ title, label: cfg.label })}
            />
          )}
          {added && (
            <p className="mt-3 flex items-center gap-1 text-xs text-success">
              <Check className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                Added “{added.title}” to {added.label}
              </span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
