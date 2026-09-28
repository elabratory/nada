"use client";

import type { ClipCount, ClipStyle, Framing, VideoMeta } from "@/lib/types";
import { Button, Icon, formatBytes, formatTime } from "./ui";

export interface Settings {
  count: ClipCount;
  style: ClipStyle;
  framing: Framing;
}

const STYLES: { id: ClipStyle; label: string; desc: string; glyph: string }[] = [
  { id: "best-moments", label: "Best Moments", desc: "The most shareable parts, any kind", glyph: "★" },
  { id: "funny", label: "Funny", desc: "Jokes, banter and punchlines", glyph: "☺" },
  { id: "educational", label: "Educational", desc: "Insights, tips and explanations", glyph: "✎" },
  { id: "high-energy", label: "High Energy", desc: "Passion, hype and strong takes", glyph: "⚡" },
];

export default function Studio({
  video,
  settings,
  onChange,
  onGenerate,
  onReset,
  busy,
}: {
  video: VideoMeta;
  settings: Settings;
  onChange: (s: Settings) => void;
  onGenerate: () => void;
  onReset: () => void;
  busy: boolean;
}) {
  const landscape = video.width / video.height > 0.65;

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-5 pb-16 pt-8 sm:px-8 lg:grid-cols-[1.35fr_1fr] lg:gap-8">
      <section className="animate-rise">
        <div className="overflow-hidden rounded-3xl border border-line bg-black">
          <video
            src={`${video.url}#t=0.1`}
            controls
            playsInline
            preload="metadata"
            className="aspect-video w-full bg-black object-contain"
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 px-1">
          <div className="min-w-0">
            <p className="truncate font-medium">{video.fileName}</p>
            <p className="text-sm text-mute">
              {formatTime(video.duration)} · {video.width}×{video.height} · {formatBytes(video.size)}
            </p>
          </div>
          <Button variant="ghost" onClick={onReset} className="-mr-3">
            Replace video
          </Button>
        </div>
        {!video.hasAudio && (
          <p className="mt-4 rounded-2xl border border-ember/30 bg-ember/10 p-4 text-sm text-ember-soft">
            This video has no audio track, so there&apos;s no speech to find moments in.
          </p>
        )}
      </section>

      <section className="rounded-3xl border border-line bg-coal p-5 sm:p-7 animate-rise [animation-delay:80ms]">
        <h2 className="text-2xl font-semibold tracking-tight">
          Find the <span className="font-serif font-normal italic text-ember">best</span> clips
        </h2>

        <div className="mt-7">
          <Label>Number of clips</Label>
          <div className="grid grid-cols-3 gap-2 rounded-2xl bg-ink p-1.5">
            {([3, 5, 10] as ClipCount[]).map((n) => (
              <button
                key={n}
                onClick={() => onChange({ ...settings, count: n })}
                className={`h-12 rounded-xl text-lg font-semibold transition-all ${
                  settings.count === n ? "bg-white text-ink" : "text-white/60 hover:bg-white/5 hover:text-white"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-7">
          <Label>Clip style</Label>
          <div className="grid grid-cols-2 gap-2">
            {STYLES.map((s) => {
              const on = settings.style === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => onChange({ ...settings, style: s.id })}
                  className={`group rounded-2xl border p-4 text-left transition-all ${
                    on ? "border-ember bg-ember/[0.08]" : "border-line hover:border-white/20 hover:bg-white/[0.03]"
                  }`}
                >
                  <span className={`text-lg ${on ? "text-ember" : "text-white/50"}`}>{s.glyph}</span>
                  <p className="mt-2 font-semibold">{s.label}</p>
                  <p className="mt-0.5 text-[13px] leading-snug text-mute">{s.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {landscape && (
          <div className="mt-7">
            <Label>Vertical framing</Label>
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-ink p-1.5">
              {(
                [
                  ["speaker", "Follow speaker"],
                  ["fit", "Full frame"],
                ] as [Framing, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => onChange({ ...settings, framing: id })}
                  className={`h-11 rounded-xl text-[15px] font-semibold transition-all ${
                    settings.framing === id ? "bg-white text-ink" : "text-white/60 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 px-1 text-[13px] text-mute">
              {settings.framing === "speaker"
                ? "Crops to 9:16 around the person speaking."
                : "Keeps the whole frame on a blurred background."}
            </p>
          </div>
        )}

        <Button size="lg" className="mt-8 w-full" onClick={onGenerate} disabled={busy || !video.hasAudio}>
          {Icon.spark}
          Find Best Clips
        </Button>
      </section>
    </main>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-2.5 text-[13px] font-medium uppercase tracking-[0.12em] text-mute">{children}</p>;
}
