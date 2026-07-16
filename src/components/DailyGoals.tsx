import { formatHours } from "@/lib/time";
import { useWorkHoursOnDate } from "@/lib/timeHooks";
import { TargetPies, useDayCompletion } from "@/modules/tdl";

// The to-do day's target pies (Action Items / Priority / Did Anyway) plus the
// hours worked that day, shared by the Today and Stats screens so the same
// goals show up outside the to-do board.
export function DailyGoals({ date }: { date: string }) {
  const completion = useDayCompletion(date);
  const workHours = useWorkHoursOnDate(date);

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-xs uppercase tracking-wide text-muted">To-do goals</div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-muted">Hours worked</div>
          <div className="text-xl font-semibold tabular-nums">
            {workHours === undefined ? "—" : `${formatHours(workHours)} h`}
          </div>
        </div>
      </div>
      <div className="mt-3">
        {completion ? (
          <TargetPies
            engaged={completion.active}
            priorityEngaged={completion.priorityActive}
            reluctantDone={completion.reluctantDone}
          />
        ) : (
          <div className="py-6 text-center text-sm text-muted">Loading…</div>
        )}
      </div>
    </div>
  );
}
