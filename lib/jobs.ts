import crypto from "node:crypto";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { buildSentences, findMoments } from "./analyze";
import { refineBoundaries, snapToWordGap } from "./boundaries";
import { DEFAULT_OVERLAY, DEFAULT_SUBTITLES, defaultCrop, lengthTarget, normalizeJob } from "./defaults";
import { buildContext, compositeSignals, scoreWindow, viralScore, type Context } from "./features";
import { probe } from "./ffmpeg";
import { cropWindow, isVerticalSource } from "./layout";
import { concatClips, renderClip } from "./render";
import { analyzeAudio, analyzeVideo } from "./signals";
import { jobDir, mediaUrl, newId, readJson, uploadDir, writeJson } from "./storage";
import { generateClipTexts, type ClipTextInput } from "./titles";
import { extractAudio, transcribe } from "./transcribe";
import { STAGES } from "./types";
import type {
  AudioSignals,
  Clip,
  Crop,
  Evidence,
  Job,
  JobOptions,
  Moment,
  SignalBreakdown,
  StageKey,
  Transcript,
  VideoMeta,
  VideoSignals,
  Word,
} from "./types";
import { analyzeFrames, sampleTimes } from "./vision";

// Share of the overall progress bar per stage (sums to 100).
const WEIGHT: Record<StageKey, number> = {
  read: 3,
  audio: 8,
  transcribe: 24,
  scenes: 10,
  moments: 14,
  score: 10,
  clips: 4,
  titles: 7,
  export: 20,
};

// Survives Next.js hot reloads, so a running pipeline isn't mistaken for a dead one.
const G = globalThis as unknown as {
  __cfRunning?: Set<string>;
  __cfLocks?: Map<string, Promise<unknown>>;
  __cfRenders?: Map<string, Promise<unknown>>;
  __cfActiveRenders?: Set<string>;
};
const running = (G.__cfRunning ??= new Set());
const locks = (G.__cfLocks ??= new Map());
const renderChains = (G.__cfRenders ??= new Map());
const activeRenders = (G.__cfActiveRenders ??= new Set());

export async function getVideo(videoId: string): Promise<VideoMeta | null> {
  return readJson<VideoMeta>(path.join(uploadDir(videoId), "meta.json"));
}

export function videoFile(meta: VideoMeta): string {
  return path.join(uploadDir(meta.id), `source.${meta.ext}`);
}

const jobFile = (id: string) => path.join(jobDir(id), "job.json");

/** Serialises every read-modify-write of a job's state file. */
async function withJobLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(id) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  const tail = next.catch(() => {});
  locks.set(id, tail);
  try {
    return await next;
  } finally {
    if (locks.get(id) === tail) locks.delete(id);
  }
}

export async function getJob(jobId: string): Promise<Job | null> {
  const raw = await readJson<Job>(jobFile(jobId));
  if (!raw) return null;
  const job = normalizeJob(raw);
  // A pipeline that isn't running in this process and hasn't written for a while was
  // interrupted (e.g. the server restarted).
  if (!["done", "error"].includes(job.stage) && !running.has(job.id) && Date.now() - job.updatedAt > 10 * 60_000) {
    job.stage = "error";
    job.error = "Processing was interrupted (the server restarted). Please try again.";
  }
  for (const c of job.clips) {
    if ((c.render.state === "queued" || c.render.state === "rendering") && !activeRenders.has(c.id)) {
      c.render = { ...c.render, state: c.render.url ? "done" : "idle", progress: c.render.url ? 1 : 0 };
    }
  }
  for (const c of job.clips) c.upToDate = !isStale(job, c) && Boolean(c.render.url);
  if (job.compilation.state === "rendering" && !activeRenders.has(`${job.id}:compilation`)) {
    job.compilation = { ...job.compilation, state: "idle" };
  }
  return job;
}

/** Applies `mutate` to the stored job under the job lock and saves it. */
export async function updateJob(jobId: string, mutate: (job: Job) => void | Promise<void>): Promise<Job | null> {
  return withJobLock(jobId, async () => {
    const job = await getJob(jobId);
    if (!job) return null;
    await mutate(job);
    job.updatedAt = Date.now();
    await writeJson(jobFile(jobId), job);
    return job;
  });
}

