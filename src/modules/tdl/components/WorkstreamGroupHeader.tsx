import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Layers,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LocalTdlWorkstream } from "@/lib/db";
import { deleteWorkstream, moveWorkstream, renameWorkstream } from "../workstreams";
import { NO_WORKSTREAM_LABEL } from "../workstreamGroups";

// The header over one workstream's items inside a category column: collapse
// chevron, name, count, an add-task shortcut and a small menu (rename, move
// up/down, delete). `workstream` null is the ungrouped bucket — no menu.
export function WorkstreamGroupHeader({
  workstream,
  count,
  doneCount,
  collapsed,
  onToggle,
  onAdd,
  isFirst,
  isLast,
}: {
  workstream: LocalTdlWorkstream | null;
  count: number;
  doneCount: number;
  collapsed: boolean;
  onToggle: () => void;
  onAdd?: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(workstream?.label ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const label = workstream?.label ?? NO_WORKSTREAM_LABEL;

  function closeMenu() {
    setMenu(false);
    setConfirmDelete(false);
  }

  async function commitRename() {
    setRenaming(false);
    if (workstream && draft.trim()) await renameWorkstream(workstream.id, draft);
    else setDraft(workstream?.label ?? "");
  }

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 border-t border-line/60 bg-surface2/40 px-3 py-1.5",
        isFirst && "border-t-0",
      )}
      data-workstream={workstream?.id ?? "none"}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-label={collapsed ? `Expand ${label}` : `Collapse ${label}`}
        className="-ml-1 flex h-7 w-6 shrink-0 items-center justify-center rounded text-muted hover:text-text"
      >
        <ChevronRight className={cn("h-4 w-4 transition-transform", !collapsed && "rotate-90")} />
      </button>
      <Layers className={cn("h-3.5 w-3.5 shrink-0", workstream ? "text-accent" : "text-muted/60")} />
      {renaming ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commitRename()}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commitRename();
            if (e.key === "Escape") {
              setDraft(workstream?.label ?? "");
              setRenaming(false);
            }
          }}
          aria-label="Workstream name"
          className="h-7 min-w-0 flex-1 rounded-md border border-line bg-surface px-2 text-sm text-text outline-none focus:border-accent"
        />
      ) : (
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "min-w-0 flex-1 truncate text-left text-sm font-semibold",
            workstream ? "text-text" : "text-muted",
          )}
        >
          {label}
        </button>
      )}
      <span className="shrink-0 rounded-full bg-surface2 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted">
        {count > 0 ? `${doneCount}/${count}` : "0"}
      </span>
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          aria-label={`Add task to ${label}`}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted hover:bg-surface2 hover:text-text"
        >
          <Plus className="h-4 w-4" />
        </button>
      )}
      {workstream && (
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => (menu ? closeMenu() : setMenu(true))}
            aria-label={`Options for ${label}`}
            aria-expanded={menu}
            className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-surface2 hover:text-text"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-30" onClick={closeMenu} aria-hidden />
              <div className="absolute right-0 top-8 z-40 min-w-[180px] overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setDraft(workstream.label);
                    setRenaming(true);
                    closeMenu();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface2"
                >
                  <Pencil className="h-4 w-4" /> Rename
                </button>
                <button
                  type="button"
                  disabled={isFirst}
                  onClick={() => {
                    void moveWorkstream(workstream.id, -1);
                    closeMenu();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface2 disabled:text-muted/50 disabled:hover:bg-transparent"
                >
                  <ArrowUp className="h-4 w-4" /> Move up
                </button>
                <button
                  type="button"
                  disabled={isLast}
                  onClick={() => {
                    void moveWorkstream(workstream.id, 1);
                    closeMenu();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface2 disabled:text-muted/50 disabled:hover:bg-transparent"
                >
                  <ArrowDown className="h-4 w-4" /> Move down
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!confirmDelete) {
                      setConfirmDelete(true);
                      return;
                    }
                    void deleteWorkstream(workstream.id);
                    closeMenu();
                  }}
                  className="flex w-full items-center gap-2 border-t border-line px-3 py-2 text-left text-sm text-danger hover:bg-surface2"
                >
                  <Trash2 className="h-4 w-4" />
                  {confirmDelete ? "Delete? Tasks become ungrouped" : "Delete workstream"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
