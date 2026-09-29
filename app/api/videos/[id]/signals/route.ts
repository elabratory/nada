import path from "node:path";
import { envelope } from "@/lib/signals";
import { readJson, isValidId, uploadDir } from "@/lib/storage";
import type { AudioSignals, VideoSignals } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Loudness envelope (2/s, LUFS) and scene-cut times for the editor timeline. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isValidId(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const a = await readJson<AudioSignals>(path.join(uploadDir(id), "signals_audio.json"));
  const v = await readJson<VideoSignals>(path.join(uploadDir(id), "signals_video.json"));
  return Response.json(
    { loudness: a ? envelope(a) : [], median: a?.median ?? -30, scenes: v?.scenes.map((s) => s.t) ?? [] },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