export async function createJob(options: JobOptions): Promise<Job> {
  const job: Job = {
    id: newId(),
    options,
    stage: "queued",
    progress: 0,
    message: "Getting ready…",
    steps: Object.fromEntries(STAGES.map((s) => [s.key, { status: "pending" }])),
    moments: [],
    clips: [],
    ranking: options.mode === "ranking",
    overlay: { ...DEFAULT_OVERLAY },
    subtitles: { ...DEFAULT_SUBTITLES },
    compilation: { state: "idle", progress: 0 },
    compilationTitles: [],
    compilationTitle: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await writeJson(jobFile(job.id), job);
  running.add(job.id);
  // Fire and forget: the pipeline runs in this server process; the client polls job.json.
  void runJob(job)
    .catch(() => {})
    .finally(() => running.delete(job.id));
  return job;
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50) || "clip"
  );
}

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

function clipWords(words: Word[], start: number, end: number): Word[] {
  return words.filter((w) => w.end > start + 0.05 && w.start < end - 0.05);
}

// ---------------------------------------------------------------------------------------------
// Cropping

/** Builds the 9:16 crop path: one horizontal position per shot, keeping the subject's face in frame. */
export function computeCrop(meta: VideoMeta, framing: JobOptions["framing"], moment: Pick<Moment, "frames">, cuts: number[], start: number, end: number): Crop {
  if (isVerticalSource(meta.width, meta.height)) return { mode: "fill", keys: [], manualX: null };
  if (framing === "fit") return defaultCrop();
  const frames = (moment.frames ?? []).filter((f) => f.p && f.r > f.l);
  if (!frames.length) return defaultCrop(); // no identifiable subject: keep the whole picture
  const wf = cropWindow(meta.width, meta.height, 0.5).w / meta.width;
  const bounds = [start, ...cuts.filter((c) => c > start + 0.3 && c < end - 0.3), end];
  const keys: { t: number; x: number }[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const [a, b] = [bounds[i], bounds[i + 1]];
    const inShot = frames.filter((f) => f.t >= a && f.t < b);
    const pool = inShot.length ? inShot : [frames.reduce((best, f) => (Math.abs(f.t - (a + b) / 2) < Math.abs(best.t - (a + b) / 2) ? f : best))];
    const l = Math.min(...pool.map((f) => f.l));
    const r = Math.max(...pool.map((f) => f.r));
    let x = (l + r) / 2;
    // If the subject fits in the window, make sure no part of it (face first) is cut off.
    if (r - l <= wf) x = Math.min(l + wf / 2, Math.max(r - wf / 2, x));
    x = Math.round(x * 1000) / 1000;
    const prev = keys[keys.length - 1];
    if (!prev || Math.abs(prev.x - x) > 0.03) keys.push({ t: Math.round(a * 1000) / 1000, x });
  }
  return { mode: "track", keys, manualX: null };
}

// ---------------------------------------------------------------------------------------------
// Rendering

function renderHash(job: Job, clip: Clip): string {
  const rank = job.ranking ? clip.index : null;
  const payload = {
    s: clip.start,
    e: clip.end,
    c: clip.crop,
    o: job.overlay.enabled ? job.overlay : null,
    u: job.subtitles.enabled ? job.subtitles : null,
    t: clip.overlayText === "short" ? clip.shortTitle : clip.title,
    r: job.overlay.showRank ? rank : null,
    m: clip.emphasis,
  };
  return crypto.createHash("sha1").update(JSON.stringify(payload)).digest("hex").slice(0, 10);
}

export function isStale(job: Job, clip: Clip): boolean {
  return clip.render.state !== "done" || clip.render.hash !== renderHash(job, clip);
}

const clipNum = (clip: Clip) => clip.id.split("-").pop() ?? "0";

async function renderOne(job: Job, clip: Clip, meta: VideoMeta, words: Word[], onProgress: (f: number) => void): Promise<{ hash: string; url: string; file: string }> {
  const hash = renderHash(job, clip);
  const outName = `clip_${clipNum(clip)}_${hash}.mp4`;
  const dir = jobDir(job.id);
  if (!existsSync(path.join(dir, outName))) {
    await renderClip({
      videoPath: videoFile(meta),
      srcW: meta.width,
      srcH: meta.height,
      hasAudio: meta.hasAudio,
      start: clip.start,
      end: clip.end,
      crop: clip.crop,
      ass: {
        words,
        subtitles: job.subtitles,
        emphasis: clip.emphasis,
        overlay: job.overlay,
        overlayTitle: clip.overlayText === "short" ? clip.shortTitle : clip.title,
        rank: job.ranking ? clip.index : null,
      },
      workDir: dir,
      outName,
      onProgress,
    });
  }
  return { hash, url: mediaUrl("jobs", job.id, outName), file: outName };
}

