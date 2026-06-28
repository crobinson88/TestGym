import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { updateItem } from "../repo";
import type { LocalTdlItem } from "../types";
import { ImageEditor } from "./ImageEditor";
import { ImageGallery } from "./ImageGallery";

// Detail / description for a single item. Revealed by double-clicking the row;
// read-only until "Edit" is pressed. Text lives in `notes`, images in `images`.
// Items flagged as ones we don't want to do also get a "why" section under the
// description, recorded in `reluctance_reason`.
export function ItemDetail({ item }: { item: LocalTdlItem }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.notes ?? "");
  const [images, setImages] = useState<string[]>(item.images ?? []);
  const [reason, setReason] = useState(item.reluctance_reason ?? "");

  // Mirror external changes (sync/realtime) into the draft while not editing,
  // so an open-but-idle panel stays current.
  useEffect(() => {
    if (!editing) {
      setText(item.notes ?? "");
      setImages(item.images ?? []);
      setReason(item.reluctance_reason ?? "");
    }
  }, [item.notes, item.images, item.reluctance_reason, editing]);

  async function save() {
    const next = text.trim();
    const nextReason = reason.trim();
    await updateItem(item.id, {
      notes: next ? next : null,
      images,
      ...(item.is_reluctant ? { reluctance_reason: nextReason ? nextReason : null } : {}),
    });
    setEditing(false);
  }

  function cancel() {
    setText(item.notes ?? "");
    setImages(item.images ?? []);
    setReason(item.reluctance_reason ?? "");
    setEditing(false);
  }

  const notes = item.notes?.trim();
  const reluctanceReason = item.reluctance_reason?.trim();
  const hasContent = !!notes || (item.images?.length ?? 0) > 0;

  return (
    <div className="mt-2 rounded-xl border border-line bg-surface2/40 p-3">
      {editing ? (
        <div className="space-y-3">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add details…"
            rows={4}
            className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <ImageEditor images={images} onChange={setImages} />
          {item.is_reluctant && (
            <div className="space-y-1">
              <p className="text-[11px] font-medium uppercase tracking-wide text-warn">
                Why I don't want to do this
              </p>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Record the reason…"
                rows={2}
                className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" variant="primary" onClick={() => void save()}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={cancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {notes ? (
            <p className="whitespace-pre-wrap break-words text-sm text-text">{notes}</p>
          ) : (
            !hasContent && <p className="text-sm italic text-muted">No details yet.</p>
          )}
          <ImageGallery images={item.images ?? []} />
          {item.is_reluctant && (
            <div className="space-y-1 border-t border-line pt-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-warn">
                Why I don't want to do this
              </p>
              {reluctanceReason ? (
                <p className="whitespace-pre-wrap break-words text-sm text-text">{reluctanceReason}</p>
              ) : (
                <p className="text-sm italic text-muted">No reason recorded yet.</p>
              )}
            </div>
          )}
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            <Pencil className="mr-1 h-4 w-4" /> Edit
          </Button>
        </div>
      )}
    </div>
  );
}
