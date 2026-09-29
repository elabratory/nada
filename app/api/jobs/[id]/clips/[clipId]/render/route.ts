import { jsonError } from "@/lib/http";
import { requestRender } from "@/lib/jobs";
import { isValidId } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Renders the clip with its current edits (returns immediately; progress is on the job). */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string; clipId: string }> }) {
  const { id, clipId } = await ctx.params;
  if (!isValidId(id)) return Response.json({ error: "Job not found" }, { status: 404 });
  try {
    const job = await requestRender(id, clipId);
    if (!job) return Response.json({ error: "Job not found" }, { status: 404 });
    return Response.json(job);
  } catch (err) {
    return jsonError(err);
  }
}
