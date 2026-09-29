"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  CANVAS_H,
  CANVAS_W,
  activeWordIndex,
  buildPhrases,
  cropCenterAt,
  cropWindow,
  isVerticalSource,
  overlayBlock,
  overlayElState,
  subtitleBlock,
  type Block,
  type El,
  type ElState,
} from "@/lib/layout";
import type { Clip, OverlayStyle, SubtitleStyle, VideoMeta, Word } from "@/lib/types";

// 1 canvas px (1080-wide output) in container-query units.
const cq = (px: number) => `${(px / CANVAS_W) * 100}cqw`;

function hexA(hex: string, a: number): string {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}

function ElView({ el, st, origin }: { el: El; st: ElState; origin: { x: number; y: number } }) {
  const pos: CSSProperties = {
    position: "absolute",
    left: cq(st.x - origin.x),
    top: cq(st.y - origin.y),
    transform: `translate(-50%, -50%) scale(${st.scale})`,
    opacity: st.opacity,
  };
  if (el.kind === "box") {
    return <div style={{ ...pos, width: cq(el.w), height: cq(el.h), borderRadius: cq(el.r), background: hexA(el.color, el.opacity) }} />;
  }
  return (
    <div
      style={{
        ...pos,
        fontFamily: "ClipFont, sans-serif",
        fontWeight: el.weight,
        fontSize: cq(el.size),
        lineHeight: 1,
        whiteSpace: "pre",
        fontKerning: "none",
        WebkitTextStroke: el.outline ? `${cq(el.outline * 2)} ${el.outlineColor}` : undefined,
        paintOrder: "stroke fill",
        textShadow: el.shadow ? `${cq(el.shadow)} ${cq(el.shadow)} 0 ${hexA(el.shadowColor, el.shadowAlpha)}` : undefined,
      }}
    >
      {el.runs.map((r, i) => (
        <span key={i} style={{ color: r.color }}>
          {r.text}
        </span>
      ))}
    </div>
  );
}

/**
 * The block is a box of the computed size whose centre sits exactly on the anchor:
 * left/top = anchor (50%/50% by default), transform: translate(-50%, -50%).
 */
function BlockView({ block, state, tag }: { block: Block; state: (el: El) => ElState | null; tag: string }) {
  const origin = { x: block.cx - block.w / 2, y: block.cy - block.h / 2 };
  const els = block.els.map((el) => [el, state(el)] as const).filter((x): x is [El, ElState] => x[1] !== null);
  if (!els.length) return null;
  return (
    <div
      data-block={tag}
      style={{
        position: "absolute",
        left: `${(block.cx / CANVAS_W) * 100}%`,
        top: `${(block.cy / CANVAS_H) * 100}%`,
        width: cq(block.w),
        height: cq(block.h),
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
      }}
    >
      {els.map(([el, st], i) => (
        <ElView key={i} el={el} st={st} origin={origin} />
      ))}
    </div>
  );
}

export interface PreviewProps {
  video: Pick<VideoMeta, "url" | "width" | "height">;
  clip: Pick<Clip, "start" | "end" | "crop" | "title" | "shortTitle" | "overlayText" | "emphasis" | "index">;
  overlay: OverlayStyle;
  subtitles: SubtitleStyle;
  ranking: boolean;
  words: Word[] | null;
  className?: string;
  /** Called with clip-relative time while playing. */
  onTime?: (t: number) => void;
  seekTo?: { t: number; n: number } | null;
  controls?: boolean;
}

/**
 * Live 9:16 preview: plays the source video between the clip's start and end, cropped the way
 * the export crops it, with the overlay and word-timed subtitles laid out by lib/layout.ts.
 * Every edit shows up immediately, without re-rendering.
 */
