"use client";

import { useEffect, useState } from "react";
import type { Job, Word } from "@/lib/types";

export async function api<T = Job>(url: string, method = "GET", body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method,
    cache: "no-store",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || `Request failed (${r.status})`), { data });
  return data as T;
}

const transcriptCache = new Map<string, Promise<Word[]>>();

/** Word timestamps for a video (fetched once, shared by every preview). */
export function useWords(videoId: string | undefined): Word[] | null {
  const [words, setWords] = useState<Word[] | null>(null);
  useEffect(() => {
    if (!videoId) return;
    let p = transcriptCache.get(videoId);
    if (!p) {
      p = api<{ words: Word[] }>(`/api/videos/${videoId}/transcript`).then((d) => d.words);
      p.catch(() => transcriptCache.delete(videoId!));
      transcriptCache.set(videoId, p);
    }
    let alive = true;
    p.then((w) => alive && setWords(w)).catch(() => alive && setWords([]));
    return () => {
      alive = false;
    };
  }, [videoId]);
  return words;
}

export interface SignalsView {
  loudness: number[];
  median: number;
  scenes: number[];
}

const signalsCache = new Map<string, Promise<SignalsView>>();

export function useSignals(videoId: string | undefined): SignalsView | null {
  const [s, setS] = useState<SignalsView | null>(null);
  useEffect(() => {
    if (!videoId) return;
    let p = signalsCache.get(videoId);
    if (!p) {
      p = api<SignalsView>(`/api/videos/${videoId}/signals`);
      signalsCache.set(videoId, p);
    }
    let alive = true;
    p.then((v) => alive && setS(v)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [videoId]);
  return s;
}

export function fmtPrecise(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
}

export function parseTime(v: string): number | null {
  const m = v.trim().match(/^(?:(\d+):)?(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  return (m[1] ? +m[1] * 60 : 0) + +m[2];
}

export function downloadUrl(url: string, name: string): string {
  return `${url}?download=1&name=${encodeURIComponent(name)}`;
}

export function triggerDownload(url: string, name: string) {
  const a = document.createElement("a");
  a.href = downloadUrl(url, name);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
