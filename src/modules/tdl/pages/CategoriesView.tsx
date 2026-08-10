import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Archive,
  ArchiveRestore,
  ChevronLeft,
  Check,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn, todayIsoDate } from "@/lib/utils";
import type { LocalTdlCategory } from "@/lib/db";
import {
  createCategory,
  deleteCategory,
  renameCategory,
  reorderCategories,
  setCategoryArchived,
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
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmStage, setConfirmStage] = useState<1 | 2>(1);
  // Local order for optimistic drag reordering; kept in sync with the live rows
  // between drags so a persisted reorder (or a realtime push) still wins.
  const [order, setOrder] = useState<string[]>([]);

  useEffect(() => {
    if (!rows) return;
    setOrder(rows.map((r) => r.id));
  }, [rows]);

  const orderedRows = useMemo(() => {
    if (!rows) return [];
    const byId = new Map(rows.map((r) => [r.id, r]));
    const seen = new Set<string>();
    const out: LocalTdlCategory[] = [];
    for (const id of order) {
      const row = byId.get(id);
      if (row) {
        out.push(row);
        seen.add(id);
      }
    }
    for (const row of rows) if (!seen.has(row.id)) out.push(row);
    return out;
  }, [rows, order]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = orderedRows.map((r) => r.id);
    const from = ids.indexOf(active.id as string);
    const to = ids.indexOf(over.id as string);
    if (from < 0 || to < 0) return;
    const next = arrayMove(ids, from, to);
    setOrder(next);
    void reorderCategories(next);
  }

  function startDelete(id: string) {
    setError(null);
    setEditingId(null);
    setConfirmId(id);
    setConfirmStage(1);
  }

  function cancelDelete() {
    setConfirmId(null);
    setConfirmStage(1);
  }

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
    } finally {
      cancelDelete();
    }
  }

  async function onArchive(id: string, archived: boolean) {
    setError(null);
    cancelDelete();
    setEditingId(null);
    await setCategoryArchived(id, archived);
  }

  const activeRows = orderedRows.filter((r) => !r.is_archived);
  const archivedRows = orderedRows.filter((r) => r.is_archived);

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
          {activeRows.length}
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
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={activeRows.map((r) => r.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
                {activeRows.map((cat) => {
                  const blockingCount = blocking?.get(cat.key) ?? 0;
                  const editing = editingId === cat.id;
                  const confirming = confirmId === cat.id;
                  const dragDisabled = editing || confirming;
                  return (
                    <SortableCategoryRow key={cat.id} id={cat.id} disabled={dragDisabled}>
                      {confirming ? (
                    <>
                      <div className="min-w-0 flex-1 text-sm text-danger">
                        {confirmStage === 1
                          ? `Delete “${cat.label}”?`
                          : "Are you sure? This can’t be undone."}
                      </div>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() =>
                          confirmStage === 1 ? setConfirmStage(2) : void onDelete(cat.id)
                        }
                      >
                        {confirmStage === 1 ? "Delete" : "Confirm"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={cancelDelete}>
                        Cancel
                      </Button>
                    </>
                  ) : editing ? (
                    <>
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
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{cat.label}</div>
                        {blockingCount > 0 && (
                          <div className="text-[11px] text-muted">
                            {blockingCount} active or snoozed
                          </div>
                        )}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setError(null);
                          cancelDelete();
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
                        onClick={() => void onArchive(cat.id, true)}
                        aria-label={`Archive ${cat.label}`}
                        title="Archive — hides it from the board, keeps history"
                        className="h-9 w-9 text-muted"
                      >
                        <Archive className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={blockingCount > 0}
                        onClick={() => startDelete(cat.id)}
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
                    </SortableCategoryRow>
                  );
                })}
              </ul>
            </SortableContext>
          </DndContext>
        )}

        {archivedRows.length > 0 && (
          <div className="mt-6">
            <div className="mb-2 px-1 text-[11px] font-medium uppercase tracking-wider text-muted">
              Archived
            </div>
            <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
              {archivedRows.map((cat) => {
                const blockingCount = blocking?.get(cat.key) ?? 0;
                const confirming = confirmId === cat.id;
                return (
                  <li
                    key={cat.id}
                    className="flex items-center gap-2 border-b border-line/50 bg-surface px-3 py-2 last:border-b-0"
                  >
                    {confirming ? (
                      <>
                        <div className="min-w-0 flex-1 text-sm text-danger">
                          {confirmStage === 1
                            ? `Delete “${cat.label}”?`
                            : "Are you sure? This can’t be undone."}
                        </div>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() =>
                            confirmStage === 1 ? setConfirmStage(2) : void onDelete(cat.id)
                          }
                        >
                          {confirmStage === 1 ? "Delete" : "Confirm"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={cancelDelete}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm text-muted">{cat.label}</div>
                          {blockingCount > 0 && (
                            <div className="text-[11px] text-muted">
                              {blockingCount} in Uncategorised while archived
                            </div>
                          )}
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => void onArchive(cat.id, false)}
                          aria-label={`Unarchive ${cat.label}`}
                          title="Unarchive — bring it back to the board"
                          className="h-9 w-9 text-muted"
                        >
                          <ArchiveRestore className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={blockingCount > 0}
                          onClick={() => startDelete(cat.id)}
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
          </div>
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
          Archive a category to hide it from the board without losing its
          history — it can be brought back any time, and its items reappear when
          you do. Deleting is permanent and only allowed once a category has no
          active or snoozed items; done history stays under “Uncategorised”.
        </p>
      </div>
    </div>
  );
}

function SortableCategoryRow({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled: boolean;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled });
  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className="flex items-center gap-2 border-b border-line/50 bg-surface px-3 py-2 last:border-b-0"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        disabled={disabled}
        className={cn(
          "-ml-1 flex h-8 w-6 shrink-0 items-center justify-center text-muted/40",
          disabled ? "cursor-default" : "cursor-grab touch-none active:cursor-grabbing",
        )}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      {children}
    </li>
  );
}
