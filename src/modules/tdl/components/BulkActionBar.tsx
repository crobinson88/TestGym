import { useState } from "react";
import { Archive, CheckSquare, Clock, Square, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Calendar } from "@/components/ui/Calendar";
import { addDays } from "@/lib/utils";

// Sticky action bar shown while the day is in selection mode. Bulk actions run
// against the currently-selected item ids; the parent owns that set.
export function BulkActionBar({
  snapshot_date,
  selectedCount,
  totalSelectable,
  onSelectAll,
  onClear,
  onArchive,
  onSnooze,
  onDelete,
  onExit,
}: {
  snapshot_date: string;
  selectedCount: number;
  totalSelectable: number;
  onSelectAll: () => void;
  onClear: () => void;
  onArchive: () => void;
  onSnooze: (until: string) => void;
  onDelete: () => void;
  onExit: () => void;
}) {
  const [snoozing, setSnoozing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const none = selectedCount === 0;
  const allSelected = totalSelectable > 0 && selectedCount === totalSelectable;

  return (
    <div className="sticky bottom-0 z-20 -mx-3 mt-3 border-t border-line bg-surface/95 px-3 py-2 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={allSelected ? onClear : onSelectAll}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted hover:text-text"
        >
          {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
          {allSelected ? "Clear" : "Select all"}
        </button>
        <span className="text-sm font-semibold tabular-nums">{selectedCount} selected</span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <Button
              size="sm"
              variant="secondary"
              disabled={none}
              onClick={() => {
                setConfirmingDelete(false);
                setSnoozing((v) => !v);
              }}
            >
              <Clock className="mr-1 h-4 w-4" /> Snooze
            </Button>
            {snoozing && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setSnoozing(false)} aria-hidden />
                <div className="absolute bottom-11 right-0 z-40">
                  <Calendar
                    min={addDays(snapshot_date, 1)}
                    onSelect={(next) => {
                      if (next > snapshot_date) onSnooze(next);
                      setSnoozing(false);
                    }}
                  />
                </div>
              </>
            )}
          </div>
          <Button size="sm" variant="secondary" disabled={none} onClick={onArchive}>
            <Archive className="mr-1 h-4 w-4" /> Archive
          </Button>
          {confirmingDelete ? (
            <Button
              size="sm"
              variant="danger"
              disabled={none}
              onClick={() => {
                onDelete();
                setConfirmingDelete(false);
              }}
            >
              <Trash2 className="mr-1 h-4 w-4" /> Confirm
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              disabled={none}
              onClick={() => {
                setSnoozing(false);
                setConfirmingDelete(true);
              }}
              className="text-danger"
            >
              <Trash2 className="mr-1 h-4 w-4" /> Delete
            </Button>
          )}
          <Button size="icon" variant="ghost" onClick={onExit} aria-label="Exit selection" className="h-9 w-9">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
