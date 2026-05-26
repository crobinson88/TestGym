import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronLeft, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { syncEngine } from "@/lib/sync";
import { useMetActivities } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const MINUTE_STEPS = [-10, -5, -1, 1, 5, 10];

export function AddCardio() {
  const navigate = useNavigate();
  const activities = useMetActivities("cardio");
  const [activityId, setActivityId] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(30);
  const [distance, setDistance] = useState("");
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(false);

  function goBack() {
    if (activityId === null) {
      navigate("/");
      return;
    }
    setActivityId(null);
  }

  const activity = activityId ? activities?.find((a) => a.id === activityId) : null;

  async function save() {
    if (!activityId || minutes <= 0) return;
    setSaving(true);
    try {
      const distNum = distance.trim() === "" ? null : Number(distance);
      await syncEngine.mutations.addCardioSession({
        activity_id: activityId,
        minutes,
        distance: Number.isFinite(distNum) ? distNum : null,
      });
      setFlash(true);
      setTimeout(() => navigate("/"), 700);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-2 py-3">
        <button
          onClick={goBack}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-text hover:bg-surface2"
          aria-label="Back"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <div className="min-w-0 truncate text-sm text-muted">
          {activity ? (
            <span className="font-medium text-text">{activity.name}</span>
          ) : (
            <span className="font-medium text-text">Pick a cardio activity</span>
          )}
        </div>
      </div>

      <div className="relative flex-1 overflow-y-auto p-4">
        {activities === undefined && (
          <div className="py-12 text-center text-muted">Loading...</div>
        )}

        {activities && activityId === null && (
          <ul className="space-y-2">
            {activities.map((a) => (
              <li key={a.id}>
                <button
                  onClick={() => setActivityId(a.id)}
                  className="flex w-full items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3 text-left transition active:scale-[0.99] hover:bg-surface2"
                >
                  <span className="text-base font-medium">{a.name}</span>
                  <span className="text-sm text-muted tabular-nums">{a.met_value} MET</span>
                </button>
              </li>
            ))}
            {activities.length === 0 && (
              <li className="py-12 text-center text-muted">
                No cardio activities seeded.
              </li>
            )}
          </ul>
        )}

        {activity && (
          <div className="flex h-full flex-col">
            <div className="mb-4 text-center text-sm text-muted">
              {activity.met_value} MET
            </div>

            <Display label="Minutes" value={String(minutes)} />
            <StepRow
              steps={MINUTE_STEPS}
              onTap={(delta) => setMinutes((m) => Math.max(0, m + delta))}
            />

            <div className="mt-6 text-center">
              <div className="text-xs uppercase tracking-wide text-muted">
                MET-minutes
              </div>
              <div className="mt-1 text-3xl font-semibold tabular-nums">
                {Math.round(activity.met_value * minutes)}
              </div>
            </div>

            <div className="mt-6">
              <label className="block space-y-2">
                <span className="text-xs uppercase tracking-wide text-muted">
                  Distance (optional)
                </span>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={distance}
                  onChange={(e) => setDistance(e.target.value)}
                  placeholder="e.g. 3.2"
                  disabled={saving}
                />
              </label>
            </div>

            <div className="mt-auto pt-6">
              <Button
                onClick={save}
                size="lg"
                className="w-full"
                disabled={saving || minutes <= 0}
              >
                {saving ? (
                  "Saving..."
                ) : (
                  <>
                    <Check className="mr-2 h-5 w-5" />
                    Save cardio
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {flash && (
          <div
            role="status"
            className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-success px-4 py-2 text-sm font-medium text-bg shadow-lg"
          >
            Saved ✓
          </div>
        )}
      </div>
    </div>
  );
}

function Display({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-6xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function StepRow({
  steps,
  onTap,
}: {
  steps: readonly number[];
  onTap: (delta: number) => void;
}) {
  return (
    <div className="mt-3 flex justify-center gap-2">
      {steps.map((delta) => {
        const positive = delta > 0;
        return (
          <button
            key={delta}
            onClick={() => onTap(delta)}
            className={cn(
              "flex h-14 min-w-tap flex-1 items-center justify-center gap-1 rounded-xl border border-line bg-surface text-base font-semibold transition active:scale-[0.96]",
              positive ? "text-success" : "text-warn",
            )}
            aria-label={`${positive ? "Add" : "Subtract"} ${Math.abs(delta)}`}
          >
            {positive ? <Plus className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
            {Math.abs(delta)}
          </button>
        );
      })}
    </div>
  );
}