async function loadTranscript(videoId: string): Promise<Transcript> {
  const t = await readJson<Transcript>(path.join(uploadDir(videoId), "transcript.json"));
  if (!t) throw new Error("The transcript for this video is missing. Please process it again.");
  return t;
}

/** Queues a background render of one clip with its current edits (no-op when up to date). */
export async function requestRender(jobId: string, clipId: string): Promise<Job | null> {
  const job = await updateJob(jobId, (j) => {
    const c = j.clips.find((x) => x.id === clipId);
    if (!c) throw new Error("Clip not found");
    if (!isStale(j, c)) return;
    c.render = { ...c.render, state: "queued", progress: 0, error: undefined };
  });
  const clip = job?.clips.find((c) => c.id === clipId);
  if (!job || !clip || clip.render.state !== "queued") return job;
  activeRenders.add(clipId);
  const chain = (renderChains.get(jobId) ?? Promise.resolve()).then(() => runRender(jobId, clipId));
  renderChains.set(jobId, chain.catch(() => {}));
  return job;
}

async function runRender(jobId: string, clipId: string): Promise<void> {
  try {
    const job = await getJob(jobId);
    const clip = job?.clips.find((c) => c.id === clipId);
    if (!job || !clip) return;
    const meta = await getVideo(job.options.videoId);
    if (!meta) throw new Error("The source video is gone. Upload it again.");
    const transcript = await loadTranscript(meta.id);
    let last = 0;
    await updateJob(jobId, (j) => {
      const c = j.clips.find((x) => x.id === clipId);
      if (c) c.render = { ...c.render, state: "rendering", progress: 0 };
    });
    const res = await renderOne(job, clip, meta, transcript.words, (f) => {
      if (Date.now() - last < 700) return;
      last = Date.now();
      void updateJob(jobId, (j) => {
        const c = j.clips.find((x) => x.id === clipId);
        if (c && c.render.state === "rendering") c.render.progress = f;
      });
    });
    await updateJob(jobId, (j) => {
      const c = j.clips.find((x) => x.id === clipId);
      if (!c) return;
      const oldFile = c.render.url?.split("/").pop();
      c.render = { state: "done", progress: 1, hash: res.hash, url: res.url };
      c.url = res.url;
      if (oldFile && oldFile !== res.file) void fs.rm(path.join(jobDir(jobId), decodeURIComponent(oldFile)), { force: true });
    });
  } catch (err) {
    console.error(`[clipforge] render of ${clipId} failed:`, err);
    await updateJob(jobId, (j) => {
      const c = j.clips.find((x) => x.id === clipId);
      if (c) c.render = { ...c.render, state: "error", progress: 0, error: friendlyError(err) };
    });
  } finally {
    activeRenders.delete(clipId);
  }
}

/** Ranking mode: renders any stale clips, then joins them as a countdown (#N … #1). */
export async function requestCompilation(jobId: string): Promise<Job | null> {
  const key = `${jobId}:compilation`;
  if (activeRenders.has(key)) return getJob(jobId);
  const job = await updateJob(jobId, (j) => {
    if (!j.clips.length) throw new Error("There are no clips to join.");
    j.compilation = { ...j.compilation, state: "rendering", progress: 0, error: undefined };
  });
  if (!job) return null;
  activeRenders.add(key);
  const chain = (renderChains.get(jobId) ?? Promise.resolve()).then(() => runCompilation(jobId));
  renderChains.set(jobId, chain.catch(() => {}));
  return job;
}

