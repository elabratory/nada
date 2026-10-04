#!/usr/bin/env node
// Builds a vertical "Ranking …" Short (1080x1920) from a short.json: a two-line coloured title in
// a black top bar, the clips cropped to fill the middle, and a numbered ranking list down the left
// whose slots fill in as each clip lands.
//
//   node scripts/build-ranking-short.mjs content/ufc-332-top-5-finishes
//
// Clips whose source file or mark time is missing render as labelled placeholders.
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { copyFonts, esc, finishWithMusic, fmt, hasAudio, resolveTime, run, secs, ts } from "./lib/media.mjs";

const W = 1080;
const H = 1920;
const VIDEO_TOP = 340; // black title bar above, clips fill 340..1780
const VIDEO_H = 1440;
const FPS = 30;

// ASS colours are &HBBGGRR.
const COLOURS = { white: "&HFFFFFF&", yellow: "&H00F0FF&", blue: "&HFF8A1E&", red: "&H3A3AE8&" };
const RANK_COLOURS = ["yellow", "blue", "red"]; // #1, #2, #3; the rest are white

function assHeader() {
  const style = (name, font, size, align, outline) =>
    `Style: ${name},${font},${size},&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,${outline},0,${align},40,40,0,1`;
  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    style("title", "Montserrat ExtraBold", 104, 5, 0),
    style("num", "Anton", 112, 4, 7),
    style("label", "Montserrat ExtraBold", 54, 4, 6),
    style("note", "Montserrat ExtraBold", 50, 5, 5),
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ].join("\n");
}

const ev = (style, start, end, text) => `Dialogue: 0,${ts(start)},${ts(end)},${style},,0,0,0,,${text}`;

/** Title as [[text, colour], …]; "\n" entries break the line. */
function titleText(parts) {
  return parts.map(([text, colour]) => (text === "\n" ? "\\N" : `{\\c${COLOURS[colour] ?? COLOURS.white}}${esc(text)}`)).join("");
}

async function loadMarks(projectDir, marks) {
  if (typeof marks !== "string") return marks ?? {};
  const other = JSON.parse(await fs.readFile(path.resolve(projectDir, marks), "utf8"));
  return other.marks ?? {};
}

/** Renders one 1080x1440 piece (a live clip or a slow-mo replay). */
async function renderPart(part, i, ctx) {
  const out = `part_${String(i).padStart(3, "0")}.mp4`;
  const speed = part.speed ?? 1;
  const freeze = secs(part.freezeEnd);
  const s = resolveTime(part.start, ctx.marks);
  const e = resolveTime(part.end, ctx.marks);
  if (e.t <= s.t) throw new Error(`Clip ${part.label}: end must be after start`);
  const duration = (e.t - s.t) / speed + freeze;
  const missing = !ctx.hasSource ? "source" : s.missing ?? e.missing;
  const enc = ["-c:v", "libx264", "-preset", ctx.preset, "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2"];

  if (missing) {
    await run(
      [
        "-y",
        "-f", "lavfi", "-i", `color=c=0x2a1414:s=${W}x${VIDEO_H}:r=${FPS}:d=${duration.toFixed(3)}`,
        "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
        "-map", "0:v", "-map", "1:a", "-t", duration.toFixed(3), ...enc, out,
      ],
      ctx.workDir,
    );
    return { out, duration, missing, startT: s.t, speed };
  }

  const cx = part.cropX ?? 0.5;
  const v =
    `[0:v]setpts=(PTS-STARTPTS)/${speed},scale=${W}:${VIDEO_H}:force_original_aspect_ratio=increase,` +
    `crop=${W}:${VIDEO_H}:(iw-ow)*${cx}:(ih-oh)/2,setsar=1,fps=${FPS}` +
    `${freeze ? `,tpad=stop_mode=clone:stop_duration=${freeze}` : ""},format=yuv420p[v]`;
  const atempo = speed === 1 ? "" : speed >= 0.5 ? `,atempo=${speed}` : `,atempo=0.5,atempo=${speed / 0.5}`;
  const a = ctx.sourceHasAudio && !part.mute
    ? `[0:a]asetpts=PTS-STARTPTS${atempo},aresample=48000,aformat=channel_layouts=stereo,volume=${part.volume ?? 1},apad[a]`
    : `[1:a]anull[a]`;
  await run(
    [
      "-y",
      "-ss", Math.max(0, s.t).toFixed(3), "-to", e.t.toFixed(3), "-i", ctx.source,
      "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
      "-filter_complex", `${v};${a}`,
      "-map", "[v]", "-map", "[a]", "-t", duration.toFixed(3), ...enc, out,
    ],
    ctx.workDir,
  );
  return { out, duration, missing: null, startT: s.t, speed };
}

