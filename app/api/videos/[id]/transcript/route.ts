import path from "node:path";
import { readJson, isValidId, uploadDir } from "@/lib/storage";
import type { Transcript } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Word-level transcript, used by the live preview for subtitles and by the trim editor. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isValidId(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const t = await readJson<Transcript>(path.join(uploadDir(id), "transcript.json"));
  if (!t) return Response.json({ error: "No transcript yet" }, { status: 404 });
  return Response.json({ language: t.language, words: t.words }, { headers: { "Cache-Control": "private, max-age=60" } });
}
