import { z } from "zod";
import { OptionsSchema } from "@/lib/http";
import { createJob, getVideo } from "@/lib/jobs";
import { isValidId } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = OptionsSchema.extend({ videoId: z.string().refine(isValidId) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });

  const missing = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"].filter((k) => !process.env[k]);
  if (missing.length) {
    return Response.json({ error: "Add your API keys first.", needsKeys: true }, { status: 400 });
  }
  if (!(await getVideo(parsed.data.videoId))) {
    return Response.json({ error: "Video not found. Please upload it again." }, { status: 404 });
  }
  const job = await createJob(parsed.data);
  return Response.json(job);
}
