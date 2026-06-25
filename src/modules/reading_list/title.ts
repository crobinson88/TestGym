// Calls the server-side title fetcher (browsers can't fetch arbitrary URLs).
// Returns null when nothing usable came back so the caller can stay quiet.
export async function fetchUrlTitle(url: string, token: string): Promise<string | null> {
  const res = await fetch("/api/fetch-title", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) return null;
  let parsed: { title?: string | null } | null;
  try {
    parsed = (await res.json()) as { title?: string | null };
  } catch {
    parsed = null;
  }
  return parsed?.title?.trim() || null;
}
