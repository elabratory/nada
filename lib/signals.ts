import { promises as fs } from "node:fs";
import path from "node:path";
import { runFfmpeg } from "./ffmpeg";
import type { AudioSignals, VideoSignals } from "./types";

const FLOOR = -70;

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))];
}

/**
 * Measures loudness every 100 ms (EBU R128 momentary loudness) and finds silences, in one
 * audio-only FFmpeg pass. Only the audio stream is decoded, so this is fast even for long videos.
 */
export async function analyzeAudio(videoPath: string, duration: number, onProgress: (f: number) => void): Promise<AudioSignals> {
  const loudness: number[] = [];
  const silences: [number, number][] = [];
  let silenceStart: number | null = null;
  await runFfmpeg(["-i", videoPath, "-vn", "-af", "ebur128=framelog=info,silencedetect=n=-38dB:d=0.35", "-f", "null", "-"], {
    duration,
    onProgress,
    onLine: (line) => {
      const m = line.match(/\bt:\s*([\d.]+)\s+TARGET:.*?M:\s*(-?[\d.]+|-inf|nan)/);
      if (m) {
        const idx = Math.round(+m[1] / 0.1) - 1;
        const v = Number.isFinite(+m[2]) ? Math.max(FLOOR, +m[2]) : FLOOR;
        if (idx >= 0) loudness[idx] = v;
        return;
      }
      const s = line.match(/silence_start:\s*(-?[\d.]+)/);
      if (s) silenceStart = Math.max(0, +s[1]);
      const e = line.match(/silence_end:\s*([\d.]+)/);
      if (e && silenceStart !== null) {
        silences.push([silenceStart, +e[1]]);
        silenceStart = null;
      }
    },
  });
  if (silenceStart !== null) silences.push([silenceStart, duration]);
  for (let i = 0; i < loudness.length; i++) if (loudness[i] === undefined) loudness[i] = FLOOR;
  const voiced = loudness.filter((v) => v > -50);
  return {
    step: 0.1,
    loudness: loudness.map((v) => Math.round(v * 10) / 10),
    silences,
    median: percentile(voiced.length ? voiced : loudness, 0.5),
    p90: percentile(voiced.length ? voiced : loudness, 0.9),
  };
}

/**
 * Samples the picture 4× per second at thumbnail size and records scene cuts (FFmpeg scdet)
 * and how much the image changes between samples (signalstats YDIF, a motion measure).
 */
export async function analyzeVideo(
  videoPath: string,
  workDir: string,
  duration: number,
  onProgress: (f: number) => void,
): Promise<VideoSignals> {
  await fs.mkdir(workDir, { recursive: true });
  const metaFile = "scenes_meta.txt";
  await runFfmpeg(
    [
      "-i",
      videoPath,
      "-an",
      "-sn",
      "-vf",
      `fps=4,scale=160:-2,scdet=threshold=10,signalstats,metadata=mode=print:file=${metaFile}`,
      "-f",
      "null",
      "-",
    ],
    { cwd: workDir, duration, onProgress },
  );
  const text = await fs.readFile(path.join(workDir, metaFile), "utf8").catch(() => "");
  await fs.rm(path.join(workDir, metaFile), { force: true });

  const motion: number[] = [];
  const scenes: { t: number; score: number }[] = [];
  let t = 0;
  let score = 0;
  for (const line of text.split("\n")) {
    const f = line.match(/^frame:\d+\s+pts:\S+\s+pts_time:([\d.]+)/);
    if (f) {
      t = +f[1];
      continue;
    }
    const sc = line.match(/^lavfi\.scd\.score=([\d.]+)/);
    if (sc) score = +sc[1];
    else if (line.startsWith("lavfi.scd.time=")) scenes.push({ t, score: Math.round(score * 10) / 10 });
    else {
      const y = line.match(/^lavfi\.signalstats\.YDIF=([\d.]+)/);
      if (y) motion[Math.round(t * 4)] = Math.round(+y[1] * 100) / 100;
    }
  }
  for (let i = 0; i < motion.length; i++) if (motion[i] === undefined) motion[i] = 0;
  return { step: 0.25, motion, scenes, medianMotion: percentile(motion, 0.5) };
}

/** Loudness envelope at 2 samples/second for the editor timeline. */
export function envelope(a: AudioSignals, perSecond = 2): number[] {
  const n = Math.round(1 / a.step / perSecond);
  const out: number[] = [];
  for (let i = 0; i < a.loudness.length; i += n) {
    out.push(Math.max(...a.loudness.slice(i, i + n)));
  }
  return out;
}
