// Photo → structured data endpoint. A few AI jobs share one function to stay
// within Vercel's Serverless-Function budget (like french-chat doubling as the
// sentence generator):
//   kind:"receipt" (default) — a receipt's line items (+ tax/tip/total) for the
//                              bill-splitter.
//   kind:"food"             — a meal's estimated calories + protein from a photo,
//                              for the Food Diary's photo logging.
//   kind:"food-text"        — the same estimate from a typed food description
//                              (no image), for logging food by name.
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

const FoodEstimate = z.object({
  // A short human label for the food or meal, e.g. "Grilled chicken salad".
  name: z.string(),
  // Whole-meal estimates for the full portion shown.
  calories: z.number(),
  protein: z.number(),
  // 0..1 rough confidence; low when the photo is ambiguous or not food.
  confidence: z.number(),
  // Non-empty only when the image is not food or is unreadable.
  error: z.string().nullable(),
});

type Body = {
  imageBase64?: string;
  mediaType?: string;
  kind?: string;
  note?: string;
  // Food description for the text-only estimate (kind:"food-text").
  text?: string;
};

const RECEIPT_SYSTEM =
  "You read a photo of a restaurant or store receipt and extract its line items. " +
  "One entry per purchased item, with its price as a number (no currency symbol). " +
  "If a quantity is shown, give the line's total price, not the unit price. " +
  "Fold modifiers and sub-lines into their parent item. " +
  "Do NOT include subtotal, tax, tip/gratuity, or total as items — return tax and " +
  "tip in their own fields, and the grand total in `total`. Use null when a field " +
  "is absent. If the image is not a readable receipt, return an empty items array.";

const FOOD_SYSTEM =
  "You are a nutrition estimator. From a photo of food, estimate the total " +
  "calories (kcal) and grams of protein for the ENTIRE portion shown, not per " +
  "100g. Judge portion size from plates, utensils, hands, and packaging for scale. " +
  "Give a concise name for the food or meal. Round calories to the nearest 5 and " +
  "protein to the nearest gram. Set confidence in [0,1] — lower it when the food, " +
  "portion, or hidden ingredients (oils, dressings) are ambiguous. If the image is " +
  'not food or is unreadable, set error to a short message, name to "", and calories ' +
  "and protein to 0. Never refuse; give your best single estimate.";

const FOOD_TEXT_SYSTEM =
  "You are a nutrition estimator. From a short text description of a food or " +
  "meal, estimate the total calories (kcal) and grams of protein for the portion " +
  "described. If the description gives a quantity or serving size, use it; " +
  "otherwise assume one typical single serving. Give a concise name for the food " +
  "or meal. Round calories to the nearest 5 and protein to the nearest gram. Set " +
  "confidence in [0,1] — lower it when the portion or ingredients are vague. If " +
  'the text does not describe a food, set error to a short message, name to "", ' +
  "and calories and protein to 0. Never refuse; give your best single estimate.";

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

  const { imageBase64, mediaType, kind } = body;
  const isFood = kind === "food";
  const isFoodText = kind === "food-text";

  // The text-only food estimate takes a description instead of an image.
  const description =
    typeof body.text === "string" && body.text.trim() ? body.text.trim().slice(0, 500) : null;
  if (isFoodText && !description) return json({ error: "missing text" }, 400);

  if (!isFoodText) {
    if (!imageBase64) return json({ error: "missing imageBase64" }, 400);
    if (!mediaType || !MEDIA_TYPES.includes(mediaType as MediaType)) {
      return json({ error: "unsupported mediaType" }, 400);
    }
  }

  try {
    const anthropic = new Anthropic();

    if (isFoodText) {
      const result = await anthropic.messages.parse({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: FOOD_TEXT_SYSTEM,
        output_config: { format: zodOutputFormat(FoodEstimate) },
        messages: [
          { role: "user", content: `Estimate the nutrition of this food: ${description}` },
        ],
      });
      const parsed = result.parsed_output;
      if (!parsed) return json({ error: "could not estimate" }, 422);
      return json(
        {
          name: parsed.name,
          calories: Math.max(0, Math.round(parsed.calories)),
          protein: Math.max(0, Math.round(parsed.protein)),
          confidence: parsed.confidence,
          error: parsed.error,
        },
        200,
      );
    }

    if (isFood) {
      const hint =
        typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 300) : null;
      const result = await anthropic.messages.parse({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: FOOD_SYSTEM,
        output_config: { format: zodOutputFormat(FoodEstimate) },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType as MediaType, data: imageBase64 },
              },
              {
                type: "text",
                text: hint
                  ? `Estimate the nutrition of this food. Context from the user: ${hint}`
                  : "Estimate the nutrition of this food.",
              },
            ],
          },
        ],
      });
      const parsed = result.parsed_output;
      if (!parsed) return json({ error: "could not read photo" }, 422);
      return json(
        {
          name: parsed.name,
          calories: Math.max(0, Math.round(parsed.calories)),
          protein: Math.max(0, Math.round(parsed.protein)),
          confidence: parsed.confidence,
          error: parsed.error,
        },
        200,
      );
    }

    const result = await anthropic.messages.parse({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      system: RECEIPT_SYSTEM,
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
