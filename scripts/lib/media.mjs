// Shared helpers for the video build scripts (FFmpeg runner, time parsing, ASS text).
import { spawn } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const FONTS_DIR = path.join(ROOT, "assets", "fonts");

async function ffmpegPath() {
  if (process.env.FFMPEG_PATH?.trim()) return process.env.FFMPEG_PATH.trim();
  try {
    const mod = await import("ffmpeg-static");
    if (mod.default && existsSync(mod.default)) return mod.default;
  } catch {}
  return "ffmpeg";
}

const FFMPEG = await ffmpegPath();

export function run(args, cwd) {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, ["-hide_banner", "-nostdin", ...args], { cwd, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (c) => {
      stderr += c.toString();
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
    });
    proc.on("error", reject);
    proc.on("close", (code) => (code === 0 ? resolve(stderr) : reject(new Error(stderr.slice(-3000)))));
  });
}

export async function hasAudio(file) {
  const out = await run(["-i", file], undefined).catch((e) => e.message);
  return /Stream #\d+:\d+.*Audio:/.test(out);
}

/** "1:23", "1:02:03", "83.5" or 83.5 -> seconds. */
export function secs(v) {
  if (v === undefined || v === null || v === "") return 0;
  if (typeof v === "number") return v;
  return String(v)
    .split(":")
    .reduce((acc, part) => acc * 60 + Number(part), 0);
}

/**
 * Clip start/end can be a plain time, or a named mark from the timeline's "marks" map plus an
 * offset, e.g. "pinas-12" or "pinas+2.5". Marks let several segments (live + replay) share one
 * timestamp. Returns { t, missing } where missing names a mark that has no time set yet.
 */
export function resolveTime(v, marks) {
  const m = typeof v === "string" && v.trim().match(/^([a-z_][\w-]*?)\s*(?:([+-])\s*([\d.]+))?$/i);
  if (!m || !(m[1] in marks)) return { t: secs(v), missing: null };
  const offset = m[2] ? (m[2] === "-" ? -1 : 1) * Number(m[3]) : 0;
  const mark = marks[m[1]];
  if (mark === null || mark === undefined || mark === "") return { t: offset, missing: m[1] };
  return { t: secs(mark) + offset, missing: null };
}

export function ts(t) {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
}

export const esc = (s) => String(s).replace(/[{}\\]/g, "").replace(/\n/g, "\\N");

export const fmt = (t) => {
  const r = Math.round(t);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")}`;
};

/** Copies the bundled fonts next to the build files so libass filter paths stay relative. */
export async function copyFonts(workDir) {
  await fs.mkdir(path.join(workDir, "fonts"), { recursive: true });
  for (const f of await fs.readdir(FONTS_DIR)) {
    if (/\.(ttf|otf)$/.test(f)) await fs.copyFile(path.join(FONTS_DIR, f), path.join(workDir, "fonts", f));
  }
}

/** Mixes a looped music bed under `input`'s audio (or just copies it when there is no music). */
export async function finishWithMusic(workDir, input, output, music, volume, total) {
  if (music && existsSync(music)) {
    await run(
      [
        "-y", "-i", input, "-stream_loop", "-1", "-i", music,
        "-filter_complex", `[1:a]volume=${volume},afade=t=out:st=${Math.max(0, total - 3).toFixed(2)}:d=3[m];[0:a][m]amix=inputs=2:duration=first:normalize=0[a]`,
        "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", output,
      ],
      workDir,
    );
    return true;
  }
  await fs.copyFile(path.join(workDir, input), output);
  return false;
}
