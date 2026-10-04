#!/usr/bin/env node
// Builds a long-form 16:9 compilation video from a timeline.json: title cards, clips,
// on-screen text (no voiceover), optional background music.
//
//   node scripts/build-compilation.mjs content/disrespectful-ufc-moments
//
// Clips whose file is missing are rendered as labelled placeholders, so the whole
// edit can be previewed (timing, text, order) before any footage is downloaded.
import { spawn } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FONTS_DIR = path.join(ROOT, "assets", "fonts");

async function ffmpegPath() {
  if (process.env.FFMPEG_PATH?.trim()) return process.env.FFMPEG_PATH.trim();
  try {
    const mod = await import("ffmpeg-static");
    if (mod.default && existsSync(mod.default)) return mod.default;
  } catch {}
  return "ffmpeg";
}

const FFMPEG = await ffmpegPath();

function run(args, cwd) {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, ["-hide_banner", "-nostdin", ...args], { cwd, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (c) => {
      stderr += c.toString();
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
    });
    proc.on("error", reject);
    proc.on("close", (code) => (code === 0 ? resolve(stderr) : reject(new Error(stderr.slice(-3000)))));
  });
}

async function hasAudio(file) {
  const out = await run(["-i", file], undefined).catch((e) => e.message);
  return /Stream #\d+:\d+.*Audio:/.test(out);
}

/** "1:23", "1:02:03", "83.5" or 83.5 -> seconds. */
function secs(v) {
  if (v === undefined || v === null || v === "") return 0;
  if (typeof v === "number") return v;
  return String(v)
    .split(":")
    .reduce((acc, part) => acc * 60 + Number(part), 0);
}

/**
 * Clip start/end can be a plain time, or a named mark from the timeline's "marks" map plus an
 * offset, e.g. "pinas-12" or "pinas+2.5". Marks let several segments (live + replay) share one
 * timestamp. Returns { t, missing } where missing names a mark that has no time set yet.
 */
function resolveTime(v, marks) {
  const m = typeof v === "string" && v.trim().match(/^([a-z_][\w-]*?)\s*(?:([+-])\s*([\d.]+))?$/i);
  if (!m || !(m[1] in marks)) return { t: secs(v), missing: null };
  const offset = m[2] ? (m[2] === "-" ? -1 : 1) * Number(m[3]) : 0;
  const mark = marks[m[1]];
  if (mark === null || mark === undefined || mark === "") return { t: offset, missing: m[1] };
  return { t: secs(mark) + offset, missing: null };
}

function ts(t) {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
}

const esc = (s) => String(s).replace(/[{}\\]/g, "").replace(/\n/g, "\\N");

// ASS colours are &HAABBGGRR.
const ACCENT = "&H003D6AFF"; // #FF6A3D
function assHeader(w, h) {
  const style = (name, size, colour, align, marginV, outline, extra = "0,0") =>
    `Style: ${name},Montserrat ExtraBold,${size},${colour},&H000000FF,&H00000000,&H96000000,-1,0,0,0,100,100,1,0,1,${outline},${extra},${align},60,60,${marginV},1`;
  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${w}`,
    `PlayResY: ${h}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    style("label", 34, "&H00FFFFFF", 7, 50, 3, "2"),
    style("caption", 62, "&H00FFFFFF", 2, 70, 5, "3"),
    style("punch", 130, ACCENT, 5, 0, 7, "4"),
    style("title", 112, "&H00FFFFFF", 5, 0, 0, "0"),
    style("subtitle", 46, "&H00B4B4B4", 5, 0, 0, "0"),
    style("accent", 46, ACCENT, 5, 0, 0, "0"),
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ].join("\n");
}

function dialogue(style, start, end, text, tags = "") {
  return `Dialogue: 0,${ts(start)},${ts(end)},${style},,0,0,0,,${tags}${esc(text)}`;
}

