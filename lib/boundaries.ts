// Turns an AI-picked sentence range into a clean clip: hook → context → payoff, never cutting
// anyone off mid-sentence, starting slightly before the moment and ending after the reaction.
import type { LengthTarget } from "./defaults";
import { isReactionText, startsDangling, type Context } from "./features";
import type { Structure } from "./types";

export interface RangePick {
  start_sentence: number;
  hook_sentence: number;
  payoff_sentence: number;
  end_sentence: number;
  needs_more_time?: boolean;
}

export interface Refined {
  a: number; // first sentence index
  b: number; // last sentence index
  hook: number;
  payoff: number;
  start: number;
  end: number;
  structure: Structure;
  notes: string[];
}

const TERMINAL = /[.!?…]["')\]]*$/;

export function refineBoundaries(ctx: Context, pick: RangePick, target: LengthTarget, videoDuration: number): Refined | null {
  const S = ctx.sentences;
  const last = S.length - 1;
  if (last < 0) return null;
  const clampI = (i: number) => Math.max(0, Math.min(last, Math.round(i)));
  let a = clampI(Math.min(pick.start_sentence, pick.end_sentence));
  let b = clampI(Math.max(pick.start_sentence, pick.end_sentence));
  let hook = clampI(pick.hook_sentence);
  let payoff = clampI(pick.payoff_sentence);
  if (hook < a || hook > b) hook = a;
  if (payoff < a || payoff > b) payoff = Math.max(hook, Math.min(b, payoff));
  if (payoff < hook) payoff = b;
  const notes: string[] = [];
  const hardMax = pick.needs_more_time ? target.hardMax : Math.max(target.max, target.ideal * 1.3);
  const dur = (x = a, y = b) => S[y].end - S[x].start;

  // 1. Don't open on a sentence that leans on what came before ("and", "so", "but"...).
  for (let n = 0; n < 2 && a > 0 && startsDangling(S[a].text) && dur(a - 1, b) <= hardMax && S[a].start - S[a - 1].end < 1.5; n++) {
    a--;
    notes.push("pulled the start back one sentence so it doesn't open mid-thought");
  }

  // 2. Don't end on an unfinished sentence.
  if (!TERMINAL.test(S[b].text) && b < last && S[b + 1].start - S[b].end < 0.6 && dur(a, b + 1) <= hardMax) {
    b++;
    notes.push("extended the end to finish the sentence");
  }

  // 3. Keep a short reaction right after the payoff ("NO WAY!", laughter).
  if (b < last) {
    const next = S[b + 1];
    const words = next.lastWord - next.firstWord + 1;
    if (next.start - S[b].end < 1.5 && words <= 6 && next.end - next.start <= 3 && isReactionText(next.text) && dur(a, b + 1) <= hardMax) {
      b++;
      notes.push("kept the reaction after the payoff");
    }
  }

  // 4. Reach the minimum length — add context before the hook first (unless there's a topic
  //    break), then after the payoff.
  while (dur() < target.min) {
    const canBack = a > 0 && S[a].start - S[a - 1].end < 2 && dur(a - 1, b) <= target.max;
    const canFwd = b < last && S[b + 1].start - S[b].end < 2 && dur(a, b + 1) <= target.max;
    if (canBack && (!canFwd || S[a].start - S[a - 1].end <= S[b + 1].start - S[b].end)) a--;
    else if (canFwd) b++;
    else break;
  }
  if (dur() < target.hardMin) {
    while (dur() < target.hardMin && (a > 0 || b < last)) {
      if (b < last) b++;
      else a--;
    }
  }

  // 5. Too long: trim context that sits outside hook..payoff, never the hook or payoff themselves.
  while (dur() > hardMax && (a < hook || b > payoff)) {
    if (b > payoff && (a >= hook || S[b].end - S[b].start >= S[a].end - S[a].start)) b--;
    else a++;
  }
  if (dur() > target.hardMax) {
    // Still too long: keep hook and payoff, drop what's between from the front.
    while (dur() > target.hardMax && a < payoff) a++;
    hook = Math.max(hook, a);
  }
  if (dur() < 2) return null;

  // 6. Exact cut points: a little pre-roll before the first word, and room after the last word
  //    for the reaction (non-speech burst) — but never into the next sentence.
  const firstWord = ctx.words[S[a].firstWord];
  const lastWord = ctx.words[S[b].lastWord];
  const prevEnd = S[a].firstWord > 0 ? ctx.words[S[a].firstWord - 1].end : 0;
  const nextStart = S[b].lastWord < ctx.words.length - 1 ? ctx.words[S[b].lastWord + 1].start : videoDuration;
  let start = Math.max(0, prevEnd + 0.05, firstWord.start - 0.35);
  if (start > firstWord.start) start = Math.max(0, firstWord.start - 0.05);
  let end = Math.min(videoDuration, lastWord.end + 0.6, Math.max(lastWord.end + 0.05, nextStart - 0.08));
  const burst = ctx.bursts.find((x) => x.start >= lastWord.end - 0.2 && x.start <= lastWord.end + 1.2);
  if (burst) {
    const tail = Math.min(burst.end + 0.3, lastWord.end + 4, nextStart - 0.08, videoDuration);
    if (tail > end) {
      end = tail;
      notes.push("held the ending for the reaction");
    }
  }
  if (end - start < 2) return null;

  const structure: Structure = {
    hook: [Math.max(start, S[hook].start), S[hook].end],
    context: payoff - hook > 1 ? [S[hook + 1].start, S[payoff - 1].end] : null,
    payoff: [S[payoff].start, Math.min(end, S[payoff].end)],
  };
  return { a, b, hook, payoff, start: round(start), end: round(end), structure, notes };
}

const round = (t: number) => Math.round(t * 100) / 100;

/** Snaps a user-edited cut to the nearest gap between words so nobody is cut off mid-word. */
export function snapToWordGap(ctx: Pick<Context, "words">, t: number, edge: "start" | "end"): number {
  const w = ctx.words;
  for (let i = 0; i < w.length; i++) {
    if (t > w[i].start && t < w[i].end) {
      return edge === "start" ? Math.max(0, w[i].start - 0.05) : w[i].end + 0.05;
    }
  }
  return t;
}
