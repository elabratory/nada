import { getImport } from "@/lib/importer";
import { getVideo } from "@/lib/jobs";
import { isValidId } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The video's metadata, or (202) the progress of a link import that's still running. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isValidId(id)) return Response.json({ error: "Video not found" }, { status: 404 });
  const video = await getVideo(id);
  if (video) return Response.json(video, { headers: { "Cache-Control": "no-store" } });
  const imp = await getImport(id);
  if (imp) return Response.json({ importing: imp }, { status: 202, headers: { "Cache-Control": "no-store" } });
  return Response.json({ error: "Video not found" }, { status: 404 });
}
