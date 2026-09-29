// Shared text layout for overlays and subtitles. The browser preview and the burned-in export
// both position every element from this module, so what you see is what gets exported.
// Coordinates are on the 1080×1920 output canvas; every element is anchored at its centre.
import { SUBTITLE_Y } from "./defaults";
import { ADVANCES, ADVANCE_CHARS } from "./fontMetrics";
import type { Crop, OverlayStyle, SubtitleStyle, Weight, Word } from "./types";

export const CANVAS_W = 1080;
export const CANVAS_H = 1920;

export const FONT_FILES: Record<Weight, string> = {
  500: "Montserrat_500Medium.ttf",
  700: "Montserrat_700Bold.ttf",
  800: "Montserrat_800ExtraBold.ttf",
  900: "Montserrat_900Black.ttf",
};
/** Full font names as libass/fontconfig sees them. */
export const ASS_FONT: Record<Weight, string> = {
  500: "Montserrat Medium",
  700: "Montserrat Bold",
  800: "Montserrat ExtraBold",
  900: "Montserrat Black",
};
/** libass sizes fonts by winAscent+winDescent (1109+453 units per 1000 em), CSS by the em. */
export const ASS_SIZE_RATIO = 1.562;
/**
 * libass centres the (winAscent+winDescent) box on the anchor, browsers centre the
 * (hhea ascent+descent) content box; this is the baseline difference in em.
 */
export const ASS_Y_SHIFT_EM = 0.0305;

const CHAR_INDEX = new Map<string, number>([...ADVANCE_CHARS].map((c, i) => [c, i]));

