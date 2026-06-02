import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";

type TriggerResult = { meetingIds: string[]; basePosition: number };
type ProcessResult = { added: number; ok: boolean; error?: string };

// Read a response as JSON, but degrade gracefully when the server returns a
// non-JSON body (e.g. Vercel's plain-text "A server error has occurred" on a
// function crash). Returns the parsed object, or null if the body wasn't JSON.
async function readJson<T>(res: Response): Promise<{ parsed: T | null; text: string }> {
  const text = await res.text();
  try {
    return { parsed: JSON.parse(text) as T, text };
  } catch {
    return { parsed: null, text };
  }
}

export function ImportMeetingsButton() {
  const { session } = useAuth();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    if (!session) return;
    setRunning(true);
    setProgress(null);
    setMessage(null);
    setError(null);
    const token = session.access_token;
    try {
      // 1) Fast call: which meetings are new? Returns instantly.
      const res = await fetch("/api/fireflies-import", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const { parsed, text } = await readJson<Partial<TriggerResult> & { error?: string }>(res);
      if (!res.ok || !parsed) {
        const detail = parsed?.error ?? text.trim().slice(0, 120);
        throw new Error(detail ? `Import failed (${res.status}): ${detail}` : `Import failed (${res.status})`);
      }
      const body = parsed;

      const meetingIds = body.meetingIds ?? [];
      const basePosition = body.basePosition ?? 0;
      const total = meetingIds.length;
      if (total === 0) {
        setMessage("No new meetings");
        return;
      }

      // 2) Process each meeting in its own request, in parallel. Items appear on
      // the board via Realtime as each finishes; we just track the X-of-N count.
      setProgress({ done: 0, total });
      let added = 0;
      let failed = 0;
      let done = 0;
      let firstError: string | null = null;
      await Promise.all(
        meetingIds.map(async (meetingId, meetingIndex) => {
          try {
            const r = await fetch("/api/fireflies-process", {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ meetingId, basePosition, meetingIndex }),
            });
            const { parsed: b, text } = await readJson<Partial<ProcessResult>>(r);
            if (!r.ok || !b?.ok) {
              failed++;
              firstError ??= b?.error ?? text.trim().slice(0, 160) ?? `HTTP ${r.status}`;
            } else {
              added += b.added ?? 0;
            }
          } catch (e) {
            failed++;
            firstError ??= e instanceof Error ? e.message : "request failed";
          } finally {
            done++;
            setProgress({ done, total });
          }
        }),
      );

      const ok = total - failed;
      const base =
        added === 0
          ? `No action items found in ${ok} meeting${ok === 1 ? "" : "s"}`
          : `Added ${added} item${added === 1 ? "" : "s"} from ${ok} meeting${ok === 1 ? "" : "s"}`;
      // Surface the first failure reason so a silent per-meeting throw is debuggable.
      const suffix = failed > 0 ? ` (${failed} failed${firstError ? `: ${firstError}` : ""} — tap again to retry)` : "";
      setMessage(`${base}${suffix}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  const label = running
    ? progress
      ? `Importing ${progress.done} of ${progress.total}...`
      : "Importing..."
    : "Import meeting action items";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={go} disabled={running || !session} variant="secondary" size="sm">
        <Download className="mr-1 h-4 w-4" />
        {label}
      </Button>
      {message && <span className="text-xs text-success">{message}</span>}
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