export default function ClipPreview({ video, clip, overlay, subtitles, ranking, words, className = "", onTime, seekTo, controls = true }: PreviewProps) {
  const vref = useRef<HTMLVideoElement>(null);
  const bgRef = useRef<HTMLCanvasElement>(null);
  const [t, setT] = useState(0); // clip-relative time
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const vertical = isVerticalSource(video.width, video.height);
  const mode = vertical ? "fill" : clip.crop.manualX !== null ? "track" : clip.crop.mode;
  const dur = Math.max(0.1, clip.end - clip.start);

  const phrases = useMemo(
    () => (words ? buildPhrases(words, clip.start, clip.end, subtitles.maxWords, clip.emphasis) : []),
    [words, clip.start, clip.end, subtitles.maxWords, clip.emphasis],
  );
  const title = clip.overlayText === "short" ? clip.shortTitle : clip.title;
  const block = useMemo(() => overlayBlock(overlay, ranking ? clip.index : null, title), [overlay, ranking, clip.index, title]);

  // Keep the playhead inside the clip when it's trimmed.
  useEffect(() => {
    const v = vref.current;
    if (!v || !ready) return;
    if (v.currentTime < clip.start - 0.05 || v.currentTime > clip.end) {
      v.currentTime = clip.start;
      setT(0);
    }
  }, [clip.start, clip.end, ready]);

  useEffect(() => {
    const v = vref.current;
    if (!v || !seekTo || !ready) return;
    v.currentTime = clip.start + Math.max(0, Math.min(dur, seekTo.t));
    setT(Math.max(0, Math.min(dur, seekTo.t)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekTo]);

  const drawBg = () => {
    const v = vref.current;
    const c = bgRef.current;
    if (!v || !c || mode !== "fit" || v.readyState < 2) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    // Cover-crop the frame into the small canvas; CSS blurs it (like the export's boxblur).
    const s = Math.max(c.width / video.width, c.height / video.height);
    const w = video.width * s;
    const h = video.height * s;
    ctx.drawImage(v, (c.width - w) / 2, (c.height - h) / 2, w, h);
  };

  // Frame loop while playing.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const loop = () => {
      const v = vref.current;
      if (!v) return;
      const rel = v.currentTime - clip.start;
      if (v.currentTime >= clip.end - 0.02) {
        v.pause();
        v.currentTime = clip.start;
        setT(0);
        setPlaying(false);
        return;
      }
      setT(Math.max(0, rel));
      onTime?.(Math.max(0, rel));
      drawBg();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, clip.start, clip.end, mode]);

  const toggle = () => {
    const v = vref.current;
    if (!v) return;
    if (playing) {
      v.pause();
      setPlaying(false);
    } else {
      if (v.currentTime < clip.start || v.currentTime >= clip.end - 0.05) v.currentTime = clip.start;
      void v.play().then(
        () => setPlaying(true),
        () => setPlaying(false),
      );
    }
  };

  // Video placement for the 9:16 frame.
  const sourceT = clip.start + t;
  let videoStyle: CSSProperties;
  if (mode === "fill") {
    videoStyle = { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" };
  } else if (mode === "track") {
    const cx = cropCenterAt(clip.crop, sourceT);
    const win = cropWindow(video.width, video.height, cx);
    const widthCq = (video.width / video.height) * (CANVAS_H / CANVAS_W) * 100; // video width in cqw at full height
    videoStyle = {
      position: "absolute",
      top: 0,
      height: "100%",
      width: `${widthCq}cqw`,
      maxWidth: "none",
      left: `${-(win.x / video.width) * widthCq}cqw`,
    };
  } else {
    videoStyle = { position: "absolute", left: 0, width: "100%", top: "50%", transform: "translateY(-50%)" };
  }

  // Overlay animation time: while paused at the very start, show the settled state.
  const ms = playing || t > 0.05 ? t * 1000 : 600;
  const phrase = phrases.find((p) => t >= p.start && t < p.end);
  const subBlock = phrase ? subtitleBlock(subtitles, phrase, subtitles.highlightActive ? activeWordIndex(phrase, t) : 0) : null;

  return (
    <div className={`relative aspect-[9/16] w-full overflow-hidden bg-black ${className}`} style={{ containerType: "inline-size" }}>
      {mode === "fit" && (
        <canvas
          ref={bgRef}
          width={54}
          height={96}
          className="absolute inset-0 h-full w-full"
          style={{ filter: "blur(14px) brightness(0.88) saturate(1.15)", transform: "scale(1.15)" }}
        />
      )}
      <video
        ref={vref}
        src={video.url}
        playsInline
        preload="metadata"
        style={videoStyle}
        onLoadedMetadata={(e) => {
          e.currentTarget.currentTime = clip.start;
          setReady(true);
        }}
        onSeeked={() => drawBg()}
        onPause={() => setPlaying(false)}
      />
      {subBlock && <BlockView tag="subtitle" block={subBlock} state={(el) => ({ x: el.x, y: el.y, scale: 1, opacity: 1 })} />}
      {block && <BlockView tag="overlay" block={block} state={(el) => overlayElState(overlay, block, el, ms)} />}

      {controls && (
        <button
          onClick={toggle}
          aria-label={playing ? "Pause preview" : "Play preview"}
          className="group absolute inset-0 grid place-items-center focus-visible:outline-2 focus-visible:outline-ember"
        >
          {!playing && (
            <span className="grid h-14 w-14 place-items-center rounded-full bg-black/55 text-white backdrop-blur transition-transform group-hover:scale-105">
              <svg viewBox="0 0 24 24" className="ml-0.5 h-6 w-6" fill="currentColor">
                <path d="M8 5.5v13l11-6.5z" />
              </svg>
            </span>
          )}
        </button>
      )}
      {controls && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-white/15">
          <div className="h-full bg-ember" style={{ width: `${(t / dur) * 100}%` }} />
        </div>
      )}
    </div>
  );
}
