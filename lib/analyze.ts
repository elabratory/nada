import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { LengthTarget } from "./defaults";
import { hotspots, sentenceTags, type Context } from "./features";
import type { RangePick } from "./boundaries";
import { MOMENT_CATEGORIES, type ClipStyle, type JobOptions, type MomentCategory, type Sentence, type Transcript } from "./types";

export function claudeModel(): string {
  return process.env.CLAUDE_MODEL?.trim() || "claude-opus-5-5";
}

export function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the server.");
  }
  return new Anthropic();
}

/**
 * Runs a Claude request with server-side refusal fallbacks enabled; if the API rejects
 * the fallback parameters (e.g. an older account/region), retries once without them.
 */
export async function withFallbacks<T>(call: (fb: typeof FALLBACKS | object) => Promise<T>): Promise<T> {
  try {
    return await call(FALLBACKS);
  } catch (err) {
    if (err instanceof Anthropic.BadRequestError && /fallback/i.test(err.message)) return call({});
    throw err;
  }
}
const FALLBACKS = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };

/** Groups words into sentences using the punctuation Whisper produces (plus pause/length fallbacks). */
export function buildSentences(t: Transcript): Sentence[] {
  const sentences: Sentence[] = [];
  let first = 0;
  const flush = (last: number) => {
    if (last < first) return;
    const ws = t.words.slice(first, last + 1);
    sentences.push({
      index: sentences.length,
      start: ws[0].start,
      end: ws[ws.length - 1].end,
      text: ws.map((w) => w.text).join(" "),
      firstWord: first,
      lastWord: last,
    });
    first = last + 1;
  };
  for (let i = 0; i < t.words.length; i++) {
    const w = t.words[i];
    const next = t.words[i + 1];
    const endsSentence = /[.!?…]["')\]]*$/.test(w.text);
    const longPause = next ? next.start - w.end > 1.5 : false;
    const tooLong = i - first >= 45;
    if (!next || endsSentence || longPause || tooLong) flush(i);
  }
  return sentences;
}


const STYLE_GUIDE: Record<ClipStyle, string> = {
  funny:
    "FUNNY: prioritise jokes, witty remarks, absurd stories, playful banter, and moments with a clear comedic setup and punchline. The punchline must be inside the clip.",
  educational:
    "EDUCATIONAL: prioritise clear explanations, surprising facts, practical tips, frameworks and 'aha' insights that make sense without the rest of the video.",
  "high-energy":
    "HIGH ENERGY: prioritise passionate, intense, fast-paced, emphatic or emotional moments — strong opinions, exciting reveals, rallying statements.",
  "best-moments":
    "BEST MOMENTS: pick the overall most compelling, shareable moments of any kind — the parts a viewer would most likely send to a friend.",
};

const CATEGORY_HELP: Record<MomentCategory, string> = {
  funny: "genuinely funny moment",
  unexpected: "something nobody saw coming",
  argument: "disagreement, heated exchange or confrontation",
  reaction: "a strong, visible or audible reaction",
  punchline: "a setup that lands a punchline",
  important: "an important or quotable statement",
  exciting: "high excitement / hype",
  shocking: "shocking reveal or statement",
  emotional: "emotional or vulnerable moment",
  "major-event": "a major event happens (win, fail, reveal, crash...)",
  "energy-shift": "the energy suddenly changes",
  conversation: "an interesting back-and-forth conversation",
};

const Score10 = z.number().int().describe("0-10");

const MomentSchema = z.object({
  moments: z.array(
    z.object({
      start_sentence: z.number().int().describe("First sentence of the clip (where it should open)"),
      hook_sentence: z.number().int().describe("The sentence that grabs attention; usually the first one"),
      payoff_sentence: z.number().int().describe("The sentence where the moment pays off (punchline, reveal, reaction, conclusion)"),
      end_sentence: z.number().int().describe("Last sentence of the clip (inclusive)"),
      categories: z.array(z.enum(MOMENT_CATEGORIES)).describe("1-3 categories that describe the moment"),
      hook_strength: Score10,
      payoff_strength: Score10,
      emotion: Score10,
      humor: Score10,
      surprise: Score10,
      standalone: Score10.describe("How well it makes sense without the rest of the video"),
      ai_score: z.number().int().describe("0-100. Your overall prediction of how well it performs as a Short/TikTok/Reel"),
      reason: z
        .string()
        .describe("One specific sentence on why this moment works, naming what actually happens (e.g. 'Huge reaction to an unexpected punchline about the car')"),
      needs_more_time: z.boolean().describe("True only if the moment genuinely needs to run longer than the target length to make sense"),
    }),
  ),
});

export type AiMoment = z.infer<typeof MomentSchema>["moments"][number] & RangePick;

/**
 * Reads the whole transcript, annotated with the measured audio/visual signals, and proposes
 * candidate moments with hook/payoff structure and per-dimension scores.
 */
export async function findMoments(
  ctx: Context,
  options: Pick<JobOptions, "count" | "style" | "mode">,
  target: LengthTarget,
  videoDuration: number,
): Promise<AiMoment[]> {
  const sentences = ctx.sentences;
  const lines = sentences.map((s) => {
    const tags = sentenceTags(ctx, s);
    return `[${s.index}] (${fmt(s.start)}–${fmt(s.end)})${tags ? ` {${tags}}` : ""} ${s.text}`;
  });
  const spots = hotspots(ctx);
  const want = Math.min(24, Math.max(options.count * 2, options.count + 4));

  const system = `You are a senior short-form video editor. You find the moments in long videos that will perform best as vertical Shorts, TikToks and Reels, and you are honest about how strong each one is.

You receive the transcript split into numbered sentences with timestamps. Some sentences carry tags measured from the actual audio and picture:
- LOUD+NdB: the audio peaks N dB above this video's typical level
- NONSPEECH-BURST: a loud stretch with no words during/right after the sentence (often laughter, applause, a scream or a crash)
- PAUSE-BEFORE Ns: silence before the sentence (a dramatic pause, or a topic change)
- CUT: a scene change happens during the sentence
- FAST: spoken faster than usual; REACT: reaction words; ARGUE: argument cues; INTENSE: strong sentiment words
The tags are evidence, not verdicts: loud is not automatically good. Judge what is actually said and what happens. Combine the meaning of the words with the signals.

Look for: funny moments, unexpected moments, arguments, reactions, punchlines, important statements, exciting moments, shocking moments, emotional moments, major events, sudden changes in energy, strong reactions and interesting conversations. Category meanings: ${Object.entries(CATEGORY_HELP)
    .map(([k, v]) => `${k} = ${v}`)
    .join("; ")}.

Every clip needs a structure a stranger can follow: HOOK (opens strong — never on filler like "so", "um", "and yeah" or on a line that depends on earlier context) → CONTEXT (just enough to understand what's happening) → PAYOFF (the punchline, reveal, reaction or conclusion — it must be inside the clip). Start slightly before the key moment and end shortly after the payoff; never end mid-thought.

Length: aim for ${Math.round(target.min)}–${Math.round(target.max)} seconds per clip (ideal ≈ ${Math.round(target.ideal)} s), computed from the sentence timestamps. Only set needs_more_time when the moment genuinely can't work within that.${
    options.mode === "ranking"
      ? ` These clips will be cut into a ranked countdown video, so each one must be tight and land its payoff fast.`
      : ""
  }
Clips must not overlap. Clips are sentence-index ranges, so you can never cut mid-sentence.

Focus requested by the user — ${STYLE_GUIDE[options.style]}

Scoring must be discriminating: reserve 85+ for moments you'd bet on, use the full range, and don't give everything similar scores. Return up to ${want} candidates, best first. For a short video return fewer rather than padding with weak or overlapping ones.`;

  const hot = spots.length
    ? `\n\nStrongest measured signal peaks (check what happens around them):\n${spots.map((s) => `- ${fmt(s.t)}: ${s.label}`).join("\n")}`
    : "";

  const res = await withFallbacks((fb) =>
    anthropic().beta.messages.parse({
      ...fb,
      model: claudeModel(),
      max_tokens: 20000,
      output_config: { effort: "medium", format: betaZodOutputFormat(MomentSchema) },
      system,
      messages: [
        {
          role: "user",
          content: `Video length: ${fmt(videoDuration)}. Sentences: ${sentences.length} (indices 0–${sentences.length - 1}).${hot}\n\n<transcript>\n${lines.join("\n")}\n</transcript>\n\nFind the best ${want} candidate moments.`,
        },
      ],
    }),
  );

  if (res.stop_reason === "refusal") throw new Error("The AI model declined to analyse this transcript.");
  const parsed = res.parsed_output;
  if (!parsed) throw new Error("The AI returned an unreadable list of moments. Please try again.");
  return parsed.moments;
}

export function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(1).padStart(4, "0");
  return `${m}:${s}`;
}
