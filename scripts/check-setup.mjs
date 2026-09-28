// Quick sanity check: `npm run check`
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let ok = true;
const pass = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const fail = (m) => {
  ok = false;
  console.log(`  \x1b[31m✗\x1b[0m ${m}`);
};

// Load .env.local / .env the same way Next.js does (simple KEY=VALUE parsing).
for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

console.log("\nClipForge AI setup check\n");

const major = +process.versions.node.split(".")[0];
major >= 20 ? pass(`Node.js ${process.versions.node}`) : fail(`Node.js ${process.versions.node} — version 20 or newer is required`);

let ffmpeg = process.env.FFMPEG_PATH;
if (!ffmpeg) {
  try {
    ffmpeg = require("ffmpeg-static");
  } catch {
    /* not installed */
  }
}
if (!ffmpeg || (ffmpeg !== "ffmpeg" && !existsSync(ffmpeg))) {
  fail("FFmpeg binary not found — run `npm install` again (ffmpeg-static downloads it), or set FFMPEG_PATH");
} else {
  try {
    const filters = execFileSync(ffmpeg, ["-hide_banner", "-filters"], { stdio: ["ignore", "pipe", "ignore"] }).toString();
    pass(`FFmpeg found at ${ffmpeg}`);
    /\bsubtitles\b/.test(filters) ? pass("FFmpeg has libass (subtitle burn-in)") : fail("This FFmpeg build lacks libass, so captions can't be burned in");
  } catch (e) {
    fail(`FFmpeg failed to run: ${e.message}`);
  }
}

existsSync(".env.local") || existsSync(".env") ? pass(".env.local found") : fail("No .env.local — run: cp .env.example .env.local");
process.env.OPENAI_API_KEY ? pass("OPENAI_API_KEY is set") : fail("OPENAI_API_KEY is missing (needed for transcription)");
process.env.ANTHROPIC_API_KEY ? pass("ANTHROPIC_API_KEY is set") : fail("ANTHROPIC_API_KEY is missing (needed to pick the best moments)");

console.log(ok ? "\nAll good — run `npm run dev` and open http://localhost:3000\n" : "\nFix the items above, then run `npm run check` again.\n");
process.exit(ok ? 0 : 1);