async function runCompilation(jobId: string): Promise<void> {
  const key = `${jobId}:compilation`;
  try {
    const job = await getJob(jobId);
    if (!job) return;
    const meta = await getVideo(job.options.videoId);
    if (!meta) throw new Error("The source video is gone. Upload it again.");
    const transcript = await loadTranscript(meta.id);
    const order = [...job.clips].sort((a, b) => b.index - a.index); // countdown: #N first, #1 last
    const total = order.reduce((s, c) => s + c.duration, 0);
    const files: string[] = [];
    let doneSecs = 0;
    const progress = (f: number) =>
      void updateJob(jobId, (j) => {
        j.compilation.progress = Math.min(0.99, f);
      });
    for (const c of order) {
      const res = await renderOne(job, c, meta, transcript.words, (f) => progress(((doneSecs + f * c.duration) / total) * 0.9));
      files.push(res.file);
      doneSecs += c.duration;
      await updateJob(jobId, (j) => {
        const jc = j.clips.find((x) => x.id === c.id);
        if (jc) {
          jc.render = { state: "done", progress: 1, hash: res.hash, url: res.url };
          jc.url = res.url;
        }
      });
    }
    const hash = crypto.createHash("sha1").update(files.join("|")).digest("hex").slice(0, 10);
    const outName = `ranking_${hash}.mp4`;
    if (!existsSync(path.join(jobDir(jobId), outName))) {
      await concatClips(jobDir(jobId), files, outName, total, (f) => progress(0.9 + f * 0.1));
    }
    await updateJob(jobId, (j) => {
      j.compilation = { state: "done", progress: 1, hash, url: mediaUrl("jobs", jobId, outName), duration: Math.round(total * 10) / 10 };
    });
  } catch (err) {
    console.error(`[clipforge] compilation for ${jobId} failed:`, err);
    await updateJob(jobId, (j) => {
      j.compilation = { ...j.compilation, state: "error", progress: 0, error: friendlyError(err) };
    });
  } finally {
    activeRenders.delete(key);
  }
}

// ---------------------------------------------------------------------------------------------
// Edits

export interface ClipPatch {
  start?: number;
  end?: number;
  title?: string;
  shortTitle?: string;
  caption?: string;
  hashtags?: string[];
  overlayText?: "title" | "short";
  cropX?: number | null;
}

export async function editClip(jobId: string, clipId: string, patch: ClipPatch): Promise<Job | null> {
  const job = await getJob(jobId);
  const meta = job && (await getVideo(job.options.videoId));
  const words = meta ? (await readJson<Transcript>(path.join(uploadDir(meta.id), "transcript.json")))?.words ?? [] : [];
  return updateJob(jobId, (j) => {
    const c = j.clips.find((x) => x.id === clipId);
    if (!c) throw new Error("Clip not found");
    const dur = meta?.duration ?? Infinity;
    let start = patch.start ?? c.start;
    let end = patch.end ?? c.end;
    // Never cut a word in half.
    if (patch.start !== undefined) start = snapToWordGap({ words }, start, "start");
    if (patch.end !== undefined) end = snapToWordGap({ words }, end, "end");
    start = Math.max(0, Math.min(start, dur - 1));
    end = Math.min(dur, Math.max(end, start + 1));
    c.start = Math.round(start * 100) / 100;
    c.end = Math.round(end * 100) / 100;
    c.duration = Math.round((c.end - c.start) * 100) / 100;
    if (patch.title !== undefined) c.title = patch.title.trim().slice(0, 120) || c.title;
    if (patch.shortTitle !== undefined) c.shortTitle = patch.shortTitle.trim().slice(0, 60);
    if (patch.caption !== undefined) c.caption = patch.caption.slice(0, 2000);
    if (patch.hashtags !== undefined) c.hashtags = patch.hashtags.slice(0, 8);
    if (patch.overlayText !== undefined) c.overlayText = patch.overlayText;
    if (patch.cropX !== undefined) c.crop = { ...c.crop, manualX: patch.cropX === null ? null : Math.min(1, Math.max(0, patch.cropX)) };
    c.downloadName = `${String(c.index).padStart(2, "0")}-${slug(c.title)}.mp4`;
  });
}

export async function reorderClips(jobId: string, order: string[]): Promise<Job | null> {
  return updateJob(jobId, (j) => {
    const byId = new Map(j.clips.map((c) => [c.id, c]));
    const next = order.map((id) => byId.get(id)).filter((c): c is Clip => Boolean(c));
    for (const c of j.clips) if (!next.includes(c)) next.push(c);
    next.forEach((c, i) => {
      c.index = i + 1;
      c.downloadName = `${String(i + 1).padStart(2, "0")}-${slug(c.title)}.mp4`;
    });
    j.clips = next;
  });
}

