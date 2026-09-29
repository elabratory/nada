"use client";

import type { ClipCount, ClipLength, ClipStyle, Framing, JobOptions, OutputMode, VideoMeta } from "@/lib/types";
import { Button, Icon, formatBytes, formatTime } from "./ui";

export type Settings = Omit<JobOptions, "videoId">;

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
  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-5 pb-16 pt-8 sm:px-8 lg:grid-cols-[1.35fr_1fr] lg:gap-8">
      <section className="animate-rise">
        <div className="overflow-hidden rounded-3xl border border-line bg-black">
          <video src={`${video.url}#t=0.1`} controls playsInline preload="metadata" className="aspect-video w-full bg-black object-contain" />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 px-1">
          <div className="min-w-0">
            <p className="truncate font-medium">{video.title || video.fileName}</p>
            <p className="text-sm text-mute">
              {formatTime(video.duration)} · {video.width}×{video.height} · {formatBytes(video.size)}
              {video.sourceUrl ? " · from link" : ""}
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
          Find the <span className="font-serif font-normal italic text-ember">best</span> moments
        </h2>
        <SettingsFields settings={settings} onChange={onChange} landscape={video.width / video.height > 0.65} duration={video.duration} />
        <Button size="lg" className="mt-8 w-full" onClick={onGenerate} disabled={busy || !video.hasAudio}>
          {Icon.spark}
          {settings.mode === "ranking" ? "Make Ranking Video" : "Find Best Clips"}
        </Button>
      </section>
    </main>
  );
}

/** The processing options; shared by the single-video studio and batch setup. */
export function SettingsFields({ settings, onChange, landscape = true, duration }: { settings: Settings; onChange: (s: Settings) => void; landscape?: boolean; duration?: number }) {
  const set = (p: Partial<Settings>) => onChange({ ...settings, ...p });
  const perClip = settings.mode === "ranking" ? Math.round(Math.min(settings.rankingSeconds, (duration ?? Infinity) * 0.9) / settings.count) : null;
  return (
    <>
      <div className="mt-7">
        <Label>Output</Label>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["clips", "Separate clips", "One vertical short per moment"],
              ["ranking", "Ranking video", "Countdown #N → #1 with titles"],
            ] as [OutputMode, string, string][]
          ).map(([id, label, desc]) => (
            <button
              key={id}
              type="button"
              onClick={() => set({ mode: id })}
              className={`rounded-2xl border p-4 text-left transition-all ${settings.mode === id ? "border-ember bg-ember/[0.08]" : "border-line hover:border-white/20 hover:bg-white/[0.03]"}`}
            >
              <p className="font-semibold">{label}</p>
              <p className="mt-0.5 text-[13px] leading-snug text-mute">{desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-7">
        <Label>{settings.mode === "ranking" ? "Moments in the ranking" : "Number of clips"}</Label>
        <Pills value={settings.count} options={[3, 5, 10] as ClipCount[]} render={(n) => String(n)} onChange={(count) => set({ count })} />
      </div>

      {settings.mode === "ranking" ? (
        <div className="mt-7">
          <Label>Ranking video length</Label>
          <Pills value={settings.rankingSeconds} options={[30, 60, 90]} render={(n) => (n === 60 ? "1 min" : `${n} s`)} onChange={(rankingSeconds) => set({ rankingSeconds })} />
          <p className="mt-2 px-1 text-[13px] text-mute">≈ {perClip} s per moment. Each one keeps its hook and payoff; nobody gets cut off mid-sentence.</p>
        </div>
      ) : (
        <div className="mt-7">
          <Label>Clip length</Label>
          <Pills
            value={settings.length}
            options={["auto", "short", "long"] as ClipLength[]}
            render={(l) => ({ auto: "Auto · 20–60 s", short: "Short · 15–30 s", long: "Long · 45–90 s" })[l]}
            onChange={(length) => set({ length })}
          />
        </div>
      )}

      <div className="mt-7">
        <Label>Focus</Label>
        <div className="grid grid-cols-2 gap-2">
          {STYLES.map((s) => {
            const on = settings.style === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => set({ style: s.id })}
                className={`group rounded-2xl border p-4 text-left transition-all ${on ? "border-ember bg-ember/[0.08]" : "border-line hover:border-white/20 hover:bg-white/[0.03]"}`}
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
          <Pills
            value={settings.framing}
            options={["speaker", "fit"] as Framing[]}
            render={(f) => (f === "speaker" ? "Track subject" : "Full frame")}
            onChange={(framing) => set({ framing })}
          />
          <p className="mt-2 px-1 text-[13px] text-mute">
            {settings.framing === "speaker" ? "Crops to 9:16 around the main person or action, shot by shot, keeping faces in frame." : "Keeps the whole frame on a blurred background."}
          </p>
        </div>
      )}
    </>
  );
}

function Pills<T extends string | number>({ value, options, render, onChange }: { value: T; options: T[]; render: (v: T) => string; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1.5 rounded-2xl bg-ink p-1.5">
      {options.map((o) => (
        <button
          key={String(o)}
          type="button"
          onClick={() => onChange(o)}
          className={`h-11 flex-1 rounded-xl px-2 text-[15px] font-semibold transition-all ${value === o ? "bg-white text-ink" : "text-white/60 hover:bg-white/5 hover:text-white"}`}
        >
          {render(o)}
        </button>
      ))}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-2.5 text-[13px] font-medium uppercase tracking-[0.12em] text-mute">{children}</p>;
}
