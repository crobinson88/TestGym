import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { syncEngine } from "@/lib/sync";
import { prettyDate } from "@/lib/utils";
import { rollForward } from "../rollForward";

export function RollForwardButton({
  fromDate,
  toDate,
}: {
  fromDate: string;
  toDate: string;
}) {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function go() {
    setRunning(true);
    const r = await rollForward(fromDate, toDate);
    setRunning(false);
    setDone(`Carried ${r.created} items from ${prettyDate(fromDate)}`);
    if (typeof navigator === "undefined" || navigator.onLine) {
      void syncEngine.drain();
    }
  }

  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface p-6 text-center">
      <p className="text-sm text-muted">
        Nothing here yet. Carry over from {prettyDate(fromDate)}?
      </p>
      <Button onClick={go} disabled={running} size="md">
        <ArrowRight className="mr-1 h-4 w-4" />
        {running ? "Carrying..." : `Roll forward from ${prettyDate(fromDate)}`}
      </Button>
      {done && <p className="text-xs text-success">{done}</p>}
    </div>
  );
}
