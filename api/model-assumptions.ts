// Seed 3-statement model assumptions from filings. Takes a ticker plus document
// URLs and/or uploaded files, has Claude read them and return structured driver
// assumptions. The client's deterministic engine still does all the arithmetic —
// this only proposes the inputs. Auth reuses the app's magic-link gate.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { authedUser, json, serviceClient } from "./_fireflies.js";
import { loadDocBlocks, MAX_SOURCES, type DocFile } from "./_research.js";

export const maxDuration = 60;

type Body = { ticker?: string; urls?: string[]; files?: DocFile[] };

// Decimals for rates (0.1 = 10%); absolute currency amounts for the starting
// balances. Nullable so the model can omit anything the filings don't support;
// the client merges non-null values onto its defaults.
const Assumptions = z.object({
  baseRevenue: z.number().nullable(),
  revenueGrowth: z.number().nullable(),
  grossMargin: z.number().nullable(),
  opexPctRevenue: z.number().nullable(),
  daPctRevenue: z.number().nullable(),
  taxRate: z.number().nullable(),
  capexPctRevenue: z.number().nullable(),
  dso: z.number().nullable(),
  dio: z.number().nullable(),
  dpo: z.number().nullable(),
  interestRate: z.number().nullable(),
  dividendPayout: z.number().nullable(),
  startingCash: z.number().nullable(),
  startingPpe: z.number().nullable(),
  startingDebt: z.number().nullable(),
  rationale: z.string().nullable(),
});

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

  const ticker = body.ticker?.trim().toUpperCase() || "the company";
  const urls = (body.urls ?? []).map((u) => u.trim()).filter(Boolean);
  const files = body.files ?? [];
  if (urls.length + files.length === 0) {
    return json({ error: "provide at least one document URL or file" }, 400);
  }
  if (urls.length + files.length > MAX_SOURCES) {
    return json({ error: `too many sources (max ${MAX_SOURCES})` }, 400);
  }

  let docBlocks;
  try {
    docBlocks = await loadDocBlocks(urls, files);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "failed to load documents" }, 502);
  }

  try {
    const anthropic = new Anthropic();
    const result = await anthropic.messages.parse({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system:
        "You are an equity-research analyst building a 3-statement model. From the provided " +
        "company filings, propose forward-looking driver assumptions. Ground every figure in the " +
        "documents (latest full-year actuals and management guidance where available); do not " +
        "invent numbers. Use DECIMALS for all rates and margins (e.g. 0.18 for 18%). Use the " +
        "filing's own currency units for baseRevenue and the starting balances (cash, PP&E, debt) " +
        "— take these from the most recent balance sheet. revenueGrowth is a forward annual rate. " +
        "Return null for any input the filings don't support. Put a one-paragraph justification " +
        "in `rationale`.",
      output_config: { format: zodOutputFormat(Assumptions) },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: `Company: ${ticker}\n\nPropose model assumptions from these documents.` },
            ...docBlocks,
          ],
        },
      ],
    });

    const assumptions = result.parsed_output;
    if (!assumptions) return json({ error: "no assumptions produced" }, 422);
    return json({ assumptions }, 200);
  } catch (e) {
    console.error("model-assumptions failed", e);
    return json({ error: e instanceof Error ? e.message : "seeding failed" }, 500);
  }
}
