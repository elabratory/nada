import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import ffmpegStatic from "ffmpeg-static";

export function ffmpegPath(): string {
  const custom = process.env.FFMPEG_PATH?.trim();
  if (custom) return custom;
  if (ffmpegStatic && existsSync(ffmpegStatic)) return ffmpegStatic;
  // Last resort: whatever `ffmpeg` is on PATH.
  return "ffmpeg";
}

interface RunOptions {
  cwd?: string;
  /** Expected output duration in seconds, used to compute progress. */
  duration?: number;
  onProgress?: (fraction: number) => void;
  /** Called with every complete stderr line (for filters that log per-frame analysis). */
  onLine?: (line: string) => void;
}

/** Runs ffmpeg and resolves with its stderr. Rejects with the tail of stderr on failure. */
export function runFfmpeg(args: string[], opts: RunOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(/*turbopackIgnore: true*/ ffmpegPath(), ["-hide_banner", "-nostdin", ...args], {
      cwd: opts.cwd,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    let partial = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      if (opts.onLine) {
        const lines = (partial + text).split(/\r?\n|\r/);
        partial = lines.pop() ?? "";
        for (const l of lines) opts.onLine(l);
      }
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
      if (opts.onProgress && opts.duration) {
        const matches = [...text.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
        const last = matches[matches.length - 1];
        if (last) {
          const t = +last[1] * 3600 + +last[2] * 60 + +last[3];
          opts.onProgress(Math.min(1, t / opts.duration));
        }
      }
    });
    proc.on("error", (err) => {
      reject(new Error(`Could not start FFmpeg (${ffmpegPath()}): ${err.message}`));
    });
    proc.on("close", (code) => {
      if (partial && opts.onLine) opts.onLine(partial);
      if (code === 0) resolve(stderr);
      else {
        const tail = stderr.trim().split("\n").slice(-8).join("\n");
        reject(new Error(`FFmpeg exited with code ${code}:\n${tail}`));
      }
    });
  });
}

export interface ProbeResult {
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
  hasVideo: boolean;
}

/** Reads basic stream info by parsing `ffmpeg -i` output (avoids needing ffprobe). */
export async function probe(file: string): Promise<ProbeResult> {
  // `ffmpeg -i <file>` with no output exits non-zero, but prints stream info to stderr.
  const out = await new Promise<string>((resolve, reject) => {
    const proc = spawn(/*turbopackIgnore: true*/ ffmpegPath(), ["-hide_banner", "-i", file], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    proc.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
    proc.on("error", (err) => reject(new Error(`Could not start FFmpeg (${ffmpegPath()}): ${err.message}`)));
    proc.on("close", () => resolve(stderr));
  });

  const dur = out.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const duration = dur ? +dur[1] * 3600 + +dur[2] * 60 + +dur[3] : 0;

  const videoLine = out.split("\n").find((l) => /Stream #.*Video:/.test(l) && !/attached pic/.test(l));
  let width = 0;
  let height = 0;
  if (videoLine) {
    const size = videoLine.match(/,\s*(\d{2,5})x(\d{2,5})/);
    if (size) {
      width = +size[1];
      height = +size[2];
    }
  }
  // Respect rotation metadata from phones (portrait videos stored as landscape).
  const rotate = out.match(/rotate\s*:\s*(-?\d+)/) || out.match(/rotation of (-?\d+(?:\.\d+)?)/);
  if (rotate && Math.abs(Math.round(+rotate[1])) % 180 === 90) {
    [width, height] = [height, width];
  }

  return {
    duration,
    width,
    height,
    hasVideo: Boolean(videoLine),
    hasAudio: /Stream #.*Audio:/.test(out),
  };
}
