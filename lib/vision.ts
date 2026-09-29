import { promises as fs } from "node:fs";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { anthropic, claudeModel, withFallbacks } from "./analyze";
import { runFfmpeg } from "./ffmpeg";

const FrameSchema = z.object({
  frames: z.array(
    z.object({
      frame: z.number().int().describe("Frame number as labelled"),
      person_visible: z.boolean(),
      subject_left: z.number().describe("Left edge of the main subject (face/upper body of the most important person, or the main action) as a fraction of frame width, 0-1"),
      subject_right: z.number().describe("Right edge of the main subject as a fraction of frame width, 0-1"),
      reaction: z.number().int().describe("0-10: how strong the visible reaction/emotion/action is in this frame (0 = neutral talking head, 10 = huge laugh, shock, or dramatic action)"),
    }),
  ),
  summary: z.string().describe("One short sentence on what visibly happens across the frames (reactions, expressions, action)"),
});

export interface FrameInfo {
  t: number;
  person: boolean;
  left: number;
  right: number;
  center: number;
  reaction: number; // 0..10
}

export interface VisionResult {
  frames: FrameInfo[];
  reactionScore: number; // 0..100
  reactionChange: number; // 0..100, biggest jump in reaction between frames
  summary: string;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Samples frames at the given source times and asks Claude's vision model where the main
 * subject is (for the 9:16 crop) and how strong the visible reactions are (for scoring).
 */
export async function analyzeFrames(videoPath: string, workDir: string, times: number[], tag: string): Promise<VisionResult | null> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  const kept: number[] = [];
  for (let i = 0; i < times.length; i++) {
    const file = path.join(workDir, `${tag}_f${i}.jpg`);
    await runFfmpeg(["-y", "-ss", times[i].toFixed(2), "-i", videoPath, "-frames:v", "1", "-vf", "scale=512:-2", "-q:v", "5", file]).catch(() => {});
    const data = await fs.readFile(file).catch(() => null);
    await fs.rm(file, { force: true });
    if (!data) continue;
    kept.push(times[i]);
    content.push({ type: "text", text: `Frame ${kept.length - 1} (t=${times[i].toFixed(1)}s):` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: data.toString("base64") } });
  }
  if (!kept.length) return null;
  content.push({
    type: "text",
    text: "These frames come from one moment of a video that will be cropped to a vertical 9:16 frame. For each frame, locate the main subject (the person talking or reacting, or the main action) so the crop never cuts off their face, and rate how strong the visible reaction or action is.",
  });

  const res = await withFallbacks((fb) =>
    anthropic().beta.messages.parse({
      ...fb,
      model: claudeModel(),
      max_tokens: 4000,
      output_config: { effort: "low", format: betaZodOutputFormat(FrameSchema) },
      messages: [{ role: "user", content }],
    }),
  );
  const out = res.parsed_output;
  if (!out) return null;

  const frames: FrameInfo[] = [];
  for (const f of out.frames) {
    const t = kept[f.frame];
    if (t === undefined) continue;
    const left = clamp01(Math.min(f.subject_left, f.subject_right));
    const right = clamp01(Math.max(f.subject_left, f.subject_right));
    frames.push({ t, person: f.person_visible, left, right, center: (left + right) / 2, reaction: Math.min(10, Math.max(0, f.reaction)) });
  }
  frames.sort((a, b) => a.t - b.t);
  const reactions = frames.map((f) => f.reaction);
  let change = 0;
  for (let i = 1; i < reactions.length; i++) change = Math.max(change, reactions[i] - reactions[i - 1]);
  return {
    frames,
    reactionScore: reactions.length ? Math.round((Math.max(...reactions) * 0.7 + (reactions.reduce((a, b) => a + b, 0) / reactions.length) * 0.3) * 10) : 0,
    reactionChange: Math.round(change * 10),
    summary: out.summary.trim(),
  };
}

/** Picks sample times for a window: one per shot (between scene cuts), plus the payoff. */
export function sampleTimes(start: number, end: number, cuts: number[], payoffAt: number, max = 6): number[] {
  const bounds = [start, ...cuts.filter((c) => c > start + 0.4 && c < end - 0.4), end];
  const shots: [number, number][] = [];
  for (let i = 0; i < bounds.length - 1; i++) shots.push([bounds[i], bounds[i + 1]]);
  shots.sort((a, b) => b[1] - b[0] - (a[1] - a[0]));
  const times = shots.slice(0, max - 1).map(([a, b]) => (a + b) / 2);
  if (!times.some((t) => Math.abs(t - payoffAt) < 1)) times.push(Math.min(end - 0.1, payoffAt + 0.3));
  if (times.length < 3) {
    for (const f of [0.15, 0.5, 0.85]) {
      const t = start + (end - start) * f;
      if (!times.some((x) => Math.abs(x - t) < 1)) times.push(t);
    }
  }
  return times.slice(0, max).sort((a, b) => a - b);
}
