import { z } from "zod";
import { keyStatus, saveKeys } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Only the machine running ClipForge may change its keys.
function isLocal(req: Request): boolean {
  const host = (req.headers.get("host") ?? "").replace(/:\d+$/, "");
  return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(host);
}

/** Reports which keys are configured — never the keys themselves. */
export async function GET() {
  return Response.json(keyStatus(), { headers: { "Cache-Control": "no-store" } });
}

const Key = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_\-]{20,300}$/, "That doesn't look like an API key.")
  .optional()
  .or(z.literal("").transform(() => undefined));

const Body = z.object({
  OPENAI_API_KEY: Key.refine((v) => !v || v.startsWith("sk-"), "OpenAI keys start with “sk-”."),
  ANTHROPIC_API_KEY: Key.refine((v) => !v || v.startsWith("sk-ant-"), "Anthropic keys start with “sk-ant-”."),
});

export async function POST(req: Request) {
  if (!isLocal(req)) {
    return Response.json(
      { error: "Keys can only be changed from the computer running ClipForge (localhost)." },
      { status: 403 },
    );
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid key." }, { status: 400 });
  }
  await saveKeys(parsed.data);
  return Response.json(keyStatus());
}
