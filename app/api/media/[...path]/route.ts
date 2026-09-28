import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { JOBS_DIR, UPLOADS_DIR, isValidId } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};
const FILE_RE = /^[a-z0-9_]+\.(mp4|mov|webm)$/;

/**
 * Pull-based file stream. Browsers cancel <video> range requests constantly while seeking;
 * this closes the file cleanly instead of enqueueing into an already-closed controller.
 */
function fileStream(file: string, range?: { start: number; end: number }): ReadableStream<Uint8Array> {
  const node = createReadStream(file, range);
  const it = node[Symbol.asyncIterator]();
  return new ReadableStream({
    async pull(controller) {
      try {
        const { value, done } = await it.next();
        if (done) controller.close();
        else controller.enqueue(new Uint8Array(value as Buffer));
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() {
      node.destroy();
    },
  });
}

/** Streams stored videos with HTTP Range support (needed for seeking in <video>). */
export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const parts = (await ctx.params).path;
  if (parts.length !== 3) return new Response("Not found", { status: 404 });
  const [kind, id, file] = parts;
  const root = kind === "uploads" ? UPLOADS_DIR : kind === "jobs" ? JOBS_DIR : null;
  if (!root || !isValidId(id) || !FILE_RE.test(file)) return new Response("Not found", { status: 404 });

  const full = path.join(root, id, file);
  const stat = await fs.stat(full).catch(() => null);
  if (!stat?.isFile()) return new Response("Not found", { status: 404 });

  const url = new URL(req.url);
  const headers = new Headers({
    "Content-Type": TYPES[file.split(".").pop()!] ?? "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  });
  if (url.searchParams.has("download")) {
    const name = (url.searchParams.get("name") || file).replace(/[^\w.\-]+/g, "_");
    headers.set("Content-Disposition", `attachment; filename="${name}"`);
  }

  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (range && (range[1] || range[2])) {
    let start = range[1] ? parseInt(range[1], 10) : stat.size - parseInt(range[2], 10);
    let end = range[1] && range[2] ? parseInt(range[2], 10) : stat.size - 1;
    start = Math.max(0, start);
    end = Math.min(end, stat.size - 1);
    if (start > end) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
    }
    headers.set("Content-Range", `bytes ${start}-${end}/${stat.size}`);
    headers.set("Content-Length", String(end - start + 1));
    return new Response(fileStream(full, { start, end }), { status: 206, headers });
  }

  headers.set("Content-Length", String(stat.size));
  return new Response(fileStream(full), { status: 200, headers });
}
