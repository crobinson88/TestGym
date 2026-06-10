// Receipt OCR endpoint. Takes a photo of a receipt and returns its line items
// (plus tax/tip/total) as structured data, so the bill-splitter can list real
// items instead of hand-typed categories.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
// authedUser/serviceClient/json are generic infra helpers that happen to live
// in the fireflies module; reuse rather than duplicate the auth gate.
import { authedUser, json, serviceClient } from "./_fireflies.js";

// One vision call; receipts are small but give it room for long itemizations.
export const maxDuration = 30;

const MEDIA_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type MediaType = (typeof MEDIA_TYPES)[number];

const Receipt = z.object({
  merchant: z.string().nullable(),
  items: z.array(
    z.object({
      name: z.string(),
      // The line-item price (quantity already multiplied in), in the receipt's
      // currency. Modifiers/sub-lines should fold into the parent item.
      amount: z.number(),
    }),
  ),
  tax: z.number().nullable(),
  tip: z.number().nullable(),
  total: z.number().nullable(),
});

type Body = { imageBase64?: string; mediaType?: string };

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

  const { imageBase64, mediaType } = body;
  if (!imageBase64) return json({ error: "missing imageBase64" }, 400);
  if (!mediaType || !MEDIA_TYPES.includes(mediaType as MediaType)) {
    return json({ error: "unsupported mediaType" }, 400);
  }

  try {
    const anthropic = new Anthropic();
    const result = await anthropic.messages.parse({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      system:
        "You read a photo of a restaurant or store receipt and extract its line items. " +
        "One entry per purchased item, with its price as a number (no currency symbol). " +
        "If a quantity is shown, give the line's total price, not the unit price. " +
        "Fold modifiers and sub-lines into their parent item. " +
        "Do NOT include subtotal, tax, tip/gratuity, or total as items — return tax and " +
        "tip in their own fields, and the grand total in `total`. Use null when a field " +
        "is absent. If the image is not a readable receipt, return an empty items array.",
      output_config: { format: zodOutputFormat(Receipt) },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType as MediaType, data: imageBase64 },
            },
            { type: "text", text: "Extract the line items from this receipt." },
          ],
        },
      ],
    });

    const parsed = result.parsed_output;
    if (!parsed) return json({ error: "could not read receipt" }, 422);
    return json(parsed, 200);
  } catch (e) {
    console.error("receipt-scan failed", e);
    return json({ error: e instanceof Error ? e.message : "scan failed" }, 500);
  }
}
