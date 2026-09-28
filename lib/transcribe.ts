import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { runFfmpeg } from "./ffmpeg";
import type { Transcript, Word } from "./types";

// Whisper accepts files up to 25 MB. 10-minute mono 32 kbps MP3 chunks are ~2.4 MB,
// so any video length works and chunks can be transcribed in parallel.
const CHUNK_SECONDS = 600;
const PARALLEL = 3;

function client(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set. Add it to .env.local and restart the server.");
  }
  return new OpenAI();
}

/** Extracts the audio track into small MP3 chunks. Returns chunk paths + their start offsets. */
export async function extractAudio(
  videoPath: string,
  outDir: string,
  duration: number,
  onProgress: (fraction: number) => void,
): Promise<{ file: string; offset: number }[]> {
  await fs.mkdir(outDir, { recursive: true });
  const chunks: { file: string; offset: number }[] = [];
  const count = Math.max(1, Math.ceil(duration / CHUNK_SECONDS));
  for (let i = 0; i < count; i++) {
    const offset = i * CHUNK_SECONDS;
    const file = path.join(outDir, `audio_${String(i).padStart(3, "0")}.mp3`);
    const len = Math.min(CHUNK_SECONDS, Math.max(1, duration - offset));
    await runFfmpeg(
      [
        "-y",
        "-ss",
        String(offset),
        "-t",
        String(len),
        "-i",
        videoPath,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-b:a",
        "32k",
        file,
      ],
      { duration: len, onProgress: (f) => onProgress((i + f) / count) },
    );
    chunks.push({ file, offset });
  }
  return chunks;
}

const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");

/**
 * Whisper's word timestamps come without punctuation. Re-attach punctuation/casing by
 * aligning the timestamped words against the punctuated full text.
 */
function attachPunctuation(words: { word: string; start: number; end: number }[], text: string): Word[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  let t = 0;
  return words.map((w) => {
    const target = normalize(w.word);
    for (let look = 0; look < 4 && t + look < tokens.length; look++) {
      if (normalize(tokens[t + look]) === target && target) {
        const tok = tokens[t + look];
        t += look + 1;
        return { text: tok, start: w.start, end: w.end };
      }
    }
    return { text: w.word.trim(), start: w.start, end: w.end };
  });
}

async function transcribeChunk(openai: OpenAI, file: string, offset: number) {
  const res = await openai.audio.transcriptions.create({
    file: createReadStream(file),
    model: "whisper-1",
    response_format: "verbose_json",
    timestamp_granularities: ["word", "segment"],
  });
  const words = attachPunctuation(res.words ?? [], res.text ?? "").map((w) => ({
    text: w.text,
    start: w.start + offset,
    end: w.end + offset,
  }));
  return { text: res.text ?? "", language: res.language ?? "unknown", words };
}

export async function transcribe(
  chunks: { file: string; offset: number }[],
  duration: number,
  onProgress: (fraction: number) => void,
): Promise<Transcript> {
  const openai = client();
  const results: Awaited<ReturnType<typeof transcribeChunk>>[] = new Array(chunks.length);
  let done = 0;
  let next = 0;
  async function worker() {
    while (next < chunks.length) {
      const i = next++;
      results[i] = await transcribeChunk(openai, chunks[i].file, chunks[i].offset);
      onProgress(++done / chunks.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, chunks.length) }, worker));

  const words = results.flatMap((r) => r.words).filter((w) => w.text && w.end >= w.start);
  return {
    language: results[0]?.language ?? "unknown",
    duration,
    text: results.map((r) => r.text.trim()).join(" "),
    words,
  };
}
