"use client";

import type { Clip, Job, VideoMeta } from "@/lib/types";
import { Button, Icon, formatTime } from "./ui";

const STYLE_LABEL: Record<string, string> = {
  funny: "Funny",
  educational: "Educational",
  "high-energy": "High Energy",
  "best-moments": "Best Moments",
};

export default function Results({
  job,
  video,
  onGenerateAgain,
  onNewVideo,
}: {
  job: Job;
  video: VideoMeta | null;
  onGenerateAgain: () => void;
  onNewVideo: () => void;
}) {
  return (
    <main className="mx-auto max-w-6xl px-5 pb-20 pt-8 sm:px-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between animate-rise">
        <div>
          <p className="text-[13px] font-medium uppercase tracking-[0.12em] text-mute">
            {STYLE_LABEL[job.options.style]} · {job.clips.length} clips
            {video ? ` · from ${video.fileName}` : ""}
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">
            Your clips are <span className="font-serif font-normal italic text-ember">ready.</span>
          </h1>
        </div>
        <div className="flex gap-2.5">
          <Button variant="outline" onClick={onNewVideo}>
            New video
          </Button>
          <Button onClick={onGenerateAgain}>
            {Icon.refresh}
            Generate Again
          </Button>
        </div>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 lg:grid-cols-3">
        {job.clips.map((c, i) => (
          <ClipCard key={c.id} clip={c} delay={i * 70} />
        ))}
      </div>
    </main>
  );
}

function ClipCard({ clip, delay }: { clip: Clip; delay: number }) {
  const href = `${clip.url}?download=1&name=${encodeURIComponent(clip.downloadName)}`;
  return (
    <article
      className="group flex flex-col overflow-hidden rounded-3xl border border-line bg-coal transition-all duration-300 hover:-translate-y-1 hover:border-white/15 animate-rise"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="relative bg-black">
        <video
          src={`${clip.url}#t=0.5`}
          controls
          playsInline
          preload="metadata"
          className="aspect-[9/16] w-full bg-black object-cover"
        />
        <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[12px] font-semibold backdrop-blur">
          #{clip.index}
        </span>
        <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[12px] font-semibold tabular-nums backdrop-blur">
          {formatTime(clip.duration)}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold leading-snug tracking-tight">{clip.title}</h3>
          <span
            title="AI virality score"
            className="shrink-0 rounded-full border border-ember/40 px-2 py-0.5 text-[12px] font-semibold tabular-nums text-ember"
          >
            {clip.score}
          </span>
        </div>
        {clip.reason && <p className="mt-2 text-[14px] leading-relaxed text-mute">{clip.reason}</p>}
        <p className="mt-3 text-[12px] text-white/40">
          {formatTime(clip.start)} – {formatTime(clip.end)} in original · {formatTime(clip.duration)} long
        </p>
        <a
          href={href}
          download={clip.downloadName}
          className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white text-[15px] font-semibold text-ink transition-all hover:bg-white/85 active:scale-[0.98]"
        >
          {Icon.download}
          Download
        </a>
      </div>
    </article>
  );
}
