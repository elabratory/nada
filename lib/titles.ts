import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { anthropic, claudeModel, withFallbacks } from "./analyze";
import { cleanText } from "./layout";
import type { MomentCategory } from "./types";

const TextSchema = z.object({
  clips: z.array(
    z.object({
      id: z.string(),
      titles: z.array(z.string()).describe("Exactly 3 different title options"),
      short_title: z.string().describe("2-5 word label for the on-screen card, no emoji"),
      caption: z.string().describe("Optional post caption, 1-2 short sentences"),
      hashtags: z.array(z.string()).describe("3-5 relevant hashtags, each starting with #"),
      emphasis: z.array(z.string()).describe("2-6 exact words or short phrases copied from the clip transcript that deserve highlighting in subtitles"),
    }),
  ),
  compilation_titles: z.array(z.string()).describe("Ranking mode only: 3 titles for the whole countdown video; empty array otherwise"),
});

export interface ClipTextInput {
  id: string;
  transcript: string;
  categories: MomentCategory[];
  reason: string;
  visual: string;
  duration: number;
  rank?: number;
}

export interface ClipText {
  titles: string[];
  shortTitle: string;
  caption: string;
  hashtags: string[];
  emphasis: string[];
}

const VOICE = `You write titles for short-form clips (TikTok, Reels, Shorts) the way a sharp human creator would.

Rules for titles:
- Base every title on what actually happens in THAT clip's transcript. Reference the specific situation, person, object or line — a viewer who watches the clip should immediately see why it's called that.
- Sound like a person, not a marketing bot: casual, punchy, a little cheeky. Sentence case or Title Case is fine; an all-caps word for emphasis is fine.
- Under 60 characters. At most one emoji, and only when it genuinely fits (💀 😭 🤯 😳 🔥). Zero emoji is often better.
- Banned: "Unbelievable Moment", "You Won't Believe", "Must Watch", "Epic", "Insane Moment", "Watch Till The End", colons with subtitles, clickbait questions, anything generic that could fit any clip.
- The 3 options should be genuinely different angles (e.g. quote the line, describe the reaction, tease the payoff) — not rewordings.
Style references for the tone (don't copy them unless they genuinely fit): "Bro Really Said That 💀", "He Was NOT Ready For This", "This Took a Crazy Turn", "Nobody Expected This", "That Reaction Says Everything", "The Most Awkward 30 Seconds".

short_title: 2-5 words for a big on-screen card (e.g. "FUNNIEST MOMENT", "HE REALLY DID THAT"), no emoji.
caption: 1-2 short, natural sentences a creator would post; no hashtags inside it.
hashtags: 3-5, specific to the clip's topic plus at most one broad tag (#shorts, #funny...). Lowercase, no spaces.
emphasis: exact words/phrases from the transcript (the punchline words, the shocking word, the key claim).`;

const tidyTag = (t: string) => {
  const s = t.trim().replace(/^#*/, "").replace(/[^\p{L}\p{N}_]/gu, "").toLowerCase();
  return s ? `#${s}` : "";
};

function normalize(c: z.infer<typeof TextSchema>["clips"][number], transcript: string): ClipText {
  const titles = [...new Set(c.titles.map((t) => t.trim().replace(/^["“]|["”]$/g, "")).filter(Boolean))].slice(0, 3);
  const lower = transcript.toLowerCase();
  return {
    titles,
    shortTitle: cleanText(c.short_title).slice(0, 40) || cleanText(titles[0] ?? ""),
    caption: c.caption.trim(),
    hashtags: [...new Set(c.hashtags.map(tidyTag).filter(Boolean))].slice(0, 5),
    // Only keep emphasis that really appears in the clip.
    emphasis: c.emphasis.map((e) => e.trim()).filter((e) => e && lower.includes(e.toLowerCase())).slice(0, 6),
  };
}

export async function generateClipTexts(
  clips: ClipTextInput[],
  opts: { ranking: boolean; avoid?: Record<string, string[]> },
): Promise<{ texts: Record<string, ClipText>; compilationTitles: string[] }> {
  const blocks = clips.map((c) => {
    const avoid = opts.avoid?.[c.id]?.length ? `\nAlready used titles (write new ones): ${opts.avoid[c.id].join(" | ")}` : "";
    return `<clip id="${c.id}"${c.rank ? ` rank="#${c.rank}"` : ""} duration="${Math.round(c.duration)}s" categories="${c.categories.join(", ")}">
Why it was picked: ${c.reason}${c.visual ? `\nWhat's visible: ${c.visual}` : ""}
Transcript:
${c.transcript}${avoid}
</clip>`;
  });

  const res = await withFallbacks((fb) =>
    anthropic().beta.messages.parse({
      ...fb,
      model: claudeModel(),
      max_tokens: 8000,
      output_config: { effort: "medium", format: betaZodOutputFormat(TextSchema) },
      system: VOICE,
      messages: [
        {
          role: "user",
          content: `${blocks.join("\n\n")}\n\nWrite titles, a short title, a caption, hashtags and emphasis words for each clip (use the same ids).${
            opts.ranking
              ? " These clips form a ranked countdown video (#1 is the best); also give 3 compilation_titles for the whole countdown in the same voice, e.g. \"Top 5 Moments He Instantly Regretted 💀\" — specific to what these clips actually contain."
              : " Return compilation_titles as an empty array."
          }`,
        },
      ],
    }),
  );
  if (res.stop_reason === "refusal") throw new Error("The AI model declined to write titles for these clips.");
  const out = res.parsed_output;
  if (!out) throw new Error("The AI returned unreadable titles. Please try again.");

  const texts: Record<string, ClipText> = {};
  for (const c of out.clips) {
    const src = clips.find((x) => x.id === c.id);
    if (src) texts[c.id] = normalize(c, src.transcript);
  }
  const missing = clips.filter((c) => !texts[c.id]?.titles.length);
  if (missing.length) throw new Error(`The AI didn't return titles for ${missing.length} clip(s). Please try again.`);
  return { texts, compilationTitles: out.compilation_titles.map((t) => t.trim()).filter(Boolean).slice(0, 3) };
}
