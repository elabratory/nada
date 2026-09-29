import { z } from "zod";
import { OverlaySchema, SubtitleSchema, jsonError } from "@/lib/http";
import { getJob, reorderClips, updateJob } from "@/lib/jobs";
import { isValidId } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const job = isValidId(id) ? await getJob(id) : null;
  if (!job) return Response.json({ error: "Job not found" }, { status: 404 });
  return Response.json(job, { headers: { "Cache-Control": "no-store" } });
}

const Patch = z.object({
  ranking: z.boolean().optional(),
  overlay: OverlaySchema.partial().optional(),
  subtitles: SubtitleSchema.partial().optional(),
  order: z.array(z.string().max(80)).max(50).optional(),
  compilationTitle: z.string().max(140).optional(),
});

/** Job-wide edits: ranking mode, overlay/subtitle style, clip order (ranking), countdown title. */
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!isValidId(id)) return Response.json({ error: "Job not found" }, { status: 404 });
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  const p = parsed.data;
  try {
    const current = await getJob(id);
    if (!current) return Response.json({ error: "Job not found" }, { status: 404 });
    if (current.stage !== "done") return Response.json({ error: "Wait for processing to finish first." }, { status: 409 });
    let job = await updateJob(id, (j) => {
      if (p.ranking !== undefined) j.ranking = p.ranking;
      if (p.overlay) j.overlay = { ...j.overlay, ...p.overlay };
      if (p.subtitles) j.subtitles = { ...j.subtitles, ...p.subtitles };
      if (p.compilationTitle !== undefined) j.compilationTitle = p.compilationTitle.trim();
    });
    if (p.order) job = await reorderClips(id, p.order);
    return Response.json(job);
  } catch (err) {
    return jsonError(err);
  }
}
