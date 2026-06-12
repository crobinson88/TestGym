import { useState } from "react";
import { ChevronLeft, Check, GripVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn, todayIsoDate } from "@/lib/utils";
import {
  createCategory,
  deleteCategory,
  renameCategory,
  useBlockingCounts,
  useCategoryRows,
} from "../categories";

export default function CategoriesView() {
  const navigate = useNavigate();
  const rows = useCategoryRows();
  const blocking = useBlockingCounts();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function commitRename(id: string) {
    const label = draftLabel.trim();
    if (label) {
      await renameCategory(id, label);
    }
    setEditingId(null);
    setDraftLabel("");
  }

  async function commitAdd() {
    const label = newLabel.trim();
    if (!label) {
      setAdding(false);
      setNewLabel("");
      return;
    }
    await createCategory(label);
    setNewLabel("");
    setAdding(true);
  }

  async function onDelete(id: string) {
    setError(null);
    try {
      await deleteCategory(id);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => navigate(`/tdl/${todayIsoDate()}`)}
          aria-label="Back to today"
          className="h-10 w-10"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-base font-semibold">Categories</h1>
        <span className="ml-auto rounded-full bg-surface2 px-2 py-0.5 text-[11px] tabular-nums text-muted">
          {rows?.length ?? 0}
        </span>
      </header>

      <div className="p-3">
        {error && (
          <div className="mb-3 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        {!rows ? (
          <div className="p-6 text-center text-muted">Loading...</div>
        ) : (
          <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
            {rows.map((cat) => {
              const blockingCount = blocking?.get(cat.key) ?? 0;
              const editing = editingId === cat.id;
              return (
                <li
                  key={cat.id}
                  className="flex items-center gap-2 border-b border-line/50 px-3 py-2 last:border-b-0"
                >
                  <GripVertical className="h-4 w-4 shrink-0 text-muted/40" />
                  {editing ? (
                    <Input
                      autoFocus
                      value={draftLabel}
                      onChange={(e) => setDraftLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void commitRename(cat.id);
                        if (e.key === "Escape") {
                          setEditingId(null);
                          setDraftLabel("");
                        }
                      }}
                      className="h-9 flex-1 text-sm"
                    />
                  ) : (
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{cat.label}</div>
                      {blockingCount > 0 && (
                        <div className="text-[11px] text-muted">
                          {blockingCount} active or snoozed
                        </div>
                      )}
                    </div>
                  )}

                  {editing ? (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => void commitRename(cat.id)}
                        aria-label="Save"
                        className="h-9 w-9 text-success"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(null);
                          setDraftLabel("");
                        }}
                        aria-label="Cancel"
                        className="h-9 w-9 text-muted"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setError(null);
                          setEditingId(cat.id);
                          setDraftLabel(cat.label);
                        }}
                        aria-label={`Rename ${cat.label}`}
                        className="h-9 w-9 text-muted"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={blockingCount > 0}
                        onClick={() => void onDelete(cat.id)}
                        aria-label={`Delete ${cat.label}`}
                        title={
                          blockingCount > 0
                            ? "Move or finish active/snoozed items first"
                            : undefined
                        }
                        className={cn(
                          "h-9 w-9",
                          blockingCount > 0 ? "text-muted/40" : "text-danger",
                        )}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-3">
          {adding ? (
            <Input
              autoFocus
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void commitAdd();
                if (e.key === "Escape") {
                  setAdding(false);
                  setNewLabel("");
                }
              }}
              onBlur={() => {
                if (!newLabel.trim()) setAdding(false);
              }}
              placeholder="New category..."
              className="h-10 text-sm"
            />
          ) : (
            <Button
              variant="ghost"
              onClick={() => setAdding(true)}
              className="w-full justify-start text-muted"
            >
              <Plus className="mr-1 h-4 w-4" /> Add category
            </Button>
          )}
        </div>

        <p className="mt-4 px-1 text-[11px] leading-relaxed text-muted">
          A category can only be deleted once it has no active or snoozed items.
          Done or archived history stays put and shows under “Uncategorised”.
        </p>
      </div>
    </div>
  );
}
