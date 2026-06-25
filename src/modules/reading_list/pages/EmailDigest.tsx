import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronLeft, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import { useReadingItems } from "../hooks";
import { sendReadingDigest } from "../digest";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// Split on commas, whitespace and newlines so pasting any flavour of list works.
function parseRecipients(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[\s,;]+/)
        .map((r) => r.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

export default function EmailDigest() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const token = session?.access_token;
  const items = useReadingItems();

  const [raw, setRaw] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Mirror the server's "read this week" so the count shown matches what gets
  // sent: currently read, updated within the last 7 days.
  const readThisWeek = useMemo(() => {
    if (!items) return [];
    const since = Date.now() - WINDOW_MS;
    return items.filter((i) => i.is_read && new Date(i.updated_at).getTime() >= since);
  }, [items]);

  const recipients = useMemo(() => parseRecipients(raw), [raw]);
  const invalid = recipients.filter((r) => !EMAIL_RE.test(r));
  const canSend =
    !!token && recipients.length > 0 && invalid.length === 0 && readThisWeek.length > 0 && !sending;

  async function send() {
    if (!canSend || !token) return;
    setSending(true);
    setError(null);
    setDone(null);
    try {
      const result = await sendReadingDigest(recipients, token);
      if (result.sent) {
        setDone(
          `Sent ${result.count} item${result.count === 1 ? "" : "s"} to ${recipients.length} recipient${recipients.length === 1 ? "" : "s"}.`,
        );
        setRaw("");
      } else {
        setError("Nothing has been marked read in the last 7 days — nothing to send.");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-2 py-3">
        <button
          onClick={() => navigate("/reading")}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-text hover:bg-surface2"
          aria-label="Back"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <span className="font-medium text-text">Email this week's reads</span>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-sm text-text">
            {readThisWeek.length === 0 ? (
              <>Nothing marked read in the last 7 days yet.</>
            ) : (
              <>
                <span className="font-semibold">{readThisWeek.length}</span> item
                {readThisWeek.length === 1 ? "" : "s"} read this week will be included.
              </>
            )}
          </p>
          {readThisWeek.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {readThisWeek.map((i) => (
                <li key={i.id} className="truncate text-xs text-muted">
                  • {i.title}
                </li>
              ))}
            </ul>
          )}
        </div>

        <label className="block space-y-2">
          <span className="text-xs uppercase tracking-wide text-muted">Recipients</span>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="alice@example.com, bob@example.com"
            rows={4}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-text placeholder:text-muted outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          <span className="text-xs text-muted">Separate addresses with commas, spaces or new lines.</span>
        </label>

        {invalid.length > 0 && (
          <div className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
            Not a valid email: {invalid.join(", ")}
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
            {error}
          </div>
        )}

        {done && (
          <div className="flex items-start gap-2 rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
            <Check className="mt-0.5 h-4 w-4 shrink-0" /> {done}
          </div>
        )}

        <Button onClick={send} size="lg" className="w-full" disabled={!canSend}>
          {sending ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Sending…
            </>
          ) : (
            <>
              <Mail className="mr-2 h-5 w-5" /> Send digest
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
