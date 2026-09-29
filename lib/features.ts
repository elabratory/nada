// Measured, non-AI signals: audio energy, sudden energy changes, non-speech bursts (laughter,
// applause, shouting), dramatic pauses, scene cuts/motion, and lexical cues in the transcript.
// These are combined with the AI's reading of the transcript to produce each viral score.
import type { AudioSignals, Evidence, Sentence, VideoSignals, Word } from "./types";

const clamp = (v: number, a = 0, b = 100) => Math.min(b, Math.max(a, v));
const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

// --- Lexicon ---------------------------------------------------------------------------------

const REACTION = [
  /\b(ha){2,}\b/i,
  /\bhah?a\b/i,
  /\b(lol|lmao|lmfao|rofl)\b/i,
  /\boh my (god|gosh)\b/i,
  /\bomg\b/i,
  /\bno way\b/i,
  /\bwhat\?!|\bwhat the\b/i,
  /\bwait,? what\b/i,
  /\bare you (serious|kidding)\b/i,
  /\b(holy|jesus|bruh|bro|dude|yo+)\b/i,
  /\b(wow|whoa|woah|damn)\b/i,
  /\[(laugh|laughter|applause|cheer)/i,
  /\((laugh|laughs|laughter|applause)/i,
];

const ARGUMENT = [
  /\b(you'?re wrong|that'?s not true|that'?s not what|shut up|excuse me|let me finish|hold on|listen to me|stop it|how dare)\b/i,
  /\b(no,? no|that'?s (bullshit|ridiculous|insane|crazy))\b/i,
  /\b(disagree|argue|lying|liar)\b/i,
];

const INTENSE = new Set(
  (
    "amazing incredible insane crazy unbelievable ridiculous hilarious awful terrible horrible disgusting beautiful " +
    "love hate furious angry scared terrified shocked shocking devastated heartbroken cried crying tears dead died " +
    "kill killed destroyed genius legendary epic massive huge biggest worst best ever never always literally " +
    "absolutely completely totally seriously honestly obsessed hated loved screaming screamed nightmare disaster " +
    "perfect impossible unreal wild nuts savage brutal embarrassing awkward weird secret truth lie lied fired " +
    "million billion broke rich crazier craziest insanely unhinged psycho panic panicked"
  ).split(" "),
);

const PROFANITY = /\b(fuck\w*|shit\w*|bitch\w*|asshole|bastard|hell|damn)\b/i;

const CONNECTOR = /^(and|but|so|because|cause|'cause|which|then|or|also|plus|anyway|anyways|like|um|uh|yeah|well)\b/i;

export function startsDangling(text: string): boolean {
  return CONNECTOR.test(text.trim());
}

export function isReactionText(text: string): boolean {
  return REACTION.some((r) => r.test(text));
}

export interface LexScore {
  score: number;
  cues: string[];
}

/** Lexical intensity of a piece of transcript: sentiment words, reactions, arguments, exclamations. */
export function lexical(text: string): LexScore {
  const cues: string[] = [];
  const tokens = text.toLowerCase().match(/[\p{L}']+/gu) ?? [];
  const intense = tokens.filter((t) => INTENSE.has(t)).length;
  const react = REACTION.filter((r) => r.test(text)).length;
  const argue = ARGUMENT.filter((r) => r.test(text)).length;
  const excl = (text.match(/!/g) ?? []).length;
  const q = (text.match(/\?/g) ?? []).length;
  const swear = PROFANITY.test(text);
  if (react) cues.push("reaction words");
  if (argue) cues.push("argument cues");
  if (intense >= 2) cues.push("strong sentiment");
  if (excl) cues.push("exclamations");
  if (swear) cues.push("strong language");
  const density = tokens.length ? (intense / tokens.length) * 100 : 0;
  const score = clamp(density * 6 + react * 18 + argue * 20 + Math.min(excl, 4) * 7 + Math.min(q, 3) * 3 + (swear ? 8 : 0));
  return { score, cues };
}

// --- Audio helpers ---------------------------------------------------------------------------

function slice(a: AudioSignals, start: number, end: number): number[] {
  return a.loudness.slice(Math.max(0, Math.floor(start / a.step)), Math.max(0, Math.ceil(end / a.step)));
}

function mean(v: number[]): number {
  return v.length ? v.reduce((x, y) => x + y, 0) / v.length : 0;
}

/** Loud stretches (>0.4 s) where nobody is speaking: laughter, applause, screams, crashes. */
export function nonSpeechBursts(a: AudioSignals, words: Word[]): { start: number; end: number; peak: number }[] {
  const speaking = new Uint8Array(a.loudness.length);
  for (const w of words) {
    const s = Math.max(0, Math.floor((w.start - 0.1) / a.step));
    const e = Math.min(speaking.length, Math.ceil((w.end + 0.1) / a.step));
    for (let i = s; i < e; i++) speaking[i] = 1;
  }
  const thresh = a.median + 3;
  const out: { start: number; end: number; peak: number }[] = [];
  let runStart = -1;
  let peak = -99;
  for (let i = 0; i <= a.loudness.length; i++) {
    const hot = i < a.loudness.length && !speaking[i] && a.loudness[i] > thresh;
    if (hot) {
      if (runStart < 0) runStart = i;
      peak = Math.max(peak, a.loudness[i]);
    } else if (runStart >= 0) {
      if ((i - runStart) * a.step >= 0.4) out.push({ start: runStart * a.step, end: i * a.step, peak });
      runStart = -1;
      peak = -99;
    }
  }
  return out;
}

// --- Per-sentence annotations for the AI ------------------------------------------------------

export interface Context {
  sentences: Sentence[];
  words: Word[];
  audio: AudioSignals | null;
  video: VideoSignals | null;
  bursts: { start: number; end: number; peak: number }[];
  wordsPerSec: number; // median speech rate
}

export function buildContext(sentences: Sentence[], words: Word[], audio: AudioSignals | null, video: VideoSignals | null): Context {
  const rates = sentences
    .filter((s) => s.end - s.start > 1)
    .map((s) => (s.lastWord - s.firstWord + 1) / (s.end - s.start))
    .sort((a, b) => a - b);
  return {
    sentences,
    words,
    audio,
    video,
    bursts: audio ? nonSpeechBursts(audio, words) : [],
    wordsPerSec: rates.length ? rates[Math.floor(rates.length / 2)] : 2.5,
  };
}

/** Compact tags the AI sees next to each sentence, e.g. "LOUD+8dB BURST-AFTER CUT". */
export function sentenceTags(ctx: Context, s: Sentence): string {
  const tags: string[] = [];
  if (ctx.audio) {
    const peak = Math.max(-70, ...slice(ctx.audio, s.start, s.end));
    const rel = peak - ctx.audio.median;
    if (rel >= 5) tags.push(`LOUD+${Math.round(rel)}dB`);
    const prev = ctx.sentences[s.index - 1];
    if (prev && s.start - prev.end >= 0.8) tags.push(`PAUSE-BEFORE ${(s.start - prev.end).toFixed(1)}s`);
  }
  const after = ctx.bursts.find((b) => b.start >= s.start && b.start <= s.end + 1.5);
  if (after) tags.push(`NONSPEECH-BURST ${(after.end - after.start).toFixed(1)}s`);
  if (ctx.video && ctx.video.scenes.some((c) => c.t >= s.start && c.t <= s.end)) tags.push("CUT");
  const dur = s.end - s.start;
  const rate = dur > 0.8 ? (s.lastWord - s.firstWord + 1) / dur : 0;
  if (rate > ctx.wordsPerSec * 1.35) tags.push("FAST");
  const lex = lexical(s.text);
  if (lex.cues.includes("reaction words")) tags.push("REACT");
  if (lex.cues.includes("argument cues")) tags.push("ARGUE");
  if (lex.score >= 40) tags.push("INTENSE");
  return tags.join(" ");
}

/** Strongest measured-signal peaks across the video, so the AI also looks where the audio/picture spikes. */
export function hotspots(ctx: Context, limit = 15): { t: number; label: string; strength: number }[] {
  const spots: { t: number; label: string; strength: number }[] = [];
  const a = ctx.audio;
  if (a) {
    for (const b of ctx.bursts) {
      spots.push({ t: b.start, label: `non-speech audio burst ${(b.end - b.start).toFixed(1)}s (+${Math.round(b.peak - a.median)} dB)`, strength: (b.peak - a.median) * Math.min(3, b.end - b.start) });
    }
    // Sudden energy jumps: 1.5 s mean vs the previous 3 s.
    const w = Math.round(1.5 / a.step);
    for (let i = 2 * w; i < a.loudness.length - w; i += w) {
      const before = mean(a.loudness.slice(i - 2 * w, i));
      const now = mean(a.loudness.slice(i, i + w));
      if (now - before >= 8 && now > a.median) spots.push({ t: i * a.step, label: `energy jump +${Math.round(now - before)} dB`, strength: now - before });
    }
  }
  if (ctx.video) {
    const strong = ctx.video.scenes.filter((s) => s.score >= 25);
    for (const s of strong) spots.push({ t: s.t, label: "hard scene change", strength: s.score / 6 });
  }
  spots.sort((x, y) => y.strength - x.strength);
  const out: typeof spots = [];
  for (const s of spots) {
    if (out.some((o) => Math.abs(o.t - s.t) < 8)) continue;
    out.push(s);
    if (out.length >= limit) break;
  }
  return out.sort((x, y) => x.t - y.t);
}

// --- Window scoring ---------------------------------------------------------------------------

export interface WindowSignals {
  audio: number;
  energy: number;
  reaction: number;
  pause: number;
  scene: number;
  language: number;
  evidence: Evidence[];
}

/** Scores the measured signals inside a clip window [start, end] with its payoff at `payoffAt`. */
export function scoreWindow(ctx: Context, start: number, end: number, payoffAt: number): WindowSignals {
  const evidence: Evidence[] = [];
  let audio = 0;
  let energy = 0;
  let pause = 0;
  const a = ctx.audio;
  if (a) {
    const seg = slice(a, start, end);
    if (seg.length) {
      let peakI = 0;
      seg.forEach((v, i) => v > seg[peakI] && (peakI = i));
      const rel = seg[peakI] - a.median;
      const spread = a.p90 - a.median || 4;
      audio = clamp(30 + (rel / Math.max(4, spread)) * 35);
      if (rel >= 4) evidence.push({ t: start + peakI * a.step, kind: "audio", label: `Audio peak +${Math.round(rel)} dB above this video's typical level` });

      const w = Math.round(1.5 / a.step);
      let best = 0;
      let bestAt = start;
      const base = Math.floor(start / a.step);
      for (let i = base + w; i < base + seg.length - w + 1; i += 2) {
        const before = mean(a.loudness.slice(Math.max(0, i - 2 * w), i));
        const now = mean(a.loudness.slice(i, i + w));
        if (now - before > best) {
          best = now - before;
          bestAt = i * a.step;
        }
      }
      energy = clamp(best * 9);
      if (best >= 5) evidence.push({ t: bestAt, kind: "energy", label: `Sudden energy jump (+${Math.round(best)} dB)` });
    }
    for (const [s, e] of a.silences) {
      if (s < start || e > end - 1 || e - s < 0.7) continue;
      const after = slice(a, e, e + 1.5);
      const loud = after.length ? Math.max(...after) - a.median : -99;
      if (loud > 0) {
        const v = clamp((e - s) * 35 + loud * 4);
        if (v > pause) {
          pause = v;
          evidence.push({ t: s, kind: "pause", label: `${(e - s).toFixed(1)} s of silence, then speech comes back ${loud >= 3 ? "loud" : ""}`.trim() });
        }
      }
    }
  }

  // Reactions: non-speech bursts inside or just after the window, and reaction words.
  let reaction = 0;
  for (const b of ctx.bursts) {
    if (b.start < start || b.start > end + 0.5) continue;
    const near = Math.abs(b.start - payoffAt) < 4 ? 1.3 : 1;
    const v = clamp((b.peak - (a?.median ?? -30)) * 5 * near + Math.min(3, b.end - b.start) * 12);
    if (v > reaction) reaction = v;
    evidence.push({ t: b.start, kind: "reaction", label: `Non-speech audio burst for ${(b.end - b.start).toFixed(1)} s (laughter/reaction/applause likely)` });
  }
  const inWindow = ctx.sentences.filter((s) => s.end > start && s.start < end);
  const text = inWindow.map((s) => s.text).join(" ");
  const reactSentences = inWindow.filter((s) => isReactionText(s.text));
  if (reactSentences.length) {
    reaction = clamp(reaction + reactSentences.length * 15);
    evidence.push({ t: reactSentences[0].start, kind: "reaction", label: `Verbal reaction: “${reactSentences[0].text.slice(0, 60)}”` });
  }

  // Scene cuts & motion.
  let scene = 0;
  const v = ctx.video;
  if (v) {
    const cuts = v.scenes.filter((c) => c.t >= start && c.t <= end);
    const mot = v.motion.slice(Math.floor(start / v.step), Math.ceil(end / v.step));
    const peakMot = mot.length ? Math.max(...mot) : 0;
    const relMot = peakMot / Math.max(1, v.medianMotion);
    scene = clamp(cuts.length * 12 + Math.min(40, (relMot - 1) * 10));
    if (cuts.length) evidence.push({ t: cuts[0].t, kind: "scene", label: `${cuts.length} scene change${cuts.length > 1 ? "s" : ""}` });
    if (relMot >= 3) {
      const i = mot.indexOf(peakMot);
      evidence.push({ t: start + i * v.step, kind: "scene", label: `Burst of on-screen motion (${relMot.toFixed(1)}× typical)` });
    }
  }

  const lex = lexical(text);
  const language = lex.score;
  if (lex.cues.length) evidence.push({ t: start, kind: "language", label: `Transcript cues: ${lex.cues.join(", ")}` });

  evidence.sort((x, y) => x.t - y.t);
  return { audio, energy, reaction, pause, scene, language, evidence: dedupe(evidence) };
}

function dedupe(ev: Evidence[]): Evidence[] {
  const out: Evidence[] = [];
  for (const e of ev) if (!out.some((o) => o.kind === e.kind && Math.abs(o.t - e.t) < 1.5)) out.push(e);
  return out.slice(0, 8);
}

const WEIGHTS = { audio: 0.16, energy: 0.14, reaction: 0.22, pause: 0.08, scene: 0.1, language: 0.18, visual: 0.12 };

/** Weighted composite of the measured signals (visual only counts when frames were analysed). */
export function compositeSignals(s: Omit<WindowSignals, "evidence">, visual: number | null): number {
  let total = 0;
  let weight = 0;
  for (const k of ["audio", "energy", "reaction", "pause", "scene", "language"] as const) {
    total += s[k] * WEIGHTS[k];
    weight += WEIGHTS[k];
  }
  if (visual !== null) {
    total += visual * WEIGHTS.visual;
    weight += WEIGHTS.visual;
  }
  // Moments rarely light up every signal; a strong showing on a few is what matters.
  const avg = total / weight;
  const top = [s.audio, s.energy, s.reaction, s.pause, s.scene, s.language, visual ?? 0].sort((a, b) => b - a);
  return Math.round(clamp(avg * 0.5 + ((top[0] + top[1] + top[2]) / 3) * 0.5));
}

/** Final viral score: the AI's judgement of the content, grounded by the measured signals. */
export function viralScore(ai: number, signals: number): number {
  return Math.round(clamp(ai * 0.62 + signals * 0.38));
}

export { fmt as fmtTime };
