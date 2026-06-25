// Calls the server-side digest endpoint, which reads the list itself and emails
// the items marked read in the last 7 days. Returns the outcome so the UI can
// distinguish "sent N", "nothing read this week", and an error.
export type DigestResult =
  | { sent: true; count: number }
  | { sent: false; count: 0 };

export async function sendReadingDigest(
  recipients: string[],
  token: string,
): Promise<DigestResult> {
  const res = await fetch("/api/reading-digest", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipients }),
  });
  type Payload = { sent?: boolean; count?: number; error?: string };
  let parsed: Payload | null = null;
  try {
    parsed = (await res.json()) as Payload;
  } catch {
    parsed = null;
  }
  if (!res.ok) throw new Error(parsed?.error || `send failed (${res.status})`);
  if (parsed?.sent) return { sent: true, count: parsed.count ?? 0 };
  return { sent: false, count: 0 };
}