export function cleanText(s: string): string {
  return s
    .replace(/\p{Extended_Pictographic}|‍|️|[\u{1F1E6}-\u{1F1FF}]/gu, "")
    .replace(/[{}\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function textWidth(text: string, size: number, weight: Weight): number {
  const table = ADVANCES[weight];
  let units = 0;
  for (const ch of text) {
    const i = CHAR_INDEX.get(ch);
    units += i === undefined ? (ch.charCodeAt(0) > 0x2e80 ? 1000 : 620) : table[i];
  }
  return (units / 1000) * size;
}

function greedy(words: string[], size: number, weight: Weight, maxW: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && textWidth(next, size, weight) > maxW) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Word-wraps to `maxW`, then narrows the width while the line count stays the same (balanced lines). */
export function wrapLines(text: string, size: number, weight: Weight, maxW: number): string[] {
  const words = text.split(" ").filter(Boolean);
  if (!words.length) return [];
  const base = greedy(words, size, weight, maxW);
  if (base.length < 2) return base;
  let best = base;
  for (let w = maxW * 0.96; w > maxW * 0.4; w *= 0.96) {
    const trial = greedy(words, size, weight, w);
    if (trial.length !== base.length) break;
    best = trial;
  }
  return best;
}

export interface Run {
  text: string;
  color: string;
}

export interface TextEl {
  kind: "text";
  x: number;
  y: number;
  size: number;
  weight: Weight;
  runs: Run[];
  width: number;
  outline: number;
  outlineColor: string;
  shadow: number;
  shadowColor: string;
  shadowAlpha: number; // 0..1 opacity
}

export interface BoxEl {
  kind: "box";
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  color: string;
  opacity: number; // 0..1
}

export type El = TextEl | BoxEl;

export interface Block {
  cx: number;
  cy: number;
  w: number;
  h: number;
  els: El[];
}

function effectFor(effect: OverlayStyle["effect"], size: number) {
  const outline = effect === "outline" || effect === "both" ? Math.max(2, Math.round(size * 0.075)) : 0;
  const shadow = effect === "shadow" || effect === "both" ? Math.max(2, Math.round(size * 0.07)) : 0;
  return { outline, outlineColor: "#000000", shadow, shadowColor: "#000000", shadowAlpha: 0.6 };
}

interface LineSpec {
  runs: Run[];
  size: number;
  weight: Weight;
  lineH: number;
}

function stack(
  lines: LineSpec[],
  gaps: number[],
  anchorX: number,
  anchorY: number,
  fx: ReturnType<typeof effectFor>,
  bg: { kind: "none" | "box" | "band"; color: string; opacity: number; padX: number; padY: number; r: number },
): Block {
  const widths = lines.map((l) => textWidth(l.runs.map((r) => r.text).join(""), l.size, l.weight));
  const contentW = Math.max(0, ...widths);
  const contentH = lines.reduce((h, l) => h + l.lineH, 0) + gaps.reduce((a, b) => a + b, 0);
  const w = bg.kind === "band" ? CANVAS_W : contentW + (bg.kind === "box" ? bg.padX * 2 : 0);
  const h = contentH + (bg.kind !== "none" ? bg.padY * 2 : 0);
  // Keep the whole block on screen when the anchor is moved near an edge.
  const m = 24;
  const cx = w >= CANVAS_W - 2 * m ? CANVAS_W / 2 : Math.min(CANVAS_W - m - w / 2, Math.max(m + w / 2, anchorX));
  const cy = Math.min(CANVAS_H - m - h / 2, Math.max(m + h / 2, anchorY));

  const els: El[] = [];
  if (bg.kind !== "none" && bg.opacity > 0) {
    els.push({ kind: "box", x: cx, y: cy, w, h, r: bg.kind === "band" ? 0 : bg.r, color: bg.color, opacity: bg.opacity });
  }
  let y = cy - contentH / 2;
  lines.forEach((l, i) => {
    els.push({ kind: "text", x: cx, y: y + l.lineH / 2, size: l.size, weight: l.weight, runs: l.runs, width: widths[i], ...fx });
    y += l.lineH + (gaps[i] ?? 0);
  });
  return { cx, cy, w, h, els };
}

/** The centred title card: optional "#N" rank on top, the clip title below. */
export function overlayBlock(style: OverlayStyle, rank: number | null, rawTitle: string): Block | null {
  if (!style.enabled) return null;
  const size = style.fontSize;
  const lines: LineSpec[] = [];
  const gaps: number[] = [];
  if (style.showRank && rank !== null) {
    const rs = Math.round(size * 1.9);
    lines.push({ runs: [{ text: `#${rank}`, color: style.rankColor }], size: rs, weight: 900, lineH: rs * 1.0 });
    gaps.push(size * 0.22);
  }
  const title = cleanText(style.uppercase ? rawTitle.toUpperCase() : rawTitle);
  if (style.showTitle && title) {
    const maxW = CANVAS_W * 0.84 - (style.background === "box" ? size * 0.9 : 0);
    const wrapped = wrapLines(title, size, style.fontWeight, maxW);
    wrapped.forEach((t, i) => {
      lines.push({ runs: [{ text: t, color: style.color }], size, weight: style.fontWeight, lineH: size * 1.12 });
      if (i < wrapped.length - 1) gaps.push(0);
    });
  }
  if (!lines.length) return null;
  return stack(lines, gaps, (style.x / 100) * CANVAS_W, (style.y / 100) * CANVAS_H, effectFor(style.effect, size), {
    kind: style.background,
    color: style.bgColor,
    opacity: style.bgOpacity / 100,
    padX: size * 0.45,
    padY: size * 0.32,
    r: size * 0.28,
  });
}

// ---------------------------------------------------------------------------------------------
// Overlay timing/animation — evaluated per frame in the browser, emitted as ASS tags on export.

export const INTRO_MS = 3000;
export const DOCK_AT_MS = 2500;
export const DOCK_MS = 400;
export const DOCK_Y = 0.13 * CANVAS_H;
export const DOCK_SCALE = 0.55;

export interface ElState {
  x: number;
  y: number;
  scale: number;
  opacity: number;
}

const lerp = (a: number, b: number, f: number) => a + (b - a) * Math.min(1, Math.max(0, f));

/** Where an overlay element is at `ms` into the clip (null = not shown). Mirrors `overlayAss`. */
export function overlayElState(style: OverlayStyle, block: Block, el: El, ms: number): ElState | null {
  if (style.timing === "intro" && ms >= INTRO_MS) return null;
  let x = el.x;
  let y = el.y;
  let scale = 1;
  let opacity = 1;
  if (style.timing === "dock" && ms >= DOCK_AT_MS) {
    const f = (ms - DOCK_AT_MS) / DOCK_MS;
    const dy = DOCK_Y + (el.y - block.cy) * DOCK_SCALE;
    return { x, y: lerp(el.y, dy, f), scale: lerp(1, DOCK_SCALE, f), opacity: 1 };
  }
  if (style.animation === "fade") opacity = Math.min(1, ms / 250);
  else if (style.animation === "pop") {
    scale = ms < 180 ? lerp(0, 1.12, ms / 180) : lerp(1.12, 1, (ms - 180) / 80);
  } else if (style.animation === "slide") {
    y = lerp(el.y + 90, el.y, ms / 300);
    opacity = Math.min(1, ms / 200);
  }
  if (style.timing === "intro" && ms > INTRO_MS - 200) opacity *= Math.max(0, (INTRO_MS - ms) / 200);
  return { x, y, scale, opacity };
}

// ---------------------------------------------------------------------------------------------
// Subtitles

export interface PhraseWord {
  text: string;
  start: number; // clip time
  end: number;
  emphasis: boolean;
}

export interface Phrase {
  start: number;
  end: number;
  words: PhraseWord[];
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");

/** Marks transcript words that belong to any of the emphasis phrases. */
export function emphasisMask(words: { text: string }[], emphasis: string[]): boolean[] {
  const mask = words.map(() => false);
  const toks = words.map((w) => norm(w.text));
  for (const phrase of emphasis) {
    const p = phrase.split(/\s+/).map(norm).filter(Boolean);
    if (!p.length) continue;
    for (let i = 0; i + p.length <= toks.length; i++) {
      if (p.every((t, k) => toks[i + k] === t)) for (let k = 0; k < p.length; k++) mask[i + k] = true;
    }
  }
  return mask;
}

/** Splits the clip's words into short, readable phrases, breaking at punctuation and pauses. */
export function buildPhrases(words: Word[], clipStart: number, clipEnd: number, maxWords: number, emphasis: string[]): Phrase[] {
  const inClip = words.filter((w) => w.end > clipStart && w.start < clipEnd && cleanText(w.text));
  const mask = emphasisMask(inClip, emphasis);
  const items: PhraseWord[] = inClip.map((w, i) => ({
    text: cleanText(w.text),
    start: Math.max(0, w.start - clipStart),
    end: Math.min(clipEnd, w.end) - clipStart,
    emphasis: mask[i],
  }));
  const maxChars = maxWords * 7 + 4;
  const phrases: Phrase[] = [];
  let cur: PhraseWord[] = [];
  for (let i = 0; i < items.length; i++) {
    const w = items[i];
    cur.push(w);
    const next = items[i + 1];
    const chars = cur.reduce((n, x) => n + x.text.length + 1, 0);
    const brk = !next || cur.length >= maxWords || chars > maxChars || /[.!?,;:…]$/.test(w.text) || next.start - w.end > 0.5;
    if (brk) {
      phrases.push({ start: cur[0].start, end: cur[cur.length - 1].end, words: cur });
      cur = [];
    }
  }
  // Hold each phrase on screen until the next one (max +0.35 s).
  phrases.forEach((p, i) => {
    const next = phrases[i + 1]?.start ?? clipEnd - clipStart;
    p.end = Math.max(p.start + 0.05, Math.min(next, p.end + 0.35));
  });
  return phrases;
}

/** Index of the word being spoken at clip time `t` within a phrase (-1 before the first word). */
export function activeWordIndex(p: Phrase, t: number): number {
  let idx = -1;
  for (let i = 0; i < p.words.length; i++) if (t >= p.words[i].start) idx = i;
  return idx;
}

export function subtitleBlock(style: SubtitleStyle, phrase: Phrase, active: number): Block | null {
  if (!style.enabled || !phrase.words.length) return null;
  const size = style.fontSize;
  const tokens = phrase.words.map((w, i) => ({
    text: style.uppercase ? w.text.toUpperCase() : w.text,
    color:
      style.highlightActive && i === active
        ? style.activeColor
        : style.highlightEmphasis && w.emphasis
          ? style.emphasisColor
          : style.color,
  }));
  const maxW = CANVAS_W * 0.86 - (style.background === "box" ? size * 0.8 : 0);
  const lines = wrapLines(tokens.map((t) => t.text).join(" "), size, style.fontWeight, maxW);
  const specs: LineSpec[] = [];
  let k = 0;
  for (const line of lines) {
    const n = line.split(" ").length;
    const runs: Run[] = [];
    for (let j = 0; j < n; j++, k++) {
      const t = tokens[k];
      const text = j < n - 1 ? `${t.text} ` : t.text;
      const last = runs[runs.length - 1];
      if (last && last.color === t.color) last.text += text;
      else runs.push({ text, color: t.color });
    }
    specs.push({ runs, size, weight: style.fontWeight, lineH: size * 1.15 });
  }
  return stack(specs, specs.map(() => 0), CANVAS_W / 2, (SUBTITLE_Y[style.position] / 100) * CANVAS_H, effectFor(style.effect, size), {
    kind: style.background,
    color: "#000000",
    opacity: 0.62,
    padX: size * 0.4,
    padY: size * 0.22,
    r: size * 0.22,
  });
}

// ---------------------------------------------------------------------------------------------
// 9:16 crop

export function cropCenterAt(crop: Crop, t: number): number {
  if (crop.manualX !== null && crop.manualX !== undefined) return crop.manualX;
  if (!crop.keys.length) return 0.5;
  let x = crop.keys[0].x;
  for (const k of crop.keys) if (k.t <= t + 1e-3) x = k.x;
  return x;
}

export const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);

/** Left edge (source px) and width of the 9:16 window for a given subject centre. */
export function cropWindow(srcW: number, srcH: number, cx: number): { x: number; w: number } {
  const w = even(Math.min(srcW, srcH * (CANVAS_W / CANVAS_H)));
  const x = even(Math.max(0, Math.min(srcW - w, cx * srcW - w / 2)));
  return { x, w };
}

/** True when the source is (nearly) vertical already and just needs scaling to fill 9:16. */
export function isVerticalSource(srcW: number, srcH: number): boolean {
  return srcW / srcH <= (CANVAS_W / CANVAS_H) * 1.15;
}