export async function regenerateTitles(jobId: string, clipId: string): Promise<Job | null> {
  const job = await getJob(jobId);
  const clip = job?.clips.find((c) => c.id === clipId);
  if (!job || !clip) throw new Error("Clip not found");
  const transcript = await loadTranscript(job.options.videoId);
  const input: ClipTextInput = {
    id: clip.id,
    transcript: clipWords(transcript.words, clip.start, clip.end).map((w) => w.text).join(" "),
    categories: clip.categories,
    reason: clip.reason,
    visual: job.moments.find((m) => m.id === clip.momentId)?.visual ?? "",
    duration: clip.duration,
    rank: job.ranking ? clip.index : undefined,
  };
  const { texts } = await generateClipTexts([input], { ranking: false, avoid: { [clip.id]: clip.titles } });
  const t = texts[clip.id];
  return updateJob(jobId, (j) => {
    const c = j.clips.find((x) => x.id === clipId);
    if (!c) return;
    Object.assign(c, { titles: t.titles, title: t.titles[0], shortTitle: t.shortTitle, caption: t.caption, hashtags: t.hashtags, emphasis: t.emphasis });
    c.downloadName = `${String(c.index).padStart(2, "0")}-${slug(c.title)}.mp4`;
  });
}

/** Turns a candidate moment that wasn't selected into a clip (appended at the lowest rank). */
export async function promoteMoment(jobId: string, momentId: string): Promise<Job | null> {
  const job = await getJob(jobId);
  const m = job?.moments.find((x) => x.id === momentId);
  if (!job || !m) throw new Error("Moment not found");
  if (m.clipId && job.clips.some((c) => c.id === m.clipId)) return job;
  const meta = await getVideo(job.options.videoId);
  if (!meta) throw new Error("The source video is gone. Upload it again.");
  const transcript = await loadTranscript(meta.id);
  const video = await readJson<VideoSignals>(path.join(uploadDir(meta.id), "signals_video.json"));
  const num = Math.max(0, ...job.clips.map((c) => +clipNum(c) || 0)) + 1;
  const clip = makeClip(job, meta, m, num, job.clips.length + 1, video?.scenes.map((s) => s.t) ?? []);
  const { texts } = await generateClipTexts(
    [{ id: clip.id, transcript: clipWords(transcript.words, m.start, m.end).map((w) => w.text).join(" "), categories: m.categories, reason: m.reason, visual: m.visual, duration: clip.duration }],
    { ranking: false },
  );
  applyText(clip, texts[clip.id]);
  const saved = await updateJob(jobId, (j) => {
    j.clips.push({ ...clip, index: j.clips.length + 1 });
    const jm = j.moments.find((x) => x.id === momentId);
    if (jm) {
      jm.selected = true;
      jm.clipId = clip.id;
    }
  });
  if (saved) return requestRender(jobId, clip.id);
  return saved;
}

function makeClip(job: Job, meta: VideoMeta, m: Moment, num: number, index: number, cuts: number[]): Clip {
  return {
    id: `${job.id}-${num}`,
    index,
    momentId: m.id,
    title: "",
    titles: [],
    shortTitle: "",
    caption: "",
    hashtags: [],
    emphasis: [],
    overlayText: "title",
    hook: "",
    reason: m.reason,
    score: m.viralScore,
    categories: m.categories,
    breakdown: m.breakdown,
    evidence: m.evidence,
    structure: m.structure,
    start: m.start,
    end: m.end,
    duration: Math.round((m.end - m.start) * 100) / 100,
    crop: computeCrop(meta, job.options.framing, m, cuts, m.start, m.end),
    render: { state: "idle", progress: 0 },
    url: "",
    downloadName: "",
  };
}

function applyText(c: Clip, t: { titles: string[]; shortTitle: string; caption: string; hashtags: string[]; emphasis: string[] }) {
  c.titles = t.titles;
  c.title = t.titles[0] ?? c.title;
  c.shortTitle = t.shortTitle;
  c.caption = t.caption;
  c.hashtags = t.hashtags;
  c.emphasis = t.emphasis;
  c.hook = t.titles[0] ?? "";
  c.downloadName = `${String(c.index).padStart(2, "0")}-${slug(c.title)}.mp4`;
}

// ---------------------------------------------------------------------------------------------
// The pipeline

async function cached<T>(file: string, make: () => Promise<T>): Promise<{ value: T; hit: boolean }> {
  const hit = await readJson<T>(file);
  if (hit) return { value: hit, hit: true };
  const value = await make();
  await writeJson(file, value);
  return { value, hit: false };
}

