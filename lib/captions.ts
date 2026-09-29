import {
  ASS_FONT,
  ASS_SIZE_RATIO,
  ASS_Y_SHIFT_EM,
  CANVAS_H,
  CANVAS_W,
  DOCK_AT_MS,
  DOCK_MS,
  DOCK_SCALE,
  DOCK_Y,
  INTRO_MS,
  activeWordIndex,
  buildPhrases,
  overlayBlock,
  subtitleBlock,
  type Block,
  type El,
} from "./layout";
import type { OverlayStyle, SubtitleStyle, Word } from "./types";

function ts(t: number): string {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
}

/** #rrggbb → ASS &HBBGGRR& */
function assColor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const v = m ? m[1] : "ffffff";
  return `&H${v.slice(4, 6)}${v.slice(2, 4)}${v.slice(0, 2)}&`.toUpperCase();
}

/** opacity 0..1 → ASS alpha (&H00& opaque … &HFF& transparent) */
function assAlpha(opacity: number): string {
  const a = Math.round((1 - Math.min(1, Math.max(0, opacity))) * 255);
  return `&H${a.toString(16).padStart(2, "0").toUpperCase()}&`;
}

const n2 = (v: number) => (Math.round(v * 10) / 10).toString();

function roundedRect(w: number, h: number, r: number): string {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  const k = r * 0.5523; // bezier circle approximation
  const p = (v: number) => Math.round(v).toString();
  if (r < 1) return `m 0 0 l ${p(w)} 0 ${p(w)} ${p(h)} 0 ${p(h)}`;
  return [
    `m ${p(r)} 0`,
    `l ${p(w - r)} 0`,
    `b ${p(w - r + k)} 0 ${p(w)} ${p(r - k)} ${p(w)} ${p(r)}`,
    `l ${p(w)} ${p(h - r)}`,
    `b ${p(w)} ${p(h - r + k)} ${p(w - r + k)} ${p(h)} ${p(w - r)} ${p(h)}`,
    `l ${p(r)} ${p(h)}`,
    `b ${p(r - k)} ${p(h)} 0 ${p(h - r + k)} 0 ${p(h - r)}`,
    `l 0 ${p(r)}`,
    `b 0 ${p(r - k)} ${p(r - k)} 0 ${p(r)} 0`,
  ].join(" ");
}

/** ASS y for an element: text baselines are nudged so they sit exactly where the browser puts them. */
function assY(el: El, y: number): number {
  return el.kind === "text" ? y + ASS_Y_SHIFT_EM * el.size : y;
}

/** Override tags + body for one element. `pos` is either a \pos or a \move tag. */
function elBody(el: El, pos: string, extra = ""): string {
  if (el.kind === "box") {
    return `{\\an5${pos}\\p1\\bord0\\shad0\\1c${assColor(el.color)}\\1a${assAlpha(el.opacity)}${extra}}${roundedRect(el.w, el.h, el.r)}{\\p0}`;
  }
  const tags = [
    `\\an5${pos}`,
    `\\fn${ASS_FONT[el.weight]}`,
    `\\fs${n2(el.size * ASS_SIZE_RATIO)}`,
    `\\bord${n2(el.outline)}`,
    `\\3c${assColor(el.outlineColor)}`,
    `\\shad${n2(el.shadow)}`,
    `\\4c${assColor(el.shadowColor)}`,
    `\\4a${assAlpha(el.shadowAlpha)}`,
    extra,
  ].join("");
  const text = el.runs.map((r) => `{\\c${assColor(r.color)}}${r.text.replace(/[{}\\]/g, "")}`).join("");
  return `{${tags}}${text}`;
}

function dialogue(layer: number, start: number, end: number, body: string): string {
  return `Dialogue: ${layer},${ts(start)},${ts(end)},Base,,0,0,0,,${body}`;
}

