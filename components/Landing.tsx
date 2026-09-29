"use client";

import { useState } from "react";
import { Button, Icon } from "./ui";

// Deterministic "waveform" so server and client render the same markup.
const BARS = Array.from({ length: 72 }, (_, i) => {
  const v = Math.abs(Math.sin(i * 0.61) * 0.55 + Math.sin(i * 1.73) * 0.3 + Math.cos(i * 0.23) * 0.25);
  return 0.18 + Math.min(1, v) * 0.82;
});
const HOT: [number, number][] = [
  [9, 18],
  [31, 38],
  [52, 62],
];
const CARDS = [
  { words: ["NOBODY", "TALKS", "ABOUT"], hi: 1, r: "-5deg", tint: "from-[#3a2a22] to-[#141012]" },
  { words: ["THIS", "CHANGED", "EVERYTHING"], hi: 1, r: "2deg", tint: "from-[#26303a] to-[#101214]" },
  { words: ["WAIT", "FOR", "IT"], hi: 2, r: "6deg", tint: "from-[#2f2a3a] to-[#121015]" },
];

/** Pulls every http(s) link out of pasted text (one per line, or separated by spaces). */
export function extractLinks(text: string): string[] {
  return [...new Set(text.match(/https?:\/\/[^\s<>"']+/g) ?? [])];
}

export default function Landing({
  onPick,
  onLinks,
  ytdlp,
}: {
  onPick: (file: File) => void;
  onLinks: (urls: string[]) => void;
  ytdlp: boolean | null;
}) {
  const [drag, setDrag] = useState(false);
  const [text, setText] = useState("");
  const links = extractLinks(text);

  const openPicker = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm";
    input.onchange = () => input.files?.[0] && onPick(input.files[0]);
    input.click();
  };

  return (
    <main
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDrag(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onPick(f);
      }}
      className="relative"
    >
      {drag && (
        <div className="pointer-events-none fixed inset-3 z-50 grid place-items-center rounded-[28px] border-2 border-dashed border-ember/70 bg-ink/80 backdrop-blur-sm animate-fade">
          <p className="font-serif text-4xl italic text-white">Drop it like it&apos;s hot.</p>
        </div>
      )}

      <section className="mx-auto max-w-6xl px-5 pb-10 pt-14 sm:px-8 sm:pt-20">
        <div className="max-w-3xl">
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-line px-3.5 py-1.5 text-[13px] text-white/70 animate-rise">
            <span className="h-1.5 w-1.5 rounded-full bg-ember" />
            Long video in. Vertical clips out.
          </p>
          <h1 className="text-[44px] font-semibold leading-[0.98] tracking-[-0.035em] sm:text-7xl lg:text-[88px] animate-rise [animation-delay:60ms]">
            Turn long videos into{" "}
            <span className="font-serif font-normal italic tracking-[-0.01em] text-ember">viral</span> short clips.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-white/65 sm:text-xl animate-rise [animation-delay:120ms]">
            Paste a link or upload a video. AI finds the best moments, scores them, writes the titles and cuts ranked 9:16 clips.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (links.length) onLinks(links);
            }}
            className="mt-10 max-w-2xl animate-rise [animation-delay:180ms]"
          >
            <div className="flex flex-col gap-2 rounded-[22px] border border-line bg-coal p-2 focus-within:border-ember/60 sm:flex-row sm:items-start">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (links.length) onLinks(links);
                  }
                }}
                rows={Math.min(5, Math.max(1, text.split("\n").length))}
                placeholder="Paste a video link — YouTube, TikTok, a direct .mp4… (several links = one video each)"
                aria-label="Video link"
                spellCheck={false}
                className="min-h-12 flex-1 resize-none bg-transparent px-3 py-3 text-[16px] leading-6 outline-none placeholder:text-white/35"
              />
              <Button size="md" type="submit" disabled={!links.length} className="!h-12 shrink-0">
                {Icon.spark}
                {links.length > 1 ? `Process ${links.length} links` : "Fetch video"}
              </Button>
            </div>
            {ytdlp === false && (
              <p className="mt-2 px-2 text-[13px] text-mute">
                Direct video links work now. For YouTube/TikTok/Instagram links, run <code className="text-white/75">npm run setup:ytdlp</code> once and restart.
              </p>
            )}
          </form>
          <div className="mt-5 flex flex-col items-start gap-4 sm:flex-row sm:items-center animate-rise [animation-delay:220ms]">
            <Button size="lg" variant="outline" onClick={openPicker}>
              {Icon.upload}
              Upload Video
            </Button>
            <p className="text-sm text-mute">MP4, MOV or WebM · or drop a file anywhere</p>
          </div>
        </div>

        {/* Product illustration: a long timeline with the best moments forged into vertical clips. */}
        <div className="relative mt-16 animate-rise [animation-delay:260ms] sm:mt-20">
          <div className="flex items-end justify-center gap-3 sm:gap-6">
            {CARDS.map((c, i) => (
              <div
                key={i}
                style={{ ["--r" as string]: c.r, animationDelay: `${i * 0.8}s` }}
                className={`relative aspect-[9/16] w-[27%] max-w-[190px] overflow-hidden rounded-[18px] border border-white/10 bg-gradient-to-b ${c.tint} shadow-2xl shadow-black/60 animate-float ${i === 1 ? "mb-6" : ""}`}
              >
                <div className="absolute inset-x-0 top-[22%] mx-auto h-[34%] w-[46%] rounded-full bg-white/[0.07] blur-[1px]" />
                <div className="absolute inset-x-0 top-[48%] mx-auto h-[40%] w-[78%] rounded-t-[40%] bg-white/[0.05]" />
                <div className="absolute inset-x-2 bottom-[22%] text-center text-[clamp(8px,1.5vw,13px)] font-extrabold leading-tight tracking-tight">
                  {c.words.map((w, wi) => (
                    <span key={wi} className={wi === c.hi ? "text-ember" : "text-white"}>
                      {w}{" "}
                    </span>
                  ))}
                </div>
                <div className="absolute left-2.5 top-2.5 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white/80 backdrop-blur">
                  0:{[34, 41, 27][i]}
                </div>
              </div>
            ))}
          </div>

          <div className="relative mt-8 rounded-2xl border border-line bg-coal/80 p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between text-[12px] text-mute">
              <span>podcast_episode_42.mp4</span>
              <span>1:12:08</span>
            </div>
            <div className="relative flex h-16 items-center justify-between gap-[2px]">
              {BARS.map((h, i) => {
                const hot = HOT.some(([a, b]) => i >= a && i <= b);
                return (
                  <span
                    key={i}
                    className={`w-full max-w-[5px] rounded-full ${hot ? "bg-ember animate-bar" : "bg-white/15"}`}
                    style={{ height: `${(h * 100).toFixed(1)}%`, animationDelay: `${(i % 7) * 0.12}s` }}
                  />
                );
              })}
              <span className="absolute -bottom-1 -top-1 w-px bg-white animate-scan shadow-[0_0_12px_2px_rgba(255,255,255,0.5)]" />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-3 px-5 pb-20 sm:grid-cols-3 sm:px-8">
        {[
          ["01", "Paste or upload", "A link to a podcast, stream, interview or vlog — or the file itself."],
          ["02", "AI finds & scores the moments", "Speech, reactions, audio energy, scene changes and visuals combined into a 0–100 viral score."],
          ["03", "Ranked, titled 9:16 clips", "Hook → context → payoff cuts, centred titles, subtitles, and a #N → #1 countdown."],
        ].map(([n, t, d]) => (
          <div
            key={n}
            className="rounded-2xl border border-line bg-white/[0.015] p-6 transition-colors hover:border-white/15"
          >
            <p className="font-serif text-2xl italic text-ember">{n}</p>
            <p className="mt-4 text-lg font-semibold">{t}</p>
            <p className="mt-1.5 text-[15px] leading-relaxed text-mute">{d}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
