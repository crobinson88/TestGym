import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { resetDayStatuses } from "../repo";
import { isResettable } from "../snooze";
import type { LocalTdlItem } from "../types";

type Stage = "idle" | "confirm1" | "confirm2";

// Resets every non-archived, non-snoozed item on the day back to "open".
// Destructive, so it walks through two explicit confirmations first.
export function ResetStatusesButton({
  snapshot_date,
  items,
}: {
  snapshot_date: string;
  items: LocalTdlItem[];
}) {
  const [stage, setStage] = useState<Stage>("idle");
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const count = items.filter(isResettable).length;

  // Collapse the confirmation flow whenever the day or its items change so we
  // never fire a stale reset against a day the user has since navigated away from.
  useEffect(() => {
    setStage("idle");
    setMessage(null);
  }, [snapshot_date]);

  async function run() {
    setRunning(true);
    const changed = await resetDayStatuses(snapshot_date);
    setRunning(false);
    setStage("idle");
    setMessage(`Reset ${changed} item${changed === 1 ? "" : "s"} to Open`);
  }

  if (stage === "idle") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => {
            setMessage(null);
            setStage("confirm1");
          }}
          disabled={count === 0}
          variant="secondary"
          size="sm"
        >
          <RotateCcw className="mr-1 h-4 w-4" />
          Reset all to Open
        </Button>
        {message && <span className="text-xs text-success">{message}</span>}
      </div>
    );
  }

  const prompt =
    stage === "confirm1"
      ? `Reset ${count} item${count === 1 ? "" : "s"} to Open?`
      : "Are you sure? This can't be undone.";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted">{prompt}</span>
      <Button
        onClick={() => (stage === "confirm1" ? setStage("confirm2") : void run())}
        disabled={running}
        variant="danger"
        size="sm"
      >
        {running ? "Resetting..." : stage === "confirm1" ? "Yes, reset" : "Confirm reset"}
      </Button>
      <Button onClick={() => setStage("idle")} disabled={running} variant="ghost" size="sm">
        Cancel
      </Button>
    </div>
  );
}
