"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClipPatch } from "@/lib/jobs";
import type { Clip, Job, Moment, OverlayStyle, SignalBreakdown, SubtitleStyle, VideoMeta } from "@/lib/types";
import ClipEditor from "./ClipEditor";
import ClipPreview from "./ClipPreview";
import { OverlayPanel, Segmented, SubtitlePanel, Toggle } from "./StylePanel";
import { api, downloadUrl, fmtPrecise, triggerDownload, useSignals, useWords } from "./api";
import { Button, Icon, formatTime } from "./ui";

const STYLE_LABEL: Record<string, string> = {
  funny: "Funny",
  educational: "Educational",
  "high-energy": "High Energy",
  "best-moments": "Best Moments",
};

const CATEGORY_LABEL: Record<string, string> = {
  funny: "Funny",
  unexpected: "Unexpected",
  argument: "Argument",
  reaction: "Reaction",
  punchline: "Punchline",
  important: "Key statement",
  exciting: "Exciting",
  shocking: "Shocking",
  emotional: "Emotional",
  "major-event": "Major event",
  "energy-shift": "Energy shift",
  conversation: "Conversation",
};

type StylePatch = { overlay?: Partial<OverlayStyle>; subtitles?: Partial<SubtitleStyle> };

function applyClipPatch(c: Clip, p: ClipPatch): Clip {
  const next = { ...c };
  if (p.start !== undefined) next.start = Math.max(0, Math.min(p.start, next.end - 1));
  if (p.end !== undefined) next.end = Math.max(p.end, next.start + 1);
  next.duration = Math.round((next.end - next.start) * 100) / 100;
  if (p.title !== undefined) next.title = p.title;
  if (p.shortTitle !== undefined) next.shortTitle = p.shortTitle;
  if (p.caption !== undefined) next.caption = p.caption;
  if (p.hashtags !== undefined) next.hashtags = p.hashtags;
  if (p.overlayText !== undefined) next.overlayText = p.overlayText;
  if (p.cropX !== undefined) next.crop = { ...next.crop, manualX: p.cropX };
  next.upToDate = false;
  return next;
}

