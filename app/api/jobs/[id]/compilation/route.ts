import { jsonError } from "@/lib/http";
import { requestCompilation } from "@/lib/jobs";
import { isValidId } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Builds the ranked countdown video (#N → #1) from the clips' current edits. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isValidId(id)) return Response.json({ error: "Job not found" }, { status: 404 });
  try {
    const job = await requestCompilation(id);
    if (!job) return Response.json({ error: "Job not found" }, { status: 404 });
    return Response.json(job);
  } catch (err) {
    return jsonError(err);
  }
}
