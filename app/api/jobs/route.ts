import { z } from "zod";
import { createJob, getVideo } from "@/lib/jobs";
import { isValidId } from "@/lib/storage";
import { CLIP_STYLES, FRAMINGS } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  videoId: z.string().refine(isValidId),
  count: z.union([z.literal(3), z.literal(5), z.literal(10)]),
  style: z.enum(CLIP_STYLES),
  framing: z.enum(FRAMINGS).default("speaker"),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });

  const missing = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"].filter((k) => !process.env[k]);
  if (missing.length) {
    return Response.json(
      {
        error: `Missing ${missing.join(" and ")}. Add ${missing.length > 1 ? "them" : "it"} to .env.local and restart \`npm run dev\`.`,
      },
      { status: 500 },
    );
  }
  if (!(await getVideo(parsed.data.videoId))) {
    return Response.json({ error: "Video not found. Please upload it again." }, { status: 404 });
  }
  const job = await createJob(parsed.data);
  return Response.json(job);
}
