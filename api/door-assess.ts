// Door / sliding-door installation assessment endpoint. Takes a photo of an
// installed door and returns a certifier-style inspection: plumb, level, square
// and bow, each with an estimated deviation and a pass/marginal/fail call,
// plus installer notes. Vision-only — nothing is persisted server-side.
//
// Mirrors receipt-scan.ts: one structured vision call gated by the same
// magic-link auth as every other AI endpoint.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { authedUser, json, serviceClient } from "./_fireflies.js";

// Geometric reasoning over a single frame: give it a little headroom.
export const maxDuration = 45;

const MEDIA_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type MediaType = (typeof MEDIA_TYPES)[number];

// One assessed criterion. `deviation`/`unit`/`tolerance` are null when the
// criterion could not be judged from this image (e.g. a rail is out of frame).
const Criterion = z.object({
  // Estimated deviation from true. mm for a linear gap, deg for a lean/tilt.
  deviation: z.number().nullable(),
  unit: z.enum(["mm", "deg"]).nullable(),
  // The trade tolerance the call was made against, in the same unit.
  tolerance: z.number().nullable(),
  status: z.enum(["pass", "marginal", "fail", "unknown"]),
  // One short sentence: what was observed and where (e.g. "left stile leans
  // ~4mm proud at the head"). Plain language, no preamble.
  detail: z.string(),
});

const Assessment = z.object({
  // False when the frame is too blurry, too dark, too oblique, or shows no
  // clear door — the client shows `reason` instead of results.
  assessable: z.boolean(),
  reason: z.string().nullable(),
  // Free text: "hinged door", "sliding door", "bifold", … null if unsure.
  doorType: z.string().nullable(),
  confidence: z.enum(["low", "medium", "high"]),
  plumb: Criterion,
  level: Criterion,
  square: Criterion,
  bow: Criterion,
  // One- or two-sentence overall verdict from the inspector.
  summary: z.string(),
  // Actionable installer notes / remediation, most important first.
  recommendations: z.array(z.string()),
});

type Body = { imageBase64?: string; mediaType?: string };

const SYSTEM = [
  "You are a certified window and door installation inspector with 20 years in the",
  "trade. You are handed ONE photograph of an installed door or sliding door and must",
  "assess the quality of its installation from what is visible in the frame.",
  "",
  "Assess four things and report each as a structured criterion:",
  "- PLUMB: are the vertical members (the left and right stiles / jambs) truly",
  "  vertical? Report the lean as a linear deviation in mm over the visible height,",
  "  or as degrees off vertical. A door leaning so its head is offset from its sill",
  "  is out of plumb.",
  "- LEVEL: are the horizontal members (the head and sill / top and bottom rails)",
  "  truly horizontal? Report the drop across the opening in mm, or degrees off",
  "  horizontal.",
  "- SQUARE: compare the two corner-to-corner diagonals of the frame or panel. Report",
  "  the difference between the diagonals in mm. Equal diagonals = square.",
  "- BOW: is any panel face warped / cupped / bowed rather than flat? Report the",
  "  worst out-of-plane deviation across the panel in mm.",
  "",
  "Use standard residential trade tolerances unless the image suggests otherwise:",
  "plumb and level within ~3mm over the opening, diagonals within ~3-5mm of each",
  "other, panel bow within ~3mm. status = 'pass' inside tolerance, 'marginal' near",
  "the limit, 'fail' clearly outside it, 'unknown' when that member is out of frame",
  "or too obscured to judge (set deviation/unit/tolerance to null for 'unknown').",
  "",
  "These are VISUAL ESTIMATES from a single uncalibrated photo, not laser-measured",
  "figures — be honest about that in your confidence rating and keep numbers",
  "realistic (small, in mm or degrees). Do not invent precision you cannot see.",
  "",
  "If the photo is too blurry, too dark, too steeply angled, or does not clearly",
  "show a door, set assessable=false, put the reason in `reason`, set every",
  "criterion status to 'unknown', and do not guess numbers.",
].join("\n");

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
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: SYSTEM,
      output_config: { format: zodOutputFormat(Assessment) },
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
              text: "Inspect this door's installation. Assess plumb, level, square and bow, and give your installer verdict.",
            },
          ],
        },
      ],
    });

    const parsed = result.parsed_output;
    if (!parsed) return json({ error: "could not assess image" }, 422);
    return json(parsed, 200);
  } catch (e) {
    console.error("door-assess failed", e);
    return json({ error: e instanceof Error ? e.message : "assess failed" }, 500);
  }
}
