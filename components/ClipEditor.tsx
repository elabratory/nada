"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { isVerticalSource } from "@/lib/layout";
import type { Clip, Job, OverlayStyle, SubtitleStyle, VideoMeta, Word } from "@/lib/types";
import type { ClipPatch } from "@/lib/jobs";
import ClipPreview from "./ClipPreview";
import { OverlayPanel, Segmented, SubtitlePanel, Toggle } from "./StylePanel";
import { fmtPrecise, parseTime, type SignalsView } from "./api";
import { Button, Icon } from "./ui";

type Tab = "trim" | "text" | "style";

export default function ClipEditor({
  job,
  clip,
  video,
  words,
  signals,
  busy,
  onPatch,
  onStyle,
  onMove,
  onRegenerate,
  onDownload,
  onClose,
}: {
  job: Job;
  clip: Clip;
  video: VideoMeta;
  words: Word[] | null;
  signals: SignalsView | null;
  busy: { regenerate: boolean };
  onPatch: (patch: ClipPatch) => void;
  onStyle: (patch: { overlay?: Partial<OverlayStyle>; subtitles?: Partial<SubtitleStyle> }) => void;
  onMove: (toIndex: number) => void;
  onRegenerate: () => void;
  onDownload: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("trim");
  const [styleTab, setStyleTab] = useState<"overlay" | "subtitles">("overlay");
  const [playhead, setPlayhead] = useState(0);
  const [seek, setSeek] = useState<{ t: number; n: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rendering = clip.render.state === "queued" || clip.render.state === "rendering";

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm animate-fade" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mx-auto my-4 w-[min(1100px,calc(100%-24px))] rounded-3xl border border-line bg-coal animate-rise sm:my-8">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <span className="rounded-full bg-ember px-2.5 py-0.5 text-[13px] font-bold text-ink">
              {job.ranking ? `#${clip.index}` : `Clip ${clip.index}`}
            </span>
            <h2 className="truncate text-lg font-semibold tracking-tight">{clip.title}</h2>
          </div>
          <div className="flex items-center gap-2">
            {job.clips.length > 1 && (
              <label className="flex items-center gap-2 text-[13px] text-mute">
                {job.ranking ? "Rank" : "Position"}
                <select
                  value={clip.index}
                  onChange={(e) => onMove(+e.target.value)}
                  className="h-9 rounded-lg border border-line bg-ink px-2 text-[14px] text-white"
                >
                  {job.clips.map((_, i) => (
                    <option key={i} value={i + 1}>
                      #{i + 1}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full text-white/70 hover:bg-white/5 hover:text-white" aria-label="Close editor">
              ✕
            </button>
          </div>
        </div>

        <div className="grid gap-6 p-5 sm:p-7 md:grid-cols-[minmax(0,340px)_1fr]">
          <div className="mx-auto w-full max-w-[340px]">
            <div className="overflow-hidden rounded-2xl border border-line">
              <ClipPreview
                video={video}
                clip={clip}
                overlay={job.overlay}
                subtitles={job.subtitles}
                ranking={job.ranking}
                words={words}
                onTime={setPlayhead}
                seekTo={seek}
              />
            </div>
            <p className="mt-2 text-center text-[12px] text-mute">
              Live preview · {fmtPrecise(clip.start)} → {fmtPrecise(clip.end)} · {fmtPrecise(clip.duration)}
            </p>
            <Button className="mt-4 w-full" onClick={onDownload} disabled={rendering}>
              {Icon.download}
              {rendering ? `Exporting… ${Math.round(clip.render.progress * 100)}%` : clip.upToDate ? "Download MP4" : "Export & download"}
            </Button>
            {clip.render.state === "error" && <p className="mt-2 text-[13px] text-ember-soft">{clip.render.error}</p>}
          </div>

          <div className="min-w-0">
            <div className="mb-5">
              <Segmented
                value={tab}
                options={[
                  ["trim", "Trim"],
                  ["text", "Title & caption"],
                  ["style", "Style & framing"],
                ]}
                onChange={setTab}
              />
            </div>
            {tab === "trim" && (
              <TrimPanel
                clip={clip}
                duration={video.duration}
                words={words}
                signals={signals}
                playhead={playhead}
                onPatch={onPatch}
                onSeek={(t) => setSeek({ t, n: Date.now() })}
              />
            )}
            {tab === "text" && <TextPanel clip={clip} busy={busy.regenerate} onPatch={onPatch} onRegenerate={onRegenerate} />}
            {tab === "style" && (
              <div className="grid gap-6">
                {!isVerticalSource(video.width, video.height) && <FramingPanel clip={clip} onPatch={onPatch} />}
                <div>
                  <Segmented
                    value={styleTab}
                    options={[
                      ["overlay", "Title overlay"],
                      ["subtitles", "Subtitles"],
                    ]}
                    onChange={setStyleTab}
                  />
                  <p className="mt-2 text-[12px] text-mute">Style changes apply to every clip, so the set looks consistent.</p>
                </div>
                {styleTab === "overlay" ? (
                  <OverlayPanel value={job.overlay} onChange={(p) => onStyle({ overlay: p })} />
                ) : (
                  <SubtitlePanel value={job.subtitles} onChange={(p) => onStyle({ subtitles: p })} />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TimeInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(fmtPrecise(value));
  useEffect(() => setText(fmtPrecise(value)), [value]);
  const commit = () => {
    const v = parseTime(text);
    if (v === null) setText(fmtPrecise(value));
    else onChange(v);
  };
  return (
    <div className="grid gap-1.5">
      <span className="text-[12px] font-medium uppercase tracking-[0.1em] text-mute">{label}</span>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onChange(value - 0.5)} className="h-10 w-9 rounded-lg border border-line text-white/70 hover:text-white" aria-label={`${label} 0.5 s earlier`}>
          −
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && commit()}
          className="h-10 w-24 rounded-lg border border-line bg-ink px-2 text-center font-mono text-[14px] tabular-nums outline-none focus:border-ember"
          aria-label={label}
        />
        <button type="button" onClick={() => onChange(value + 0.5)} className="h-10 w-9 rounded-lg border border-line text-white/70 hover:text-white" aria-label={`${label} 0.5 s later`}>
          +
        </button>
      </div>
    </div>
  );
}

function TrimPanel({
  clip,
  duration,
  words,
  signals,
  playhead,
  onPatch,
  onSeek,
}: {
  clip: Clip;
  duration: number;
  words: Word[] | null;
  signals: SignalsView | null;
  playhead: number;
  onPatch: (p: ClipPatch) => void;
  onSeek: (t: number) => void;
}) {
  // Visible window around the clip; widened (not shifted) when a handle leaves it.
  const [win, setWin] = useState(() => {
    const pad = Math.max(8, (clip.end - clip.start) * 0.6);
    return [Math.max(0, clip.start - pad), Math.min(duration, clip.end + pad)] as [number, number];
  });
  useEffect(() => {
    if (clip.start < win[0] || clip.end > win[1]) {
      const pad = Math.max(8, (clip.end - clip.start) * 0.6);
      setWin([Math.max(0, Math.min(win[0], clip.start - pad)), Math.min(duration, Math.max(win[1], clip.end + pad))]);
    }
  }, [clip.start, clip.end, duration, win]);
  const [w0, w1] = win;
  const span = Math.max(1, w1 - w0);
  const pct = (t: number) => ((t - w0) / span) * 100;
  const bar = useRef<HTMLDivElement>(null);
  const drag = useRef<"start" | "end" | null>(null);
  const [live, setLive] = useState<{ start: number; end: number } | null>(null);
  const cur = live ?? { start: clip.start, end: clip.end };

  const timeAt = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    return w0 + Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * span;
  };

  const bars = useMemo(() => {
    if (!signals?.loudness.length) return [];
    const out: { x: number; h: number }[] = [];
    for (let i = Math.floor(w0 * 2); i < Math.min(signals.loudness.length, Math.ceil(w1 * 2)); i++) {
      out.push({ x: pct(i / 2), h: Math.max(0.04, Math.min(1, (signals.loudness[i] + 60) / 50)) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signals, w0, w1]);

  const nearby = useMemo(() => (words ?? []).filter((w) => w.end > w0 && w.start < w1), [words, w0, w1]);
  const s = clip.structure;

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-4 sm:flex sm:flex-wrap sm:items-end">
        <TimeInput label="Start" value={clip.start} onChange={(v) => onPatch({ start: v })} />
        <TimeInput label="End" value={clip.end} onChange={(v) => onPatch({ end: v })} />
        <div className="col-span-2 grid gap-1.5 sm:col-span-1">
          <span className="text-[12px] font-medium uppercase tracking-[0.1em] text-mute">Length</span>
          <p className="h-10 content-center font-mono text-[14px] tabular-nums">{fmtPrecise(cur.end - cur.start)}</p>
        </div>
      </div>

      <div>
        <div
          ref={bar}
          className="relative h-24 touch-none select-none overflow-hidden rounded-xl border border-line bg-ink"
          onPointerDown={(e) => {
            const t = timeAt(e.clientX);
            const which = Math.abs(t - cur.start) < Math.abs(t - cur.end) ? "start" : "end";
            const handleX = which === "start" ? cur.start : cur.end;
            if (Math.abs(pct(handleX) - pct(t)) > 4) {
              if (t > cur.start && t < cur.end) onSeek(t - clip.start);
              return;
            }
            drag.current = which;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            const t = timeAt(e.clientX);
            setLive((l) => {
              const c = l ?? { start: clip.start, end: clip.end };
              return drag.current === "start" ? { ...c, start: Math.min(t, c.end - 1) } : { ...c, end: Math.max(t, c.start + 1) };
            });
          }}
          onPointerUp={() => {
            if (drag.current && live) onPatch(drag.current === "start" ? { start: live.start } : { end: live.end });
            drag.current = null;
            setLive(null);
          }}
        >
          <div className="absolute inset-x-0 bottom-0 top-3 flex items-end">
            {bars.map((b, i) => (
              <span key={i} className="absolute bottom-0 w-[2px] rounded-t bg-white/20" style={{ left: `${b.x}%`, height: `${b.h * 100}%` }} />
            ))}
          </div>
          {signals?.scenes
            .filter((t) => t > w0 && t < w1)
            .map((t) => (
              <span key={t} title={`Scene change ${fmtPrecise(t)}`} className="absolute inset-y-0 w-px bg-sky-400/50" style={{ left: `${pct(t)}%` }} />
            ))}
          <div className="absolute inset-y-0 border-y-2 border-ember bg-ember/15" style={{ left: `${pct(cur.start)}%`, width: `${pct(cur.end) - pct(cur.start)}%` }} />
          {s && (
            <div className="absolute inset-x-0 top-0 h-2">
              <span className="absolute h-full bg-amber-300/80" style={{ left: `${pct(s.hook[0])}%`, width: `${Math.max(0.5, pct(s.hook[1]) - pct(s.hook[0]))}%` }} title="Hook" />
              {s.context && <span className="absolute h-full bg-white/35" style={{ left: `${pct(s.context[0])}%`, width: `${Math.max(0.5, pct(s.context[1]) - pct(s.context[0]))}%` }} title="Context" />}
              <span className="absolute h-full bg-emerald-400/80" style={{ left: `${pct(s.payoff[0])}%`, width: `${Math.max(0.5, pct(s.payoff[1]) - pct(s.payoff[0]))}%` }} title="Payoff" />
            </div>
          )}
          {(["start", "end"] as const).map((h) => (
            <span key={h} className="absolute inset-y-0 z-10 -ml-[7px] w-[14px] cursor-ew-resize" style={{ left: `${pct(cur[h])}%` }} aria-hidden>
              <span className="absolute inset-y-4 left-1/2 w-1.5 -translate-x-1/2 rounded-full bg-ember" />
            </span>
          ))}
          <span className="pointer-events-none absolute inset-y-0 w-px bg-white" style={{ left: `${pct(clip.start + playhead)}%` }} />
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-mute">
          <span>{fmtPrecise(w0)}</span>
          <span className="flex gap-3">
            <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber-300/80" />Hook</span>
            <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-white/35" />Context</span>
            <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-400/80" />Payoff</span>
            <span><i className="mr-1 inline-block h-2 w-px bg-sky-400" />Cut</span>
          </span>
          <span>{fmtPrecise(w1)}</span>
        </div>
        <p className="mt-2 text-[12px] text-mute">Drag the orange handles, or click a word below to move the nearest edge there. Cuts snap to gaps between words.</p>
      </div>

      <div className="max-h-56 overflow-y-auto rounded-xl border border-line bg-ink p-3 text-[14px] leading-7">
        {words === null && <span className="text-mute">Loading transcript…</span>}
        {nearby.map((w, i) => {
          const inside = w.start >= cur.start - 0.05 && w.end <= cur.end + 0.05;
          const spoken = inside && clip.start + playhead >= w.start && clip.start + playhead < w.end + 0.1;
          return (
            <button
              key={i}
              type="button"
              onClick={() => {
                const mid = (cur.start + cur.end) / 2;
                if (w.start < mid) onPatch({ start: w.start - 0.05 });
                else onPatch({ end: w.end + 0.05 });
              }}
              title={`${fmtPrecise(w.start)} — click to move the ${w.start < (cur.start + cur.end) / 2 ? "start" : "end"} here`}
              className={`mr-1 rounded px-0.5 transition-colors hover:bg-ember hover:text-ink ${spoken ? "bg-white text-ink" : inside ? "text-white" : "text-white/30"}`}
            >
              {w.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TextPanel({ clip, busy, onPatch, onRegenerate }: { clip: Clip; busy: boolean; onPatch: (p: ClipPatch) => void; onRegenerate: () => void }) {
  const custom = !clip.titles.includes(clip.title);
  const [tags, setTags] = useState(clip.hashtags.join(" "));
  useEffect(() => setTags(clip.hashtags.join(" ")), [clip.hashtags]);
  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-medium uppercase tracking-[0.1em] text-mute">Pick a title</span>
          <Button variant="outline" className="!h-9 !px-3.5 !text-[13px]" onClick={onRegenerate} disabled={busy}>
            {Icon.refresh}
            {busy ? "Writing…" : "New titles"}
          </Button>
        </div>
        {clip.titles.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onPatch({ title: t })}
            className={`rounded-xl border px-4 py-3 text-left text-[15px] font-semibold transition-colors ${
              clip.title === t ? "border-ember bg-ember/10" : "border-line hover:border-white/25"
            }`}
          >
            {t}
          </button>
        ))}
        <input
          value={clip.title}
          onChange={(e) => onPatch({ title: e.target.value })}
          placeholder="Or write your own"
          className={`h-11 rounded-xl border bg-ink px-4 text-[15px] outline-none focus:border-ember ${custom ? "border-ember" : "border-line"}`}
          aria-label="Clip title"
        />
      </div>
      <label className="grid gap-2">
        <span className="text-[12px] font-medium uppercase tracking-[0.1em] text-mute">Short title</span>
        <input value={clip.shortTitle} onChange={(e) => onPatch({ shortTitle: e.target.value })} className="h-11 rounded-xl border border-line bg-ink px-4 text-[15px] outline-none focus:border-ember" />
      </label>
      <div className="grid gap-2">
        <span className="text-[12px] font-medium uppercase tracking-[0.1em] text-mute">On-screen overlay shows</span>
        <Segmented
          value={clip.overlayText}
          options={[
            ["title", "Title"],
            ["short", "Short title"],
          ]}
          onChange={(overlayText) => onPatch({ overlayText })}
        />
      </div>
      <label className="grid gap-2">
        <span className="text-[12px] font-medium uppercase tracking-[0.1em] text-mute">Caption</span>
        <textarea
          value={clip.caption}
          onChange={(e) => onPatch({ caption: e.target.value })}
          rows={3}
          className="rounded-xl border border-line bg-ink px-4 py-3 text-[15px] outline-none focus:border-ember"
        />
      </label>
      <label className="grid gap-2">
        <span className="text-[12px] font-medium uppercase tracking-[0.1em] text-mute">Hashtags</span>
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          onBlur={() =>
            onPatch({
              hashtags: tags
                .split(/[\s,]+/)
                .map((t) => t.replace(/^#*/, ""))
                .filter(Boolean)
                .map((t) => `#${t}`),
            })
          }
          className="h-11 rounded-xl border border-line bg-ink px-4 text-[15px] outline-none focus:border-ember"
        />
      </label>
      <button
        type="button"
        onClick={() => void navigator.clipboard?.writeText(`${clip.title}\n\n${clip.caption}\n\n${clip.hashtags.join(" ")}`.trim())}
        className="justify-self-start text-[13px] text-ember hover:underline"
      >
        Copy title + caption + hashtags
      </button>
    </div>
  );
}

function FramingPanel({ clip, onPatch }: { clip: Clip; onPatch: (p: ClipPatch) => void }) {
  const manual = clip.crop.manualX !== null;
  const auto = clip.crop.mode === "track" ? "Following the subject shot by shot" : "Whole frame on a blurred background";
  return (
    <div className="grid gap-3 rounded-2xl border border-line p-4">
      <span className="text-[12px] font-medium uppercase tracking-[0.1em] text-mute">9:16 framing</span>
      <Toggle label={manual ? "Manual focus" : `Auto · ${auto}`} checked={!manual} onChange={(on) => onPatch({ cropX: on ? null : (clip.crop.keys[0]?.x ?? 0.5) })} />
      {manual && (
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 text-[12px] text-mute">
          <span>Left</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={clip.crop.manualX ?? 0.5}
            onChange={(e) => onPatch({ cropX: +e.target.value })}
            aria-label="Horizontal crop focus"
          />
          <span>Right</span>
        </div>
      )}
    </div>
  );
}
