import { getBatch } from "@/lib/batches";
import { getImport } from "@/lib/importer";
import { getJob, getVideo } from "@/lib/jobs";
import { isValidId } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Batch status with a live summary of each link's import, job and ranking video. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const batch = isValidId(id) ? await getBatch(id) : null;
  if (!batch) return Response.json({ error: "Batch not found" }, { status: 404 });
  const items = await Promise.all(
    batch.items.map(async (it) => {
      const video = it.videoId ? await getVideo(it.videoId) : null;
      const imp = it.videoId && !video ? await getImport(it.videoId) : null;
      const job = it.jobId ? await getJob(it.jobId) : null;
      return {
        ...it,
        video: video && { id: video.id, fileName: video.fileName, title: video.title, duration: video.duration },
        importing: imp && { state: imp.state, progress: imp.progress, message: imp.message },
        job: job && {
          id: job.id,
          stage: job.stage,
          progress: job.progress,
          message: job.message,
          clips: job.clips.length,
          compilation: job.compilation,
          compilationTitle: job.compilationTitle,
          topTitle: job.clips[0]?.title,
        },
      };
    }),
  );
  return Response.json({ ...batch, items }, { headers: { "Cache-Control": "no-store" } });
}
