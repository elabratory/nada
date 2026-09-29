import { spawn } from "node:child_process";
import { createWriteStream, existsSync, promises as fs } from "node:fs";
import dns from "node:dns/promises";
import net from "node:net";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { ffmpegPath, probe, runFfmpeg } from "./ffmpeg";
import { mediaUrl, newId, readJson, uploadDir, writeJson } from "./storage";
import type { ImportStatus, VideoMeta } from "./types";

const MAX_BYTES = 4 * 1024 ** 3;
const DIRECT_EXT = new Set(["mp4", "mov", "webm", "m4v"]);

// ---------------------------------------------------------------------------------------------
// yt-dlp discovery (platform links). Checked in order: YTDLP_PATH, ./bin, PATH, python module.

let ytdlpCache: { cmd: string; args: string[] } | null | undefined;

function tryRun(cmd: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn(/*turbopackIgnore: true*/ cmd, [...args, "--version"], { stdio: "ignore" });
    p.on("error", () => resolve(false));
    p.on("close", (code) => resolve(code === 0));
  });
}

export async function findYtDlp(): Promise<{ cmd: string; args: string[] } | null> {
  if (ytdlpCache !== undefined) return ytdlpCache;
  const exe = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
  const candidates: { cmd: string; args: string[] }[] = [];
  if (process.env.YTDLP_PATH?.trim()) candidates.push({ cmd: process.env.YTDLP_PATH.trim(), args: [] });
  const local = path.join(process.cwd(), "bin", exe);
  if (existsSync(local)) candidates.push({ cmd: local, args: [] });
  candidates.push({ cmd: "yt-dlp", args: [] });
  candidates.push({ cmd: process.platform === "win32" ? "python" : "python3", args: ["-m", "yt_dlp"] });
  for (const c of candidates) {
    if (await tryRun(c.cmd, c.args)) return (ytdlpCache = c);
  }
  ytdlpCache = null;
  return null;
}

// ---------------------------------------------------------------------------------------------

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.") || v.startsWith("::ffff:192.168.");
}

/** Rejects links that point into the local network unless the app itself is used from localhost. */
export async function checkUrl(raw: string, allowPrivate: boolean): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("That doesn't look like a valid link.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only http(s) links are supported.");
  if (!allowPrivate) {
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const addrs = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
    if (!addrs.length) throw new Error(`Couldn't resolve ${url.hostname}.`);
    if (addrs.some(isPrivateIp)) throw new Error("Links to private network addresses aren't allowed.");
  }
  return url;
}

const statusFile = (id: string) => path.join(uploadDir(id), "import.json");

export async function getImport(id: string): Promise<ImportStatus | null> {
  return readJson<ImportStatus>(statusFile(id));
}

export async function startImport(url: URL): Promise<ImportStatus> {
  const id = newId();
  const dir = uploadDir(id);
  await fs.mkdir(dir, { recursive: true });
  const status: ImportStatus = { id, url: url.toString(), state: "resolving", progress: 0, message: "Looking up the video…", updatedAt: Date.now() };
  await writeJson(statusFile(id), status);
  void runImport(status).catch(() => {});
  return status;
}

