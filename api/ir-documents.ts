// Lists a company's publicly released investor-relations documents (SEC EDGAR
// + optional FMP). Manually triggered from the Stock page; returns a flat list
// the client caches locally. Auth reuses the app's magic-link gate.
import { authedUser, json, serviceClient } from "./_fireflies.js";
import { listIrDocuments } from "./_ir.js";

export const maxDuration = 30;

type Body = { ticker?: string };

export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = serviceClient();
    if (!(await authedUser(request, supabase))) return json({ error: "unauthorized" }, 401);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "init failed" }, 500);
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return json({ error: "invalid body" }, 400);
  }

  const ticker = (body.ticker ?? "").trim();
  if (!ticker) return json({ error: "missing ticker" }, 400);

  try {
    return json(await listIrDocuments(ticker), 200);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "lookup failed" }, 502);
  }
}
