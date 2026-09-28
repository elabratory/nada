import { createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { probe } from "@/lib/ffmpeg";
import { mediaUrl, newId, uploadDir, writeJson } from "@/lib/storage";
import type { VideoMeta } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["mp4", "mov", "webm"]);
const MAX_BYTES = 4 * 1024 ** 3; // 4 GB

/** Receives the raw file body (streamed straight to disk — no size-limited form parsing). */
export async function POST(req: Request) {
  const rawName = decodeURIComponent(req.headers.get("x-file-name") || "video.mp4");
  const fileName = path.basename(rawName).slice(0, 200);
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED.has(ext)) {
    return Response.json({ error: "Unsupported file type. Please upload an MP4, MOV or WebM video." }, { status: 400 });
  }
  if (!req.body) return Response.json({ error: "Empty upload." }, { status: 400 });

  const id = newId();
  const dir = uploadDir(id);
  await fs.mkdir(dir, { recursive: true });
  const dest = path.join(dir, `source.${ext}`);

  let size = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      size += chunk.length;
      if (size > MAX_BYTES) cb(new Error("File is larger than 4 GB."));
      else cb(null, chunk);
    },
  });

  try {
    await pipeline(Readable.fromWeb(req.body as unknown as WebReadableStream), limiter, createWriteStream(dest));
    const info = await probe(dest);
    if (!info.hasVideo || !info.duration || !info.width) {
      throw new Error("That file doesn't look like a playable video.");
    }
    const meta: VideoMeta = {
      id,
      fileName,
      ext,
      size,
      duration: info.duration,
      width: info.width,
      height: info.height,
      hasAudio: info.hasAudio,
      url: mediaUrl("uploads", id, `source.${ext}`),
      createdAt: Date.now(),
    };
    await writeJson(path.join(dir, "meta.json"), meta);
    return Response.json(meta);
  } catch (err) {
    await fs.rm(dir, { recursive: true, force: true });
    const message = err instanceof Error ? err.message : "Upload failed.";
    return Response.json({ error: message }, { status: 400 });
  }
}