function overlayEvents(style: OverlayStyle, block: Block, dur: number): string[] {
  const out: string[] = [];
  const introEnd = style.timing === "intro" ? Math.min(dur, INTRO_MS / 1000) : style.timing === "dock" ? Math.min(dur, DOCK_AT_MS / 1000) : dur;
  block.els.forEach((el, i) => {
    const layer = el.kind === "box" ? 10 : 11 + i;
    const x = n2(el.x);
    const y = assY(el, el.y);
    let anim = "";
    let pos = `\\pos(${x},${n2(y)})`;
    if (style.animation === "fade") anim = "\\fad(250,0)";
    else if (style.animation === "pop") anim = "\\fscx0\\fscy0\\t(0,180,\\fscx112\\fscy112)\\t(180,260,\\fscx100\\fscy100)";
    else if (style.animation === "slide") {
      pos = `\\move(${x},${n2(y + 90)},${x},${n2(y)},0,300)`;
      anim = "\\fad(200,0)";
    }
    if (style.timing === "intro") {
      // Fade-out over the last 200 ms of the intro window.
      anim = anim.startsWith("\\fad(") ? anim.replace(",0)", ",200)") : `${anim}\\fad(0,200)`;
    }
    out.push(dialogue(layer, 0, introEnd, elBody(el, pos, anim)));
    if (style.timing === "dock" && dur > introEnd) {
      const dockY = assY(el, DOCK_Y + (el.y - block.cy) * DOCK_SCALE);
      const s = Math.round(DOCK_SCALE * 100);
      const move = `\\move(${x},${n2(y)},${x},${n2(dockY)},0,${DOCK_MS})`;
      out.push(dialogue(layer, introEnd, dur, elBody(el, move, `\\t(0,${DOCK_MS},\\fscx${s}\\fscy${s})`)));
    }
  });
  return out;
}

function subtitleEvents(style: SubtitleStyle, words: Word[], clipStart: number, clipEnd: number, emphasis: string[]): string[] {
  if (!style.enabled) return [];
  const out: string[] = [];
  const phrases = buildPhrases(words, clipStart, clipEnd, style.maxWords, emphasis);
  for (const p of phrases) {
    // One segment per spoken word when the active word is highlighted, otherwise one per phrase.
    const segments: { start: number; end: number; active: number }[] = [];
    if (style.highlightActive) {
      p.words.forEach((w, i) => {
        const start = i === 0 ? p.start : Math.max(w.start, p.words[i - 1].end);
        const end = i === p.words.length - 1 ? p.end : p.words[i + 1].start;
        if (end - start >= 0.02) segments.push({ start, end, active: i });
      });
    } else segments.push({ start: p.start, end: p.end, active: activeWordIndex(p, p.start) });
    segments.forEach((seg, si) => {
      const block = subtitleBlock(style, p, seg.active);
      if (!block) return;
      block.els.forEach((el, i) => {
        const pop = si === 0 ? "\\fad(60,0)" : "";
        out.push(dialogue(el.kind === "box" ? 1 : 2 + i, seg.start, seg.end, elBody(el, `\\pos(${n2(el.x)},${n2(assY(el, el.y))})`, pop)));
      });
    });
  }
  return out;
}

export interface AssInput {
  words: Word[];
  clipStart: number;
  clipEnd: number;
  subtitles: SubtitleStyle;
  emphasis: string[];
  overlay: OverlayStyle;
  overlayTitle: string;
  rank: number | null;
}

/**
 * Builds the ASS script burned into the export: word-timed subtitles plus the centred
 * rank/title overlay. Every position comes from lib/layout.ts, like the browser preview.
 */
export function buildAss(input: AssInput): string {
  const dur = input.clipEnd - input.clipStart;
  const events = subtitleEvents(input.subtitles, input.words, input.clipStart, input.clipEnd, input.emphasis);
  const block = overlayBlock(input.overlay, input.rank, input.overlayTitle);
  if (block) events.push(...overlayEvents(input.overlay, block, dur));

  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${CANVAS_W}
PlayResY: ${CANVAS_H}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Base,Montserrat Black,90,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join("\n")}
`;
}
