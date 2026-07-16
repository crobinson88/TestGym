// Food photo → nutrition endpoint. Takes a photo of a meal or food item and
// returns an estimated name, calories and grams of protein, so the Food Diary
// can prefill an entry instead of the user typing macros by hand.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
// authedUser/serviceClient/json are generic infra helpers that happen to live
// in the fireflies module; reuse rather than duplicate the auth gate.
import { authedUser, json, serviceClient } from "./_fireflies.js";

// One vision call; give it room to reason about portion sizes.
export const maxDuration = 30;

const MEDIA_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type MediaType = (typeof MEDIA_TYPES)[number];

const Estimate = z.object({
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

type Body = { imageBase64?: string; mediaType?: string; note?: string };

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

  const { imageBase64, mediaType, note } = body;
  if (!imageBase64) return json({ error: "missing imageBase64" }, 400);
  if (!mediaType || !MEDIA_TYPES.includes(mediaType as MediaType)) {
    return json({ error: "unsupported mediaType" }, 400);
  }

  const hint = typeof note === "string" && note.trim() ? note.trim().slice(0, 300) : null;

  try {
    const anthropic = new Anthropic();
    const result = await anthropic.messages.parse({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system:
        "You are a nutrition estimator. From a photo of food, estimate the total " +
        "calories (kcal) and grams of protein for the ENTIRE portion shown, not per " +
        "100g. Judge portion size from plates, utensils, hands, and packaging for scale. " +
        "Give a concise name for the food or meal. Round calories to the nearest 5 and " +
        "protein to the nearest gram. Set confidence in [0,1] — lower it when the food, " +
        "portion, or hidden ingredients (oils, dressings) are ambiguous. If the image is " +
        "not food or is unreadable, set error to a short message, name to \"\", and calories " +
        "and protein to 0. Never refuse; give your best single estimate.",
      output_config: { format: zodOutputFormat(Estimate) },
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
  } catch (e) {
    console.error("food-photo failed", e);
    return json({ error: e instanceof Error ? e.message : "estimate failed" }, 500);
  }
}
