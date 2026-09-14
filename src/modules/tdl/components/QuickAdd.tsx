import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import type { SectionConfig } from "../sections";
import { QUICK_ADD_CATEGORY_STORAGE_KEY, resolveQuickAddCategory } from "../composer";
import { TaskComposer } from "./TaskComposer";

function loadQuickAddCategory(): string | null {
  try {
    return localStorage.getItem(QUICK_ADD_CATEGORY_STORAGE_KEY);
  } catch {
    // ignore unavailable storage — fall back to the initial default
    return null;
  }
}

function rememberQuickAddCategory(key: string) {
  try {
    localStorage.setItem(QUICK_ADD_CATEGORY_STORAGE_KEY, key);
  } catch {
    // ignore storage failures — the pick still holds for the session
  }
}

// Add a task from the top of the board without scrolling to its column: the
// same fields as a column composer plus the category picker.
export function QuickAdd({
  snapshot_date,
  categories,
}: {
  snapshot_date: string;
  categories: SectionConfig[];
}) {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<{ title: string; label: string } | null>(null);
  // The default category is whichever one was last quick-added to (remembered
  // per device); before anything is remembered it opens on TGM Tasks.
  const [defaultKey, setDefaultKey] = useState(loadQuickAddCategory);

  if (categories.length === 0) return null;

  return (
    <section className="mb-3 rounded-2xl border border-line bg-surface">
      <div className="flex items-center gap-2 px-2 py-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setOpen((v) => !v);
            setAdded(null);
          }}
          aria-expanded={open}
          className={cn("h-9 justify-start px-2 text-sm", !open && "w-full text-muted")}
        >
          {open ? <X className="mr-1 h-4 w-4" /> : <Plus className="mr-1 h-4 w-4" />}
          {open ? "Close quick add" : "Quick add task"}
        </Button>
        {added && (
          <span className="ml-auto flex min-w-0 items-center gap-1 truncate text-xs text-success">
            <Check className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              Added “{added.title}” to {added.label}
            </span>
          </span>
        )}
      </div>
      {open && (
        <div className="border-t border-line/50 p-2">
          <TaskComposer
            snapshot_date={snapshot_date}
            categories={categories}
            defaultSectionKey={resolveQuickAddCategory(defaultKey, categories)}
            onSectionChange={(key) => {
              setDefaultKey(key);
              rememberQuickAddCategory(key);
            }}
            onCancel={() => setOpen(false)}
            onCreated={(title, cfg) => setAdded({ title, label: cfg.label })}
          />
        </div>
      )}
    </section>
  );
}