/** On-screen text events for one segment (times are segment-relative). */
function textEvents(seg, duration, w, h) {
  const ev = [];
  const fade = "{\\fad(200,200)}";
  if (seg.type === "card") {
    const cy = h / 2;
    if (seg.kicker) ev.push(dialogue("accent", 0, duration, seg.kicker, `{\\fad(300,300)\\pos(${w / 2},${cy - 110})}`));
    ev.push(dialogue("title", 0, duration, seg.title ?? "", `{\\fad(300,300)\\pos(${w / 2},${cy})}`));
    if (seg.subtitle) ev.push(dialogue("subtitle", 0, duration, seg.subtitle, `{\\fad(300,300)\\pos(${w / 2},${cy + 100})}`));
    return ev;
  }
  if (seg.label) ev.push(dialogue("label", 0, duration, seg.label, fade));
  if (seg.caption) ev.push(dialogue("caption", secs(seg.captionAt), duration, seg.caption, fade));
  for (const t of seg.texts ?? []) {
    const at = secs(t.at);
    const end = t.duration ? Math.min(duration, at + secs(t.duration)) : duration;
    ev.push(dialogue(t.style ?? "caption", at, end, t.text, t.style === "punch" ? "{\\fad(80,250)\\t(0,150,\\fscx115\\fscy115)\\t(150,300,\\fscx100\\fscy100)}" : fade));
  }
  return ev;
}

async function renderSegment(seg, i, ctx) {
  const { w, h, fps, workDir, projectDir } = ctx;
  const base = `seg_${String(i).padStart(3, "0")}`;
  const out = `${base}.mp4`;
  const enc = ["-c:v", "libx264", "-preset", ctx.preset, "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2"];

  const file = seg.file ? path.resolve(projectDir, seg.file) : null;
  let missing = seg.type === "clip" && !(file && existsSync(file));
  let missingMark = null;
  const speed = seg.speed ?? 1;
  const freeze = secs(seg.freezeEnd);
  let duration;
  if (seg.type === "card") duration = secs(seg.duration ?? 3);
  else {
    const s = resolveTime(seg.start, ctx.marks);
    const e = seg.end !== undefined ? resolveTime(seg.end, ctx.marks) : { t: s.t + secs(seg.duration ?? 10), missing: s.missing };
    missingMark = s.missing ?? e.missing;
    if (missingMark) missing = true;
    if (e.t <= s.t) throw new Error(`Segment ${i} (${seg.label ?? seg.file}): end must be after start`);
    duration = (e.t - s.t) / speed + freeze;
    seg = { ...seg, _start: Math.max(0, s.t), _end: e.t };
  }

  const segForText = missing
    ? {
        ...seg,
        texts: [
          { style: "punch", text: missingMark ? `SET "${missingMark}" IN marks` : "CLIP NEEDED" },
          { style: "caption", text: seg.find ?? seg.file ?? "" },
        ],
        caption: undefined,
      }
    : seg;
  await fs.writeFile(path.join(workDir, `${base}.ass`), `${assHeader(w, h)}\n${textEvents(segForText, duration, w, h).join("\n")}\n`, "utf8");
  const subs = `subtitles=${base}.ass:fontsdir=fonts`;

  if (seg.type === "card" || missing) {
    const bg = missing ? "0x2a1414" : seg.background ?? "0x0b0b0b";
    await run(
      [
        "-y",
        "-f", "lavfi", "-i", `color=c=${bg}:s=${w}x${h}:r=${fps}:d=${duration.toFixed(3)}`,
        "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
        "-filter_complex", `[0:v]${subs},format=yuv420p[v]`,
        "-map", "[v]", "-map", "1:a", "-t", duration.toFixed(3),
        ...enc, out,
      ],
      workDir,
    );
    return { out, duration, missing };
  }

  // Fit any aspect ratio into the 16:9 frame over a blurred copy of itself.
  const v = [
    `[0:v]setpts=(PTS-STARTPTS)/${speed},split=2[bgsrc][fgsrc]`,
    `[bgsrc]scale=${w / 8}:${h / 8}:force_original_aspect_ratio=increase,crop=${w / 8}:${h / 8},boxblur=8:2,eq=brightness=-0.15,scale=${w}:${h},setsar=1[bg]`,
    `[fgsrc]scale=${w}:${h}:force_original_aspect_ratio=decrease,setsar=1[fg]`,
    `[bg][fg]overlay=(W-w)/2:(H-h)/2,fps=${fps}${freeze ? `,tpad=stop_mode=clone:stop_duration=${freeze}` : ""},${subs},format=yuv420p[v]`,
  ];
  const isImage = /\.(jpe?g|png|webp)$/i.test(file);
  const audioIn = !isImage && !seg.mute && (await hasAudio(file));
  const atempo = speed === 1 ? "" : speed >= 0.5 ? `,atempo=${speed}` : `,atempo=0.5,atempo=${speed / 0.5}`;
  const a = audioIn
    ? `[0:a]asetpts=PTS-STARTPTS${atempo},aresample=48000,aformat=channel_layouts=stereo,volume=${seg.volume ?? 1},apad[a]`
    : `[1:a]anull[a]`;

  await run(
    [
      "-y",
      ...(isImage
        ? ["-loop", "1", "-framerate", String(fps), "-t", duration.toFixed(3), "-i", file]
        : ["-ss", seg._start.toFixed(3), "-to", seg._end.toFixed(3), "-i", file]),
      "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
      "-filter_complex", [...v, a].join(";"),
      "-map", "[v]", "-map", "[a]", "-t", duration.toFixed(3),
      ...enc, out,
    ],
    workDir,
  );
  return { out, duration, missing };
}

