"use client";

import { useEffect, useState } from "react";
import type { Compilation, JobStage } from "@/lib/types";
import { Bar } from "./Processing";
import { SettingsFields, type Settings } from "./Studio";
import { api, triggerDownload } from "./api";
import { Button, Icon, formatTime } from "./ui";

export function BatchSetup({
  urls,
  settings,
  onChange,
  onStart,
  onCancel,
  busy,
}: {
  urls: string[];
  settings: Settings;
  onChange: (s: Settings) => void;
  onStart: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <main className="mx-auto grid max-w-5xl gap-6 px-5 pb-16 pt-8 sm:px-8 lg:grid-cols-[1fr_1.1fr]">
      <section className="animate-rise">
        <p className="text-[13px] font-medium uppercase tracking-[0.12em] text-mute">{urls.length} links</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">One {settings.mode === "ranking" ? "ranking video" : "set of clips"} per link</h1>
        <p className="mt-2 text-[15px] text-mute">Each link is fetched, analysed and exported in turn with the same settings.</p>
        <ol className="mt-6 grid gap-2">
          {urls.map((u, i) => (
            <li key={u} className="flex gap-3 rounded-2xl border border-line bg-coal px-4 py-3 text-[14px]">
              <span className="text-mute">{i + 1}</span>
              <span className="min-w-0 break-all text-white/80">{u}</span>
            </li>
          ))}
        </ol>
        <Button variant="ghost" className="mt-4 -ml-3" onClick={onCancel}>
          {Icon.arrowLeft}
          Back
        </Button>
      </section>
      <section className="rounded-3xl border border-line bg-coal p-5 sm:p-7 animate-rise [animation-delay:80ms]">
        <SettingsFields settings={settings} onChange={onChange} />
        <Button size="lg" className="mt-8 w-full" onClick={onStart} disabled={busy}>
          {Icon.spark}
          Process {urls.length} links
        </Button>
      </section>
    </main>
  );
}

interface BatchView {
  id: string;
  options: Settings;
  items: {
    url: string;
    videoId?: string;
    jobId?: string;
    error?: string;
    video: { id: string; fileName: string; title?: string; duration: number } | null;
    importing: { state: string; progress: number; message: string } | null;
    job: { id: string; stage: JobStage; progress: number; message: string; clips: number; compilation: Compilation; compilationTitle: string; topTitle?: string } | null;
  }[];
}

export function BatchProgress({ batchId, onOpen }: { batchId: string; onOpen: (videoId: string, jobId: string) => void }) {
  const [batch, setBatch] = useState<BatchView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const b = await api<BatchView>(`/api/batches/${batchId}`);
        if (alive) setBatch(b);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Couldn't load the batch.");
      }
    };
    void load();
    const t = setInterval(load, 1500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [batchId]);

  if (error) return <p className="mx-auto max-w-3xl px-5 pt-10 text-ember-soft">{error}</p>;
  if (!batch) return <p className="mx-auto max-w-3xl px-5 pt-10 text-mute">Loading…</p>;
  const ranking = batch.options.mode === "ranking";
  const finished = batch.items.filter((i) => i.error || (i.job?.stage === "done" && (!ranking || i.job.compilation.state === "done"))).length;

  return (
    <main className="mx-auto max-w-3xl px-5 pb-20 pt-8 sm:px-8">
      <p className="text-[13px] font-medium uppercase tracking-[0.12em] text-mute">
        Batch · {finished}/{batch.items.length} finished
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{ranking ? "Ranking videos" : "Clips"} for each link</h1>
      <ol className="mt-6 grid gap-3">
        {batch.items.map((it, i) => {
          const j = it.job;
          const comp = j?.compilation;
          const done = j?.stage === "done" && (!ranking || comp?.state === "done");
          const pct = it.error ? 0 : !it.video ? (it.importing?.progress ?? 0) * 0.1 : !j ? 10 : j.stage !== "done" ? 10 + j.progress * (ranking ? 0.8 : 0.9) : ranking ? 90 + (comp?.progress ?? 0) * 10 : 100;
          const status = it.error
            ? it.error
            : !it.videoId
              ? "Waiting…"
              : !it.video
                ? (it.importing?.message ?? "Fetching video…")
                : !j
                  ? "Starting…"
                  : j.stage !== "done"
                    ? j.message
                    : ranking && comp?.state !== "done"
                      ? `Exporting ranking video… ${Math.round((comp?.progress ?? 0) * 100)}%`
                      : `${j.clips} clips ready`;
          return (
            <li key={i} className="rounded-2xl border border-line bg-coal p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{done && j?.compilationTitle ? j.compilationTitle : (it.video?.title ?? it.url)}</p>
                  <p className="mt-0.5 truncate text-[13px] text-mute">
                    {it.video ? `${it.video.title ?? it.video.fileName} · ${formatTime(it.video.duration)}` : it.url}
                  </p>
                </div>
                <span className="shrink-0 text-[13px] text-mute">{i + 1}</span>
              </div>
              {!done && !it.error && <Bar pct={pct} pulse={Boolean(it.videoId)} />}
              <p className={`mt-3 text-[14px] ${it.error ? "text-ember-soft" : "text-white/75"}`}>{status}</p>
              {j?.stage === "done" && it.videoId && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => onOpen(it.videoId!, j.id)}>
                    Open & edit
                  </Button>
                  {ranking && comp?.state === "done" && comp.url && (
                    <Button onClick={() => triggerDownload(comp.url!, `${(j.compilationTitle || "ranking").replace(/[^\w]+/g, "-").toLowerCase()}.mp4`)}>
                      {Icon.download}
                      Download ranking video
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </main>
  );
}