async function runImport(st: ImportStatus): Promise<void> {
  const dir = uploadDir(st.id);
  let last = 0;
  const save = (patch: Partial<ImportStatus>, force = false) => {
    Object.assign(st, patch, { updatedAt: Date.now() });
    if (!force && Date.now() - last < 400) return Promise.resolve();
    last = Date.now();
    return writeJson(statusFile(st.id), st);
  };
  try {
    const url = new URL(st.url);
    let file: string;
    let title: string | undefined;
    const direct = await probeDirect(url);
    if (direct) {
      file = await downloadDirect(url, dir, direct, (loaded, total) =>
        void save({ state: "downloading", progress: total ? Math.round((loaded / total) * 95) : 0, message: `Downloading… ${(loaded / 1024 ** 2).toFixed(1)}${total ? ` / ${(total / 1024 ** 2).toFixed(1)}` : ""} MB` }),
      );
      title = decodeURIComponent(url.pathname.split("/").pop() || "video").replace(/\.[a-z0-9]+$/i, "");
    } else {
      const yt = await findYtDlp();
      if (!yt) {
        throw new Error(
          "This link is a web page, not a video file. To import from YouTube, TikTok, Instagram, X, Twitch and similar sites, install yt-dlp (run `npm run setup:ytdlp`, or `pip install yt-dlp`) and restart the app — or download the video and upload the file.",
        );
      }
      await save({ state: "downloading", progress: 1, message: "Fetching video info…" }, true);
      const res = await downloadWithYtDlp(yt, url.toString(), dir, (pct, msg) => void save({ state: "downloading", progress: Math.round(pct * 0.95), message: msg }));
      file = res.file;
      title = res.title;
    }

    await save({ state: "processing", progress: 96, message: "Checking the video…" }, true);
    let ext = path.extname(file).slice(1).toLowerCase();
    if (!["mp4", "mov", "webm"].includes(ext)) {
      // Remux anything else (mkv, m4v…) to MP4 without re-encoding so browsers can play it.
      const out = path.join(dir, "source.mp4");
      await runFfmpeg(["-y", "-i", file, "-map", "0:v:0", "-map", "0:a:0?", "-c", "copy", "-movflags", "+faststart", out]);
      await fs.rm(file, { force: true });
      file = out;
      ext = "mp4";
    } else if (path.basename(file) !== `source.${ext}`) {
      await fs.rename(file, path.join(dir, `source.${ext}`));
      file = path.join(dir, `source.${ext}`);
    }
    const info = await probe(file);
    if (!info.hasVideo || !info.duration || !info.width) throw new Error("The downloaded file doesn't look like a playable video.");
    const size = (await fs.stat(file)).size;
    const meta: VideoMeta = {
      id: st.id,
      fileName: `${(title || "video").slice(0, 120)}.${ext}`,
      ext,
      size,
      duration: info.duration,
      width: info.width,
      height: info.height,
      hasAudio: info.hasAudio,
      url: mediaUrl("uploads", st.id, `source.${ext}`),
      createdAt: Date.now(),
      sourceUrl: st.url,
      title,
    };
    await writeJson(path.join(dir, "meta.json"), meta);
    await fs.rm(statusFile(st.id), { force: true });
  } catch (err) {
    console.error(`[clipforge] import ${st.id} failed:`, err);
    // Keep only the status file so the client can show the error.
    for (const f of await fs.readdir(dir).catch(() => [] as string[])) {
      if (f !== "import.json") await fs.rm(path.join(dir, f), { recursive: true, force: true });
    }
    await save({ state: "error", progress: 0, message: "Import failed", error: err instanceof Error ? err.message : String(err) }, true);
  }
}

/** A link is "direct" when it serves a video file itself (by content type or extension). */
async function probeDirect(url: URL): Promise<{ ext: string } | null> {
  const extFromPath = url.pathname.split(".").pop()?.toLowerCase() ?? "";
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(15000) });
    const type = res.headers.get("content-type")?.toLowerCase() ?? "";
    if (res.ok && type.startsWith("video/")) {
      const ext = type.includes("webm") ? "webm" : type.includes("quicktime") ? "mov" : "mp4";
      return { ext: DIRECT_EXT.has(extFromPath) && extFromPath !== "m4v" ? extFromPath : ext };
    }
    if (res.ok && type.includes("octet-stream") && DIRECT_EXT.has(extFromPath)) return { ext: extFromPath === "m4v" ? "mp4" : extFromPath };
  } catch {
    /* some servers reject HEAD; fall through */
  }
  return DIRECT_EXT.has(extFromPath) && !(await isHtml(url)) ? { ext: extFromPath === "m4v" ? "mp4" : extFromPath } : null;
}

