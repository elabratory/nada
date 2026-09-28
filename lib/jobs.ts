import { promises as fs } from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { buildSentences, findBestMoments } from "./analyze";
import { renderClip } from "./render";
import { locateSpeaker } from "./speaker";
import { jobDir, mediaUrl, newId, readJson, uploadDir, writeJson } from "./storage";
import { extractAudio, transcribe } from "./transcribe";
import type { Clip, Job, JobOptions, JobStage, Transcript, VideoMeta } from "./types";

// Overall progress budget for each stage (start %, end %).
const STAGE_RANGE: Record<Exclude<JobStage, "done" | "error" | "queued">, [number, number]> = {
  audio: [2, 12],
  transcribe: [12, 40],
  analyze: [40, 52],
  render: [52, 99],
};

export async function getVideo(videoId: string): Promise<VideoMeta | null> {
  return readJson<VideoMeta>(path.join(uploadDir(videoId), "meta.json"));
}

export function videoFile(meta: VideoMeta): string {
  return path.join(uploadDir(meta.id), `source.${meta.ext}`);
}

export async function getJob(jobId: string): Promise<Job | null> {
  return readJson<Job>(path.join(jobDir(jobId), "job.json"));
}

export async function createJob(options: JobOptions): Promise<Job> {
  const job: Job = {
    id: newId(),
    options,
    stage: "queued",
    progress: 0,
    message: "Getting ready…",
    clips: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await writeJson(path.join(jobDir(job.id), "job.json"), job);
  // Fire and forget: the pipeline runs in this server process; the client polls job.json.
  void runJob(job).catch(() => {});
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
      .then(() => writeJson(path.join(dir, "job.json"), snapshot))
      .catch((err) => console.error("[clipforge] could not save job state:", err));
    return queue;
  };
  const setStage = async (stage: keyof typeof STAGE_RANGE, message: string, fraction = 0) => {
    const [a, b] = STAGE_RANGE[stage];
    job.stage = stage;
    job.message = message;
    job.progress = Math.round(a + (b - a) * Math.min(1, Math.max(0, fraction)));
    await save(fraction === 0 || fraction === 1);
  };

  try {
    const meta = await getVideo(job.options.videoId);
    if (!meta) throw new Error("Uploaded video not found. Please upload it again.");
    const source = videoFile(meta);
    if (!meta.hasAudio) throw new Error("This video has no audio track, so there is nothing to transcribe.");

    // 1–2. Audio + transcript (cached per video so "Generate Again" is fast).
    const transcriptFile = path.join(uploadDir(meta.id), "transcript.json");
    let transcript = await readJson<Transcript>(transcriptFile);
    if (!transcript) {
      await setStage("audio", "Extracting audio…");
      const audioDir = path.join(uploadDir(meta.id), "audio");
      const chunks = await extractAudio(
        source,
        audioDir,
        meta.duration,
        (f) => void setStage("audio", "Extracting audio…", f),
      );
      await setStage("transcribe", "Transcribing speech with timestamps…");
      transcript = await transcribe(
        chunks,
        meta.duration,
        (f) => void setStage("transcribe", `Transcribing speech… ${Math.round(f * 100)}%`, f),
      );
      await writeJson(transcriptFile, transcript);
      await fs.rm(audioDir, { recursive: true, force: true });
    }
    if (transcript.words.length < 10) {
      throw new Error("We couldn't detect enough speech in this video to find clips.");
    }

    // 3. Pick the best moments.
    await setStage("analyze", "Reading the transcript and finding the best moments…");
    const sentences = buildSentences(transcript);
    const picks = await findBestMoments(sentences, job.options.count, job.options.style, meta.duration);
    if (picks.length === 0) throw new Error("No strong clip candidates were found in this video.");
    await setStage("analyze", `Found ${picks.length} great moments`, 1);

    // 4–5. Reframe, caption, encode.
    for (let i = 0; i < picks.length; i++) {
      const p = picks[i];
      const label = `Creating clip ${i + 1} of ${picks.length}`;
      const base = (f: number) => (i + f) / picks.length;

      let speakerX: number | null = null;
      const isLandscape = meta.width / meta.height > 0.65;
      if (job.options.framing === "speaker" && isLandscape) {
        await setStage("render", `${label} — locating the speaker…`, base(0.02));
        try {
          speakerX = await locateSpeaker(source, dir, p.start, p.end, `clip_${i + 1}`);
        } catch (err) {
          console.warn("[clipforge] speaker detection failed, using fit layout:", err);
        }
      }

      await setStage("render", `${label} — cutting, framing & burning captions…`, base(0.1));
      const baseName = `clip_${i + 1}`;
      await renderClip({
        videoPath: source,
        srcW: meta.width,
        srcH: meta.height,
        hasAudio: meta.hasAudio,
        start: p.start,
        end: p.end,
        words: transcript.words,
        speakerX,
        workDir: dir,
        baseName,
        onProgress: (f) => void setStage("render", `${label} — encoding ${Math.round(f * 100)}%`, base(0.1 + 0.9 * f)),
      });

      const clip: Clip = {
        id: `${job.id}-${i + 1}`,
        index: i + 1,
        title: p.title,
        hook: p.hook,
        reason: p.reason,
        score: p.score,
        start: p.start,
        end: p.end,
        duration: +(p.end - p.start).toFixed(2),
        url: mediaUrl("jobs", job.id, `${baseName}.mp4`),
        downloadName: `${String(i + 1).padStart(2, "0")}-${slug(p.title)}.mp4`,
      };
      job.clips.push(clip);
      await save(true);
    }

    await fs.rm(path.join(dir, "fonts"), { recursive: true, force: true });
    job.stage = "done";
    job.progress = 100;
    job.message = "Your clips are ready";
    await save(true);
  } catch (err) {
    console.error(`[clipforge] job ${job.id} failed:`, err);
    job.stage = "error";
    job.error = friendlyError(err);
    job.message = "Something went wrong";
    await save(true);
  }
}

function friendlyError(err: unknown): string {
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