async function main() {
  const projectDir = path.resolve(process.argv[2] ?? ".");
  const cfg = JSON.parse(await fs.readFile(path.join(projectDir, "short.json"), "utf8"));
  const workDir = path.join(projectDir, ".build-short");
  await copyFonts(workDir);

  const source = path.resolve(projectDir, cfg.source);
  const hasSource = existsSync(source);
  const ctx = {
    workDir,
    source,
    hasSource,
    sourceHasAudio: hasSource && (await hasAudio(source)),
    marks: await loadMarks(projectDir, cfg.marks),
    preset: process.argv.includes("--fast") ? "ultrafast" : "medium",
  };
  if (!hasSource) console.warn(`Source not found: ${cfg.source} (rendering placeholders)`);

  const slots = cfg.slots ?? cfg.clips.length;
  const slotY = (rank) => 620 + ((rank - 1) * (1480 - 620)) / Math.max(1, slots - 1);
  const parts = [];
  const reveals = [];
  const notes = [];
  let total = 0;

  for (const clip of cfg.clips) {
    const pieces = [{ ...clip, label: clip.label }];
    if (clip.replay) pieces.push({ ...clip.replay, label: `${clip.label} (replay)`, cropX: clip.replay.cropX ?? clip.cropX });
    for (const [pi, piece] of pieces.entries()) {
      const r = await renderPart(piece, parts.length, ctx);
      console.log(`${fmt(total).padStart(5)}  ${r.missing ? "MISSING " : "clip    "} #${clip.rank} ${piece.label}`);
      if (pi === 0) {
        const at = clip.reveal !== undefined ? (resolveTime(clip.reveal, ctx.marks).t - r.startT) / r.speed : 0;
        reveals.push({ rank: clip.rank, label: clip.label, at: total + Math.max(0, Math.min(r.duration, at)) });
      }
      if (r.missing) {
        const what = r.missing === "source" ? `ADD ${cfg.source}` : `SET "${r.missing}" IN marks`;
        notes.push({ start: total, end: total + r.duration, text: `${what}\\N{\\fs36}#${clip.rank} ${esc(piece.label)}` });
      }
      parts.push(r);
      total += r.duration;
    }
  }

  const events = [ev("title", 0, total, `{\\pos(${W / 2},${VIDEO_TOP / 2})}${titleText(cfg.title)}`)];
  for (let rank = 1; rank <= slots; rank++) {
    const colour = COLOURS[RANK_COLOURS[rank - 1] ?? "white"];
    events.push(ev("num", 0, total, `{\\pos(60,${slotY(rank)})\\c${colour}}${rank}.`));
  }
  for (const r of reveals) {
    const pop = "{\\fad(60,0)\\t(0,120,\\fscx118\\fscy118)\\t(120,260,\\fscx100\\fscy100)}";
    events.push(ev("label", r.at, total, `{\\pos(150,${slotY(r.rank)})}${pop}${esc(r.label)}`));
  }
  for (const n of notes) events.push(ev("note", n.start, n.end, `{\\pos(${W / 2},${VIDEO_TOP + 130})\\c${COLOURS.yellow}}${n.text}`));
  await fs.writeFile(path.join(workDir, "short.ass"), `${assHeader()}\n${events.join("\n")}\n`, "utf8");

  await fs.writeFile(path.join(workDir, "concat.txt"), parts.map((p) => `file '${p.out}'`).join("\n"), "utf8");
  await run(["-y", "-f", "concat", "-safe", "0", "-i", "concat.txt", "-c", "copy", "middle.mp4"], workDir);
  await run(
    [
      "-y",
      "-f", "lavfi", "-i", `color=c=black:s=${W}x${H}:r=${FPS}:d=${total.toFixed(3)}`,
      "-i", "middle.mp4",
      "-filter_complex", `[0:v][1:v]overlay=0:${VIDEO_TOP}:shortest=1,subtitles=short.ass:fontsdir=fonts,format=yuv420p[v]`,
      "-map", "[v]", "-map", "1:a",
      "-c:v", "libx264", "-preset", ctx.preset, "-crf", "20", "-c:a", "copy", "-movflags", "+faststart", "composed.mp4",
    ],
    workDir,
  );

  const output = path.resolve(projectDir, cfg.output ?? "short.mp4");
  const music = cfg.music?.file ? path.resolve(projectDir, cfg.music.file) : null;
  const mixed = await finishWithMusic(workDir, "composed.mp4", output, music, cfg.music?.volume ?? 0.15, total);
  if (music && !mixed) console.warn(`Music file not found, skipping: ${cfg.music.file}`);

  console.log(`\nDone: ${path.relative(process.cwd(), output)} (${fmt(total)}, ${W}x${H})`);
  if (notes.length) console.log(`${notes.length} clip(s) missing a source file or mark time; rendered as placeholders.`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
