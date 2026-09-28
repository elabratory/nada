import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { ClipStyle, Sentence, Transcript } from "./types";

export const MIN_CLIP = 15;
export const MAX_CLIP = 60;

export function claudeModel(): string {
  return process.env.CLAUDE_MODEL?.trim() || "claude-opus-5";
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

const ClipSchema = z.object({
  clips: z.array(
    z.object({
      start_sentence: z.number().int().describe("Index of the first sentence of the clip"),
      end_sentence: z.number().int().describe("Index of the last sentence of the clip (inclusive)"),
      title: z.string().describe("Punchy title for the clip, max 60 characters, no hashtags or emojis"),
      hook: z.string().describe("The opening line/idea that grabs attention, in a few words"),
      reason: z.string().describe("One sentence on why this moment works as a short clip"),
      score: z.number().int().describe("Virality score 0-100"),
    }),
  ),
});

export interface ClipCandidate {
  startSentence: number;
  endSentence: number;
  start: number;
  end: number;
  title: string;
  hook: string;
  reason: string;
  score: number;
}

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(1).padStart(4, "0");
  return `${m}:${s}`;
}

export async function findBestMoments(
  sentences: Sentence[],
  count: number,
  style: ClipStyle,
  videoDuration: number,
): Promise<ClipCandidate[]> {
  const transcript = sentences.map((s) => `[${s.index}] (${fmt(s.start)}–${fmt(s.end)}) ${s.text}`).join("\n");
  const want = count + 3; // ask for a few spares; overlaps/invalid ones get filtered out

  const system = `You are a senior short-form video editor who turns long videos into viral vertical clips for TikTok, Reels and Shorts.

You receive a transcript split into numbered sentences with timestamps. Choose the strongest self-contained moments.

Selection criteria, in order of importance:
1. A strong hook in the first sentence — it must make a scroller stop. Never start on filler ("so", "um", "and yeah", "like I said") or on a sentence that depends on earlier context.
2. A complete thought: the clip must make sense on its own and end on a satisfying beat (punchline, conclusion, reveal, strong statement). Never end mid-idea.
3. Interesting information, emotion, humour, tension or surprise.
4. Length: each clip should be ${MIN_CLIP}–${MAX_CLIP} seconds (ideally 25–45 s), computed from the sentence timestamps.
5. Clips must not overlap each other.

Clips always start at the beginning of a sentence and end at the end of a sentence — you express them as sentence index ranges, so you can never cut mid-sentence.

Style requested by the user — ${STYLE_GUIDE[style]}

Return up to ${want} clips, best first. If the video is short, return fewer rather than weak or overlapping clips.`;

  const res = await withFallbacks((fb) =>
    anthropic().beta.messages.parse({
      ...fb,
      model: claudeModel(),
      max_tokens: 16000,
      output_config: { effort: "medium", format: betaZodOutputFormat(ClipSchema) },
      system,
      messages: [
        {
          role: "user",
          content: `Video length: ${fmt(videoDuration)}. Sentences: ${sentences.length} (indices 0–${sentences.length - 1}).\n\n<transcript>\n${transcript}\n</transcript>\n\nPick the best ${want} clip candidates.`,
        },
      ],
    }),
  );

  if (res.stop_reason === "refusal") {
    throw new Error("The AI model declined to analyse this transcript.");
  }
  const parsed = res.parsed_output;
  if (!parsed) throw new Error("The AI returned an unreadable clip list. Please try again.");

  return refineCandidates(parsed.clips, sentences, count);
}

/** Clamps AI picks to valid sentence ranges, enforces duration limits and removes overlaps. */
export function refineCandidates(
  raw: z.infer<typeof ClipSchema>["clips"],
  sentences: Sentence[],
  count: number,
): ClipCandidate[] {
  const last = sentences.length - 1;
  const out: ClipCandidate[] = [];

  for (const c of [...raw].sort((a, b) => b.score - a.score)) {
    let a = Math.max(0, Math.min(last, Math.min(c.start_sentence, c.end_sentence)));
    let b = Math.max(0, Math.min(last, Math.max(c.start_sentence, c.end_sentence)));
    const dur = () => sentences[b].end - sentences[a].start;

    // Too long: drop trailing sentences (never below one sentence).
    while (dur() > MAX_CLIP + 5 && b > a) b--;
    // Too short: extend with following sentences, then preceding ones.
    while (dur() < MIN_CLIP && b < last && sentences[b + 1].end - sentences[a].start <= MAX_CLIP) b++;
    while (dur() < MIN_CLIP && a > 0 && sentences[b].end - sentences[a - 1].start <= MAX_CLIP) a--;
    if (dur() < 5) continue;

    // Small padding so words aren't clipped, without bleeding into neighbouring sentences.
    const prevEnd = a > 0 ? sentences[a - 1].end : 0;
    const nextStart = b < last ? sentences[b + 1].start : sentences[b].end + 1;
    const start = Math.max(prevEnd, sentences[a].start - 0.2, 0);
    const end = Math.min(nextStart, sentences[b].end + 0.4);

    const overlaps = out.some((o) => {
      const inter = Math.min(o.end, end) - Math.max(o.start, start);
      return inter > 0.25 * Math.min(o.end - o.start, end - start);
    });
    if (overlaps) continue;

    out.push({
      startSentence: a,
      endSentence: b,
      start,
      end,
      title: c.title.trim().slice(0, 80) || `Clip ${out.length + 1}`,
      hook: c.hook.trim(),
      reason: c.reason.trim(),
      score: Math.max(0, Math.min(100, Math.round(c.score))),
    });
    if (out.length >= count) break;
  }
  return out;
}
