import { ArrowDown, ArrowUp, Flag, Star, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { QUADRANT_BY_KEY } from "../quadrant";
import {
  CUT_QUADRANT,
  SHORTLIST_LIMIT,
  cutIds,
  isPicked,
  orderShortlist,
  pickedIds,
  type Shortlist,
} from "../priorityShortlist";
import type { LocalTdlItem } from "../types";
import { StatusPill } from "./StatusPill";

// The cut: every task tagged a potential priority during the status pass, as
// one sorted list however many were tagged. Sort it top to bottom; the first
// SHORTLIST_LIMIT take ranks 1…n and everything below the line goes to Do
// First. Shown once, at the end of the pass — it is the only step that writes.
export function PriorityShortlistStep({
  shortlist,
  itemById,
  labelBySection,
  busy,
  onPromote,
  onDemote,
  onMove,
  onRemove,
}: {
  shortlist: Shortlist;
  itemById: ReadonlyMap<string, LocalTdlItem>;
  labelBySection: ReadonlyMap<string, string>;
  busy: boolean;
  onPromote: (id: string) => void;
  onDemote: (id: string) => void;
  onMove: (id: string, delta: number) => void;
  onRemove: (id: string) => void;
}) {
  const ordered = orderShortlist(shortlist, itemById);
  const picked = pickedIds(shortlist);
  const cut = cutIds(shortlist);
  const cutLabel = QUADRANT_BY_KEY[CUT_QUADRANT].label;

  return (
    <>
      <div className="rounded-xl border border-line bg-surface2 p-3">
        <p className="text-sm font-semibold">{`The final ${SHORTLIST_LIMIT}`}</p>
        <p className="mt-1 text-xs text-muted">
          {`Sort all ${ordered.length} — the top ${picked.length} become today's priorities, in this order. `}
          {cut.length > 0 &&
            `The ${cut.length} below the line go to ${cutLabel}.`}
        </p>
      </div>

      <ul className="mt-3 space-y-2">
        {ordered.map((item, i) => {
          const isTop = isPicked(shortlist, item.id);
          const rank = isTop ? i + 1 : null;
          return (
            <li
              key={item.id}
              className={cn(
                "rounded-xl border p-2",
                isTop
                  ? "border-accent/40 bg-accent/10"
                  : "border-danger/30 bg-danger/5",
              )}
            >
              <div className="flex items-start gap-2">
                <span
                  className={cn(
                    "mt-0.5 inline-flex h-7 min-w-[2rem] shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums",
                    isTop
                      ? "bg-accent/20 text-accent"
                      : "bg-danger/15 text-danger",
                  )}
                >
                  {rank != null ? `P${rank}` : "cut"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug">
                    {item.title}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] text-muted">
                      {labelBySection.get(item.section) ?? item.section}
                    </span>
                    <StatusPill
                      status={item.status}
                      section={item.section}
                      compact
                    />
                    {!isTop && (
                      <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-medium text-danger">
                        → {cutLabel}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => onRemove(item.id)}
                  aria-label={`Remove ${item.title} from the shortlist`}
                  className="h-9 w-9 shrink-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <Button
                  size="icon"
                  variant="secondary"
                  disabled={busy || i === 0}
                  onClick={() => onMove(item.id, -1)}
                  aria-label={`Move ${item.title} up`}
                  className="h-11 w-11"
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="secondary"
                  disabled={busy || i === ordered.length - 1}
                  onClick={() => onMove(item.id, 1)}
                  aria-label={`Move ${item.title} down`}
                  className="h-11 w-11"
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                {isTop ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy || ordered.length <= SHORTLIST_LIMIT}
                    onClick={() => onDemote(item.id)}
                    aria-label={`Cut ${item.title}`}
                    className="ml-auto h-11"
                  >
                    Cut
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => onPromote(item.id)}
                    className="ml-auto h-11"
                  >
                    <Star className="mr-1 h-4 w-4" />
                    Make a priority
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {ordered.length === 0 && (
        <p className="mt-6 text-center text-sm text-muted">
          <Flag className="mx-auto mb-2 h-8 w-8 opacity-40" />
          Nothing tagged a potential priority.
        </p>
      )}
    </>
  );
}