const fmt = (t) => {
  const r = Math.round(t);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")}`;
};

async function main() {
  const projectDir = path.resolve(process.argv[2] ?? ".");
  const timelinePath = path.join(projectDir, "timeline.json");
  const tl = JSON.parse(await fs.readFile(timelinePath, "utf8"));
  const w = tl.width ?? 1920;
  const h = tl.height ?? 1080;
  const fps = tl.fps ?? 30;
  const workDir = path.join(projectDir, ".build");
  await fs.mkdir(path.join(workDir, "fonts"), { recursive: true });
  for (const f of await fs.readdir(FONTS_DIR)) {
    if (/\.(ttf|otf)$/.test(f)) await fs.copyFile(path.join(FONTS_DIR, f), path.join(workDir, "fonts", f));
  }

  const ctx = { w, h, fps, workDir, projectDir, marks: tl.marks ?? {}, preset: process.argv.includes("--fast") ? "ultrafast" : "medium" };
  const parts = [];
  let total = 0;
  for (const [i, seg] of tl.segments.entries()) {
    const r = await renderSegment(seg, i, ctx);
    parts.push(r);
    console.log(`${fmt(total).padStart(5)}  ${r.missing ? "MISSING " : seg.type === "card" ? "card    " : "clip    "} ${seg.title ?? seg.label ?? seg.file}`);
    total += r.duration;
  }

  await fs.writeFile(path.join(workDir, "concat.txt"), parts.map((p) => `file '${p.out}'`).join("\n"), "utf8");
  const joined = "joined.mp4";
  await run(["-y", "-f", "concat", "-safe", "0", "-i", "concat.txt", "-c", "copy", joined], workDir);

  const output = path.resolve(projectDir, tl.output ?? "compilation.mp4");
  const music = tl.music?.file ? path.resolve(projectDir, tl.music.file) : null;
  if (music && existsSync(music)) {
    const vol = tl.music.volume ?? 0.2;
    await run(
      [
        "-y", "-i", joined, "-stream_loop", "-1", "-i", music,
        "-filter_complex", `[1:a]volume=${vol},afade=t=out:st=${Math.max(0, total - 3).toFixed(2)}:d=3[m];[0:a][m]amix=inputs=2:duration=first:normalize=0[a]`,
        "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", output,
      ],
      workDir,
    );
  } else {
    if (music) console.warn(`Music file not found, skipping: ${tl.music.file}`);
    await fs.copyFile(path.join(workDir, joined), output);
  }

  const missing = parts.filter((p) => p.missing).length;
  console.log(`\nDone: ${path.relative(process.cwd(), output)} (${fmt(total)})`);
  if (missing) console.log(`${missing} clip(s) missing a source file or mark time; rendered as placeholders. See footage.md.`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