async function isHtml(url: URL): Promise<boolean> {
  try {
    const res = await fetch(url, { headers: { range: "bytes=0-0" }, signal: AbortSignal.timeout(15000) });
    await res.body?.cancel();
    return (res.headers.get("content-type") ?? "").includes("text/html");
  } catch {
    return true;
  }
}

async function downloadDirect(url: URL, dir: string, d: { ext: string }, onProgress: (loaded: number, total: number) => void): Promise<string> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`The server answered ${res.status} ${res.statusText}.`);
  const total = Number(res.headers.get("content-length") || 0);
  if (total > MAX_BYTES) throw new Error("That video is larger than 4 GB.");
  const dest = path.join(dir, `source.${d.ext}`);
  let loaded = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      loaded += chunk.length;
      if (loaded > MAX_BYTES) return cb(new Error("That video is larger than 4 GB."));
      onProgress(loaded, total);
      cb(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(res.body as unknown as WebReadableStream), counter, createWriteStream(dest));
  return dest;
}

function downloadWithYtDlp(
  yt: { cmd: string; args: string[] },
  url: string,
  dir: string,
  onProgress: (pct: number, message: string) => void,
): Promise<{ file: string; title?: string }> {
  return new Promise((resolve, reject) => {
    const args = [
      ...yt.args,
      url,
      "--no-playlist",
      "--newline",
      "--progress",
      "--no-simulate",
      "--no-mtime",
      "-f",
      "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/bv*[height<=1080]+ba/b[height<=1080]/b",
      "--merge-output-format",
      "mp4",
      "--ffmpeg-location",
      ffmpegPath(),
      "--max-filesize",
      "4G",
      "-o",
      path.join(dir, "download.%(ext)s"),
      "--progress-template",
      "download:CFPROG %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s",
      "--print",
      "before_dl:CFTITLE %(title)s",
      "--print",
      "after_move:CFFILE %(filepath)s",
    ];
    const p = spawn(/*turbopackIgnore: true*/ yt.cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let title: string | undefined;
    let file: string | undefined;
    let part = 0;
    let lastLoaded = 0;
    let err = "";
    let out = "";
    const onLine = (line: string) => {
      const prog = line.match(/^CFPROG (\S+) (\S+) (\S+)/);
      if (prog) {
        const loaded = Number(prog[1]) || 0;
        const total = Number(prog[2]) || Number(prog[3]) || 0;
        if (loaded < lastLoaded) part++;
        lastLoaded = loaded;
        const frac = total ? loaded / total : 0;
        // Video and audio usually download separately: first ~80 %, then the rest.
        const pct = part === 0 ? frac * 80 : 80 + Math.min(1, frac) * 18;
        onProgress(pct, `Downloading${part ? " audio" : ""}… ${(loaded / 1024 ** 2).toFixed(1)}${total ? ` / ${(total / 1024 ** 2).toFixed(1)}` : ""} MB`);
        return;
      }
      if (line.startsWith("CFTITLE ")) title = line.slice(8).trim();
      else if (line.startsWith("CFFILE ")) file = line.slice(7).trim();
      else if (/\[Merger\]|\[VideoRemuxer\]/.test(line)) onProgress(98, "Merging video and audio…");
    };
    let buf = "";
    p.stdout.on("data", (c: Buffer) => {
      out += c.toString();
      buf += c.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";
      lines.forEach(onLine);
    });
    p.stderr.on("data", (c: Buffer) => {
      err += c.toString();
      if (err.length > 50_000) err = err.slice(-20_000);
    });
    p.on("error", (e) => reject(new Error(`Could not start yt-dlp: ${e.message}`)));
    p.on("close", (code) => {
      if (buf) onLine(buf);
      if (code === 0 && file && existsSync(file)) return resolve({ file, title });
      const msg = (err.match(/ERROR: (.*)/g) ?? []).pop()?.replace(/^ERROR:\s*/, "") ?? err.trim().split("\n").pop() ?? out.trim().split("\n").pop();
      reject(new Error(`Couldn't download that link: ${msg || `yt-dlp exited with code ${code}`}`));
    });
  });
}