export default function Results({
  job,
  video,
  setJob,
  onGenerateAgain,
  onNewVideo,
  onError,
}: {
  job: Job;
  video: VideoMeta | null;
  setJob: (updater: (j: Job) => Job) => void;
  onGenerateAgain: () => void;
  onNewVideo: () => void;
  onError: (msg: string) => void;
}) {
  const words = useWords(video?.id);
  const signals = useSignals(video?.id);
  const [editing, setEditing] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [styleOpen, setStyleOpen] = useState(false);
  const [regen, setRegen] = useState<Set<string>>(new Set());
  const [promoting, setPromoting] = useState<string | null>(null);
  const [wantDl, setWantDl] = useState<Set<string>>(new Set());
  const [wantCompDl, setWantCompDl] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // --- saving: optimistic local edits, debounced PATCHes -------------------------------------
  const clipPending = useRef(new Map<string, ClipPatch>());
  const stylePending = useRef<StylePatch & { compilationTitle?: string }>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef<Promise<void>>(Promise.resolve());
  const holdPollUntil = useRef(0);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const clips = [...clipPending.current.entries()];
    const style = stylePending.current;
    clipPending.current.clear();
    stylePending.current = {};
    const run = async () => {
      let latest: Job | null = null;
      try {
        if (style.overlay || style.subtitles || style.compilationTitle !== undefined) latest = await api(`/api/jobs/${job.id}`, "PATCH", style);
        for (const [id, patch] of clips) latest = await api(`/api/jobs/${job.id}/clips/${encodeURIComponent(id)}`, "PATCH", patch);
      } catch (e) {
        onError(e instanceof Error ? e.message : "Couldn't save your change.");
      }
      // Only take the server copy when nothing newer is waiting to be saved.
      if (latest && !clipPending.current.size && !Object.keys(stylePending.current).length) setJob(() => latest!);
    };
    inflight.current = inflight.current.then(run);
    return inflight.current;
  }, [job.id, onError, setJob]);

  const schedule = () => {
    holdPollUntil.current = Date.now() + 2500;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 450);
  };

  const patchClip = (id: string, patch: ClipPatch) => {
    setJob((j) => ({ ...j, clips: j.clips.map((c) => (c.id === id ? applyClipPatch(c, patch) : c)) }));
    clipPending.current.set(id, { ...clipPending.current.get(id), ...patch });
    schedule();
  };

  const patchStyle = (p: StylePatch & { compilationTitle?: string }) => {
    setJob((j) => ({
      ...j,
      overlay: p.overlay ? { ...j.overlay, ...p.overlay } : j.overlay,
      subtitles: p.subtitles ? { ...j.subtitles, ...p.subtitles } : j.subtitles,
      compilationTitle: p.compilationTitle ?? j.compilationTitle,
      clips: p.overlay || p.subtitles ? j.clips.map((c) => ({ ...c, upToDate: false })) : j.clips,
    }));
    const cur = stylePending.current;
    stylePending.current = {
      overlay: p.overlay ? { ...cur.overlay, ...p.overlay } : cur.overlay,
      subtitles: p.subtitles ? { ...cur.subtitles, ...p.subtitles } : cur.subtitles,
      compilationTitle: p.compilationTitle ?? cur.compilationTitle,
    };
    if (stylePending.current.overlay === undefined) delete stylePending.current.overlay;
    if (stylePending.current.subtitles === undefined) delete stylePending.current.subtitles;
    if (stylePending.current.compilationTitle === undefined) delete stylePending.current.compilationTitle;
    schedule();
  };

  const immediate = async (body: Record<string, unknown>) => {
    holdPollUntil.current = Date.now() + 2500;
    await flush();
    try {
      const next = await api(`/api/jobs/${job.id}`, "PATCH", body);
      setJob(() => next);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Couldn't save your change.");
    }
  };

  const reorder = (ids: string[]) => {
    setJob((j) => {
      const by = new Map(j.clips.map((c) => [c.id, c]));
      const clips = ids.map((id, i) => ({ ...by.get(id)!, index: i + 1, upToDate: false }));
      return { ...j, clips };
    });
    void immediate({ order: ids });
  };

  const moveTo = (id: string, toIndex: number) => {
    const ids = job.clips.map((c) => c.id).filter((x) => x !== id);
    ids.splice(Math.max(0, Math.min(ids.length, toIndex - 1)), 0, id);
    reorder(ids);
  };

  const setRanking = (on: boolean) => {
    setJob((j) => ({ ...j, ranking: on, clips: j.clips.map((c) => ({ ...c, upToDate: false })) }));
    void immediate({ ranking: on });
  };

  // --- polling while something renders ------------------------------------------------------
  const busy =
    job.clips.some((c) => c.render.state === "queued" || c.render.state === "rendering") || job.compilation.state === "rendering" || wantDl.size > 0 || wantCompDl;
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(async () => {
      if (Date.now() < holdPollUntil.current) return;
      try {
        const next = await api(`/api/jobs/${job.id}`);
        if (Date.now() >= holdPollUntil.current && !clipPending.current.size) setJob(() => next);
      } catch {
        /* keep polling */
      }
    }, 1000);
    return () => clearInterval(t);
  }, [busy, job.id, setJob]);

  // Downloads that were waiting for an export to finish.
  useEffect(() => {
    if (!wantDl.size) return;
    const left = new Set(wantDl);
    for (const id of wantDl) {
      const c = job.clips.find((x) => x.id === id);
      if (!c) left.delete(id);
      else if (c.render.state === "error") left.delete(id);
      else if (c.upToDate && c.render.state === "done" && c.render.url) {
        triggerDownload(c.render.url, c.downloadName);
        left.delete(id);
      }
    }
    if (left.size !== wantDl.size) setWantDl(left);
  }, [job, wantDl]);

  useEffect(() => {
    if (wantCompDl && job.compilation.state === "done" && job.compilation.url) {
      triggerDownload(job.compilation.url, `${slugify(job.compilationTitle || "ranking")}.mp4`);
      setWantCompDl(false);
    } else if (wantCompDl && job.compilation.state === "error") setWantCompDl(false);
  }, [job.compilation, job.compilationTitle, wantCompDl]);

  const download = async (c: Clip) => {
    if (c.upToDate && c.render.url && !clipPending.current.has(c.id)) {
      triggerDownload(c.render.url, c.downloadName);
      return;
    }
    await flush();
    setWantDl((s) => new Set(s).add(c.id));
    try {
      const next = await api(`/api/jobs/${job.id}/clips/${encodeURIComponent(c.id)}/render`, "POST");
      setJob(() => next);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Export failed.");
      setWantDl((s) => {
        const n = new Set(s);
        n.delete(c.id);
        return n;
      });
    }
  };

  const exportAll = async () => {
    await flush();
    for (const c of job.clips.filter((x) => !x.upToDate)) {
      try {
          const next = await api(`/api/jobs/${job.id}/clips/${encodeURIComponent(c.id)}/render`, "POST");
        setJob(() => next);
      } catch (e) {
        onError(e instanceof Error ? e.message : "Export failed.");
      }
    }
  };

  const buildCompilation = async (andDownload: boolean) => {
    await flush();
    try {
      const next = await api(`/api/jobs/${job.id}/compilation`, "POST");
      setJob(() => next);
      if (andDownload) setWantCompDl(true);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Couldn't build the ranking video.");
    }
  };

  const regenerate = async (id: string) => {
    await flush();
    setRegen((s) => new Set(s).add(id));
    try {
      const next = await api(`/api/jobs/${job.id}/clips/${encodeURIComponent(id)}/regenerate`, "POST");
      setJob(() => next);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Couldn't write new titles.");
    } finally {
      setRegen((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  };

  const promote = async (m: Moment) => {
    await flush();
    setPromoting(m.id);
    try {
      const next = await api(`/api/jobs/${job.id}/moments/${m.id}`, "POST");
      setJob(() => next);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Couldn't add that moment.");
    } finally {
      setPromoting(null);
    }
  };

  const sortByScore = () => reorder([...job.clips].sort((a, b) => b.score - a.score).map((c) => c.id));

  const editingClip = job.clips.find((c) => c.id === editing);
  const previewClip = job.clips.find((c) => c.id === previewing);
  const stale = job.clips.filter((c) => !c.upToDate).length;
  const total = job.clips.reduce((s, c) => s + c.duration, 0);
  const scoreOrdered = job.clips.every((c, i) => i === 0 || job.clips[i - 1].score >= c.score);

  return (
    <main className="mx-auto max-w-6xl px-5 pb-24 pt-8 sm:px-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between animate-rise">
        <div className="min-w-0">
          <p className="text-[13px] font-medium uppercase tracking-[0.12em] text-mute">
            {STYLE_LABEL[job.options.style]} · {job.clips.length} clips · {formatTime(total)} total
            {video ? ` · from ${video.title || video.fileName}` : ""}
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">
            {job.ranking ? "Your ranking is " : "Your clips are "}
            <span className="font-serif font-normal italic text-ember">ready.</span>
          </h1>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Button variant="outline" onClick={onNewVideo}>
            New video
          </Button>
          <Button variant="outline" onClick={onGenerateAgain}>
            {Icon.refresh}
            Generate again
          </Button>
          <Button variant="outline" onClick={() => setStyleOpen(true)}>
            Style
          </Button>
          {stale > 0 && (
            <Button onClick={() => void exportAll()}>
              {Icon.download}
              Export {stale} updated
            </Button>
          )}
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-line bg-coal px-5 py-4">
        <div className="w-52">
          <Toggle label="Ranking mode" checked={job.ranking} onChange={setRanking} />
        </div>
        <p className="flex-1 text-[14px] text-mute">
          {job.ranking
            ? "The strongest moment is #1. Drag cards (or use the arrows) to change the order; the rank updates on the overlay."
            : "Turn on ranking to number the clips #1…#N by viral score and export a countdown video."}
        </p>
        {job.ranking && !scoreOrdered && (
          <Button variant="ghost" onClick={sortByScore}>
            Re-rank by score
          </Button>
        )}
      </div>

      {job.ranking && (
        <RankingPanel
          job={job}
          stale={stale}
          onTitle={(t) => patchStyle({ compilationTitle: t })}
          onBuild={() => void buildCompilation(false)}
          onDownload={() => {
            if (job.compilation.state === "done" && job.compilation.url && stale === 0) triggerDownload(job.compilation.url, `${slugify(job.compilationTitle || "ranking")}.mp4`);
            else void buildCompilation(true);
          }}
        />
      )}

      <div className="mt-8 grid grid-cols-1 gap-5 min-[560px]:grid-cols-2 lg:grid-cols-3">
        {job.clips.map((c, i) => (
          <ClipCard
            key={c.id}
            clip={c}
            job={job}
            video={video}
            words={words}
            delay={i * 60}
            regenerating={regen.has(c.id)}
            dragging={dragId === c.id}
            dropTarget={overId === c.id && dragId !== c.id}
            onDragStart={() => setDragId(c.id)}
            onDragEnter={() => setOverId(c.id)}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
            onDrop={() => {
              if (dragId && dragId !== c.id) moveTo(dragId, c.index);
              setDragId(null);
              setOverId(null);
            }}
            onMove={(d) => moveTo(c.id, c.index + d)}
            onPreview={() => setPreviewing(c.id)}
            onEdit={() => setEditing(c.id)}
            onRegenerate={() => void regenerate(c.id)}
            onDownload={() => void download(c)}
            wantDownload={wantDl.has(c.id)}
          />
        ))}
      </div>

      <MomentsTable job={job} promoting={promoting} onPromote={(m) => void promote(m)} onOpen={(id) => setEditing(id)} />

      {editingClip && video && (
        <ClipEditor
          job={job}
          clip={editingClip}
          video={video}
          words={words}
          signals={signals}
          busy={{ regenerate: regen.has(editingClip.id) }}
          onPatch={(p) => patchClip(editingClip.id, p)}
          onStyle={patchStyle}
          onMove={(to) => moveTo(editingClip.id, to)}
          onRegenerate={() => void regenerate(editingClip.id)}
          onDownload={() => void download(editingClip)}
          onClose={() => {
            setEditing(null);
            void flush();
          }}
        />
      )}

      {previewClip && video && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4 backdrop-blur-sm animate-fade" onClick={(e) => e.target === e.currentTarget && setPreviewing(null)}>
          <div className="w-[min(420px,100%,calc((100dvh-120px)*9/16))]">
            <div className="overflow-hidden rounded-3xl border border-line">
              <ClipPreview video={video} clip={previewClip} overlay={job.overlay} subtitles={job.subtitles} ranking={job.ranking} words={words} />
            </div>
            <div className="mt-3 flex justify-between gap-2">
              <Button variant="outline" onClick={() => setPreviewing(null)}>
                Close
              </Button>
              <Button
                onClick={() => {
                  setPreviewing(null);
                  setEditing(previewClip.id);
                }}
              >
                Edit
              </Button>
            </div>
          </div>
        </div>
      )}

      {styleOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm animate-fade" onClick={(e) => e.target === e.currentTarget && setStyleOpen(false)}>
          <StyleDrawer job={job} video={video} words={words} onStyle={patchStyle} onClose={() => setStyleOpen(false)} />
        </div>
      )}
    </main>
  );
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "ranking";
}

