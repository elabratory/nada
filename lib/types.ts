export const CLIP_COUNTS = [3, 5, 10] as const;
export type ClipCount = (typeof CLIP_COUNTS)[number];

export const CLIP_STYLES = ["funny", "educational", "high-energy", "best-moments"] as const;
export type ClipStyle = (typeof CLIP_STYLES)[number];

export const FRAMINGS = ["speaker", "fit"] as const;
export type Framing = (typeof FRAMINGS)[number];

/** "clips": separate shorts. "ranking": a ranked countdown (#N → #1) with a target total length. */
export const OUTPUT_MODES = ["clips", "ranking"] as const;
export type OutputMode = (typeof OUTPUT_MODES)[number];

export const CLIP_LENGTHS = ["auto", "short", "long"] as const;
export type ClipLength = (typeof CLIP_LENGTHS)[number];

export const RANKING_SECONDS = [30, 60, 90] as const;

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
  /** Set when the video was fetched from a link rather than uploaded. */
  sourceUrl?: string;
  title?: string;
}

/** Progress of a link import (storage/uploads/<id>/import.json until meta.json exists). */
export interface ImportStatus {
  id: string;
  url: string;
  state: "resolving" | "downloading" | "processing" | "error";
  progress: number; // 0..100
  message: string;
  error?: string;
  updatedAt: number;
}

export interface JobOptions {
  videoId: string;
  count: ClipCount;
  style: ClipStyle;
  framing: Framing;
  mode: OutputMode;
  length: ClipLength;
  /** Ranking mode: target length of the whole countdown video, in seconds. */
  rankingSeconds: number;
}

export const STAGES = [
  { key: "read", label: "Reading video" },
  { key: "audio", label: "Extracting audio" },
  { key: "transcribe", label: "Transcribing" },
  { key: "scenes", label: "Detecting scenes" },
  { key: "moments", label: "Finding interesting moments" },
  { key: "score", label: "Scoring moments" },
  { key: "clips", label: "Creating clips" },
  { key: "titles", label: "Generating titles" },
  { key: "export", label: "Preparing exports" },
] as const;
export type StageKey = (typeof STAGES)[number]["key"];
export type JobStage = "queued" | StageKey | "done" | "error";

export interface StageState {
  status: "pending" | "active" | "done";
  detail?: string;
  startedAt?: number;
  endedAt?: number;
}

export const MOMENT_CATEGORIES = [
  "funny",
  "unexpected",
  "argument",
  "reaction",
  "punchline",
  "important",
  "exciting",
  "shocking",
  "emotional",
  "major-event",
  "energy-shift",
  "conversation",
] as const;
export type MomentCategory = (typeof MOMENT_CATEGORIES)[number];

/** Every signal is 0–100. `visual` is null when no frame analysis was run for the moment. */
export interface SignalBreakdown {
  ai: number;
  hook: number;
  payoff: number;
  audio: number;
  energy: number;
  reaction: number;
  pause: number;
  scene: number;
  language: number;
  visual: number | null;
  signals: number; // weighted composite of the measured (non-AI) signals
}

export interface Evidence {
  t: number; // seconds in the source video
  kind: "audio" | "energy" | "reaction" | "pause" | "scene" | "language" | "visual" | "structure";
  label: string;
}

export interface Structure {
  hook: [number, number];
  context: [number, number] | null;
  payoff: [number, number];
}

export interface Moment {
  id: string;
  start: number;
  end: number;
  categories: MomentCategory[];
  reason: string;
  viralScore: number;
  breakdown: SignalBreakdown;
  evidence: Evidence[];
  structure: Structure;
  /** What a vision pass saw in the frames (empty if none). */
  visual: string;
  /** Subject boxes from the vision pass (fractions of width), reused for the 9:16 crop. */
  frames?: { t: number; l: number; r: number; p: boolean }[];
  selected: boolean;
  clipId?: string;
}

