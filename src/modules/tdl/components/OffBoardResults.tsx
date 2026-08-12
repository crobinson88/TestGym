import { ArchiveRestore, BellOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { dayMonth } from "@/lib/utils";
import type { LocalTdlItem } from "../types";
import type { SectionConfig } from "../sections";
import { unarchiveItem, unsnoozeItem } from "../repo";

// Archived and snoozed items are excluded from the day board, so a board search
// would otherwise never surface them. When searching, show the matches here with
// the same restore/wake actions the Archive and Snoozed views offer.
export function OffBoardResults({
  archived,
  snoozed,
  categories,
}: {
  archived: LocalTdlItem[];
  snoozed: LocalTdlItem[];
  categories: SectionConfig[];
}) {
  const labelByKey = new Map(categories.map((c) => [c.key, c.label]));
  const sectionLabel = (item: LocalTdlItem) =>
    labelByKey.get(item.section) ?? item.section;

  if (archived.length === 0 && snoozed.length === 0) return null;

  return (
    <div className="mt-4 space-y-4">
      {snoozed.length > 0 && (
        <div>
          <h2 className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
            Snoozed · {snoozed.length}
          </h2>
          <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
            {snoozed.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-2 border-b border-line/50 px-3 py-2 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{item.title}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                    <span className="text-accent">
                      snoozed until {item.snoozed_until ? dayMonth(item.snoozed_until) : "—"}
                    </span>
                    <span>·</span>
                    <span>{sectionLabel(item)}</span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void unsnoozeItem(item.id)}
                  className="text-muted"
                >
                  <BellOff className="mr-1 h-4 w-4" /> Wake up
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {archived.length > 0 && (
        <div>
          <h2 className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
            Archived · {archived.length}
          </h2>
          <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
            {archived.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-2 border-b border-line/50 px-3 py-2 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{item.title}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                    <span>{sectionLabel(item)}</span>
                    <span>·</span>
                    <span>{dayMonth(item.origin_snapshot_date ?? item.snapshot_date)}</span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void unarchiveItem(item.id)}
                  className="text-muted"
                >
                  <ArchiveRestore className="mr-1 h-4 w-4" /> Unarchive
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
