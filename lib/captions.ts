import type { Word } from "./types";

// Output canvas is 1080x1920; ASS coordinates use the same space.
const HIGHLIGHT = "&H003D6AFF&"; // ember orange (#FF6A3D) in ASS BGR order
const WHITE = "&H00FFFFFF&";

function ts(t: number): string {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
}

function clean(text: string): string {
  return text
    .replace(/[{}\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * Builds an ASS subtitle file with short 1–3 word caption groups and the currently spoken
 * word highlighted — the "karaoke" caption look used on Shorts/Reels/TikTok.
 * `words` are in source-video time; `clipStart` shifts them to clip time.
 */
export function buildAss(words: Word[], clipStart: number, clipEnd: number): string {
  const inClip = words
    .filter((w) => w.end > clipStart && w.start < clipEnd && clean(w.text))
    .map((w) => ({
      text: clean(w.text),
      start: Math.max(0, w.start - clipStart),
      end: Math.min(clipEnd, w.end) - clipStart,
    }));

  // Group into chunks of up to 3 words, breaking at sentence ends and pauses.
  const groups: (typeof inClip)[] = [];
  let cur: typeof inClip = [];
  for (let i = 0; i < inClip.length; i++) {
    const w = inClip[i];
    cur.push(w);
    const next = inClip[i + 1];
    const chars = cur.reduce((n, x) => n + x.text.length + 1, 0);
    const brk = !next || cur.length >= 3 || chars > 16 || /[.!?,;:…]$/.test(w.text) || next.start - w.end > 0.5;
    if (brk) {
      groups.push(cur);
      cur = [];
    }
  }

  const events: string[] = [];
  groups.forEach((g, gi) => {
    const nextGroupStart = groups[gi + 1]?.[0].start ?? clipEnd - clipStart;
    const groupEnd = Math.min(nextGroupStart, g[g.length - 1].end + 0.35);
    g.forEach((w, wi) => {
      const start = wi === 0 ? w.start : Math.max(w.start, g[wi - 1].end);
      const end = wi === g.length - 1 ? groupEnd : g[wi + 1].start;
      if (end - start < 0.02) return;
      const text = g
        .map((x, xi) =>
          xi === wi ? `{\\c${HIGHLIGHT}\\fscx108\\fscy108}${x.text}{\\c${WHITE}\\fscx100\\fscy100}` : x.text,
        )
        .join(" ");
      // Small pop-in on the first word of each group.
      const pop = wi === 0 ? "{\\fad(60,0)}" : "";
      events.push(`Dialogue: 0,${ts(start)},${ts(end)},Caption,,0,0,0,,${pop}${text}`);
    });
  });

  return `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Montserrat ExtraBold,86,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,0,0,0,0,100,100,1,0,1,7,3,2,90,90,560,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join("\n")}
`;
}
