import { jsonError } from "@/lib/http";
import { friendlyError, promoteMoment } from "@/lib/jobs";
import { isValidId } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Turns a scored candidate moment into a clip. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string; momentId: string }> }) {
  const { id, momentId } = await ctx.params;
  if (!isValidId(id) || !isValidId(momentId)) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    return Response.json(await promoteMoment(id, momentId));
  } catch (err) {
    return jsonError(new Error(friendlyError(err)));
  }
}