function scoreTone(s: number) {
  return s >= 85 ? "text-emerald-300 border-emerald-300/40" : s >= 70 ? "text-ember border-ember/40" : "text-white/70 border-white/20";
}

function RankingPanel({ job, stale, onTitle, onBuild, onDownload }: { job: Job; stale: number; onTitle: (t: string) => void; onBuild: () => void; onDownload: () => void }) {
  const comp = job.compilation;
  const rendering = comp.state === "rendering";
  const total = job.clips.reduce((s, c) => s + c.duration, 0);
  const target = job.options.mode === "ranking" ? job.options.rankingSeconds : null;
  return (
    <section className="mt-5 grid gap-6 rounded-3xl border border-ember/30 bg-ember/[0.05] p-5 sm:p-7 md:grid-cols-[1fr_220px]">
      <div className="min-w-0">
        <p className="text-[13px] font-medium uppercase tracking-[0.12em] text-ember">Ranking video · countdown #{job.clips.length} → #1</p>
        <p className="mt-1 text-[14px] text-mute">
          {formatTime(total)} long{target ? ` (target ${formatTime(target)})` : ""} · {job.clips.length} moments · each with its rank and title centred on screen
        </p>
        <div className="mt-4 grid gap-2">
          {job.compilationTitles.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onTitle(t)}
              className={`rounded-xl border px-4 py-3 text-left text-[16px] font-semibold ${job.compilationTitle === t ? "border-ember bg-ember/10" : "border-line hover:border-white/25"}`}
            >
              {t}
            </button>
          ))}
          <input
            value={job.compilationTitle}
            onChange={(e) => onTitle(e.target.value)}
            placeholder="Title for the ranking video"
            aria-label="Ranking video title"
            className="h-11 rounded-xl border border-line bg-ink px-4 text-[15px] outline-none focus:border-ember"
          />
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button onClick={onDownload} disabled={rendering}>
            {Icon.download}
            {rendering ? `Building… ${Math.round(comp.progress * 100)}%` : comp.state === "done" && stale === 0 ? "Download ranking video" : "Export ranking video"}
          </Button>
          {comp.state === "done" && stale > 0 && !rendering && (
            <Button variant="outline" onClick={onBuild}>
              Rebuild with changes
            </Button>
          )}
          {comp.state === "error" && <span className="text-[13px] text-ember-soft">{comp.error}</span>}
        </div>
      </div>
      <div className="mx-auto w-full max-w-[220px]">
        {comp.state === "done" && comp.url ? (
          <video key={comp.url} src={comp.url} controls playsInline preload="metadata" className="aspect-[9/16] w-full rounded-2xl border border-line bg-black object-cover" />
        ) : (
          <div className="grid aspect-[9/16] w-full place-items-center rounded-2xl border border-dashed border-line p-4 text-center text-[13px] text-mute">
            {rendering ? <Bar pct={comp.progress * 100} /> : "The countdown video appears here once exported."}
          </div>
        )}
      </div>
    </section>
  );
}