export interface CropKey {
  t: number; // source time the key starts applying from
  x: number; // horizontal centre of the subject, 0..1 of source width
}

export interface Crop {
  /** track: 9:16 window following the subject; fit: whole frame on blurred background; fill: source is already vertical. */
  mode: "track" | "fit" | "fill";
  keys: CropKey[];
  /** User override of the horizontal focus (0..1), or null to follow `keys`. */
  manualX: number | null;
}

export interface RenderState {
  state: "idle" | "queued" | "rendering" | "done" | "error";
  progress: number; // 0..1
  hash?: string;
  url?: string;
  error?: string;
}

export interface Clip {
  id: string;
  /** 1-based position in the list; in ranking mode this is the rank (#1 = strongest). */
  index: number;
  momentId?: string;
  title: string;
  titles: string[];
  shortTitle: string;
  caption: string;
  hashtags: string[];
  /** Words/phrases from the transcript to highlight in subtitles. */
  emphasis: string[];
  overlayText: "title" | "short";
  hook: string;
  reason: string;
  score: number;
  categories: MomentCategory[];
  breakdown?: SignalBreakdown;
  evidence: Evidence[];
  structure?: Structure;
  start: number;
  end: number;
  duration: number;
  crop: Crop;
  render: RenderState;
  /** Computed on read: true when the rendered file matches the current edits. */
  upToDate?: boolean;
  /** URL of the last rendered file (kept for older jobs too). */
  url: string;
  downloadName: string;
}

export type Weight = 500 | 700 | 800 | 900;

export interface OverlayStyle {
  enabled: boolean;
  showRank: boolean;
  showTitle: boolean;
  fontSize: number; // px on the 1080-wide canvas (CSS px size)
  fontWeight: Weight;
  uppercase: boolean;
  x: number; // anchor, % of width (50 = centre)
  y: number; // anchor, % of height (50 = centre)
  color: string; // #rrggbb
  rankColor: string;
  background: "none" | "box" | "band";
  bgColor: string;
  bgOpacity: number; // 0..100
  animation: "none" | "fade" | "pop" | "slide";
  effect: "none" | "shadow" | "outline" | "both";
  timing: "full" | "intro" | "dock";
}

export interface SubtitleStyle {
  enabled: boolean;
  preset: "bold" | "clean" | "boxed" | "karaoke";
  position: "bottom" | "lower" | "center" | "top";
  fontSize: number;
  fontWeight: Weight;
  uppercase: boolean;
  color: string;
  activeColor: string; // currently spoken word
  emphasisColor: string; // important words
  highlightActive: boolean;
  highlightEmphasis: boolean;
  maxWords: number;
  background: "none" | "box";
  effect: "none" | "shadow" | "outline" | "both";
}

export interface Compilation {
  state: "idle" | "rendering" | "done" | "error";
  progress: number;
  hash?: string;
  url?: string;
  duration?: number;
  error?: string;
}

export interface Job {
  id: string;
  options: JobOptions;
  stage: JobStage;
  progress: number; // 0..100
  message: string;
  steps: Partial<Record<StageKey, StageState>>;
  moments: Moment[];
  clips: Clip[];
  ranking: boolean;
  overlay: OverlayStyle;
  subtitles: SubtitleStyle;
  compilation: Compilation;
  /** Ranking mode: AI title options for the whole countdown video, and the chosen one. */
  compilationTitles: string[];
  compilationTitle: string;
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

/** Measured (non-AI) signals for a whole video. */
export interface AudioSignals {
  step: number; // seconds between loudness samples
  loudness: number[]; // momentary loudness (LUFS, floored at -70)
  silences: [number, number][];
  median: number;
  p90: number;
}

export interface VideoSignals {
  step: number; // seconds between motion samples
  motion: number[]; // mean frame difference (0..255)
  scenes: { t: number; score: number }[];
  medianMotion: number;
}
