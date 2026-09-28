import { getVideo } from "@/lib/jobs";
import { isValidId } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const video = isValidId(id) ? await getVideo(id) : null;
  if (!video) return Response.json({ error: "Video not found" }, { status: 404 });
  return Response.json(video);
}
