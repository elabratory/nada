import { z } from "zod";
import { CLIP_LENGTHS, CLIP_STYLES, FRAMINGS, OUTPUT_MODES } from "./types";

/** True when the request was made to the app on this machine (localhost). */
export function isLocal(req: Request): boolean {
  const host = (req.headers.get("host") ?? "").replace(/:\d+$/, "");
  return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(host);
}

export function jsonError(err: unknown, status = 400): Response {
  const message = err instanceof Error ? err.message : "Something went wrong.";
  return Response.json({ error: message }, { status: /not found/i.test(message) ? 404 : status });
}

export const OptionsSchema = z.object({
  count: z.union([z.literal(3), z.literal(5), z.literal(10)]),
  style: z.enum(CLIP_STYLES),
  framing: z.enum(FRAMINGS).default("speaker"),
  mode: z.enum(OUTPUT_MODES).default("clips"),
  length: z.enum(CLIP_LENGTHS).default("auto"),
  rankingSeconds: z.number().int().min(15).max(300).default(60),
});

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const WeightSchema = z.union([z.literal(500), z.literal(700), z.literal(800), z.literal(900)]);

export const OverlaySchema = z.object({
  enabled: z.boolean(),
  showRank: z.boolean(),
  showTitle: z.boolean(),
  fontSize: z.number().min(24).max(160),
  fontWeight: WeightSchema,
  uppercase: z.boolean(),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  color: Hex,
  rankColor: Hex,
  background: z.enum(["none", "box", "band"]),
  bgColor: Hex,
  bgOpacity: z.number().min(0).max(100),
  animation: z.enum(["none", "fade", "pop", "slide"]),
  effect: z.enum(["none", "shadow", "outline", "both"]),
  timing: z.enum(["full", "intro", "dock"]),
});

export const SubtitleSchema = z.object({
  enabled: z.boolean(),
  preset: z.enum(["bold", "clean", "boxed", "karaoke"]),
  position: z.enum(["bottom", "lower", "center", "top"]),
  fontSize: z.number().min(24).max(140),
  fontWeight: WeightSchema,
  uppercase: z.boolean(),
  color: Hex,
  activeColor: Hex,
  emphasisColor: Hex,
  highlightActive: z.boolean(),
  highlightEmphasis: z.boolean(),
  maxWords: z.number().int().min(1).max(8),
  background: z.enum(["none", "box"]),
  effect: z.enum(["none", "shadow", "outline", "both"]),
});
