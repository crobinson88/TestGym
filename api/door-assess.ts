// Door / sliding-door installation assessment endpoint. Takes a photo of an
// installed door and returns a certifier-style inspection: plumb, level, square
// and bow, each with an estimated deviation and a pass/marginal/fail call,
// plus installer notes. Vision-only — nothing is persisted server-side.
//
// Uses Google Gemini vision. Auth reuses the app's magic-link gate (shared with
// the other AI endpoints). The Gemini key is read from GEMINI_API_KEY (or
// GOOGLE_API_KEY) — never hard-code it.
import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";
import { authedUser, json, serviceClient } from "./_fireflies.js";

// Geometric reasoning over a single frame: give it a little headroom.
export const maxDuration = 45;

// Best general-purpose Gemini vision model. Swap to "gemini-2.5-pro" for the
// strongest spatial reasoning at the cost of latency.
const MODEL = "gemini-2.5-flash";

const MEDIA_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type MediaType = (typeof MEDIA_TYPES)[number];

// Post-parse validation of Gemini's JSON, so a malformed reply returns a clean
// 422 instead of leaking through to the client.
const Criterion = z.object({
  deviation: z.number().nullable(),
  unit: z.enum(["mm", "deg"]).nullable(),
  tolerance: z.number().nullable(),
  status: z.enum(["pass", "marginal", "fail", "unknown"]),
  detail: z.string(),
});

const Assessment = z.object({
  assessable: z.boolean(),
  reason: z.string().nullable(),
  doorType: z.string().nullable(),
  confidence: z.enum(["low", "medium", "high"]),
  plumb: Criterion,
  level: Criterion,
  square: Criterion,
  bow: Criterion,
  summary: z.string(),
  recommendations: z.array(z.string()),
});

// Gemini structured-output schema (a subset of OpenAPI). Mirrors the zod shape
// above; `propertyOrdering` keeps the model's fields stable.
const criterionSchema = {
  type: Type.OBJECT,
  properties: {
    deviation: { type: Type.NUMBER, nullable: true },
    unit: { type: Type.STRING, enum: ["mm", "deg"], nullable: true },
    tolerance: { type: Type.NUMBER, nullable: true },
    status: { type: Type.STRING, enum: ["pass", "marginal", "fail", "unknown"] },
    detail: { type: Type.STRING },
  },
  required: ["deviation", "unit", "tolerance", "status", "detail"],
  propertyOrdering: ["deviation", "unit", "tolerance", "status", "detail"],
};

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    assessable: { type: Type.BOOLEAN },
    reason: { type: Type.STRING, nullable: true },
    doorType: { type: Type.STRING, nullable: true },
    confidence: { type: Type.STRING, enum: ["low", "medium", "high"] },
    plumb: criterionSchema,
    level: criterionSchema,
    square: criterionSchema,
    bow: criterionSchema,
    summary: { type: Type.STRING },
    recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    "assessable",
    "reason",
    "doorType",
    "confidence",
    "plumb",
    "level",
    "square",
    "bow",
    "summary",
    "recommendations",
  ],
  propertyOrdering: [
    "assessable",
    "reason",
    "doorType",
    "confidence",
    "plumb",
    "level",
    "square",
    "bow",
    "summary",
    "recommendations",
  ],
};

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

  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) return json({ error: "missing GEMINI_API_KEY" }, 500);

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
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: mediaType, data: imageBase64 } },
            {
              text: "Inspect this door's installation. Assess plumb, level, square and bow, and give your installer verdict.",
            },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM,
        maxOutputTokens: 2000,
        responseMimeType: "application/json",
        responseSchema,
      },
    });

    const raw = response.text;
    if (!raw) return json({ error: "could not assess image" }, 422);

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return json({ error: "could not assess image" }, 422);
    }

    const validated = Assessment.safeParse(parsed);
    if (!validated.success) return json({ error: "could not assess image" }, 422);
    return json(validated.data, 200);
  } catch (e) {
    console.error("door-assess failed", e);
    return json({ error: e instanceof Error ? e.message : "assess failed" }, 500);
  }
}
