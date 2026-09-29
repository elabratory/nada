import { jsonError } from "@/lib/http";
import { friendlyError, regenerateTitles } from "@/lib/jobs";
import { isValidId } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Writes three new title options (plus caption, hashtags) from the clip's current transcript. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string; clipId: string }> }) {
  const { id, clipId } = await ctx.params;
  if (!isValidId(id)) return Response.json({ error: "Job not found" }, { status: 404 });
  try {
    return Response.json(await regenerateTitles(id, clipId));
  } catch (err) {
    return jsonError(new Error(friendlyError(err)));
  }
}
