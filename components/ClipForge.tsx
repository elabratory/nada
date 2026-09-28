"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Job, VideoMeta } from "@/lib/types";
import Landing from "./Landing";
import Processing, { Uploading } from "./Processing";
import Results from "./Results";
import Studio, { type Settings } from "./Studio";
import { Logo } from "./ui";

type View = "landing" | "uploading" | "studio" | "processing" | "results";

const ALLOWED_EXT = ["mp4", "mov", "webm"];

/** Keeps ?v=<video>&job=<job> in the URL so a refresh restores where you were. */
function syncUrl(videoId?: string, jobId?: string) {
  const p = new URLSearchParams();
  if (videoId) p.set("v", videoId);
  if (jobId) p.set("job", jobId);
  const qs = p.toString();
  window.history.replaceState(null, "", qs ? `/?${qs}` : "/");
}

export default function ClipForge() {
  const [view, setView] = useState<View>("landing");
  const [video, setVideo] = useState<VideoMeta | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [upload, setUpload] = useState({ name: "", loaded: 0, total: 0 });
  const [settings, setSettings] = useState<Settings>({ count: 5, style: "best-moments", framing: "speaker" });
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  // Restore state from the URL on first load.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const v = p.get("v");
    const j = p.get("job");
    (async () => {
      if (v) {
        const r = await fetch(`/api/videos/${v}`);
        if (r.ok) {
          setVideo(await r.json());
          setView("studio");
        } else syncUrl();
      }
      if (j) {
        const r = await fetch(`/api/jobs/${j}`);
        if (r.ok) {
          const jb: Job = await r.json();
          setJob(jb);
          setSettings({ count: jb.options.count, style: jb.options.style, framing: jb.options.framing });
          setView(jb.stage === "done" ? "results" : "processing");
        }
      }
    })().catch(() => {});
  }, []);

  // Poll the running job.
  useEffect(() => {
    if (view !== "processing" || !job || job.stage === "done" || job.stage === "error") return;
    const id = job.id;
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
        if (!r.ok) return;
        const next: Job = await r.json();
        setJob(next);
        if (next.stage === "done") setView("results");
      } catch {
        /* transient network error — keep polling */
      }
    }, 1200);
    return () => clearInterval(t);
  }, [view, job]);

  const pickFile = useCallback((file: File) => {
    setError(null);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXT.includes(ext)) {
      setError("Please choose an MP4, MOV or WebM video.");
      return;
    }
    setUpload({ name: file.name, loaded: 0, total: file.size });
    setView("uploading");

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open("POST", "/api/upload");
    xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name));
    xhr.setRequestHeader("content-type", "application/octet-stream");
    xhr.upload.onprogress = (e) => setUpload((u) => ({ ...u, loaded: e.loaded, total: e.total || u.total }));
    xhr.onload = () => {
      let body: (VideoMeta & { error?: string }) | null = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* handled below */
      }
      if (xhr.status >= 200 && xhr.status < 300 && body && !body.error) {
        setVideo(body);
        setJob(null);
        setView("studio");
        syncUrl(body.id);
      } else {
        setError(body?.error || `Upload failed (${xhr.status}).`);
        setView("landing");
      }
    };
    xhr.onerror = () => {
      setError("Upload failed — is the dev server still running?");
      setView("landing");
    };
    xhr.send(file);
  }, []);

  const generate = useCallback(async () => {
    if (!video) return;
    setError(null);
    setStarting(true);
    try {
      const r = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ videoId: video.id, ...settings }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "Could not start processing.");
      setJob(body);
      setView("processing");
      syncUrl(video.id, body.id);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start processing.");
    } finally {
      setStarting(false);
    }
  }, [video, settings]);

  const reset = () => {
    xhrRef.current?.abort();
    setVideo(null);
    setJob(null);
    setError(null);
    setView("landing");
    syncUrl();
  };

  const backToStudio = () => {
    setError(null);
    setView("studio");
    if (video) syncUrl(video.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Logo onClick={reset} />
        {view !== "landing" && (
          <button onClick={reset} className="text-sm text-mute transition-colors hover:text-white">
            Start over
          </button>
        )}
      </header>

      {error && (
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <div className="flex items-start justify-between gap-4 rounded-2xl border border-ember/30 bg-ember/10 px-4 py-3 text-[15px] text-ember-soft animate-rise">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-white/60 hover:text-white" aria-label="Dismiss">
              ✕
            </button>
          </div>
        </div>
      )}

      {view === "landing" && <Landing onPick={pickFile} />}
      {view === "uploading" && <Uploading {...upload} />}
      {view === "studio" && video && (
        <Studio
          video={video}
          settings={settings}
          onChange={setSettings}
          onGenerate={generate}
          onReset={reset}
          busy={starting}
        />
      )}
      {view === "processing" && job && <Processing job={job} onBack={backToStudio} onRetry={generate} />}
      {view === "results" && job && (
        <Results job={job} video={video} onGenerateAgain={backToStudio} onNewVideo={reset} />
      )}
    </div>
  );
}