function Bar({ pct }: { pct: number }) {
  return (
    <div className="w-full">
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full bg-ember transition-[width]" style={{ width: `${Math.max(3, pct)}%` }} />
      </div>
      <p className="mt-2 tabular-nums">{Math.round(pct)}%</p>
    </div>
  );
}

const BREAKDOWN: [keyof SignalBreakdown, string][] = [
  ["ai", "AI read of the content"],
  ["hook", "Hook strength"],
  ["payoff", "Payoff strength"],
  ["reaction", "Laughs / reactions"],
  ["audio", "Audio intensity"],
  ["energy", "Sudden energy change"],
  ["pause", "Silence → speech"],
  ["scene", "Scene changes / motion"],
  ["language", "Keywords & sentiment"],
  ["visual", "Visible reactions"],
];

function WhyPanel({ clip }: { clip: Clip }) {
  const b = clip.breakdown;
  return (
    <details className="group mt-3 rounded-xl border border-line bg-ink/60 open:bg-ink">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3.5 py-2.5 text-[13px] font-semibold text-white/85">
        Why this moment was selected
        <span className="text-mute transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <div className="grid gap-3 px-3.5 pb-3.5 text-[13px]">
        {clip.reason && <p className="leading-relaxed text-white/80">{clip.reason}</p>}
        {b && (
          <div className="grid gap-1.5">
            {BREAKDOWN.map(([k, label]) => {
              const v = b[k];
              if (v === null || v === undefined) return null;
              return (
                <div key={k} className="grid grid-cols-[1fr_90px_28px] items-center gap-2">
                  <span className="text-mute">{label}</span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-white/10">
                    <span className="block h-full rounded-full bg-ember" style={{ width: `${v}%` }} />
                  </span>
                  <span className="text-right tabular-nums text-white/70">{v}</span>
                </div>
              );
            })}
            <p className="mt-1 text-[12px] text-mute">
              Viral score = 62% AI content judgement ({b.ai}) + 38% measured signals ({b.signals}).
            </p>
          </div>
        )}
        {clip.evidence.length > 0 && (
          <ul className="grid gap-1">
            {clip.evidence.map((e, i) => (
              <li key={i} className="flex gap-2 text-white/70">
                <span className="w-10 shrink-0 tabular-nums text-mute">{formatTime(e.t)}</span>
                <span>{e.label}</span>
              </li>
            ))}
          </ul>
        )}
        {clip.structure && (
          <p className="text-[12px] text-mute">
            Hook {fmtPrecise(clip.structure.hook[0])} · {clip.structure.context ? `context ${fmtPrecise(clip.structure.context[0])} · ` : ""}payoff {fmtPrecise(clip.structure.payoff[0])}
          </p>
        )}
      </div>
    </details>
  );
}

