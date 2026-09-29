import { z } from "zod";
import { isLocal, jsonError } from "@/lib/http";
import { checkUrl, startImport } from "@/lib/importer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ url: z.string().min(4).max(2000) });

/** Starts downloading a video from a link. Poll GET /api/videos/<id> for progress. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Paste a video link." }, { status: 400 });
  try {
    const url = await checkUrl(parsed.data.url, isLocal(req));
    return Response.json(await startImport(url));
  } catch (err) {
    return jsonError(err);
  }
}
