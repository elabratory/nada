// Downloads the standalone yt-dlp binary into ./bin so ClipForge can import YouTube, TikTok,
// Instagram, X, Twitch… links. Run: `npm run setup:ytdlp` (re-run any time to update it).
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const base = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/";
const asset =
  process.platform === "win32"
    ? "yt-dlp.exe"
    : process.platform === "darwin"
      ? "yt-dlp_macos"
      : process.arch === "arm64"
        ? "yt-dlp_linux_aarch64"
        : "yt-dlp_linux";
const dest = path.join(process.cwd(), "bin", process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");

console.log(`Downloading ${asset}…`);
const res = await fetch(base + asset, { redirect: "follow" });
if (!res.ok) {
  console.error(`Download failed: ${res.status} ${res.statusText}. You can also install it with \`pip install yt-dlp\`.`);
  process.exit(1);
}
mkdirSync(path.dirname(dest), { recursive: true });
writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
if (process.platform !== "win32") chmodSync(dest, 0o755);
console.log(`yt-dlp saved to ${dest}. Restart \`npm run dev\` and paste a link.`);
