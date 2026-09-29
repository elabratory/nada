"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_OPTIONS, normalizeJob } from "@/lib/defaults";
import type { ImportStatus, Job, VideoMeta } from "@/lib/types";
import { BatchProgress, BatchSetup } from "./Batch";
import KeysDialog, { type KeyStatus } from "./KeysDialog";
import Landing from "./Landing";
import Processing, { Importing, Uploading } from "./Processing";
import Results from "./Results";
import Studio, { type Settings } from "./Studio";
import { api } from "./api";
import { Logo } from "./ui";

type View = "landing" | "uploading" | "importing" | "studio" | "processing" | "results" | "batchSetup" | "batch";

const ALLOWED_EXT = ["mp4", "mov", "webm"];

/** Keeps ?v=<video>&job=<job> (or ?import= / ?batch=) in the URL so a refresh restores where you were. */
function syncUrl(params: { v?: string; job?: string; import?: string; batch?: string } = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const qs = p.toString();
  window.history.replaceState(null, "", qs ? `/?${qs}` : "/");
}

export default function ClipForge() {
  const [view, setView] = useState<View>("landing");
  const [video, setVideo] = useState<VideoMeta | null>(null);
  const [job, setJobState] = useState<Job | null>(null);
  const [upload, setUpload] = useState({ name: "", loaded: 0, total: 0 });
  const [importing, setImporting] = useState<ImportStatus | null>(null);
  const [batchUrls, setBatchUrls] = useState<string[]>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_OPTIONS });
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const [keys, setKeys] = useState<(KeyStatus & { ytdlp?: boolean }) | null>(null);
  const [keysOpen, setKeysOpen] = useState(false);
  const [resumeAfterKeys, setResumeAfterKeys] = useState<null | "job" | "batch">(null);
  const keysReady = Boolean(keys?.OPENAI_API_KEY && keys?.ANTHROPIC_API_KEY);

  const setJob = useCallback((j: Job | null) => setJobState(j ? normalizeJob(j) : null), []);

  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then(setKeys)
      .catch(() => {});
  }, []);

  // Restore state from the URL on first load.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const v = p.get("v");
    const j = p.get("job");
    const imp = p.get("import");
    const b = p.get("batch");
    (async () => {
      if (b) {
        setBatchId(b);
        setView("batch");
        return;
      }
      if (imp) {
        setImporting({ id: imp, url: "", state: "resolving", progress: 0, message: "Fetching video…", updatedAt: Date.now() });
        setView("importing");
        return;
      }
      if (v) {
        const r = await fetch(`/api/videos/${v}`);
        if (r.status === 200) {
          setVideo(await r.json());
          setView("studio");
        } else syncUrl();
      }
      if (j) {
        const r = await fetch(`/api/jobs/${j}`);
        if (r.ok) {
          const jb: Job = normalizeJob(await r.json());
          setJob(jb);
          const { videoId: _v, ...opts } = jb.options;
          setSettings(opts);
          setView(jb.stage === "done" ? "results" : "processing");
        }
      }
    })().catch(() => {});
  }, [setJob]);

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
  }, [view, job, setJob]);

  // Poll a link import until the video is ready.
  useEffect(() => {
    if (view !== "importing" || !importing || importing.state === "error") return;
    const id = importing.id;
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/videos/${id}`, { cache: "no-store" });
        const body = await r.json();
        if (r.status === 200) {
          setVideo(body);
          setJob(null);
          setView("studio");
          syncUrl({ v: id });
        } else if (r.status === 202) setImporting(body.importing);
        else {
          setError(body.error || "The import was lost. Please paste the link again.");
          setView("landing");
          syncUrl();
        }
      } catch {
        /* keep polling */
      }
    }, 1000);
    return () => clearInterval(t);
  }, [view, importing, setJob]);

  const pickFile = useCallback(
    (file: File) => {
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
          syncUrl({ v: body.id });
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
    },
    [setJob],
  );

  const onLinks = useCallback(async (urls: string[]) => {
    setError(null);
    if (urls.length > 1) {
      setBatchUrls(urls);
      setSettings((s) => ({ ...s, mode: "ranking" }));
      setView("batchSetup");
      return;
    }
    try {
      const st = await api<ImportStatus>("/api/import", "POST", { url: urls[0] });
      setImporting(st);
      setView("importing");
      syncUrl({ import: st.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't fetch that link.");
    }
  }, []);

  const generate = useCallback(async () => {
    if (!video) return;
    setError(null);
    if (keys && !keysReady) {
      setResumeAfterKeys("job");
      setKeysOpen(true);
      return;
    }
    setStarting(true);
    try {
      const r = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ videoId: video.id, ...settings }),
      });
      const body = await r.json();
      if (body.needsKeys) {
        setResumeAfterKeys("job");
        setKeysOpen(true);
        return;
      }
      if (!r.ok) throw new Error(body.error || "Could not start processing.");
      setJob(body);
      setView("processing");
      syncUrl({ v: video.id, job: body.id });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start processing.");
    } finally {
      setStarting(false);
    }
  }, [video, settings, keys, keysReady, setJob]);

  const startBatch = useCallback(async () => {
    setError(null);
    if (keys && !keysReady) {
      setResumeAfterKeys("batch");
      setKeysOpen(true);
      return;
    }
    setStarting(true);
    try {
      const b = await api<{ id: string }>("/api/batches", "POST", { urls: batchUrls, options: settings });
      setBatchId(b.id);
      setView("batch");
      syncUrl({ batch: b.id });
    } catch (e) {
      const data = (e as { data?: { needsKeys?: boolean } }).data;
      if (data?.needsKeys) {
        setResumeAfterKeys("batch");
        setKeysOpen(true);
      } else setError(e instanceof Error ? e.message : "Could not start the batch.");
    } finally {
      setStarting(false);
    }
  }, [batchUrls, settings, keys, keysReady]);

  // After keys are saved from the prompt, continue automatically.
  useEffect(() => {
    if (resumeAfterKeys && keysReady && !keysOpen) {
      const what = resumeAfterKeys;
      setResumeAfterKeys(null);
      void (what === "batch" ? startBatch() : generate());
    }
  }, [resumeAfterKeys, keysReady, keysOpen, generate, startBatch]);

  const reset = () => {
    xhrRef.current?.abort();
    setVideo(null);
    setJob(null);
    setImporting(null);
    setBatchId(null);
    setError(null);
    setView("landing");
    syncUrl();
  };

  const backToStudio = () => {
    setError(null);
    setView("studio");
    if (video) syncUrl({ v: video.id });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openFromBatch = async (videoId: string, jobId: string) => {
    try {
      const [v, j] = await Promise.all([api<VideoMeta>(`/api/videos/${videoId}`), api<Job>(`/api/jobs/${jobId}`)]);
      setVideo(v);
      setJob(j);
      setView("results");
      syncUrl({ v: videoId, job: jobId });
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open that result.");
    }
  };

  const updateJob = useCallback((fn: (j: Job) => Job) => setJobState((j) => (j ? fn(j) : j)), []);
  const showError = useCallback((m: string) => setError(m), []);

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Logo onClick={reset} />
        <div className="flex items-center gap-5">
          {view !== "landing" && (
            <button onClick={reset} className="text-sm text-mute transition-colors hover:text-white">
              Start over
            </button>
          )}
          {keys && (
            <button
              onClick={() => setKeysOpen(true)}
              className="flex items-center gap-2 rounded-full border border-line px-3.5 py-1.5 text-sm text-white/80 transition-colors hover:border-white/25 hover:text-white"
            >
              <span className={`h-2 w-2 rounded-full ${keysReady ? "bg-emerald-400" : "bg-ember animate-pulse"}`} />
              {keysReady ? "AI connected" : "Add API keys"}
            </button>
          )}
        </div>
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

      {keysOpen && keys && (
        <KeysDialog
          status={keys}
          onClose={() => {
            setKeysOpen(false);
            setResumeAfterKeys(null);
          }}
          onSaved={(s) => {
            setKeys((k) => ({ ...k, ...s }));
            setKeysOpen(false);
          }}
        />
      )}

      {view === "landing" && <Landing onPick={pickFile} onLinks={(u) => void onLinks(u)} ytdlp={keys ? Boolean(keys.ytdlp) : null} />}
      {view === "uploading" && <Uploading {...upload} />}
      {view === "importing" && importing && <Importing status={importing} onCancel={reset} />}
      {view === "studio" && video && <Studio video={video} settings={settings} onChange={setSettings} onGenerate={generate} onReset={reset} busy={starting} />}
      {view === "batchSetup" && (
        <BatchSetup urls={batchUrls} settings={settings} onChange={setSettings} onStart={() => void startBatch()} onCancel={reset} busy={starting} />
      )}
      {view === "batch" && batchId && <BatchProgress batchId={batchId} onOpen={(v, j) => void openFromBatch(v, j)} />}
      {view === "processing" && job && <Processing job={job} onBack={backToStudio} onRetry={generate} />}
      {view === "results" && job && (
        <Results job={job} video={video} setJob={updateJob} onGenerateAgain={backToStudio} onNewVideo={reset} onError={showError} />
      )}
    </div>
  );
}