async function runJob(job: Job): Promise<void> {
  const dir = jobDir(job.id);
  let lastWrite = 0;
  let queue: Promise<void> = Promise.resolve();
  // Writes are serialised so a slow progress update can never overwrite a newer state.
  const save = (force = false): Promise<void> => {
    job.updatedAt = Date.now();
    if (!force && job.updatedAt - lastWrite < 400) return queue;
    lastWrite = job.updatedAt;
    const snapshot = JSON.parse(JSON.stringify(job)) as Job;
    queue = queue
      .then(() => withJobLock(job.id, () => writeJson(jobFile(job.id), snapshot)))
      .catch((err) => console.error("[clipforge] could not save job state:", err));
    return queue;
  };
  const doneWeight = () => STAGES.reduce((s, st) => s + (job.steps[st.key]?.status === "done" ? WEIGHT[st.key] : 0), 0);
  const begin = async (key: StageKey, message: string) => {
    job.stage = key;
    job.message = message;
    job.steps[key] = { status: "active", startedAt: Date.now() };
    job.progress = Math.round(doneWeight());
    await save(true);
  };
  const update = (key: StageKey, fraction: number, message?: string) => {
    if (message) job.message = message;
    job.progress = Math.round(doneWeight() + WEIGHT[key] * Math.min(1, Math.max(0, fraction)));
    void save();
  };
  const finish = async (key: StageKey, detail: string) => {
    job.steps[key] = { ...job.steps[key], status: "done", detail, endedAt: Date.now() };
    job.progress = Math.round(doneWeight());
    await save(true);
  };

  try {
    // 1. Reading video -----------------------------------------------------------------------
    await begin("read", "Reading the video file…");
    const meta = await getVideo(job.options.videoId);
    if (!meta) throw new Error("Uploaded video not found. Please upload it again.");
    const source = videoFile(meta);
    const info = await probe(source);
    if (!info.hasVideo || !info.duration) throw new Error("The video file can't be read. Please upload it again.");
    if (!info.hasAudio) throw new Error("This video has no audio track, so there is no speech to find moments in.");
    const udir = uploadDir(meta.id);
    await finish("read", `${fmt(info.duration)} · ${info.width}×${info.height} · audio found`);

    // Picture analysis runs alongside audio work + transcription (it only needs FFmpeg).
    let videoFrac = 0;
    const videoP = cached(path.join(udir, "signals_video.json"), () =>
      analyzeVideo(source, path.join(dir, "work"), meta.duration, (f) => (videoFrac = f)),
    );
    videoP.catch(() => {});

    // 2. Extracting audio --------------------------------------------------------------------
    await begin("audio", "Extracting audio…");
    const transcriptFile = path.join(udir, "transcript.json");
    let transcript = await readJson<Transcript>(transcriptFile);
    const audioDir = path.join(udir, "audio");
    let chunks: { file: string; offset: number }[] = [];
    if (!transcript) {
      chunks = await extractAudio(source, audioDir, meta.duration, (f) => update("audio", f * 0.6, "Extracting audio for transcription…"));
    }
    const audioRes = await cached(path.join(udir, "signals_audio.json"), () =>
      analyzeAudio(source, meta.duration, (f) => update("audio", 0.6 + f * 0.4, "Measuring loudness, silences and energy…")),
    );
    const audio: AudioSignals = audioRes.value;
    await finish(
      "audio",
      `${transcript ? "Reused cached audio · " : ""}loudness measured every 0.1 s · ${audio.silences.length} silences found`,
    );

    // 3. Transcribing -------------------------------------------------------------------------
    await begin("transcribe", "Transcribing speech with word timestamps…");
    const cachedTranscript = Boolean(transcript);
    if (!transcript) {
      transcript = await transcribe(chunks, meta.duration, (f) => update("transcribe", f, `Transcribing speech… ${Math.round(f * 100)}%`));
      await writeJson(transcriptFile, transcript);
      await fs.rm(audioDir, { recursive: true, force: true });
    }
    if (transcript.words.length < 10) throw new Error("We couldn't detect enough speech in this video to find clips.");
    await finish("transcribe", `${transcript.words.length.toLocaleString("en-US")} words${cachedTranscript ? " (cached)" : ""} · language: ${transcript.language}`);

    // 4. Detecting scenes ----------------------------------------------------------------------
    await begin("scenes", "Detecting scene changes and motion…");
    const tick = setInterval(() => update("scenes", videoFrac, `Detecting scene changes and motion… ${Math.round(videoFrac * 100)}%`), 500);
    let video: VideoSignals | null = null;
    try {
      video = (await videoP).value;
    } catch (err) {
      console.warn("[clipforge] scene detection failed, continuing without it:", err);
    } finally {
      clearInterval(tick);
    }
    await finish("scenes", video ? `${video.scenes.length} scene change${video.scenes.length === 1 ? "" : "s"} · motion sampled 4×/s` : "Picture analysis unavailable — using audio and transcript only");

    // 5. Finding interesting moments ---------------------------------------------------------
    await begin("moments", "Reading the transcript alongside the audio and picture signals…");
    const sentences = buildSentences(transcript);
    const ctx: Context = buildContext(sentences, transcript.words, audio, video);
    const target = lengthTarget(job.options, meta.duration);
    const ai = await findMoments(ctx, job.options, target, meta.duration);
    if (!ai.length) throw new Error("No strong moments were found in this video.");
    await finish("moments", `${ai.length} candidate moments · ${ctx.bursts.length} non-speech audio bursts considered`);

    // 6. Scoring moments ----------------------------------------------------------------------
    await begin("score", "Scoring each moment on speech, audio, reactions and visuals…");
    const cuts = video?.scenes.map((s) => s.t) ?? [];
    type Cand = { m: Moment; payoffAt: number; ai: number; ws: ReturnType<typeof scoreWindow>; hook: number; payoff: number; notes: string[] };
    const cands: Cand[] = [];
    for (const a of ai) {
      const r = refineBoundaries(ctx, a, target, meta.duration);
      if (!r) continue;
      const payoffAt = r.structure.payoff[0];
      const ws = scoreWindow(ctx, r.start, r.end, payoffAt);
      const aiScore = Math.max(0, Math.min(100, Math.round(a.ai_score)));
      const m: Moment = {
        id: newId(),
        start: r.start,
        end: r.end,
        categories: [...new Set(a.categories)].slice(0, 3),
        reason: a.reason.trim(),
        viralScore: 0,
        breakdown: null as unknown as SignalBreakdown,
        evidence: ws.evidence,
        structure: r.structure,
        visual: "",
        selected: false,
      };
      const c10 = (v: number) => Math.max(0, Math.min(10, v)) * 10;
      cands.push({ m, payoffAt, ai: aiScore, ws, hook: c10(a.hook_strength), payoff: c10(a.payoff_strength), notes: r.notes });
    }
    const score = (c: Cand, visual: number | null) => {
      const signals = compositeSignals(c.ws, visual);
      c.m.breakdown = { ai: c.ai, hook: c.hook, payoff: c.payoff, audio: Math.round(c.ws.audio), energy: Math.round(c.ws.energy), reaction: Math.round(c.ws.reaction), pause: Math.round(c.ws.pause), scene: Math.round(c.ws.scene), language: Math.round(c.ws.language), visual, signals };
      c.m.viralScore = viralScore(c.ai, signals);
    };
    cands.forEach((c) => score(c, null));
    // Remove overlapping candidates, keeping the stronger one.
    cands.sort((x, y) => y.m.viralScore - x.m.viralScore);
    const unique: Cand[] = [];
    for (const c of cands) {
      const overlaps = unique.some((o) => Math.min(o.m.end, c.m.end) - Math.max(o.m.start, c.m.start) > 0.3 * Math.min(o.m.end - o.m.start, c.m.end - c.m.start));
      if (!overlaps) unique.push(c);
    }
    update("score", 0.25, "Looking at the frames of the strongest moments…");

    // Vision pass on the shortlist: reactions/expressions + where the subject is for cropping.
    const shortlist = unique.slice(0, job.options.count + 3);
    let seen = 0;
    let visionOk = 0;
    let next = 0;
    const worker = async () => {
      while (next < shortlist.length) {
        const c = shortlist[next++];
        try {
          const times = sampleTimes(c.m.start, c.m.end, cuts, c.payoffAt);
          const v = await analyzeFrames(source, dir, times, `m${c.m.id}`);
          if (v) {
            visionOk++;
            c.m.frames = v.frames.map((f) => ({ t: f.t, l: f.left, r: f.right, p: f.person }));
            c.m.visual = v.summary;
            const visual = Math.round(v.reactionScore * 0.7 + v.reactionChange * 0.3);
            score(c, visual);
            const peak = v.frames.reduce((b, f) => (f.reaction > b.reaction ? f : b), v.frames[0]);
            if (peak && peak.reaction >= 5) {
              c.m.evidence = [...c.m.evidence, { t: peak.t, kind: "visual", label: `Visible reaction/action (${peak.reaction}/10): ${v.summary}` } as Evidence].sort((a, b) => a.t - b.t);
            }
          }
        } catch (err) {
          console.warn("[clipforge] frame analysis failed for a moment:", err);
        }
        update("score", 0.25 + (++seen / shortlist.length) * 0.75, `Looking at the frames of the strongest moments… ${seen}/${shortlist.length}`);
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, shortlist.length) }, worker));
    for (const c of unique) {
      if (c.notes.length) c.m.evidence = [...c.m.evidence, { t: c.m.start, kind: "structure", label: `Smart cut: ${c.notes.join("; ")}` } as Evidence];
    }
    unique.sort((x, y) => y.m.viralScore - x.m.viralScore);
    const selected = unique.slice(0, job.options.count);
    selected.forEach((c) => (c.m.selected = true));
    job.moments = unique.map((c) => c.m);
    await finish("score", `${unique.length} moments scored (0–100) · ${visionOk ? `${visionOk} checked visually · ` : ""}top ${selected.length} selected`);

    // 7. Creating clips -------------------------------------------------------------------------
    await begin("clips", "Setting clip boundaries and the 9:16 framing…");
    job.clips = selected.map((c, i) => {
      const clip = makeClip(job, meta, c.m, i + 1, i + 1, cuts);
      c.m.clipId = clip.id;
      return clip;
    });
    const tracked = job.clips.filter((c) => c.crop.mode === "track").length;
    const total = job.clips.reduce((s, c) => s + c.duration, 0);
    await finish(
      "clips",
      `${job.clips.length} clips · ${fmt(total)} total${isVerticalSource(meta.width, meta.height) ? " · source already vertical" : tracked ? ` · ${tracked} with subject tracking` : " · full-frame 9:16 layout"}`,
    );

    // 8. Generating titles ----------------------------------------------------------------------
    await begin("titles", "Writing titles, captions and hashtags from each clip's transcript…");
    const inputs: ClipTextInput[] = job.clips.map((c) => ({
      id: c.id,
      transcript: clipWords(transcript!.words, c.start, c.end).map((w) => w.text).join(" "),
      categories: c.categories,
      reason: c.reason,
      visual: job.moments.find((m) => m.id === c.momentId)?.visual ?? "",
      duration: c.duration,
      rank: job.ranking ? c.index : undefined,
    }));
    const { texts, compilationTitles } = await generateClipTexts(inputs, { ranking: job.options.mode === "ranking" });
    for (const c of job.clips) applyText(c, texts[c.id]);
    job.compilationTitles = compilationTitles;
    job.compilationTitle = compilationTitles[0] ?? "";
    await finish("titles", `${job.clips.length * 3} title options · captions · hashtags`);

    // 9. Preparing exports ----------------------------------------------------------------------
    await begin("export", "Rendering 9:16 exports with subtitles and overlays…");
    for (let i = 0; i < job.clips.length; i++) {
      const c = job.clips[i];
      const label = `Rendering clip ${i + 1} of ${job.clips.length}`;
      c.render = { state: "rendering", progress: 0 };
      const res = await renderOne(job, c, meta, transcript.words, (f) => {
        c.render.progress = f;
        update("export", (i + f) / job.clips.length, `${label} — ${Math.round(f * 100)}%`);
      });
      c.render = { state: "done", progress: 1, hash: res.hash, url: res.url };
      c.url = res.url;
      await save(true);
    }
    await fs.rm(path.join(dir, "fonts"), { recursive: true, force: true });
    await fs.rm(path.join(dir, "work"), { recursive: true, force: true });
    await finish("export", `${job.clips.length} MP4s · 1080×1920 · H.264/AAC`);

    job.stage = "done";
    job.progress = 100;
    job.message = "Your clips are ready";
    await save(true);
  } catch (err) {
    console.error(`[clipforge] job ${job.id} failed:`, err);
    job.stage = "error";
    job.error = friendlyError(err);
    job.message = "Something went wrong";
    for (const s of STAGES) if (job.steps[s.key]?.status === "active") job.steps[s.key] = { ...job.steps[s.key], status: "pending" };
    await save(true);
  }
}

export function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: number })?.status;
  if (status === 401) {
    const key = err instanceof OpenAI.APIError ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";
    return `Your ${key} was rejected (401). Check it in .env.local and restart the server.`;
  }
  if (status === 429)
    return "An AI provider rate-limited or ran out of credit (429). Wait a moment or check your billing, then try again.";
  if (status === 413) return "The audio file was too large for the transcription API.";
  return msg.length > 600 ? msg.slice(0, 600) + "…" : msg;
}
