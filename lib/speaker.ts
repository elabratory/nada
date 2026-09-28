import { promises as fs } from "node:fs";
import path from "node:path";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { anthropic, claudeModel, withFallbacks } from "./analyze";
import { runFfmpeg } from "./ffmpeg";

const SpeakerSchema = z.object({
  person_visible: z.boolean().describe("True if at least one person is clearly visible in the frames"),
  speaker_center_x: z
    .number()
    .describe(
      "Horizontal centre of the main speaker's face as a fraction of frame width: 0 = left edge, 1 = right edge",
    ),
});

/**
 * Finds where the main speaker is horizontally, so the 9:16 crop can keep them in frame.
 * Samples three frames across the clip and asks Claude's vision model. Returns null when
 * nobody is visible (the caller then falls back to the full-frame "fit" layout).
 */
export async function locateSpeaker(
  videoPath: string,
  workDir: string,
  clipStart: number,
  clipEnd: number,
  tag: string,
): Promise<number | null> {
  const times = [0.2, 0.5, 0.8].map((f) => clipStart + (clipEnd - clipStart) * f);
  const images: string[] = [];
  for (let i = 0; i < times.length; i++) {
    const file = path.join(workDir, `${tag}_frame${i}.jpg`);
    await runFfmpeg([
      "-y",
      "-ss",
      times[i].toFixed(2),
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-vf",
      "scale=640:-2",
      "-q:v",
      "4",
      file,
    ]);
    images.push((await fs.readFile(file)).toString("base64"));
    await fs.rm(file, { force: true });
  }

  const res = await withFallbacks((fb) =>
    anthropic().beta.messages.parse({
      ...fb,
      model: claudeModel(),
      max_tokens: 2000,
      output_config: { effort: "low", format: betaZodOutputFormat(SpeakerSchema) },
      messages: [
        {
          role: "user",
          content: [
            ...images.map((data) => ({
              type: "image" as const,
              source: { type: "base64" as const, media_type: "image/jpeg" as const, data },
            })),
            {
              type: "text",
              text: "These are three frames from the same video clip. We will crop it to a vertical 9:16 frame. Where is the main speaker (the person talking, or the most prominent person)? Give the horizontal centre of their face as a fraction of the frame width. If several people appear, choose the one most central to the conversation.",
            },
          ],
        },
      ],
    }),
  );

  const out = res.parsed_output;
  if (!out || !out.person_visible) return null;
  return Math.max(0, Math.min(1, out.speaker_center_x));
}
