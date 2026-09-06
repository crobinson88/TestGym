import { Flame, Lock } from "lucide-react";
import { cn, relativeDay } from "@/lib/utils";
import { STREAK_DEFS, totalBadgesEarned, type Badge, type Streak, type StreakDef } from "./compute";
import { useStreaks } from "./hooks";

export function StreakBoard() {
  const streaks = useStreaks();
  if (!streaks) return <div className="py-10 text-center text-sm text-muted">Loading…</div>;

  const earned = totalBadgesEarned(streaks);
  const byKey = new Map(streaks.map((s) => [s.key, s]));

  return (
    <div className="space-y-3">
      {STREAK_DEFS.map((def) => {
        const streak = byKey.get(def.key);
        return streak ? <StreakCard key={def.key} def={def} streak={streak} /> : null;
      })}
      <div className="px-1 text-[11px] text-muted">
        {earned} of {streaks.length * streaks[0].badges.length} badges earned. A streak survives a
        day that isn't logged yet — it only breaks once a whole day goes by without it.
      </div>
    </div>
  );
}

function subtitle(streak: Streak): string {
  if (streak.current === 0) {
    return streak.lastDate ? `Last on ${relativeDay(streak.lastDate)}` : "Not started yet";
  }
  if (streak.pendingToday) return "Alive — not logged today yet";
  return "Logged today";
}

function StreakCard({ def, streak }: { def: StreakDef; streak: Streak }) {
  const pct =
    streak.next === null ? 100 : Math.min(100, Math.round((streak.current / streak.next.days) * 100));
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <Flame
              className={cn("h-4 w-4", streak.current === 0 && "opacity-30")}
              style={streak.current > 0 ? { color: def.color } : undefined}
            />
            <span className="font-semibold">{def.label}</span>
          </div>
          <div className="mt-0.5 text-xs text-muted">{subtitle(streak)}</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tabular-nums" style={{ color: def.color }}>
            {streak.current}
            <span className="ml-1 text-sm font-medium text-muted">
              {streak.current === 1 ? def.unit : `${def.unit}s`}
            </span>
          </div>
          <div className="text-[11px] text-muted tabular-nums">
            best {streak.best} · {streak.total} total
          </div>
        </div>
      </div>

      <div className="mt-3 flex gap-1.5">
        {streak.badges.map((badge) => (
          <BadgeChip key={badge.days} badge={badge} color={def.color} label={def.label} />
        ))}
      </div>

      {streak.next && (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-surface2">
            <div
              className="h-full rounded-full transition-[width]"
              style={{ width: `${pct}%`, backgroundColor: def.color }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-muted">
            <span>{def.hint}</span>
            <span className="shrink-0 pl-2 tabular-nums">
              {streak.next.remaining} to {streak.next.label}
            </span>
          </div>
        </div>
      )}
      {!streak.next && (
        <div className="mt-3 text-[11px] text-muted">
          {def.hint} · every badge held
        </div>
      )}
    </div>
  );
}

function BadgeChip({ badge, color, label }: { badge: Badge; color: string; label: string }) {
  const title = badge.held
    ? `${label}: ${badge.label} badge — held right now`
    : badge.earned
      ? `${label}: ${badge.label} badge earned`
      : `${label}: ${badge.days} days in a row to earn the ${badge.label} badge`;
  return (
    <div
      title={title}
      className={cn(
        "flex h-8 flex-1 items-center justify-center gap-1 rounded-lg border text-[11px] font-semibold tabular-nums",
        badge.earned ? "border-transparent" : "border-line bg-surface2 text-muted/60",
      )}
      style={
        badge.earned
          ? {
              color,
              backgroundColor: `${color}22`,
              boxShadow: badge.held ? `inset 0 0 0 1.5px ${color}` : undefined,
            }
          : undefined
      }
    >
      {!badge.earned && <Lock className="h-3 w-3" />}
      {badge.short}
    </div>
  );
}
