import { promises as fs } from "node:fs";
import path from "node:path";
import { buildAss } from "./captions";
import { runFfmpeg } from "./ffmpeg";
import { FONTS_DIR } from "./storage";
import type { Word } from "./types";

const OUT_W = 1080;
const OUT_H = 1920;

const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);

/**
 * Video filter that turns the source into a 1080x1920 frame.
 * - speakerX given: crop a 9:16 window centred on the speaker (full height).
 * - otherwise: "fit" — whole frame centred over a blurred, zoomed copy of itself.
 */
export function layoutFilter(srcW: number, srcH: number, speakerX: number | null): string {
  const srcAspect = srcW / srcH;
  const target = OUT_W / OUT_H;

  // Already (nearly) vertical: just fill.
  if (srcAspect <= target * 1.15) {
    return `[0:v]scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=increase,crop=${OUT_W}:${OUT_H},setsar=1[base]`;
  }

  if (speakerX !== null) {
    const cw = even(srcH * target);
    const x = even(Math.max(0, Math.min(srcW - cw, speakerX * srcW - cw / 2)));
    return `[0:v]crop=${cw}:${even(srcH)}:${x}:0,scale=${OUT_W}:${OUT_H},setsar=1[base]`;
  }

  return [
    `[0:v]split=2[bgsrc][fgsrc]`,
    `[bgsrc]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,boxblur=12:2,eq=brightness=-0.12:saturation=1.15,scale=${OUT_W}:${OUT_H},setsar=1[bg]`,
    `[fgsrc]scale=${OUT_W}:-2,setsar=1[fg]`,
    `[bg][fg]overlay=(W-w)/2:(H-h)/2[base]`,
  ].join(";");
}

export interface RenderInput {
  videoPath: string;
  srcW: number;
  srcH: number;
  hasAudio: boolean;
  start: number;
  end: number;
  words: Word[];
  speakerX: number | null;
  workDir: string;
  baseName: string; // e.g. "clip_1"
  onProgress?: (fraction: number) => void;
}

/** Cuts, reframes to 9:16, burns in captions. Returns the output file path. */
export async function renderClip(input: RenderInput): Promise<string> {
  const { workDir, baseName } = input;
  const duration = input.end - input.start;

  // libass needs the font on disk; keep everything relative to the job folder so
  // filter paths never contain drive letters or special characters (Windows-safe).
  const fontsDir = path.join(workDir, "fonts");
  await fs.mkdir(fontsDir, { recursive: true });
  for (const f of await fs.readdir(FONTS_DIR)) {
    if (f.endsWith(".ttf") || f.endsWith(".otf")) {
      const dest = path.join(fontsDir, f);
      await fs.copyFile(path.join(FONTS_DIR, f), dest).catch(() => {});
    }
  }

  const assName = `${baseName}.ass`;
  await fs.writeFile(path.join(workDir, assName), buildAss(input.words, input.start, input.end), "utf8");

  const graph = `${layoutFilter(input.srcW, input.srcH, input.speakerX)};[base]fps=30,subtitles=${assName}:fontsdir=fonts[v]`;
  const outName = `${baseName}.mp4`;

  const args = [
    "-y",
    "-ss",
    input.start.toFixed(3),
    "-t",
    duration.toFixed(3),
    "-i",
    input.videoPath,
    "-filter_complex",
    graph,
    "-map",
    "[v]",
    ...(input.hasAudio ? ["-map", "0:a:0", "-c:a", "aac", "-b:a", "160k", "-ar", "48000"] : []),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "21",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outName,
  ];

  await runFfmpeg(args, { cwd: workDir, duration, onProgress: input.onProgress });
  await fs.rm(path.join(workDir, assName), { force: true });
  return path.join(workDir, outName);
}
