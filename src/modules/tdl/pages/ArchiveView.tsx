import { ArchiveRestore, ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { dayMonth, todayIsoDate } from "@/lib/utils";
import { useArchivedItems } from "../hooks";
import { SECTION_BY_KEY } from "../sections";
import { unarchiveItem } from "../repo";

export default function ArchiveView() {
  const navigate = useNavigate();
  const items = useArchivedItems();

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
        <h1 className="text-base font-semibold">Archived items</h1>
        <span className="ml-auto rounded-full bg-surface2 px-2 py-0.5 text-[11px] tabular-nums text-muted">
          {items?.length ?? 0}
        </span>
      </header>

      <div className="p-3">
        {!items ? (
          <div className="p-6 text-center text-muted">Loading...</div>
        ) : items.length === 0 ? (
          <div className="p-6 text-center text-muted">Nothing archived.</div>
        ) : (
          <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-2 border-b border-line/50 px-3 py-2 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{item.title}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                    <span>{SECTION_BY_KEY[item.section]?.label ?? item.section}</span>
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
        )}
      </div>
    </div>
  );
}