function ClipCard({
  clip,
  job,
  video,
  words,
  delay,
  regenerating,
  dragging,
  dropTarget,
  wantDownload,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDrop,
  onMove,
  onPreview,
  onEdit,
  onRegenerate,
  onDownload,
}: {
  clip: Clip;
  job: Job;
  video: VideoMeta | null;
  words: ReturnType<typeof useWords>;
  delay: number;
  regenerating: boolean;
  dragging: boolean;
  dropTarget: boolean;
  wantDownload: boolean;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
  onMove: (d: number) => void;
  onPreview: () => void;
  onEdit: () => void;
  onRegenerate: () => void;
  onDownload: () => void;
}) {
  const rendering = clip.render.state === "queued" || clip.render.state === "rendering";
  const n = job.clips.length;
  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", clip.id);
        onDragStart();
      }}
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragEnd={onDragEnd}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      className={`flex flex-col overflow-hidden rounded-3xl border bg-coal transition-all duration-200 animate-rise ${
        dropTarget ? "border-ember ring-2 ring-ember/40" : "border-line hover:border-white/15"
      } ${dragging ? "opacity-40" : ""}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="cursor-grab select-none text-mute" title="Drag to reorder" aria-hidden>
            ⋮⋮
          </span>
          <span className={`text-[15px] font-bold ${job.ranking ? "text-ember" : ""}`}>{job.ranking ? `#${clip.index}` : `CLIP #${clip.index}`}</span>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" disabled={clip.index === 1} onClick={() => onMove(-1)} aria-label="Move up" className="grid h-7 w-7 place-items-center rounded-full text-white/60 hover:bg-white/5 hover:text-white disabled:opacity-25">
            ←
          </button>
          <button type="button" disabled={clip.index === n} onClick={() => onMove(1)} aria-label="Move down" className="grid h-7 w-7 place-items-center rounded-full text-white/60 hover:bg-white/5 hover:text-white disabled:opacity-25">
            →
          </button>
        </div>
      </div>
      {video ? (
        <ClipPreview video={video} clip={clip} overlay={job.overlay} subtitles={job.subtitles} ranking={job.ranking} words={words} />
      ) : (
        <video src={`${clip.url}#t=0.5`} controls playsInline preload="metadata" className="aspect-[9/16] w-full bg-black object-cover" />
      )}
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold leading-snug tracking-tight">{clip.title}</h3>
          <span title="Viral score (0–100)" className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[13px] font-bold tabular-nums ${scoreTone(clip.score)}`}>
            {clip.score}
          </span>
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
          <div>
            <dt className="text-mute">Duration</dt>
            <dd className="tabular-nums">{fmtPrecise(clip.duration)}</dd>
          </div>
          <div>
            <dt className="text-mute">Start</dt>
            <dd className="tabular-nums">{fmtPrecise(clip.start)}</dd>
          </div>
          <div>
            <dt className="text-mute">End</dt>
            <dd className="tabular-nums">{fmtPrecise(clip.end)}</dd>
          </div>
        </dl>
        {clip.categories.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {clip.categories.map((c) => (
              <span key={c} className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-[12px] text-white/75">
                {CATEGORY_LABEL[c] ?? c}
              </span>
            ))}
          </div>
        )}
        {clip.hashtags.length > 0 && <p className="mt-2 text-[12px] text-sky-300/80">{clip.hashtags.join(" ")}</p>}
        <WhyPanel clip={clip} />
        <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
          <Button variant="outline" className="!h-10 !text-[14px]" onClick={onPreview}>
            Preview
          </Button>
          <Button variant="outline" className="!h-10 !text-[14px]" onClick={onEdit}>
            Edit
          </Button>
          <Button variant="outline" className="!h-10 !text-[14px]" onClick={onRegenerate} disabled={regenerating}>
            {Icon.refresh}
            {regenerating ? "Writing…" : "Regenerate"}
          </Button>
          <Button className="!h-10 !text-[14px]" onClick={onDownload} disabled={rendering}>
            {Icon.download}
            {rendering ? `${Math.round(clip.render.progress * 100)}%` : wantDownload ? "Queued" : "Download"}
          </Button>
        </div>
        {clip.render.state === "error" && <p className="mt-2 text-[12px] text-ember-soft">{clip.render.error}</p>}
        {!clip.upToDate && !rendering && clip.render.url && <p className="mt-2 text-[12px] text-mute">Edited: the download re-exports it with your changes.</p>}
        {clip.upToDate && clip.render.url && (
          <a href={downloadUrl(clip.render.url, clip.downloadName)} className="sr-only">
            Download {clip.title}
          </a>
        )}
      </div>
    </article>
  );
}

function MomentsTable({ job, promoting, onPromote, onOpen }: { job: Job; promoting: string | null; onPromote: (m: Moment) => void; onOpen: (clipId: string) => void }) {
  if (!job.moments.length) return null;
  const moments = [...job.moments].sort((a, b) => b.viralScore - a.viralScore);
  return (
    <section className="mt-14">
      <h2 className="text-2xl font-semibold tracking-tight">Every moment the AI found</h2>
      <p className="mt-1 text-[14px] text-mute">Scored 0–100. The strongest non-overlapping ones became clips; add any other moment with one click.</p>
      <ol className="mt-5 grid gap-2">
        {moments.map((m, i) => {
          const clip = job.clips.find((c) => c.id === m.clipId);
          return (
            <li key={m.id} className="grid grid-cols-[auto_1fr] gap-4 rounded-2xl border border-line bg-coal px-4 py-3.5 sm:grid-cols-[auto_1fr_auto] sm:items-center">
              <div className="w-20">
                <p className="text-[12px] text-mute">Moment {i + 1}</p>
                <p className={`text-2xl font-bold tabular-nums ${scoreTone(m.viralScore).split(" ")[0]}`}>{m.viralScore}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[13px] tabular-nums text-white/60">
                  {fmtPrecise(m.start)}–{fmtPrecise(m.end)} · {m.categories.map((c) => CATEGORY_LABEL[c] ?? c).join(" · ")}
                </p>
                <p className="mt-0.5 text-[15px] leading-snug">{m.reason}</p>
              </div>
              <div className="col-span-2 sm:col-span-1">
                {clip ? (
                  <Button variant="ghost" className="!h-9 !text-[13px]" onClick={() => onOpen(clip.id)}>
                    {job.ranking ? `#${clip.index}` : `Clip ${clip.index}`} · Edit
                  </Button>
                ) : (
                  <Button variant="outline" className="!h-9 !text-[13px]" disabled={promoting !== null} onClick={() => onPromote(m)}>
                    {promoting === m.id ? "Adding…" : "Add as clip"}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function StyleDrawer({ job, video, words, onStyle, onClose }: { job: Job; video: VideoMeta | null; words: ReturnType<typeof useWords>; onStyle: (p: StylePatch) => void; onClose: () => void }) {
  const [tab, setTab] = useState<"overlay" | "subtitles">("overlay");
  const clip = job.clips[0];
  return (
    <div className="mx-auto my-4 w-[min(900px,calc(100%-24px))] rounded-3xl border border-line bg-coal p-5 animate-rise sm:my-8 sm:p-7">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Style for all clips</h2>
        <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full text-white/70 hover:bg-white/5 hover:text-white" aria-label="Close">
          ✕
        </button>
      </div>
      <div className="mt-5 grid gap-6 md:grid-cols-[280px_1fr]">
        {clip && video && (
          <div className="mx-auto w-full max-w-[280px]">
            <div className="overflow-hidden rounded-2xl border border-line">
              <ClipPreview video={video} clip={clip} overlay={job.overlay} subtitles={job.subtitles} ranking={job.ranking} words={words} />
            </div>
          </div>
        )}
        <div className="grid content-start gap-5">
          <Segmented
            value={tab}
            options={[
              ["overlay", "Title overlay"],
              ["subtitles", "Subtitles"],
            ]}
            onChange={setTab}
          />
          {tab === "overlay" ? (
            <OverlayPanel value={job.overlay} onChange={(p) => onStyle({ overlay: p })} />
          ) : (
            <SubtitlePanel value={job.subtitles} onChange={(p) => onStyle({ subtitles: p })} />
          )}
        </div>
      </div>
    </div>
  );
}
