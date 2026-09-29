// Shared by the browser and the server — no Node imports here.
import type { Clip, Crop, Job, JobOptions, OverlayStyle, StageKey, SubtitleStyle } from "./types";
import { STAGES } from "./types";

export const DEFAULT_OVERLAY: OverlayStyle = {
  enabled: true,
  showRank: true,
  showTitle: true,
  fontSize: 64,
  fontWeight: 900,
  uppercase: true,
  x: 50,
  y: 50,
  color: "#ffffff",
  rankColor: "#ff6a3d",
  background: "none",
  bgColor: "#000000",
  bgOpacity: 55,
  animation: "pop",
  effect: "both",
  timing: "full",
};

export const SUBTITLE_PRESETS: Record<SubtitleStyle["preset"], Partial<SubtitleStyle>> = {
  bold: {
    fontWeight: 900,
    uppercase: true,
    color: "#ffffff",
    activeColor: "#ff6a3d",
    emphasisColor: "#ffd23f",
    highlightActive: true,
    highlightEmphasis: true,
    maxWords: 3,
    background: "none",
    effect: "both",
  },
  clean: {
    fontWeight: 700,
    uppercase: false,
    color: "#ffffff",
    activeColor: "#ffffff",
    emphasisColor: "#ffd23f",
    highlightActive: false,
    highlightEmphasis: true,
    maxWords: 5,
    background: "none",
    effect: "shadow",
  },
  boxed: {
    fontWeight: 800,
    uppercase: false,
    color: "#ffffff",
    activeColor: "#ffd23f",
    emphasisColor: "#ffd23f",
    highlightActive: false,
    highlightEmphasis: true,
    maxWords: 4,
    background: "box",
    effect: "none",
  },
  karaoke: {
    fontWeight: 900,
    uppercase: true,
    color: "#ffffff",
    activeColor: "#3ddc97",
    emphasisColor: "#3ddc97",
    highlightActive: true,
    highlightEmphasis: false,
    maxWords: 2,
    background: "none",
    effect: "outline",
  },
};

export const DEFAULT_SUBTITLES: SubtitleStyle = {
  enabled: true,
  preset: "bold",
  position: "lower",
  fontSize: 60,
  fontWeight: 900,
  uppercase: true,
  color: "#ffffff",
  activeColor: "#ff6a3d",
  emphasisColor: "#ffd23f",
  highlightActive: true,
  highlightEmphasis: true,
  maxWords: 3,
  background: "none",
  effect: "both",
};

export const SUBTITLE_Y: Record<SubtitleStyle["position"], number> = {
  top: 22,
  center: 50,
  lower: 70,
  bottom: 82,
};

export const DEFAULT_OPTIONS: Omit<JobOptions, "videoId"> = {
  count: 5,
  style: "best-moments",
  framing: "speaker",
  mode: "clips",
  length: "auto",
  rankingSeconds: 60,
};

/** Clip length targets in seconds. Hard limits apply only when the moment genuinely needs it. */
export interface LengthTarget {
  min: number;
  ideal: number;
  max: number;
  hardMin: number;
  hardMax: number;
}

export function lengthTarget(o: Pick<JobOptions, "mode" | "length" | "count" | "rankingSeconds">, videoDuration: number): LengthTarget {
  if (o.mode === "ranking") {
    const total = Math.min(o.rankingSeconds, Math.max(10, videoDuration * 0.9));
    const per = total / o.count;
    return {
      min: Math.max(4, per * 0.7),
      ideal: per,
      max: per * 1.35,
      hardMin: Math.max(3, per * 0.45),
      hardMax: Math.max(per * 1.8, per + 6),
    };
  }
  if (o.length === "short") return { min: 15, ideal: 22, max: 30, hardMin: 8, hardMax: 45 };
  if (o.length === "long") return { min: 45, ideal: 60, max: 90, hardMin: 25, hardMax: 120 };
  return { min: 20, ideal: 35, max: 60, hardMin: 10, hardMax: 90 };
}

export function defaultCrop(): Crop {
  return { mode: "fit", keys: [], manualX: null };
}

const LEGACY_STAGE: Record<string, Job["stage"]> = { analyze: "moments", render: "export" };

/** Fills in fields that jobs created by older versions of the app don't have. */
export function normalizeJob(raw: Job): Job {
  const j = raw as Job & Record<string, unknown>;
  const options: JobOptions = { ...DEFAULT_OPTIONS, ...j.options };
  const stage = (LEGACY_STAGE[j.stage as string] ?? j.stage) as Job["stage"];
  const clips: Clip[] = (j.clips ?? []).map((c: Partial<Clip> & Clip, i: number) => ({
    ...c,
    index: c.index ?? i + 1,
    titles: c.titles?.length ? c.titles : [c.title],
    shortTitle: c.shortTitle ?? c.title,
    caption: c.caption ?? "",
    hashtags: c.hashtags ?? [],
    emphasis: c.emphasis ?? [],
    overlayText: c.overlayText ?? "title",
    categories: c.categories ?? [],
    evidence: c.evidence ?? [],
    crop: c.crop ?? defaultCrop(),
    render: c.render ?? (c.url ? { state: "done", progress: 1, url: c.url } : { state: "idle", progress: 0 }),
  }));
  const steps = j.steps ?? {};
  if (!j.steps && stage === "done") for (const s of STAGES) steps[s.key as StageKey] = { status: "done" };
  return {
    ...j,
    options,
    stage,
    steps,
    moments: j.moments ?? [],
    clips,
    ranking: j.ranking ?? options.mode === "ranking",
    overlay: { ...DEFAULT_OVERLAY, ...(j.overlay ?? {}) },
    subtitles: { ...DEFAULT_SUBTITLES, ...(j.subtitles ?? {}) },
    compilation: j.compilation ?? { state: "idle", progress: 0 },
    compilationTitles: j.compilationTitles ?? [],
    compilationTitle: j.compilationTitle ?? j.compilationTitles?.[0] ?? "",
  };
}

/** Clips as shown in ranking order: #1 is the strongest. */
export function rankLabel(clip: Pick<Clip, "index">): string {
  return `#${clip.index}`;
}
