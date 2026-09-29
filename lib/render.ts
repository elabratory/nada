import { promises as fs } from "node:fs";
import path from "node:path";
import { buildAss, type AssInput } from "./captions";
import { runFfmpeg } from "./ffmpeg";
import { CANVAS_H, CANVAS_W, cropWindow, even, isVerticalSource } from "./layout";
import { FONTS_DIR } from "./storage";
import type { Crop } from "./types";

const OUT_W = CANVAS_W;
const OUT_H = CANVAS_H;

/**
 * Video filter that turns the source into a 1080×1920 frame.
 * - vertical source: scale to fill.
 * - track: full-height 9:16 window that follows the subject shot by shot (crop x changes at
 *   the keyframe times, which sit on scene cuts, so the reframing is invisible).
 * - fit: whole frame centred over a blurred, zoomed copy of itself.
 * `clipStart` converts source-time keys to the clip's own timeline (t starts at 0 after -ss).
 */
export function layoutFilter(srcW: number, srcH: number, crop: Crop, clipStart: number): string {
  if (isVerticalSource(srcW, srcH) || crop.mode === "fill") {
    return `[0:v]scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=increase,crop=${OUT_W}:${OUT_H},setsar=1[base]`;
  }
  if (crop.mode === "track" || crop.manualX !== null) {
    const h = even(srcH);
    const w = cropWindow(srcW, srcH, 0.5).w;
    let xExpr: string;
    if (crop.manualX !== null || crop.keys.length <= 1) {
      xExpr = String(cropWindow(srcW, srcH, crop.manualX ?? crop.keys[0]?.x ?? 0.5).x);
    } else {
      // Nested if(lt(t,T),X,…) — commas escaped for the filtergraph parser.
      const keys = crop.keys.map((k) => ({ t: Math.max(0, k.t - clipStart), x: cropWindow(srcW, srcH, k.x).x }));
      xExpr = String(keys[keys.length - 1].x);
      for (let i = keys.length - 1; i >= 1; i--) xExpr = `if(lt(t\\,${keys[i].t.toFixed(3)})\\,${keys[i - 1].x}\\,${xExpr})`;
    }
    return `[0:v]crop=${w}:${h}:${xExpr}:0,scale=${OUT_W}:${OUT_H},setsar=1[base]`;
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
  crop: Crop;
  ass: Omit<AssInput, "clipStart" | "clipEnd">;
  workDir: string;
  outName: string; // e.g. "clip_1_ab12cd34.mp4"
  onProgress?: (fraction: number) => void;
}

async function ensureFonts(workDir: string) {
  const fontsDir = path.join(workDir, "fonts");
  await fs.mkdir(fontsDir, { recursive: true });
  for (const f of await fs.readdir(FONTS_DIR)) {
    if (f.endsWith(".ttf") || f.endsWith(".otf")) {
      await fs.copyFile(path.join(FONTS_DIR, f), path.join(fontsDir, f)).catch(() => {});
    }
  }
}

/** Cuts, reframes to 9:16, burns in subtitles + the centred overlay. Returns the output path. */
export async function renderClip(input: RenderInput): Promise<string> {
  const { workDir, outName } = input;
  const duration = input.end - input.start;

  // libass needs the fonts on disk; keep everything relative to the job folder so filter
  // paths never contain drive letters or special characters (Windows-safe).
  await ensureFonts(workDir);
  const base = outName.replace(/\.mp4$/, "");
  const assName = `${base}.ass`;
  await fs.writeFile(path.join(workDir, assName), buildAss({ ...input.ass, clipStart: input.start, clipEnd: input.end }), "utf8");

  const graph = `${layoutFilter(input.srcW, input.srcH, input.crop, input.start)};[base]fps=30,subtitles=${assName}:fontsdir=fonts[v]`;
  const tmpName = `${base}.part.mp4`;
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
    ...(input.hasAudio ? ["-map", "0:a:0", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2"] : []),
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
    tmpName,
  ];
  try {
    await runFfmpeg(args, { cwd: workDir, duration, onProgress: input.onProgress });
    await fs.rename(path.join(workDir, tmpName), path.join(workDir, outName));
  } finally {
    await fs.rm(path.join(workDir, assName), { force: true });
    await fs.rm(path.join(workDir, tmpName), { force: true });
  }
  return path.join(workDir, outName);
}

/** Joins already-rendered clips (same encoding settings) into one video without re-encoding. */
export async function concatClips(workDir: string, files: string[], outName: string, totalDuration: number, onProgress?: (f: number) => void) {
  const list = `${outName}.txt`;
  await fs.writeFile(path.join(workDir, list), files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n") + "\n");
  const tmp = outName.replace(/\.mp4$/, ".part.mp4");
  try {
    await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", tmp], {
      cwd: workDir,
      duration: totalDuration,
      onProgress,
    });
    await fs.rename(path.join(workDir, tmp), path.join(workDir, outName));
  } finally {
    await fs.rm(path.join(workDir, list), { force: true });
    await fs.rm(path.join(workDir, tmp), { force: true });
  }
}
