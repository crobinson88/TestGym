import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";

type ImportResult = { added: number; meetings: number; failed: number };

export function ImportMeetingsButton() {
  const { session } = useAuth();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    if (!session) return;
    setRunning(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/fireflies-import", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const body = (await res.json()) as Partial<ImportResult> & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Import failed (${res.status})`);
      const { added = 0, meetings = 0, failed = 0 } = body;
      const base =
        meetings === 0
          ? "No new meetings"
          : `Added ${added} item${added === 1 ? "" : "s"} from ${meetings} meeting${meetings === 1 ? "" : "s"}`;
      setMessage(failed > 0 ? `${base} (${failed} failed)` : base);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={go} disabled={running || !session} variant="secondary" size="sm">
        <Download className="mr-1 h-4 w-4" />
        {running ? "Importing..." : "Import meeting action items"}
      </Button>
      {message && <span className="text-xs text-success">{message}</span>}
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
