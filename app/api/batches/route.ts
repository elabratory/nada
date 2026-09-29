import { z } from "zod";
import { createBatch } from "@/lib/batches";
import { OptionsSchema, isLocal, jsonError } from "@/lib/http";
import { checkUrl } from "@/lib/importer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ urls: z.array(z.string().min(4).max(2000)).min(1).max(20), options: OptionsSchema });

/** Processes several links in a row with the same settings (one ranking video per link). */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const missing = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"].filter((k) => !process.env[k]);
  if (missing.length) return Response.json({ error: "Add your API keys first.", needsKeys: true }, { status: 400 });
  try {
    const urls = [];
    for (const u of parsed.data.urls) urls.push(await checkUrl(u, isLocal(req)));
    return Response.json(await createBatch(urls, parsed.data.options));
  } catch (err) {
    return jsonError(err);
  }
}
