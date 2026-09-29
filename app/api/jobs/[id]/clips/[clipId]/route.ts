import { z } from "zod";
import { jsonError } from "@/lib/http";
import { editClip, getJob } from "@/lib/jobs";
import { isValidId } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Patch = z.object({
  start: z.number().min(0).optional(),
  end: z.number().min(0).optional(),
  title: z.string().max(200).optional(),
  shortTitle: z.string().max(80).optional(),
  caption: z.string().max(2000).optional(),
  hashtags: z.array(z.string().max(60)).max(8).optional(),
  overlayText: z.enum(["title", "short"]).optional(),
  cropX: z.number().min(0).max(1).nullable().optional(),
});

/** Manual edits to one clip: trim, title, caption, hashtags, overlay text, crop focus. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; clipId: string }> }) {
  const { id, clipId } = await ctx.params;
  if (!isValidId(id)) return Response.json({ error: "Job not found" }, { status: 404 });
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  try {
    const job = await getJob(id);
    if (!job) return Response.json({ error: "Job not found" }, { status: 404 });
    if (job.stage !== "done") return Response.json({ error: "Wait for processing to finish first." }, { status: 409 });
    return Response.json(await editClip(id, clipId, parsed.data));
  } catch (err) {
    return jsonError(err);
  }
}
