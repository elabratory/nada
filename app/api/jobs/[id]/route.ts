import { getJob } from "@/lib/jobs";
import { isValidId } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const job = isValidId(id) ? await getJob(id) : null;
  if (!job) return Response.json({ error: "Job not found" }, { status: 404 });
  return Response.json(job, { headers: { "Cache-Control": "no-store" } });
}
