export const CLIP_COUNTS = [3, 5, 10] as const;
export type ClipCount = (typeof CLIP_COUNTS)[number];

export const CLIP_STYLES = ["funny", "educational", "high-energy", "best-moments"] as const;
export type ClipStyle = (typeof CLIP_STYLES)[number];

export const FRAMINGS = ["speaker", "fit"] as const;
export type Framing = (typeof FRAMINGS)[number];

export interface VideoMeta {
  id: string;
  fileName: string;
  ext: string;
  size: number;
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
  url: string;
  createdAt: number;
}

export interface JobOptions {
  videoId: string;
  count: ClipCount;
  style: ClipStyle;
  framing: Framing;
}

export type JobStage = "queued" | "audio" | "transcribe" | "analyze" | "render" | "done" | "error";

export interface Clip {
  id: string;
  index: number;
  title: string;
  hook: string;
  reason: string;
  score: number;
  start: number;
  end: number;
  duration: number;
  url: string;
  downloadName: string;
}

export interface Job {
  id: string;
  options: JobOptions;
  stage: JobStage;
  progress: number; // 0..100
  message: string;
  clips: Clip[];
  error?: string;
  createdAt: number;
  updatedAt: number;
}

/** One transcribed word, with punctuation re-attached, times in seconds. */
export interface Word {
  text: string;
  start: number;
  end: number;
}

export interface Transcript {
  language: string;
  duration: number;
  text: string;
  words: Word[];
}

export interface Sentence {
  index: number;
  start: number;
  end: number;
  text: string;
  firstWord: number;
  lastWord: number;
}
